// Structure exonique du transcrit, et place exacte de la variation dedans.
//
// Répond à une question que ni la conséquence VEP ni « exon 5/11 » ne tranchent :
// **la variation est-elle en bordure d'exon ?** Un faux-sens posé sur la dernière base
// d'un exon n'est pas un faux-sens ordinaire — il touche le site donneur, et la
// conséquence rendue par VEP (`missense_variant`) ne le dit pas toujours. Le chiffre
// qui répond est la distance en paires de bases entre la variation et la jonction la
// plus proche : tout ce module sert à la calculer, et js/schema.js à la dessiner.
//
// Aucun accès au DOM ici : les fonctions pures sont testées sous Node
// (tools/test-structure.mjs).

import { ucscRefSeq } from './sources.js';

/**
 * Bordure exonique : les **trois** premières ou dernières bases de l'exon.
 *
 * C'est la définition de `splice_region_variant` chez VEP (1 à 3 bases de l'exon,
 * 3 à 8 bases de l'intron) et la zone où une substitution exonique peut altérer le
 * site d'épissage. Exprimé en distance à la jonction : 0 = la variation est *sur* la
 * base de bordure, donc la bordure est `dist < EDGE_BP`.
 */
export const EDGE_BP = 3;

/** Au-delà de la bordure, « proche » jusqu'à la 10e base de l'exon. */
export const NEAR_BP = 10;

/** Site d'épissage canonique : +1, +2 (donneur) et −1, −2 (accepteur). */
export const CANONICAL_BP = 2;

/** Région d'épissage intronique de VEP : jusqu'à 8 bases dans l'intron. */
export const SPLICE_INTRON_BP = 8;

/** Fenêtre dessinée de part et d'autre d'une jonction, en pb. */
export const FLANK = 25;

/** Au-delà, le zoom perd son sens de « vue à la base » : on cadre sur la jonction. */
export const MAX_WINDOW = 420;

/**
 * Intervalle génomique réellement touché par la variation (bornes 1-based incluses).
 *
 * La forme VCF porte une base d'**ancrage** pour les indels : `117559590 ATCT>A` ne
 * touche pas la position 117559590 mais les trois suivantes. La prendre telle quelle
 * fausserait la distance à la jonction d'autant de bases que compte l'ancrage.
 * Une insertion n'a pas de base touchée : elle est rendue comme le couple de bases
 * qui l'encadre.
 */
export function variantSpan({ pos, ref, alt }) {
  const p = Number(pos);
  if (!Number.isFinite(p)) return null;
  if (!ref || !alt) return { start: p, end: p, kind: 'point' };
  let r = String(ref).toUpperCase();
  let a = String(alt).toUpperCase();
  let off = 0;
  while (r.length && a.length && r[0] === a[0]) { r = r.slice(1); a = a.slice(1); off += 1; }
  while (r.length && a.length && r[r.length - 1] === a[a.length - 1]) {
    r = r.slice(0, -1);
    a = a.slice(0, -1);
  }
  const start = p + off;
  // Insertion : aucune base de référence touchée, l'événement tient entre deux bases.
  if (!r.length) return { start: start - 1, end: start, kind: 'ins' };
  const kind = !a.length ? 'del' : (r.length === a.length ? 'sub' : 'delins');
  return { start, end: start + r.length - 1, kind };
}

/**
 * Enregistrement UCSC du transcrit demandé, parmi ceux qui couvrent la position.
 *
 * La version est comparée d'abord telle quelle, puis sans elle : UCSC ne sert que la
 * version courante de chaque accession, et une saisie sur `NM_000546.5` doit
 * continuer d'afficher une structure — avec la mention du décalage de version, car
 * les bornes d'exons peuvent avoir changé.
 */
export function pickRecord(items, transcript, pos) {
  if (!transcript) return null;
  const p = Number(pos);
  const covers = (it) => !Number.isFinite(p) || (it.txStart < p && p <= it.txEnd);
  const list = (items || []).filter((it) => it && it.name && it.exonStarts);
  const acc = String(transcript).split('.')[0];
  const exact = list.filter((it) => it.name === transcript);
  const loose = list.filter((it) => String(it.name).split('.')[0] === acc);
  for (const pool of [exact, loose]) {
    const hit = pool.find(covers) || pool[0];
    if (hit) return { item: hit, versionMismatch: hit.name !== transcript };
  }
  return null;
}

/**
 * Enregistrement UCSC → structure exonique, exons dans l'ordre du **transcrit**.
 *
 * UCSC numérote les exons dans le sens du génome : sur un gène du brin −, son premier
 * exon est le dernier du transcrit. Les rendre dans l'ordre du transcrit est ce qui
 * fait coïncider la numérotation avec celle de VEP, de la nomenclature HGVS et du
 * compte rendu. Ses coordonnées sont par ailleurs à base 0 et demi-ouvertes, d'où le
 * « + 1 » sur chaque début.
 */
export function exonsFromUcsc(item) {
  if (!item) return null;
  const starts = String(item.exonStarts).split(',').filter((s) => s !== '').map(Number);
  const ends = String(item.exonEnds).split(',').filter((s) => s !== '').map(Number);
  if (!starts.length || starts.length !== ends.length) return null;
  const strand = item.strand === '-' ? -1 : 1;
  const asc = starts.map((s, i) => ({ start: s + 1, end: ends[i] }));
  const ordered = strand === -1 ? asc.slice().reverse() : asc;
  const cdsStart = Number(item.cdsStart) + 1;
  const cdsEnd = Number(item.cdsEnd);
  return {
    transcript: item.name,
    gene: item.name2 || null,
    chr: String(item.chrom || '').replace(/^chr/i, ''),
    strand,
    total: ordered.length,
    // Un transcrit non codant (NR_) a cdsStart == cdsEnd : tout l'exon est « non codant ».
    coding: cdsStart <= cdsEnd,
    cdsStart,
    cdsEnd,
    txStart: Number(item.txStart) + 1,
    txEnd: Number(item.txEnd),
    exons: ordered.map((e, i) => ({
      number: i + 1, start: e.start, end: e.end, length: e.end - e.start + 1,
    })),
  };
}

/** Bornes génomiques de l'intron qui suit l'exon n° `n` (1 ≤ n < total). */
export function intronBounds(st, n) {
  const a = st.exons[n - 1];
  const b = st.exons[n];
  if (!a || !b) return null;
  return st.strand === 1
    ? { start: a.end + 1, end: b.start - 1 }
    : { start: b.end + 1, end: a.start - 1 };
}

function classifyExon(dist) {
  if (dist < EDGE_BP) return 'edge';
  if (dist < NEAR_BP) return 'near';
  return 'inside';
}

function classifyIntron(offset) {
  if (offset <= CANONICAL_BP) return 'canonical';
  if (offset <= SPLICE_INTRON_BP) return 'splice';
  return 'deep';
}

/**
 * Fenêtre génomique du zoom, en gardant la jonction utile **et** la variation.
 *
 * L'exon entier quand il tient dans MAX_WINDOW — les deux jonctions sont alors
 * visibles à l'échelle de la base, ce qui est le cas le plus parlant. Sinon la
 * fenêtre est cadrée sur la jonction la plus proche et étirée jusqu'à la variation :
 * une seule échelle linéaire, sans rupture, donc aucune distance trompeuse à l'œil.
 */
function zoomWindow(span, anchor, exon) {
  if (exon && exon.length + 2 * FLANK <= MAX_WINDOW) {
    return { start: exon.start - FLANK, end: exon.end + FLANK };
  }
  const lo = Math.min(span.start, anchor) - FLANK;
  const hi = Math.max(span.end, anchor) + FLANK;
  return { start: lo, end: hi };
}

/**
 * Place la variation dans la structure, et mesure sa distance aux jonctions.
 *
 * Les distances sont comptées dans le sens du **transcrit** : `dist3` sépare la
 * variation de la dernière base de l'exon (site donneur), `dist5` de la première
 * (site accepteur). `0` signifie que la variation est posée *sur* la base de bordure.
 * Pour une variation intronique, `offsetDonor` et `offsetAcceptor` sont exactement
 * les décalages de la nomenclature HGVS (`c.123+5`, `c.124-12`), ce qui rend le
 * calcul vérifiable sur `hgvsc`.
 *
 * @returns {object|null} { kind, exon, intron, dist5, dist3, nearest, edge, window, … }
 */
export function locate(st, span) {
  if (!st || !span) return null;
  const { start, end } = span;
  // Exons touchés, même partiellement : une délétion peut emporter une bordure, voire
  // un exon entier et ses deux jonctions.
  const touched = st.exons.filter((e) => end >= e.start && start <= e.end);
  const inside = touched.length === 1 && start >= touched[0].start && end <= touched[0].end;

  if (inside) {
    const e = touched[0];
    const dist5 = st.strand === 1 ? start - e.start : e.end - end;
    const dist3 = st.strand === 1 ? e.end - end : start - e.start;
    const first = e.number === 1;
    const last = e.number === st.total;
    // Pas de jonction au bout du transcrit : le premier exon n'a pas d'accepteur,
    // le dernier pas de donneur.
    const cand = [
      !first && { side: 'acceptor', dist: dist5, boundary: st.strand === 1 ? e.start : e.end },
      !last && { side: 'donor', dist: dist3, boundary: st.strand === 1 ? e.end : e.start },
    ].filter(Boolean);
    const nearest = cand.length
      ? cand.reduce((m, c) => (c.dist < m.dist ? c : m))
      : null;
    return {
      kind: 'exon',
      exon: e.number,
      exonLength: e.length,
      offsetInExon: dist5 + 1,
      dist5: first ? null : dist5,
      dist3: last ? null : dist3,
      intron: null,
      offsetDonor: null,
      offsetAcceptor: null,
      nearest,
      edge: nearest ? classifyExon(nearest.dist) : 'inside',
      span,
      window: zoomWindow(span, nearest ? nearest.boundary : e.start, e),
    };
  }

  if (!touched.length) {
    // Intron : celui dont les bornes encadrent la variation.
    for (let n = 1; n < st.total; n++) {
      const b = intronBounds(st, n);
      if (!b || start < b.start || end > b.end) continue;
      const prev = st.exons[n - 1];
      const next = st.exons[n];
      const offsetDonor = st.strand === 1 ? start - prev.end : prev.start - end;
      const offsetAcceptor = st.strand === 1 ? next.start - end : start - next.end;
      const nearest = offsetDonor <= offsetAcceptor
        ? { side: 'donor', dist: offsetDonor, offset: offsetDonor, boundary: st.strand === 1 ? prev.end : prev.start }
        : { side: 'acceptor', dist: offsetAcceptor, offset: offsetAcceptor, boundary: st.strand === 1 ? next.start : next.end };
      return {
        kind: 'intron',
        exon: null,
        exonLength: null,
        offsetInExon: null,
        dist5: null,
        dist3: null,
        intron: n,
        offsetDonor,
        offsetAcceptor,
        nearest,
        edge: classifyIntron(nearest.offset),
        span,
        window: zoomWindow(span, nearest.boundary, null),
      };
    }
    return { kind: 'outside', span, window: zoomWindow(span, start, null), edge: 'outside', nearest: null };
  }

  /* À cheval sur au moins une bordure : la variation *est* sur la jonction, distance 0.
   *
   * Le côté franchi se lit sur les coordonnées, pas sur l'ordre génomique du span :
   * sur un gène du brin −, la borne génomique basse d'un exon est son extrémité 3'
   * (donneur) et la haute son extrémité 5' (accepteur). Choisir d'après `span.start`
   * désignait la jonction opposée — donc une fenêtre de zoom cadrée plusieurs
   * centaines de paires de bases à côté de la variation. */
  const e = touched[0];
  const last = touched[touched.length - 1];
  const crossesLow = start < e.start;         // sort par la borne génomique basse
  const crossesHigh = end > last.end;         // sort par la borne génomique haute
  const lowIsDonor = st.strand === -1;
  const boundary = crossesLow ? e.start : last.end;
  const side = (crossesLow ? lowIsDonor : !lowIsDonor) ? 'donor' : 'acceptor';
  return {
    kind: 'junction',
    exon: e.number,
    exonLength: e.length,
    offsetInExon: null,
    dist5: null,
    dist3: null,
    intron: null,
    offsetDonor: null,
    offsetAcceptor: null,
    // Un exon emporté en entier a ses deux jonctions touchées : les deux sont nommées.
    sides: crossesLow && crossesHigh ? ['donor', 'acceptor'] : [side],
    wholeExons: touched.filter((x) => start <= x.start && end >= x.end).map((x) => x.number),
    nearest: { side, dist: 0, boundary },
    edge: 'junction',
    span,
    window: zoomWindow(span, boundary, null),
  };
}

/**
 * Structure du transcrit et place de la variation, prêtes à dessiner.
 *
 * Renvoie aussi `total` — le nombre d'exons du transcrit — que la normalisation par
 * VariantValidator ne fournit pas (voir `assemble`, « exon 5/11 »). UCSC le donne au
 * passage, ce qui évite l'appel `gene2transcripts` de 203 KiB qui ne servait qu'à ça.
 *
 * `mismatch` signale un désaccord entre le numéro d'exon calculé ici et celui de la
 * normalisation : il ne doit pas arriver, et s'il arrive l'interface le dit plutôt
 * que d'afficher un schéma rassurant mais faux.
 */
export async function fetchStructure(variant) {
  if (!variant || !variant.chr || !variant.pos || !variant.transcript) return null;
  const items = await ucscRefSeq(variant.chr, variant.pos);
  const picked = pickRecord(items, variant.transcript, variant.pos);
  if (!picked) return null;
  const structure = exonsFromUcsc(picked.item);
  if (!structure) return null;
  const location = locate(structure, variantSpan(variant));

  let mismatch = null;
  const expected = variant.locNum ? Number(variant.locNum) : null;
  const got = location && (location.kind === 'intron' ? location.intron : location.exon);
  if (expected && got && variant.loc && location
      && (location.kind === 'exon' || location.kind === 'intron')
      && (got !== expected || location.kind !== variant.loc)) {
    mismatch = { expected: `${variant.loc} ${expected}`, got: `${location.kind} ${got}` };
  }

  return {
    structure,
    location,
    total: structure.total,
    versionMismatch: picked.versionMismatch ? picked.item.name : null,
    mismatch,
  };
}
