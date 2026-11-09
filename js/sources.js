// Clients des services interrogeables depuis un navigateur (voir docs/cors.md).
// Chaque fonction renvoie du JSON brut ; l'interprétation est dans annotate.js.

import { fetchJSON } from './util.js';

const VEP_OPTS = 'refseq=1&hgvs=1&numbers=1&domains=1&mane=1&canonical=1&variant_class=1';

/** VEP à partir d'une nomenclature HGVS c. (transcrit RefSeq). */
export function vepHgvs(hgvs) {
  const url = `https://rest.ensembl.org/vep/human/hgvs/${encodeURIComponent(hgvs)}`
    + `?content-type=application/json&${VEP_OPTS}`;
  return fetchJSON(url, { retries: 5, timeout: 40000 });
}

/**
 * Conversion VCF → région Ensembl (format « default » de VEP).
 * Indispensable : l'endpoint POST /vep/human/region ne répond pas au préflight CORS
 * (OPTIONS sans en-tête Access-Control-Allow-Origin), alors que le GET passe.
 * Vérifié contre la normalisation de VEP elle-même pour substitution, délétion,
 * insertion et delins.
 */
export function vcfToEnsemblRegion(chr, pos, ref, alt) {
  const p = Number(pos);
  if (ref.length === alt.length) {
    return { region: `${chr}:${p}-${p + ref.length - 1}`, allele: alt };
  }
  if (alt.length < ref.length && ref.startsWith(alt)) { // délétion
    return { region: `${chr}:${p + alt.length}-${p + ref.length - 1}`, allele: '-' };
  }
  if (ref.length < alt.length && alt.startsWith(ref)) { // insertion : start = end + 1
    const start = p + ref.length;
    return { region: `${chr}:${start}-${start - 1}`, allele: alt.slice(ref.length) };
  }
  return { region: `${chr}:${p}-${p + ref.length - 1}`, allele: alt }; // delins
}

/** VEP à partir de coordonnées VCF, en GET (le POST est bloqué par CORS). */
export function vepVcf(chr, pos, ref, alt) {
  const { region, allele } = vcfToEnsemblRegion(chr, pos, ref, alt);
  // Les « : » ne doivent pas être encodés : /region/17%3A7675088-7675088 renvoie une
  // page d'erreur 500, sans en-tête CORS. region et allele sont déjà validés
  // (chromosome, position numérique, allèles ACGTN ou « - »).
  const url = `https://rest.ensembl.org/vep/human/region/${region}/${allele}`
    + `?content-type=application/json&${VEP_OPTS}`;
  return fetchJSON(url, { retries: 5, timeout: 40000 });
}

/** Séquence de référence hg38 sur un intervalle (bornes incluses). */
export async function refSeq(chr, start, end) {
  const url = `https://rest.ensembl.org/sequence/region/human/${chr}:${start}..${end}`
    + '?content-type=application/json&coord_system_version=GRCh38';
  const r = await fetchJSON(url, { retries: 3 });
  return r && r.seq ? r.seq.toUpperCase() : null;
}

/** Base de référence à une position donnée. */
export async function refBase(chr, pos) {
  return refSeq(chr, pos, pos);
}

/** MyVariant.info : dbNSFP, CADD, ClinVar, gnomAD v2.1.1 exomes. `id` est un HGVS génomique. */
export function myVariant(id) {
  const url = `https://myvariant.info/v1/variant/${encodeURIComponent(id)}?assembly=hg38&fields=all`;
  return fetchJSON(url, { retries: 3, timeout: 35000 });
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
    retries: 3,
    timeout: 35000,
  });
}

// L'hôte documenté de SpliceAI ne répond plus (connexion en timeout) : ce sont les
// services Cloud Run appelés par l'interface officielle qui sont essayés d'abord,
// l'hôte documenté restant en dernier recours s'il revient un jour.
// Les services Cloud Run démarrent à froid : il faut leur laisser ~25 s. L'hôte
// documenté, lui, ne répond plus du tout — timeout court pour ne pas allonger
// l'attente de 20 s supplémentaires à chaque fois.
const SPLICEAI_HOSTS = [
  { host: 'https://spliceai-38-xwkwwwxdwq-uc.a.run.app', timeout: 25000 },
  { host: 'https://spliceai-38-comprehensive-xwkwwwxdwq-uc.a.run.app', timeout: 25000 },
  { host: 'https://spliceailookup-api.broadinstitute.org', timeout: 4000 },
];

export async function spliceai(variantId, distance = 50) {
  let lastErr;
  for (const { host, timeout } of SPLICEAI_HOSTS) {
    try {
      const url = `${host}/spliceai/?hg=38&distance=${distance}&variant=${encodeURIComponent(variantId)}`;
      const r = await fetchJSON(url, { retries: 0, timeout });
      // Une réponse d'erreur du service (variant non couvert) est une réponse :
      // inutile d'essayer les autres hôtes.
      if (r && (r.scores || r.error)) return r;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('SpliceAI indisponible');
}

/**
 * InterVar (wInterVar) : classification ACMG automatique + critères.
 * Le service ne traite que les substitutions : pour un indel il renvoie un corps
 * vide. Ce n'est pas une panne — on renvoie null, et la valeur affichée reste « n.a. ».
 */
export async function intervar(chr, pos, ref, alt) {
  const url = `https://wintervar.wglab.org/api_new.php?queryType=position&chr=${chr}`
    + `&pos=${pos}&ref=${ref}&alt=${alt}&build=hg38`;
  const text = await fetchJSON(url, { retries: 2, timeout: 25000, expect: 'text' });
  if (!text || !String(text).trim()) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null; // page d'erreur ou réponse tronquée
  }
}

/** mygene.info : UniProt (Swiss-Prot) et HGNC, à partir du transcrit RefSeq. */
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
  return fetchJSON(url, { retries: 2, timeout: 25000 });
}

/** Monarch : fiche maladie — numéro MIM (mappings) et mode de transmission (terme HPO). */
export function monarchDisease(mondoId) {
  const url = `https://api.monarchinitiative.org/v3/api/entity/${encodeURIComponent(mondoId)}`;
  return fetchJSON(url, { retries: 2, timeout: 25000 });
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
  let r = await fetchJSON(url, { retries: 1, timeout: 30000 });
  // MobiDetails impose sa propre version de transcrit : « (1) for NM_… does not match MobiDetail's (2) ».
  const err = r && (r.mobidetails_error || r.error);
  if (err && String(err).includes('does not match MobiDetail')) {
    const m = String(err).match(/\((\d+)\)[^(]*\((\d+)\)/);
    if (m) {
      const retryHgvs = clean.replace(`.${m[1]}:`, `.${m[2]}:`);
      const retryUrl = 'https://mobidetails.chu-montpellier.fr/api/variant/create'
        + `?variant_chgvs=${encodeURIComponent(retryHgvs)}&caller=cli&api_key=${encodeURIComponent(apiKey)}`;
      r = await fetchJSON(retryUrl, { retries: 1, timeout: 30000 });
    }
  }
  return r && r.mobidetails_id ? String(r.mobidetails_id) : null;
}
