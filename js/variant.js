// Saisie → variant normalisé. Deux entrées possibles :
//   HGVS     NM_000546.6:c.524G>A  (le nom du gène entre parenthèses est accepté)
//   pseudo-VCF hg38  chr17-7675088-C-T
// La normalisation passe toujours par VEP : c'est elle qui fixe gène, transcrit,
// conséquence, exon/intron et les nomenclatures c./p./g.

import {
  vepHgvs, vepVcf, refBase, refSeq, genomicHgvsFromVcf,
  variantValidator, variantValidatorTranscript, NC_ACCESSION,
} from './sources.js';
import { hedge, errorText } from './util.js';

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
    hgvsp: tc.hgvsp || null,
    proteinChange: tc.hgvsp ? tc.hgvsp.split(':')[1] || null : null,
    aminoAcids: tc.amino_acids || null,
    domains: tc.domains || [],
    rsid: item.id && /^rs\d+$/.test(item.id) ? item.id : null,
    source: 'VEP',
    degraded: null,
    vepRaw: item,
  };
}

/* ------------------------------------------------------------------ *
 * Repli VariantValidator
 * ------------------------------------------------------------------ */

/**
 * Conséquence déduite des nomenclatures, quand VEP n'est pas joignable.
 * Volontairement prudente : si le motif n'est pas reconnu avec certitude, on
 * renvoie `null` et le commentaire **omet** la phrase de type plutôt que de
 * risquer un type faux. L'interface signale alors la source de repli.
 */
export function inferConsequence(hgvsc, hgvsp) {
  const c = String(hgvsc || '');
  const p = String(hgvsp || '');
  const cPart = c.includes(':') ? c.split(':').slice(1).join(':') : c;

  // Épissage canonique : ±1 et ±2 d'une bordure d'intron.
  const splice = cPart.match(/[+-](\d+)[ACGT>_a-z]/);
  if (/\+[12][ACGT]?>/.test(cPart) || /\+[12]_/.test(cPart)) return 'splice_donor';
  if (/-[12][ACGT]?>/.test(cPart) || /-[12]_/.test(cPart)) return 'splice_acceptor';
  if (splice) return 'intronic';

  if (/fsTer|fs\b|fs$/i.test(p)) return 'frameshift';
  if (/Ter\d*\)?$/.test(p) && !/fs/i.test(p)) return 'nonsense';
  if (/p\.\(?=\)?$|p\.\(?[A-Za-z]{3}\d+=\)?$/.test(p)) return 'synonymous';
  if (/^p\.\(?Met1\b/.test(p)) return 'start_lost';
  if (/del$|del\b/.test(cPart) && /del\)?$/.test(p)) return 'inframe';
  if (/ins/.test(cPart) && /ins/i.test(p)) return 'inframe';
  // Faux-sens : trois lettres, position, trois lettres différentes.
  const mis = p.match(/p\.\(?([A-Za-z]{3})(\d+)([A-Za-z]{3})\)?$/);
  if (mis && mis[1] !== mis[3] && mis[3] !== 'Ter') return 'missense';
  return null;
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
  const key = Object.keys(r).find((k) => k !== 'flag' && k !== 'metadata');
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
  const hgvspClean = hgvspRaw ? hgvspRaw.replace(/\((.*)\)/, '$1') : null;
  const hgvsp = hgvspClean && !/:p\.\(?\?\)?$/.test(hgvspClean) ? hgvspClean : null;

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
    hgvsp,
    proteinChange: hgvsp ? hgvsp.split(':').slice(1).join(':') || null : null,
    aminoAcids: null,
    domains: [],
    rsid: null,
    hgncId: dbx.hgnc ? String(dbx.hgnc).replace('HGNC:', '') : null,
    ncbiGeneId: dbx.ncbigene ? String(dbx.ncbigene) : null,
    degraded: varType === null ? 'CONSEQUENCE_UNKNOWN' : null,
    vepRaw: null,
  };
}
