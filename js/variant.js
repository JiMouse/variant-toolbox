// Saisie → variant normalisé. Deux entrées possibles :
//   HGVS     NM_000546.6:c.524G>A  (le nom du gène entre parenthèses est accepté)
//   pseudo-VCF hg38  chr17-7675088-C-T
// La normalisation passe toujours par VEP : c'est elle qui fixe gène, transcrit,
// conséquence, exon/intron et les nomenclatures c./p./g.

import {
  vepHgvs, vepEnsembl, vepVcf, refBase, refSeq, genomicHgvsFromVcf,
  variantValidator, variantValidatorTranscript, ucscMane, NC_ACCESSION,
} from './sources.js';
import { hedge, errorText, predictedProtein } from './util.js';
// Les seuils d'épissage sont définis une seule fois, là où ils sont dessinés.
import { CANONICAL_BP, SPLICE_INTRON_BP } from './structure.js';

const CHR_RE = /^(?:chr)?([0-9]{1,2}|[XYM]|MT)$/i;

/** Reconnaît le type de saisie sans appel réseau. */
export function parseInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return { kind: 'empty' };

  // pseudo-VCF : chr-pos-ref-alt (séparateurs - : espace ou /)
  const vcf = text.split(/[-:\s/]+/).filter(Boolean);
  if (vcf.length === 4 && CHR_RE.test(vcf[0]) && /^\d+$/.test(vcf[1])
      && /^[ACGTN]+$/i.test(vcf[2]) && /^[ACGTN]+$/i.test(vcf[3])) {
    return {
      kind: 'vcf',
      chr: normChr(vcf[0]),
      pos: Number(vcf[1]),
      ref: vcf[2].toUpperCase(),
      alt: vcf[3].toUpperCase(),
    };
  }

  // HGVS : accession:c.… (ou n./g.)
  if (/^[A-Z]{2}_?\d+(\.\d+)?(\([^)]*\))?:[cngm]\./i.test(text)) {
    const hgvs = text.replace(/\(([^)]*)\)/, ''); // retirer le gène entre parenthèses
    return { kind: 'hgvs', hgvs, gene: (text.match(/\(([^)]*)\)/) || [])[1] || null, raw: text };
  }

  return { kind: 'unknown', raw: text };
}

function normChr(c) {
  const s = String(c).replace(/^chr/i, '').toUpperCase();
  return s === 'MT' ? 'M' : s;
}

/** Conséquences VEP → clés de la macro (var_type). */
const CONSEQUENCE_MAP = [
  ['splice_acceptor_variant', 'splice_acceptor'],
  ['splice_donor_variant', 'splice_donor'],
  ['stop_gained', 'nonsense'],
  ['frameshift_variant', 'frameshift'],
  ['start_lost', 'start_lost'],
  ['stop_lost', 'stop_lost'],
  ['missense_variant', 'missense'],
  ['inframe_deletion', 'inframe'],
  ['inframe_insertion', 'inframe'],
  ['protein_altering_variant', 'inframe'],
  ['synonymous_variant', 'synonymous'],
  ['splice_donor_5th_base_variant', 'splice_region'],
  ['splice_region_variant', 'splice_region'],
  ['splice_polypyrimidine_tract_variant', 'splice_region'],
  ['splice_donor_region_variant', 'splice_region'],
  ['intron_variant', 'intronic'],
  ['5_prime_UTR_variant', 'utr5'],
  ['3_prime_UTR_variant', 'utr3'],
  ['upstream_gene_variant', 'upstream'],
  ['downstream_gene_variant', 'downstream'],
  ['non_coding_transcript_exon_variant', 'noncoding_exon'],
  ['coding_sequence_variant', 'coding'],
];

/** La conséquence la plus sévère parmi celles renvoyées par VEP (ordre ci-dessus). */
export function mapConsequence(terms = []) {
  for (const [vepTerm, key] of CONSEQUENCE_MAP) {
    if (terms.includes(vepTerm)) return key;
  }
  return terms[0] || null;
}

/** Variation « nulle » au sens de la macro : frameshift, non-sens, site d'épissage ±1/2. */
export function isNullVariant(varType) {
  return varType === 'frameshift' || varType === 'nonsense'
    || varType === 'splice_acceptor' || varType === 'splice_donor';
}

/** Choisit la conséquence de transcrit à utiliser et dit si c'est le transcrit MANE Select. */
function pickTranscript(vepItem, wantedTranscript) {
  const all = (vepItem.transcript_consequences || []);
  const refseq = all.filter((t) => /^(NM_|NR_)/.test(t.transcript_id || ''));
  const pool = refseq.length ? refseq : all;

  if (wantedTranscript) {
    const acc = wantedTranscript.split('.')[0];
    const exact = pool.find((t) => t.transcript_id === wantedTranscript)
      || pool.find((t) => (t.transcript_id || '').split('.')[0] === acc);
    if (exact) return { tc: exact, selectedBy: 'input' };
  }
  const mane = pool.find((t) => t.mane_select);
  if (mane) return { tc: mane, selectedBy: 'mane' };
  const canonical = pool.find((t) => t.canonical);
  if (canonical) return { tc: canonical, selectedBy: 'canonical' };
  return { tc: pool[0] || null, selectedBy: pool.length ? 'first' : 'none' };
}

const COMPLEMENT = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };

function revcomp(seq) {
  return seq.split('').reverse().map((c) => COMPLEMENT[c] || c).join('');
}

/**
 * Allèles dans l'orientation du génome.
 * Pour une saisie HGVS c. sur un gène du brin -, VEP renvoie les allèles dans le sens du
 * transcrit (strand: -1) alors que les coordonnées sont génomiques : il faut complémenter.
 */
export function genomicAlleles(item) {
  const [a, b] = String(item.allele_string || '').split('/');
  if (item.strand === -1) {
    return [a && a !== '-' ? revcomp(a) : a, b && b !== '-' ? revcomp(b) : b];
  }
  return [a, b];
}

/** Forme VCF (chr-pos-ref-alt) depuis la représentation VEP, en retrouvant la base d'ancrage. */
async function vcfFromVep(item) {
  const chr = String(item.seq_region_name);
  const [a, b] = genomicAlleles(item);
  const start = item.start;

  if (a && b && a !== '-' && b !== '-' && a.length === b.length) {
    return { chr, pos: start, ref: a, alt: b }; // substitution
  }
  if (b === '-') { // délétion : ancrer sur la base précédente
    const anchor = await refBase(chr, start - 1);
    if (!anchor) return null;
    return { chr, pos: start - 1, ref: anchor + a, alt: anchor };
  }
  if (a === '-') { // insertion : VEP place start = end + 1
    const anchor = await refBase(chr, item.end);
    if (!anchor) return null;
    return { chr, pos: item.end, ref: anchor, alt: anchor + b };
  }
  // delins
  const anchor = await refBase(chr, start - 1);
  if (!anchor) return null;
  return { chr, pos: start - 1, ref: anchor + a, alt: anchor + b };
}

/**
 * Lecteur de référence avec fenêtre en cache : évite un appel réseau par base
 * pendant la normalisation.
 */
function refReader(chr, from, to) {
  let start = from;
  let seq = null;
  return async (pos) => {
    if (seq === null || pos < start) {
      start = Math.max(1, Math.min(pos, from) - 60);
      seq = await refSeq(chr, start, Math.max(to, start + 120));
      if (!seq) throw new Error('REF_UNAVAILABLE');
    }
    const i = pos - start;
    if (i < 0 || i >= seq.length) {
      start = Math.max(1, pos - 60);
      seq = await refSeq(chr, start, pos + 60);
      if (!seq) throw new Error('REF_UNAVAILABLE');
      return seq[pos - start];
    }
    return seq[i];
  };
}

/**
 * Normalisation VCF (alignement à gauche), algorithme de vt normalize.
 *
 * Indispensable : HGVS décale les indels vers la **droite** dans une répétition,
 * alors que VCF — donc gnomAD, SpliceAI, InterVar, Decipher, Varsome, Franklin —
 * les aligne à **gauche**. Sans cette étape, CFTR p.Phe508del sortait en
 * 7-117559591-TCTT-T, introuvable dans gnomAD, et le commentaire annonçait une
 * variation « absente des bases de données » pour la variation CF la plus fréquente
 * (forme correcte : 7-117559590-ATCT-A, AF ≈ 1,2 %).
 */
export async function normalizeVcf(chr, pos, ref, alt, getBase) {
  let p = Number(pos);
  let r = String(ref).toUpperCase();
  let a = String(alt).toUpperCase();
  if (r.length === a.length) return { pos: p, ref: r, alt: a }; // substitution : rien à faire

  for (let guard = 0; guard < 1000; guard++) {
    if (r.length > 1 && a.length > 1 && r[r.length - 1] === a[a.length - 1]) {
      r = r.slice(0, -1);
      a = a.slice(0, -1);
      continue;
    }
    if ((r.length === 1 || a.length === 1) && r.length !== a.length
        && r[r.length - 1] === a[a.length - 1] && p > 1) {
      const b = await getBase(p - 1);
      if (!b) break;
      p -= 1;
      r = b + r.slice(0, -1);
      a = b + a.slice(0, -1);
      continue;
    }
    break;
  }
  while (r.length > 1 && a.length > 1 && r[0] === a[0]) {
    r = r.slice(1);
    a = a.slice(1);
    p += 1;
  }
  return { pos: p, ref: r, alt: a };
}

/**
 * HGVS génomique dérivé d'une représentation VCF normalisée, préfixé « chr »
 * (forme attendue par MyVariant.info). Même construction que pour VEP, au préfixe près.
 */
export function hgvsFromVcf(chr, pos, ref, alt) {
  return `chr${genomicHgvsFromVcf(chr, pos, ref, alt)}`;
}

/** Identifiant MyVariant (HGVS génomique) construit sur les coordonnées normalisées par VEP. */
export function myVariantId(item) {
  const chr = `chr${item.seq_region_name}`;
  const [a, b] = genomicAlleles(item);
  const { start, end } = item;
  if (a && b && a !== '-' && b !== '-' && a.length === 1 && b.length === 1) {
    return `${chr}:g.${start}${a}>${b}`;
  }
  if (b === '-') {
    return start === end ? `${chr}:g.${start}del` : `${chr}:g.${start}_${end}del`;
  }
  if (a === '-') {
    return `${chr}:g.${end}_${start}ins${b}`;
  }
  return start === end ? `${chr}:g.${start}delins${b}` : `${chr}:g.${start}_${end}delins${b}`;
}

/** HGVS génomique lisible pour la ligne de nomenclature (hg38 chr17:g.7675088C>T). */
export function genomicHgvs(item) {
  return myVariantId(item);
}

/** Partie suivant l'accession : « NM_000546.6:c.524G>A » → « c.524G>A ». */
export function cPart(hgvs) {
  if (!hgvs) return null;
  const s = String(hgvs);
  return s.includes(':') ? s.split(':').slice(1).join(':') || null : s;
}

/* ------------------------------------------------------------------ *
 * Transcrit Ensembl
 * ------------------------------------------------------------------ */

/**
 * Le transcrit Ensembl correspondant au transcrit RefSeq retenu, et sa nomenclature c.
 *
 * Deux chemins, et le premier couvre la quasi-totalité des cas :
 *
 * 1. **Transcrit MANE Select** — VEP a déjà rendu l'ENST apparié dans `mane_select`,
 *    et la numérotation c. est la même des deux côtés : c'est la définition même de
 *    MANE Select (même intervalle génomique, même CDS, mêmes UTR, à la base près).
 *    Rien à demander, la ligne s'affiche aussitôt que l'identité.
 * 2. **Repli VariantValidator sur un transcrit MANE** — l'appariement est demandé à la
 *    piste `mane` d'UCSC (997 octets, ~0,8 s) plutôt qu'à VEP, puisque c'est la table
 *    de MANE elle-même. La même garantie qu'au cas 1 s'applique alors à la
 *    numérotation c., et Ensembl n'est pas sollicité du tout.
 * 3. **Transcrit non-MANE** — un second appel à VEP, sur le
 *    cache Ensembl cette fois, car VEP sert l'un **ou** l'autre jeu de transcrits.
 *    L'ENST retenu est, dans l'ordre : celui que VEP apparie lui-même au transcrit
 *    saisi, puis celui dont la numérotation c. est **identique** (même CDS, donc une
 *    nomenclature qui se lit comme l'autre), puis le MANE Select, puis le canonique.
 *    Les deux derniers décrivent un **autre** transcrit : l'interface le dit, et la
 *    nomenclature rendue porte de toute façon sa propre accession ENST.
 *
 * Renvoie `null` plutôt que d'échouer : cette ligne n'entre dans aucun chiffre et dans
 * aucune phrase du commentaire.
 */
/**
 * ENST apparié au transcrit RefSeq retenu, lu dans la table MANE (UCSC).
 *
 * L'appariement est reconnu sur `ncbiId`, jamais sur l'ordre des lignes : un gène qui
 * a un transcrit MANE Plus Clinical en rend deux. La version est comparée d'abord
 * telle quelle, puis sans elle — UCSC ne sert que la version courante, et une saisie
 * sur `NM_000546.5` doit continuer d'afficher la ligne (même raison que `pickRecord`,
 * js/structure.js).
 *
 * `null` dès que l'appariement n'existe pas — transcrit non-MANE, ou UCSC muet : c'est
 * le cas qui justifie encore l'appel à VEP.
 */
async function manePairing(variant) {
  if (!variant.transcript || !variant.chr || !variant.pos) return null;
  try {
    const rows = await ucscMane(variant.chr, variant.pos);
    const acc = String(variant.transcript).split('.')[0];
    const row = rows.find((r) => r.ncbiId === variant.transcript)
      || rows.find((r) => String(r.ncbiId || '').split('.')[0] === acc);
    if (!row || !/^ENST/.test(row.name || '')) return null;
    return { transcript: row.name, stat: row.maneStat || null };
  } catch (e) {
    return null;   // la ligne n'entre dans aucun chiffre : VEP reste le recours
  }
}

export async function ensemblTranscript(variant) {
  const c = cPart(variant.hgvsc);
  if (variant.ensemblTranscript) {
    return {
      transcript: variant.ensemblTranscript,
      hgvsc: c ? `${variant.ensemblTranscript}:${c}` : null,
      matched: 'mane',
    };
  }

  // Appariement MANE par UCSC, avant d'aller redemander à Ensembl ce que MANE publie.
  const mane = await manePairing(variant);
  if (mane) {
    return {
      transcript: mane.transcript,
      hgvsc: c ? `${mane.transcript}:${c}` : null,
      matched: 'mane',
      maneStat: mane.stat,
      source: 'UCSC',
    };
  }

  const g = variant.ref && variant.alt
    ? genomicHgvsFromVcf(variant.chr, variant.pos, variant.ref, variant.alt)
    : (variant.genomicHgvs ? String(variant.genomicHgvs).replace(/^chr/, '') : null);
  if (!g) return null;

  const vep = await vepEnsembl(g);
  const item = Array.isArray(vep) ? vep[0] : vep;
  const pool = ((item && item.transcript_consequences) || [])
    .filter((t) => /^ENST/.test(t.transcript_id || '') && t.hgvsc);
  if (!pool.length) return null;

  const acc = variant.transcript ? String(variant.transcript).split('.')[0] : null;
  // Sur le cache Ensembl, `mane_select` porte l'accession **RefSeq** : la réciproque
  // exacte de ce que rend le cache RefSeq.
  const paired = acc && pool.find((t) => String(t.mane_select || '').split('.')[0] === acc);
  const sameC = c && pool.find((t) => cPart(t.hgvsc) === c);
  const other = pool.find((t) => t.mane_select) || pool.find((t) => t.canonical) || pool[0];
  const tc = paired || sameC || other;
  if (!tc) return null;

  return {
    // `hgvsc` porte l'ENST **versionné**, là où `transcript_id` ne l'est pas.
    transcript: String(tc.hgvsc).split(':')[0] || tc.transcript_id,
    hgvsc: tc.hgvsc,
    matched: paired ? 'paired' : (sameC ? 'sameC' : 'other'),
  };
}

/**
 * Délai avant de lancer VariantValidator en parallèle de VEP.
 *
 * VEP en bonne santé répond en ~40 ms (médiane sur 8 mesures, min 34, max 214) ; en
 * mauvaise santé il met 24 s, 51 s, ou ne répond pas. 2 500 ms étaient donc 2,5 s
 * d'attente morte à chaque épisode de lenteur, et le `retries: 2` de `vepHgvs`
 * retardait d'autant la détection d'un échec franc (un HTTP 500 connu dès 160 ms
 * n'était signalé à `hedge` qu'au bout de 2,8 s).
 *
 * 200 ms laissent 5× la médiane de VEP tout en rendant la bascule presque immédiate :
 * pendant un épisode de lenteur d'Ensembl, c'était le plus gros poste restant du chemin
 * critique du repli. VariantValidator n'est donc sollicité en vain que lorsque VEP
 * dépasse 200 ms — et même alors VEP garde la course s'il répond avant lui (~1,3 s à
 * froid, ~200 ms à chaud).
 */
const VEP_HEDGE_DELAY = 200;

/**
 * Un service n'a pas répondu — par opposition à un service qui a répondu en
 * refusant le variant.
 *
 * Seuls 5xx, 429 et 408 sont des pannes. Un 400 ou un 422 est au contraire une
 * **réponse** : le service a lu la description et l'a jugée invalide. Les ranger
 * parmi les pannes ferait conseiller « réessayer dans quelques minutes » pour une
 * saisie qui ne sera jamais acceptée.
 */
function isUnavailable(e) {
  if (!e) return false;
  if (e.code === 'TIMEOUT') return true;
  if (typeof e.status === 'number') return e.status >= 500 || e.status === 429 || e.status === 408;
  return /Failed to fetch|NetworkError|load failed/i.test(errorText(e));
}

/**
 * Échec des deux sources de normalisation : la seule panne qui empêche toute
 * analyse — sans gène ni coordonnées, aucune base n'est interrogeable.
 *
 * Les deux cas qu'il ne faut **pas** confondre :
 *   — les services sont tombés (délai, 503) : le variant est peut-être parfait, il
 *     faut réessayer plus tard ;
 *   — un service a répondu et a **refusé** le variant (base de référence qui ne
 *     correspond pas, transcrit inconnu) : réessayer n'y changera rien, c'est la
 *     saisie qu'il faut corriger.
 * Un refus l'emporte sur une panne : si VariantValidator dit « variant non validé »
 * pendant qu'Ensembl laisse pendre la connexion, c'est le refus qui renseigne.
 */
function normaliseFailure(causes) {
  const refusals = causes.filter((c) => !isUnavailable(c));
  const shown = refusals.length ? refusals : causes;
  const err = new Error([...new Set(shown.map(errorText))].join(' · '));
  err.code = refusals.length ? 'VARIANT_REJECTED' : 'SOURCES_UNAVAILABLE';
  err.causes = causes;
  return err;
}

/**
 * Normalise une saisie en un objet variant complet.
 * @returns {Promise<object>} chr, pos, ref, alt, pseudoVcf, gene, transcript, isMane, …
 */
export async function normalize(input, { onProgress = null } = {}) {
  const parsed = typeof input === 'string' ? parseInput(input) : input;
  if (parsed.kind === 'empty') throw new Error('EMPTY_INPUT');
  if (parsed.kind === 'unknown') throw new Error('UNRECOGNISED_INPUT');

  const wantedTranscript = parsed.kind === 'hgvs' ? parsed.hgvs.split(':')[0] : null;

  // VEP d'abord, VariantValidator lancé en parallèle s'il tarde : Ensembl laisse
  // pendre la connexion plutôt que d'échouer franchement, et on rendait la main
  // au bout de 100 s là où le repli répondait en moins d'une seconde.
  const viaVep = async () => {
    const vep = parsed.kind === 'hgvs'
      ? await vepHgvs(parsed.hgvs)
      : await vepVcf(parsed.chr, parsed.pos, parsed.ref, parsed.alt);
    const it = Array.isArray(vep) ? vep[0] : vep;
    if (!it || it.error) throw new Error(`VEP: ${(it && it.error) || 'aucun résultat'}`);
    return it;
  };

  // Le repli signale aussi son **échec** : quand VariantValidator tombe à son tour,
  // il reste à attendre le délai d'Ensembl (8 s) sans que rien ne l'explique, et
  // l'interface continuait d'annoncer « repli sur VariantValidator » — exactement
  // l'inverse de ce qui se passait.
  const viaFallback = async () => {
    try {
      return await normalizeViaVariantValidator(parsed);
    } catch (e) {
      if (onProgress) onProgress('fallbackFailed');
      throw e;
    }
  };

  let item;
  try {
    item = await hedge(viaVep, viaFallback, {
      delay: VEP_HEDGE_DELAY,
      onSecondary: () => { if (onProgress) onProgress('fallback'); },
    });
  } catch (e) {
    throw normaliseFailure((e && e.causes) || [e]);
  }

  // La course peut être gagnée par le repli, qui renvoie déjà un variant complet.
  if (item && item.source === 'VariantValidator') return item;

  const { tc, selectedBy } = pickTranscript(item, wantedTranscript);
  if (!tc) throw new Error('VEP: aucune conséquence de transcrit');

  // Coordonnées VCF : la saisie telle quelle si elle était en VCF, sinon reconstruite.
  let vcf = parsed.kind === 'vcf'
    ? { chr: parsed.chr, pos: parsed.pos, ref: parsed.ref, alt: parsed.alt }
    : (await vcfFromVep(item)) || {
      chr: String(item.seq_region_name), pos: item.start, ref: null, alt: null,
    };

  // Alignement à gauche des indels : gnomAD, MyVariant, SpliceAI et InterVar
  // attendent la forme VCF, pas la forme HGVS décalée à droite.
  let vcfNormalised = false;
  if (vcf.ref && vcf.alt && vcf.ref.length !== vcf.alt.length) {
    try {
      const reader = refReader(vcf.chr, vcf.pos - 60, vcf.pos + vcf.ref.length + 60);
      const n = await normalizeVcf(vcf.chr, vcf.pos, vcf.ref, vcf.alt, reader);
      vcfNormalised = n.pos !== vcf.pos || n.ref !== vcf.ref;
      vcf = { chr: vcf.chr, ...n };
    } catch (e) {
      // Référence indisponible : on garde la forme non normalisée plutôt que d'échouer.
    }
  }

  const maneTc = (item.transcript_consequences || []).find((t) => t.mane_select
    && /^NM_/.test(t.transcript_id || ''));
  const varType = mapConsequence(tc.consequence_terms || []);

  // VEP écrit la conséquence protéique sans parenthèses ; elle est pourtant déduite,
  // jamais observée (voir predictedProtein).
  const hgvsp = predictedProtein(tc.hgvsp || null);
  // En mode RefSeq, `mane_select` porte l'**ENST** apparié au transcrit RefSeq choisi :
  // le transcrit Ensembl est donc déjà connu, sans second appel (voir ensemblTranscript).
  const ensembl = /^ENST\d/.test(String(tc.mane_select || '')) ? String(tc.mane_select) : null;

  const exonField = tc.exon || null;   // « 5/11 »
  const intronField = tc.intron || null;
  const loc = exonField ? 'exon' : (intronField ? 'intron' : null);
  const locField = exonField || intronField;

  return {
    input: parsed,
    chr: vcf.chr,
    pos: vcf.pos,
    ref: vcf.ref,
    alt: vcf.alt,
    pseudoVcf: vcf.ref ? `${vcf.chr}-${vcf.pos}-${vcf.ref}-${vcf.alt}` : null,
    gnomadId: vcf.ref ? `${vcf.chr}-${vcf.pos}-${vcf.ref}-${vcf.alt}` : null,
    vcfNormalised,
    // MyVariant indexe la forme alignée à gauche ; la nomenclature du compte rendu
    // garde la forme HGVS (décalée à droite dans une répétition), celle de VEP.
    myVariantId: vcf.ref ? hgvsFromVcf(vcf.chr, vcf.pos, vcf.ref, vcf.alt) : myVariantId(item),
    genomicHgvs: genomicHgvs(item),
    gene: tc.gene_symbol || parsed.gene || null,
    transcript: tc.transcript_id || null,
    transcriptSelectedBy: selectedBy,
    isMane: Boolean(tc.mane_select),
    maneTranscript: maneTc ? maneTc.transcript_id : null,
    consequenceTerms: tc.consequence_terms || [],
    varType,
    varTypeNull: isNullVariant(varType),
    variantClass: item.variant_class || null,
    loc,
    locNum: locField ? locField.split('/')[0] : null,
    locField,
    hgvsc: tc.hgvsc || null,
    hgvsp,
    proteinChange: cPart(hgvsp),
    ensemblTranscript: ensembl,
    aminoAcids: tc.amino_acids || null,
    domains: tc.domains || [],
    rsid: item.id && /^rs\d+$/.test(item.id) ? item.id : null,
    source: 'VEP',
    varTypeFrom: 'vep',
    degraded: null,
    vepRaw: item,
  };
}

/* ------------------------------------------------------------------ *
 * Repli VariantValidator
 * ------------------------------------------------------------------ */

/**
 * Changement protéique seul : « NP_000537.3:p.(Arg175His) » → « Arg175His ».
 * Accepte les deux écritures, celle de VEP (nue) et celle de VariantValidator
 * (entre parenthèses).
 */
function proteinChangeOf(hgvsp) {
  const s = String(hgvsp || '').split(':').pop();
  const m = s.trim().match(/^p\.\(?(.+?)\)?$/);
  return m ? m[1].trim() : '';
}

/**
 * Conséquence lue sur la **nomenclature protéique**, qui la décrit entièrement :
 * `fs` dit le décalage du cadre, `Ter` final le codon stop prématuré, `=` l'absence
 * de changement, `Met1` le codon d'initiation. L'ordre des tests est celui de la
 * sévérité, car un frameshift se termine lui aussi par `Ter`.
 *
 * `Ter` en **tête** du changement (p.Ter334Leu, p.Ter334extTer15) est l'inverse d'un
 * non-sens : c'est le codon stop qui disparaît. Rendu « non-sens » jusqu'ici, soit la
 * conclusion opposée sur la perte de fonction.
 */
export function proteinConsequence(hgvsp) {
  const change = proteinChangeOf(hgvsp);
  if (!change || change === '?') return null;
  if (/fs/i.test(change)) return 'frameshift';
  if (/^Met1\b/.test(change)) return 'start_lost';
  if (/^Ter\d/.test(change)) return 'stop_lost';
  if (/Ter\d*$/.test(change)) return 'nonsense';
  if (/^=$|=$/.test(change)) return 'synonymous';
  if (/del|ins|dup/i.test(change)) return 'inframe';
  // Faux-sens : trois lettres, position, trois lettres différentes.
  const mis = change.match(/^([A-Za-z]{3})(\d+)([A-Za-z]{3})$/);
  if (mis && mis[1] !== mis[3]) return 'missense';
  return null;
}

/**
 * Première position d'une nomenclature c., décomposée.
 *
 * La grammaire HGVS est sans ambiguïté : `-` en tête = 5'UTR, `*` en tête = 3'UTR,
 * et un `+n`/`-n` en queue = décalage intronique. C'est ce découpage qui manquait —
 * `c.-14C>T`, lu par une expression cherchant « un signe suivi de chiffres », passait
 * pour intronique alors que son `-14` compte depuis l'ATG.
 *
 * @returns {{utr: '5'|'3'|null, offset: number}|null}
 */
function parseCPosition(hgvsc) {
  const s = String(hgvsc || '');
  const body = s.includes(':') ? s.split(':').slice(1).join(':') : s;
  const m = body.replace(/^[cnm]\./, '').match(/^([*-])?(\d+)([+-]\d+)?/);
  if (!m) return null;
  return {
    utr: m[1] === '*' ? '3' : (m[1] === '-' ? '5' : null),
    offset: m[3] ? Number(m[3]) : 0,
  };
}

/**
 * Conséquence déduite des seules nomenclatures — le cas où la structure exonique
 * n'a pas pu être obtenue (voir `consequenceFromStructure`, qui la supplante).
 *
 * Volontairement prudente : si le motif n'est pas reconnu avec certitude, on renvoie
 * `null` et le commentaire **omet** la phrase de type plutôt que de risquer un type
 * faux. L'interface signale alors la source de repli.
 */
export function inferConsequence(hgvsc, hgvsp) {
  const pos = parseCPosition(hgvsc);
  if (!pos) return null;

  if (pos.offset) {
    const d = Math.abs(pos.offset);
    if (d <= CANONICAL_BP) return pos.offset > 0 ? 'splice_donor' : 'splice_acceptor';
    return d <= SPLICE_INTRON_BP ? 'splice_region' : 'intronic';
  }
  if (pos.utr === '5') return 'utr5';
  if (pos.utr === '3') return 'utr3';
  return proteinConsequence(hgvsp);
}

/**
 * Conséquence établie sur la **structure exonique** du transcrit (UCSC) et la
 * nomenclature protéique — le chemin normal du repli, où elle n'est plus devinée.
 *
 * Les deux moitiés sont complémentaires et aucune n'est heuristique : la structure
 * situe la variation (intron, bordure, UTR, exon non codant) en comparant ses
 * coordonnées aux bornes du CDS et des exons ; la nomenclature protéique dit ce qu'il
 * advient de la protéine quand la variation est dans le CDS. VariantValidator fournit
 * la seconde, `fetchStructure` la première — toutes deux sans Ensembl.
 *
 * L'ordre des cas suit celui de `CONSEQUENCE_MAP`, pour que le type rendu ici soit
 * **le même** que celui qu'aurait rendu VEP. En particulier une variation exonique à
 * une ou deux bases d'une jonction reste rendue par son effet protéique — c'est ce
 * que fait VEP, qui place `missense_variant` avant `splice_region_variant` : sa
 * proximité de la jonction est dite ailleurs, par le schéma (voir js/structure.js).
 *
 * @param {object} structure  sortie de `exonsFromUcsc`
 * @param {object} location   sortie de `locate`
 * @param {string} hgvsp      nomenclature protéique, parenthésée ou non
 */
export function consequenceFromStructure(structure, location, hgvsp) {
  if (!structure || !location) return null;

  // La variation emporte une jonction : le site canonique est détruit, quel que soit
  // ce que devient la protéine.
  if (location.kind === 'junction') {
    const sides = location.sides || [];
    return sides.includes('donor') ? 'splice_donor' : 'splice_acceptor';
  }

  if (location.kind === 'intron') {
    const off = location.nearest ? location.nearest.offset : null;
    if (off === null) return 'intronic';
    if (off <= CANONICAL_BP) return location.nearest.side === 'donor' ? 'splice_donor' : 'splice_acceptor';
    return off <= SPLICE_INTRON_BP ? 'splice_region' : 'intronic';
  }

  if (location.kind !== 'exon') return null;      // hors du transcrit

  // Région de la variation dans le transcrit : UTR, ou exon d'un transcrit non codant
  // (NR_, sans CDS). `null` = dans le CDS.
  const region = structure.coding ? utrSide(structure, location.span) : 'noncoding_exon';

  // Hors CDS, la protéine ne dit rien — VariantValidator écrit « p.(=) » pour une
  // variation 5'UTR comme pour une synonyme — et c'est la bordure d'exon qui prime :
  // `splice_region_variant` passe avant `5_prime_UTR_variant` dans CONSEQUENCE_MAP.
  if (region) return location.edge === 'edge' ? 'splice_region' : region;

  // Dans le CDS, l'effet protéique prime à son tour sur la bordure — faux-sens,
  // non-sens et synonyme sont tous au-dessus de `splice_region_variant`.
  const protein = proteinConsequence(hgvsp);
  if (protein) return protein;
  return location.edge === 'edge' ? 'splice_region' : 'coding';
}

/**
 * Côté UTR d'une variation exonique, ou `null` si elle est dans le CDS.
 *
 * `cdsStart`/`cdsEnd` sont des bornes **génomiques** croissantes, même sur le brin − :
 * c'est le brin qui dit laquelle des deux porte l'ATG.
 */
function utrSide(st, span) {
  if (!span) return null;
  const before = span.end < st.cdsStart;
  const after = span.start > st.cdsEnd;
  if (!before && !after) return null;            // à cheval ou dans le CDS
  if (st.strand === 1) return before ? 'utr5' : 'utr3';
  return before ? 'utr3' : 'utr5';
}

/**
 * Nombre total d'exons du transcrit, via gene2transcripts (pour « 5/11 »).
 *
 * Appelé par annotate(), pas par normalize() : la réponse pèse 200 KiB et met de
 * 200 ms à 1,3 s, pour un seul entier absent de la réponse principale de
 * VariantValidator. Sur le chemin critique de la normalisation, elle s'ajoutait
 * telle quelle au total ; dans le bloc parallèle d'annotate() elle passe sous le
 * temps des autres sources.
 */
export async function exonTotal(transcript) {
  try {
    const r = await variantValidatorTranscript(transcript);
    const list = Array.isArray(r) ? r : [r];
    for (const entry of list) {
      for (const tx of (entry && entry.transcripts) || []) {
        if (tx.reference !== transcript) continue;
        const spans = tx.genomic_spans || {};
        // Privilégier l'accession GRCh38 (NC_…\.1[1-9]) présente dans NC_ACCESSION.
        const wanted = new Set(Object.values(NC_ACCESSION));
        const key = Object.keys(spans).find((k) => wanted.has(k)) || Object.keys(spans)[0];
        const exons = key && spans[key] && spans[key].exon_structure;
        if (exons && exons.length) return exons.length;
      }
    }
  } catch (e) { /* total inconnu : on affichera le seul numéro d'exon */ }
  return null;
}

/**
 * Normalise une saisie via VariantValidator, sans Ensembl.
 * @returns {Promise<object>} même forme que normalize(), avec source: 'VariantValidator'
 */
export async function normalizeViaVariantValidator(parsed) {
  let desc;
  if (parsed.kind === 'hgvs') {
    desc = parsed.hgvs;
  } else {
    const acc = NC_ACCESSION[parsed.chr];
    if (!acc) throw new Error('VV: chromosome non pris en charge');
    // « 17:g.7675088C>T » → « NC_000017.11:g.7675088C>T »
    const g = genomicHgvsFromVcf(parsed.chr, parsed.pos, parsed.ref, parsed.alt);
    desc = `${acc}:${g.split(':').slice(1).join(':')}`;
  }

  const r = await variantValidator(desc);
  if (!r) throw new Error('VV: aucune réponse');
  // `mane_select` ne renvoie qu'une entrée (voir variantValidator, js/sources.js) ;
  // le tri reste au cas où plusieurs arriveraient : le transcrit demandé s'il y en a
  // un, sinon celui marqué MANE Select — jamais la première clé venue, dont l'ordre
  // ne veut rien dire.
  const keys = Object.keys(r).filter((k) => k !== 'flag' && k !== 'metadata');
  const wanted = parsed.kind === 'hgvs' ? parsed.hgvs.split(':')[0].split('.')[0] : null;
  const key = (wanted && keys.find((k) => k.split(':')[0].split('.')[0] === wanted))
    || keys.find((k) => ((r[k] || {}).annotations || {}).mane_select)
    || keys[0];
  if (!key) throw new Error('VV: aucun résultat');
  const v = r[key];
  const warnings = v.validation_warnings || [];
  if (!v.hgvs_transcript_variant) {
    throw new Error(`VV: ${warnings[0] || 'variant non validé'}`);
  }

  const loci = (v.primary_assembly_loci || {}).grch38 || {};
  const vcfRaw = loci.vcf || {};
  const chr = String(vcfRaw.chr || '').replace(/^chr/i, '');
  const hgvsc = v.hgvs_transcript_variant;
  const transcript = hgvsc.split(':')[0];
  const hgvspRaw = (v.hgvs_predicted_protein_consequence || {}).tlr || null;
  // VariantValidator écrit les conséquences protéiques entre parenthèses (prédites),
  // et « p.? » quand l'effet protéique est indéterminé (épissage, intronique).
  // La forme nue sert à `inferConsequence`, dont les motifs lisent le changement
  // lui-même ; la forme rendue est reparenthésée comme celle de VEP.
  const hgvspClean = hgvspRaw ? hgvspRaw.replace(/\((.*)\)/, '$1') : null;
  const hgvsp = hgvspClean && !/:p\.\(?\?\)?$/.test(hgvspClean) ? hgvspClean : null;
  const hgvspOut = predictedProtein(hgvsp);

  let vcf = { chr, pos: Number(vcfRaw.pos), ref: vcfRaw.ref, alt: vcfRaw.alt };
  if (vcf.ref && vcf.alt && vcf.ref.length !== vcf.alt.length) {
    try {
      const reader = refReader(vcf.chr, vcf.pos - 60, vcf.pos + vcf.ref.length + 60);
      vcf = { chr: vcf.chr, ...(await normalizeVcf(vcf.chr, vcf.pos, vcf.ref, vcf.alt, reader)) };
    } catch (e) { /* on garde la forme de VariantValidator, déjà normalisée en principe */ }
  }

  const exonPos = v.variant_exonic_positions || {};
  const exonKey = Object.keys(exonPos).find((k) => k === NC_ACCESSION[chr]) || Object.keys(exonPos)[0];
  const rawExon = exonKey ? (exonPos[exonKey] || {}).start_exon : null;

  // VariantValidator suffixe les positions introniques par « i » : « 22i » = intron 22.
  const isIntron = rawExon ? /i$/i.test(String(rawExon)) : false;
  const exonNum = rawExon ? String(rawExon).replace(/i$/i, '') : null;
  const varType = inferConsequence(hgvsc, hgvsp);
  const loc = exonNum ? (isIntron ? 'intron' : 'exon') : null;

  const annotations = v.annotations || {};
  const dbx = annotations.db_xref || {};

  return {
    input: parsed,
    source: 'VariantValidator',
    chr,
    pos: vcf.pos,
    ref: vcf.ref,
    alt: vcf.alt,
    pseudoVcf: vcf.ref ? `${vcf.chr}-${vcf.pos}-${vcf.ref}-${vcf.alt}` : null,
    gnomadId: vcf.ref ? `${vcf.chr}-${vcf.pos}-${vcf.ref}-${vcf.alt}` : null,
    vcfNormalised: false,
    myVariantId: vcf.ref ? hgvsFromVcf(vcf.chr, vcf.pos, vcf.ref, vcf.alt) : null,
    genomicHgvs: loci.hgvs_genomic_description
      ? `chr${chr}:${loci.hgvs_genomic_description.split(':').slice(1).join(':')}`
      : (vcf.ref ? hgvsFromVcf(vcf.chr, vcf.pos, vcf.ref, vcf.alt) : null),
    gene: v.gene_symbol || null,
    transcript,
    transcriptSelectedBy: parsed.kind === 'hgvs' ? 'input' : 'mane',
    isMane: Boolean(annotations.mane_select),
    maneTranscript: annotations.mane_select ? transcript : null,
    consequenceTerms: varType ? [varType] : [],
    varType,
    varTypeNull: isNullVariant(varType),
    variantClass: null,
    loc,
    locNum: exonNum ? String(exonNum) : null,
    // Numéro seul ici ; annotate() le complète en « 5/11 » (voir exonTotal).
    locField: exonNum ? String(exonNum) : null,
    exonTotalFor: exonNum && transcript ? transcript : null,
    hgvsc,
    hgvsp: hgvspOut,
    proteinChange: cPart(hgvspOut),
    // Le repli ne donne pas d'équivalent Ensembl : il sera demandé à VEP si Ensembl
    // est revenu d'ici là (voir ensemblTranscript).
    ensemblTranscript: null,
    aminoAcids: null,
    domains: [],
    rsid: null,
    hgncId: dbx.hgnc ? String(dbx.hgnc).replace('HGNC:', '') : null,
    ncbiGeneId: dbx.ncbigene ? String(dbx.ncbigene) : null,
    // Type lu sur les seules nomenclatures : provisoire. La structure exonique le
    // remplace par un type établi dès qu'UCSC répond (voir assemble, js/annotate.js).
    varTypeFrom: 'hgvs',
    degraded: varType === null ? 'CONSEQUENCE_UNKNOWN' : null,
    vepRaw: null,
  };
}
