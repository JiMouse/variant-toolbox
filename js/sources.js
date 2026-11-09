// Clients des services interrogeables depuis un navigateur (voir docs/cors.md).
// Chaque fonction renvoie du JSON brut ; l'interprétation est dans annotate.js.

import { fetchJSON, hedge } from './util.js';

const VEP_OPTS = 'refseq=1&hgvs=1&numbers=1&domains=1&mane=1&canonical=1&variant_class=1';

/**
 * VEP à partir d'une nomenclature HGVS c. (transcrit RefSeq).
 *
 * `retries: 0` par défaut : VEP répond en ~40 ms quand il va bien, et quand il va mal
 * il laisse pendre la connexion. Réessayer trois fois avec un palier croissant coûtait
 * 2,8 s **avant** que `hedge` ne puisse lancer VariantValidator, alors que l'échec
 * était connu dès 160 ms. Le repli est VariantValidator, pas un réessai d'Ensembl.
 */
export function vepHgvs(hgvs, opts = {}) {
  const url = `https://rest.ensembl.org/vep/human/hgvs/${encodeURIComponent(hgvs)}`
    + `?content-type=application/json&${VEP_OPTS}`;
  return fetchJSON(url, { retries: 0, timeout: 8000, ...opts });
}

/**
 * VEP à partir de coordonnées VCF — via un **HGVS génomique** sur /vep/human/hgvs.
 *
 * L'endpoint /vep/human/region est mesuré à ~57 % d'échecs (500 et timeouts) alors
 * que /vep/human/hgvs répond 14/14 dans le même intervalle, y compris avec un HGVS
 * génomique, qui porte exactement la même information. Le POST sur /region est de
 * toute façon inutilisable depuis un navigateur (pas de préflight CORS).
 * Avantage supplémentaire : pour une entrée génomique VEP renvoie `strand: 1` et des
 * allèles déjà dans l'orientation du génome, donc aucune complémentation à faire.
 */
export function vepVcf(chr, pos, ref, alt, opts = {}) {
  return vepHgvs(genomicHgvsFromVcf(chr, pos, ref, alt), opts);
}

/** HGVS génomique (chr sans préfixe) attendu par VEP : « 17:g.7675088C>T ». */
export function genomicHgvsFromVcf(chr, pos, ref, alt) {
  const p = Number(pos);
  if (ref.length === 1 && alt.length === 1) return `${chr}:g.${p}${ref}>${alt}`;
  if (alt.length < ref.length && ref.startsWith(alt)) {
    const start = p + alt.length;
    const end = p + ref.length - 1;
    return start === end ? `${chr}:g.${start}del` : `${chr}:g.${start}_${end}del`;
  }
  if (ref.length < alt.length && alt.startsWith(ref)) {
    const start = p + ref.length - 1;
    return `${chr}:g.${start}_${start + 1}ins${alt.slice(ref.length)}`;
  }
  const start = p;
  const end = p + ref.length - 1;
  return start === end ? `${chr}:g.${start}delins${alt}` : `${chr}:g.${start}_${end}delins${alt}`;
}

/**
 * Séquence de référence hg38 sur un intervalle (bornes incluses).
 * Ensembl d'abord, puis l'API REST d'UCSC — elle répond aussi avec
 * `Access-Control-Allow-Origin: *` et sert de repli quand Ensembl est en panne.
 */
export async function refSeq(chr, start, end) {
  try {
    const url = `https://rest.ensembl.org/sequence/region/human/${chr}:${start}..${end}`
      + '?content-type=application/json&coord_system_version=GRCh38';
    const r = await fetchJSON(url, { retries: 1, timeout: 8000 });
    if (r && r.seq) return r.seq.toUpperCase();
  } catch (e) {
    // on tente UCSC
  }
  // UCSC : start exclusif (demi-ouvert), d'où le « start - 1 ».
  const u = `https://api.genome.ucsc.edu/getData/sequence?genome=hg38;chrom=chr${chr}`
    + `;start=${start - 1};end=${end}`;
  const r2 = await fetchJSON(u, { retries: 2 });
  return r2 && r2.dna ? r2.dna.toUpperCase() : null;
}

/** Base de référence à une position donnée. */
export async function refBase(chr, pos) {
  return refSeq(chr, pos, pos);
}

/**
 * Champs MyVariant réellement lus par annotate.js — `fields=all` renvoyait 103 KiB
 * dont 68 KiB de `snpeff`, jamais utilisé. La liste restreinte rend 10 KiB et divise
 * la latence médiane par deux (~1 000 ms → ~500 ms).
 *
 * ⚠ `dbnsfp.gerp*` : le paramètre `fields` de MyVariant **ne sait pas** viser
 * `dbnsfp.gerp++.rs` — le `+` est ignoré et la réponse contient alors
 * `dbnsfp.gerp.91_mammals` (5,48 ici) à la place de `gerp++.rs` (5,41), soit une
 * **autre** mesure de conservation. Le joker `gerp*` ramène bien les deux.
 */
const MYVARIANT_FIELDS = [
  'dbnsfp.sift',
  'dbnsfp.polyphen2.hdiv',
  'dbnsfp.cadd.phred',
  'dbnsfp.revel.score',
  'dbnsfp.metalr',
  'dbnsfp.alphamissense',
  'dbnsfp.gerp*',
  'dbnsfp.phylop.100way_vertebrate.score',
  'dbnsfp.phastcons.100way_vertebrate.score',
  'dbnsfp.interpro.domain',
  'cadd.phred',
  'clinvar.rcv',
  'gnomad_exome.ac.ac',
  'gnomad_exome.hom.hom',
  'gnomad_exome.af.af',
  'dbsnp.rsid',
].join(',');

/**
 * MyVariant.info : dbNSFP, CADD, ClinVar, gnomAD v2.1.1 exomes. `id` est un HGVS génomique.
 *
 * Même défaut qu'Ensembl : le service ne refuse pas, il **laisse pendre** la connexion
 * par intermittence. Une requête suspendue coûtait 8 s de délai puis un réessai qui
 * aboutissait en 1,7 s — 10,5 s d'analyse pour une donnée normalement rendue en
 * ~350 ms. La requête est donc doublée si rien n'est revenu au bout de 1,5 s, et la
 * première réponse gagne : c'est la parade déjà employée pour VEP (voir `hedge`).
 * Un GET idempotent, donc sans effet de bord à être émis deux fois.
 */
export function myVariant(id) {
  const url = `https://myvariant.info/v1/variant/${encodeURIComponent(id)}`
    + `?assembly=hg38&fields=${encodeURIComponent(MYVARIANT_FIELDS)}`;
  const once = () => fetchJSON(url, { retries: 1, timeout: 8000 });
  return hedge(once, once, { delay: 1500 });
}

/** gnomAD v4.1 — exomes + génomes, AC / AN / AF / homozygotes. */
export function gnomad4(variantId) {
  const query = `query V($v: String!) {
    variant(variantId: $v, dataset: gnomad_r4) {
      variant_id rsids
      exome { ac an af homozygote_count }
      genome { ac an af homozygote_count }
    }
  }`;
  return fetchJSON('https://gnomad.broadinstitute.org/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { v: variantId } }),
    retries: 2,
    timeout: 12000,
  });
}

// L'hôte documenté de SpliceAI ne répond plus (connexion en timeout) : ce sont les
// services Cloud Run appelés par l'interface officielle qui sont essayés d'abord,
// l'hôte documenté restant en dernier recours s'il revient un jour.
// Les services Cloud Run démarrent à froid : il faut leur laisser ~25 s.
const SPLICEAI_CLOUD_RUN = [
  'https://spliceai-38-xwkwwwxdwq-uc.a.run.app',
  'https://spliceai-38-comprehensive-xwkwwwxdwq-uc.a.run.app',
];
const SPLICEAI_DOCUMENTED = 'https://spliceailookup-api.broadinstitute.org';

/**
 * SpliceAI — les deux services Cloud Run **en course**, pas l'un après l'autre.
 *
 * Essayés en série, chacun avec les 25 s que demande un démarrage à froid, ils
 * pouvaient à eux seuls retenir une analyse 50 s. Le second part donc au bout de 3 s
 * si le premier n'a pas répondu (il répond en ~200 ms à chaud), et la première réponse
 * gagne : un démarrage à froid d'un service n'est plus payé en entier avant d'essayer
 * l'autre. L'hôte documenté reste en dernier recours, avec un timeout court puisqu'il
 * ne répond plus du tout.
 */
export async function spliceai(variantId, distance = 50) {
  const ask = (host, timeout) => async () => {
    const url = `${host}/spliceai/?hg=38&distance=${distance}&variant=${encodeURIComponent(variantId)}`;
    const r = await fetchJSON(url, { retries: 0, timeout });
    // Une réponse d'erreur du service (variant non couvert) est une réponse.
    if (r && (r.scores || r.error)) return r;
    throw new Error('SpliceAI: réponse inexploitable');
  };

  try {
    return await hedge(ask(SPLICEAI_CLOUD_RUN[0], 25000), ask(SPLICEAI_CLOUD_RUN[1], 25000), { delay: 3000 });
  } catch (e) {
    return ask(SPLICEAI_DOCUMENTED, 4000)();
  }
}

/**
 * InterVar (wInterVar) : classification ACMG automatique + critères.
 * Le service ne traite que les substitutions : pour un indel il renvoie un corps
 * vide. Ce n'est pas une panne — on renvoie null, et la valeur affichée reste « n.a. ».
 */
export async function intervar(chr, pos, ref, alt) {
  const url = `https://wintervar.wglab.org/api_new.php?queryType=position&chr=${chr}`
    + `&pos=${pos}&ref=${ref}&alt=${alt}&build=hg38`;
  // Mesuré à ~99 ms connexion chaude, 1,5 s au pire : 8 s gardent 5× de marge
  // sans immobiliser l'analyse 12 s quand le service ne répond pas.
  const text = await fetchJSON(url, { retries: 1, timeout: 8000, expect: 'text' });
  if (!text || !String(text).trim()) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null; // page d'erreur ou réponse tronquée
  }
}

/**
 * genenames.org (HGNC) — HGNC, UniProt, MIM du gène et GeneID NCBI **en un appel**.
 *
 * Mesuré à ~40 ms (médiane sur 8), `Access-Control-Allow-Origin: *`, là où la paire
 * mygene.info (~1 500 ms) + E-utilities (~300 ms, et limité à 3 req/s sans clé —
 * observé en échec au 5e appel d'affilée) tenait le chemin critique à elle seule.
 * Valeurs comparées sur TP53, BRCA1, CFTR, MTHFR : identiques champ par champ.
 *
 * @param {string} path  « symbol/TP53 » ou « refseq_accession/NM_000546 »
 */
export async function genenames(path) {
  const url = `https://rest.genenames.org/fetch/${path}`;
  const r = await fetchJSON(url, { retries: 1, timeout: 8000, headers: { Accept: 'application/json' } });
  const docs = r && r.response && r.response.docs;
  return docs && docs.length ? docs[0] : null;
}

/**
 * Mode de transmission de **plusieurs** maladies en un seul appel.
 *
 * Monarch accepte `subject` répété : une requête de ~200 ms remplace les N appels
 * `/entity/{MONDO}` (~750 ms et 15 KiB chacun) que demandait le mode de transmission.
 * Elle en trouve aussi davantage : l'objet `inheritance` d'une fiche `/entity` est
 * souvent vide là où l'association existe (voir README, « Phénotypes »).
 *
 * @param {string[]} mondoIds
 * @returns {Promise<object>} { 'MONDO:…': 'AD' | 'AR' | … }
 */
export function monarchInheritance(mondoIds) {
  const qs = mondoIds.map((id) => `subject=${encodeURIComponent(id)}`).join('&');
  const url = `https://api.monarchinitiative.org/v3/api/association?${qs}`
    + '&predicate=biolink%3Ahas_mode_of_inheritance&limit=100';
  return fetchJSON(url, { retries: 1, timeout: 12000 });
}

/** mygene.info : UniProt (Swiss-Prot) et HGNC, à partir du transcrit RefSeq. Repli de genenames. */
export function mygene(refseq) {
  const acc = String(refseq).split('.')[0];
  const url = `https://mygene.info/v3/query?q=refseq:${encodeURIComponent(acc)}&species=human`
    + '&fields=symbol,name,entrezgene,uniprot,HGNC,MIM';
  return fetchJSON(url, { retries: 3 });
}

/** NCBI GeneID (pour le lien PubTator). */
export async function ncbiGeneId(gene) {
  const url = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term='
    + `${encodeURIComponent(gene)}[Gene Name] AND 9606[Taxonomy ID]&retmode=json&retmax=1`;
  const r = await fetchJSON(url, { retries: 2 });
  const ids = r && r.esearchresult && r.esearchresult.idlist;
  return ids && ids.length ? ids[0] : null;
}

/** Monarch : maladies associées au gène (source libre, sans clé). */
export function monarchDiseases(hgncId, limit = 20) {
  const url = 'https://api.monarchinitiative.org/v3/api/association'
    + `?subject=HGNC:${encodeURIComponent(hgncId)}`
    + '&category=biolink%3ACausalGeneToDiseaseAssociation'
    + `&limit=${limit}`;
  return fetchJSON(url, { retries: 1, timeout: 12000 });
}

/** Monarch : fiche maladie — numéro MIM (mappings) et mode de transmission (terme HPO). */
export function monarchDisease(mondoId) {
  const url = `https://api.monarchinitiative.org/v3/api/entity/${encodeURIComponent(mondoId)}`;
  return fetchJSON(url, { retries: 1, timeout: 12000 });
}

/** OMIM — tenté seulement si une clé est saisie. Sans CORS : échoue en général depuis un navigateur. */
export function omimGeneMap(mimNumber, apiKey) {
  const url = `https://api.omim.org/api/entry?mimNumber=${encodeURIComponent(mimNumber)}`
    + `&include=geneMap&format=json&apiKey=${encodeURIComponent(apiKey)}`;
  return fetchJSON(url, { retries: 1, timeout: 15000 });
}

/** MobiDetails : création/lecture de l'identifiant du variant (clé requise). */
export async function mobiDetailsId(hgvs, apiKey) {
  const clean = hgvs.includes('(') ? hgvs.replace(/\([^)]*\)/, '') : hgvs;
  const url = 'https://mobidetails.chu-montpellier.fr/api/variant/create'
    + `?variant_chgvs=${encodeURIComponent(clean)}&caller=cli&api_key=${encodeURIComponent(apiKey)}`;
  let r = await fetchJSON(url, { retries: 1, timeout: 15000 });
  // MobiDetails impose sa propre version de transcrit : « (1) for NM_… does not match MobiDetail's (2) ».
  const err = r && (r.mobidetails_error || r.error);
  if (err && String(err).includes('does not match MobiDetail')) {
    const m = String(err).match(/\((\d+)\)[^(]*\((\d+)\)/);
    if (m) {
      const retryHgvs = clean.replace(`.${m[1]}:`, `.${m[2]}:`);
      const retryUrl = 'https://mobidetails.chu-montpellier.fr/api/variant/create'
        + `?variant_chgvs=${encodeURIComponent(retryHgvs)}&caller=cli&api_key=${encodeURIComponent(apiKey)}`;
      r = await fetchJSON(retryUrl, { retries: 1, timeout: 15000 });
    }
  }
  return r && r.mobidetails_id ? String(r.mobidetails_id) : null;
}

/* ------------------------------------------------------------------ *
 * Repli de normalisation : VariantValidator
 *
 * Ensembl VEP est le seul service CORS qui donne à la fois conséquence et
 * numérotation des exons ; quand il tombe, l'application entière tombe.
 * VariantValidator (ACAO *) fournit gène, transcrit, HGVS c./p./g., coordonnées
 * VCF déjà normalisées, indicateur MANE, numéro d'exon, HGNC et GeneID — tout
 * sauf le terme de conséquence, qui est déduit prudemment (voir variant.js).
 * ------------------------------------------------------------------ */

const VV = 'https://rest.variantvalidator.org/VariantValidator';

/** Validation/normalisation d'un variant. `desc` est un HGVS c. ou g. (accession NC_). */
export function variantValidator(desc, selectTranscripts = 'mane') {
  const url = `${VV}/variantvalidator/GRCh38/${encodeURIComponent(desc)}/${selectTranscripts}`
    + '?content_type=application/json';
  return fetchJSON(url, { retries: 1, timeout: 20000 });
}

/** Structure exonique d'un transcrit — pour le total d'exons (« 5/11 »). */
export function variantValidatorTranscript(transcript) {
  const url = `${VV}/tools/gene2transcripts/${encodeURIComponent(transcript)}`
    + '?content_type=application/json';
  return fetchJSON(url, { retries: 1, timeout: 20000 });
}

/** Accessions RefSeq des chromosomes hg38, pour interroger VariantValidator en génomique. */
export const NC_ACCESSION = {
  1: 'NC_000001.11', 2: 'NC_000002.12', 3: 'NC_000003.12', 4: 'NC_000004.12',
  5: 'NC_000005.10', 6: 'NC_000006.12', 7: 'NC_000007.14', 8: 'NC_000008.11',
  9: 'NC_000009.12', 10: 'NC_000010.11', 11: 'NC_000011.10', 12: 'NC_000012.12',
  13: 'NC_000013.11', 14: 'NC_000014.9', 15: 'NC_000015.10', 16: 'NC_000016.10',
  17: 'NC_000017.11', 18: 'NC_000018.10', 19: 'NC_000019.10', 20: 'NC_000020.11',
  21: 'NC_000021.9', 22: 'NC_000022.11', X: 'NC_000023.11', Y: 'NC_000024.10',
  M: 'NC_012920.1',
};
