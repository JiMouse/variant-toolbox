// Saisie → variant normalisé. Deux entrées possibles :
//   HGVS     NM_000546.6:c.524G>A  (le nom du gène entre parenthèses est accepté)
//   pseudo-VCF hg38  chr17-7675088-C-T
// La normalisation passe toujours par VEP : c'est elle qui fixe gène, transcrit,
// conséquence, exon/intron et les nomenclatures c./p./g.

import { vepHgvs, vepVcf, refBase, refSeq } from './sources.js';

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

/** HGVS génomique dérivé d'une représentation VCF normalisée. */
export function hgvsFromVcf(chr, pos, ref, alt) {
  const c = `chr${chr}`;
  if (ref.length === 1 && alt.length === 1) return `${c}:g.${pos}${ref}>${alt}`;
  if (alt.length < ref.length && ref.startsWith(alt)) { // délétion
    const start = pos + alt.length;
    const end = pos + ref.length - 1;
    return start === end ? `${c}:g.${start}del` : `${c}:g.${start}_${end}del`;
  }
  if (ref.length < alt.length && alt.startsWith(ref)) { // insertion
    const start = pos + ref.length - 1;
    return `${c}:g.${start}_${start + 1}ins${alt.slice(ref.length)}`;
  }
  const start = pos;
  const end = pos + ref.length - 1;
  return start === end ? `${c}:g.${start}delins${alt}` : `${c}:g.${start}_${end}delins${alt}`;
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
 * Normalise une saisie en un objet variant complet.
 * @returns {Promise<object>} chr, pos, ref, alt, pseudoVcf, gene, transcript, isMane, …
 */
export async function normalize(input) {
  const parsed = typeof input === 'string' ? parseInput(input) : input;
  if (parsed.kind === 'empty') throw new Error('EMPTY_INPUT');
  if (parsed.kind === 'unknown') throw new Error('UNRECOGNISED_INPUT');

  const wantedTranscript = parsed.kind === 'hgvs' ? parsed.hgvs.split(':')[0] : null;
  const vep = parsed.kind === 'hgvs'
    ? await vepHgvs(parsed.hgvs)
    : await vepVcf(parsed.chr, parsed.pos, parsed.ref, parsed.alt);

  const item = Array.isArray(vep) ? vep[0] : vep;
  if (!item || item.error) throw new Error(`VEP: ${(item && item.error) || 'aucun résultat'}`);

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
    vepRaw: item,
  };
}
