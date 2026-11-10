#!/usr/bin/env node
// Tests de la géométrie exonique, sans réseau : la structure RefSeq est fournie telle
// que l'API UCSC la rend, et chaque distance attendue est vérifiable à la main sur la
// nomenclature HGVS correspondante.
//
//   node tools/test-structure.mjs

import {
  variantSpan, exonsFromUcsc, pickRecord, intronBounds, locate,
} from '../js/structure.js';

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  console.log(`✗ ${name}\n  attendu : ${e}\n  obtenu  : ${a}`);
}

/* — Enregistrements UCSC réels (hg38, piste ncbiRefSeq) — */

// TP53, brin −, 11 exons. Exon 4 : 7675994-7676272, exon 5 : 7675053-7675236.
const TP53 = {
  name: 'NM_000546.6',
  name2: 'TP53',
  chrom: 'chr17',
  strand: '-',
  txStart: 7668420,
  txEnd: 7687490,
  cdsStart: 7669608,
  cdsEnd: 7676594,
  exonStarts: '7668420,7670608,7673534,7673700,7674180,7674858,7675052,7675993,7676381,7676520,7687376,',
  exonEnds: '7669690,7670715,7673608,7673837,7674290,7674971,7675236,7676272,7676403,7676622,7687490,',
};

// CFTR, brin +, 27 exons — seuls les quatre premiers sont nécessaires ici.
const CFTR = {
  name: 'NM_000492.4',
  name2: 'CFTR',
  chrom: 'chr7',
  strand: '+',
  txStart: 117480024,
  txEnd: 117668665,
  cdsStart: 117480095,
  cdsEnd: 117667106,
  exonStarts: '117480024,117548616,117550766,117579824,',
  exonEnds: '117480148,117548702,117550925,117579929,',
};

const tp53 = exonsFromUcsc(TP53);
const cftr = exonsFromUcsc(CFTR);

/* — Lecture de la structure — */

check('TP53 : 11 exons', tp53.total, 11);
check('TP53 : brin −', tp53.strand, -1);
// UCSC numérote dans le sens du génome ; sur le brin −, son premier exon est le dernier
// du transcrit. C'est cette inversion qui fait coïncider la numérotation avec VEP.
check('TP53 : exon 1 = le plus en 3′ du génome',
  [tp53.exons[0].start, tp53.exons[0].end], [7687377, 7687490]);
check('TP53 : exon 5 (bornes 1-based)',
  [tp53.exons[4].start, tp53.exons[4].end, tp53.exons[4].length], [7675053, 7675236, 184]);
check('TP53 : exon 11 est le dernier',
  [tp53.exons[10].start, tp53.exons[10].end], [7668421, 7669690]);
check('CFTR : brin +, exon 1 en premier',
  [cftr.strand, cftr.exons[0].start, cftr.exons[0].end], [1, 117480025, 117480148]);
check('TP53 : intron 4 (entre exons 4 et 5)', intronBounds(tp53, 4), { start: 7675237, end: 7675993 });
check('CFTR : intron 1', intronBounds(cftr, 1), { start: 117480149, end: 117548616 });

/* — Intervalle réellement touché (la base d'ancrage VCF ne l'est pas) — */

check('substitution', variantSpan({ pos: 7675088, ref: 'C', alt: 'T' }),
  { start: 7675088, end: 7675088, kind: 'sub' });
// CFTR p.Phe508del : 7-117559590-ATCT-A touche 117559591 à 117559593, pas 117559590.
check('délétion : l’ancrage n’est pas touché', variantSpan({ pos: 117559590, ref: 'ATCT', alt: 'A' }),
  { start: 117559591, end: 117559593, kind: 'del' });
check('insertion : entre deux bases', variantSpan({ pos: 100, ref: 'A', alt: 'ATTT' }),
  { start: 100, end: 101, kind: 'ins' });
check('delins', variantSpan({ pos: 100, ref: 'AGG', alt: 'AC' }),
  { start: 101, end: 102, kind: 'delins' });
// Deux bases remplacées par deux autres : une substitution, pas un delins — et le
// préfixe commun ne fait pas partie de l'intervalle touché.
check('substitution multi-base', variantSpan({ pos: 100, ref: 'AGG', alt: 'ACC' }),
  { start: 101, end: 102, kind: 'sub' });

/* — Position dans la structure —
 * Les distances sont comptées dans le sens du transcrit : `dist3` sépare la variation
 * de la dernière base de l'exon (site donneur), `dist5` de la première (accepteur). */

const at = (st, pos, ref = 'C', alt = 'T') => locate(st, variantSpan({ pos, ref, alt }));

// NM_000546.6:c.524G>A — 149e base de l'exon 5 (184 pb) : 148 pb après l'accepteur,
// 35 pb avant le donneur. 148 + 1 + 35 = 184.
const c524 = at(tp53, 7675088);
check('TP53 c.524G>A : exon 5', [c524.kind, c524.exon], ['exon', 5]);
check('TP53 c.524G>A : base 149 de l’exon', c524.offsetInExon, 149);
check('TP53 c.524G>A : distances', [c524.dist5, c524.dist3], [148, 35]);
check('TP53 c.524G>A : somme = longueur de l’exon',
  c524.dist5 + 1 + c524.dist3, tp53.exons[4].length);
check('TP53 c.524G>A : au cœur de l’exon', c524.edge, 'inside');
check('TP53 c.524G>A : jonction la plus proche',
  [c524.nearest.side, c524.nearest.dist], ['donor', 35]);
// L'exon tient dans la fenêtre : les deux jonctions sont dessinées, flanc compris.
check('TP53 c.524G>A : fenêtre = exon entier ± 25 pb',
  [c524.window.start, c524.window.end], [7675028, 7675261]);

// NM_000546.6:c.375G>A — dernière base de l'exon 4, donc sur la bordure donneuse.
const c375 = at(tp53, 7675994);
check('TP53 c.375G>A : dernière base de l’exon 4',
  [c375.exon, c375.offsetInExon, c375.dist3], [4, 279, 0]);
check('TP53 c.375G>A : bordure exonique', c375.edge, 'edge');
check('TP53 c.375G>A : côté donneur', c375.nearest.side, 'donor');

// Troisième base avant la bordure : encore « bordure » (bases 1 à 3 de l'exon).
check('TP53 : 3e base avant le donneur = bordure', at(tp53, 7675996).edge, 'edge');
// Quatrième : « proche », plus « bordure ».
check('TP53 : 4e base avant le donneur = proche', at(tp53, 7675997).edge, 'near');
check('TP53 : 11e base avant le donneur = au cœur', at(tp53, 7676004).edge, 'inside');

// Premier et dernier exon : pas de jonction au bout du transcrit.
check('TP53 : exon 1 n’a pas de jonction acceptrice', at(tp53, 7687400).dist5, null);
check('TP53 : exon 11 n’a pas de jonction donneuse', at(tp53, 7669000).dist3, null);

// NM_000546.6:c.376-1G>A — première base de l'intron 4 côté accepteur.
const acc1 = at(tp53, 7675237);
check('TP53 c.376-1G>A : intron 4', [acc1.kind, acc1.intron], ['intron', 4]);
check('TP53 c.376-1G>A : décalages HGVS', [acc1.offsetDonor, acc1.offsetAcceptor], [757, 1]);
check('TP53 c.376-1G>A : site canonique', acc1.edge, 'canonical');
check('TP53 c.376-1G>A : côté accepteur', acc1.nearest.side, 'acceptor');

// Côté donneur du même intron : c.375+1 et c.375+9.
check('TP53 c.375+1 : +1 canonique',
  [at(tp53, 7675993).offsetDonor, at(tp53, 7675993).edge], [1, 'canonical']);
check('TP53 c.375+5 : région d’épissage',
  [at(tp53, 7675989).offsetDonor, at(tp53, 7675989).edge], [5, 'splice']);
check('TP53 c.375+9 : intron profond',
  [at(tp53, 7675985).offsetDonor, at(tp53, 7675985).edge], [9, 'deep']);

// Brin +, pour que l'inversion ne passe pas inaperçue : CFTR exon 2 (117548617-117548702).
const cf = at(cftr, 117548620);
check('CFTR brin + : exon 2, 4e base', [cf.exon, cf.offsetInExon], [2, 4]);
check('CFTR brin + : distances', [cf.dist5, cf.dist3], [3, 82]);
check('CFTR brin + : proche de l’accepteur', [cf.edge, cf.nearest.side], ['near', 'acceptor']);
check('CFTR brin + : 1re base de l’exon 2 = bordure',
  [at(cftr, 117548617).dist5, at(cftr, 117548617).edge], [0, 'edge']);

/* — Variation à cheval sur une jonction — */

// 17-7675992-ACC-A supprime 7675993 (intron 4) et 7675994 (dernière base de l'exon 4).
const straddle = locate(tp53, variantSpan({ pos: 7675992, ref: 'ACC', alt: 'A' }));
check('à cheval : ni exonique ni intronique', straddle.kind, 'junction');
check('à cheval : distance nulle', straddle.nearest.dist, 0);
// Le côté se lit sur les coordonnées : sur le brin −, la borne génomique basse d'un
// exon est son extrémité 3', donc le site donneur.
check('à cheval : côté donneur (brin −)', straddle.nearest.side, 'donor');
check('à cheval : la fenêtre est cadrée sur la jonction franchie',
  [straddle.window.start, straddle.window.end], [7675968, 7676019]);

// Délétion d'un exon entier : les deux jonctions sont emportées.
const wholeExon = locate(tp53, variantSpan({
  pos: 7675040, ref: 'A'.repeat(210), alt: 'A',
}));
check('exon entier emporté : jonction', wholeExon.kind, 'junction');
check('exon entier emporté : les deux côtés', wholeExon.sides, ['donor', 'acceptor']);
check('exon entier emporté : exon 5 listé', wholeExon.wholeExons, [5]);

/* — Choix de l'enregistrement UCSC — */

const items = [TP53, { ...TP53, name: 'NM_001126112.3' }];
check('transcrit demandé, version exacte',
  pickRecord(items, 'NM_000546.6', 7675088).item.name, 'NM_000546.6');
check('version exacte : aucun décalage signalé',
  pickRecord(items, 'NM_000546.6', 7675088).versionMismatch, false);
// UCSC ne sert que la version courante : une saisie sur NM_000546.5 doit tout de même
// donner une structure, avec le décalage de version signalé.
check('version ancienne : repli sur l’accession',
  pickRecord(items, 'NM_000546.5', 7675088).item.name, 'NM_000546.6');
check('version ancienne : décalage signalé',
  pickRecord(items, 'NM_000546.5', 7675088).versionMismatch, true);
check('transcrit absent', pickRecord(items, 'NM_999999.1', 7675088), null);
check('aucun transcrit', pickRecord([], 'NM_000546.6', 7675088), null);

/* — Entrées dégradées : rien ne doit lever — */

check('structure sans exons', exonsFromUcsc({ ...TP53, exonStarts: '', exonEnds: '' }), null);
check('locate sans structure', locate(null, { start: 1, end: 1 }), null);
check('locate sans span', locate(tp53, null), null);
check('span sans position', variantSpan({ pos: 'x', ref: 'A', alt: 'T' }), null);
// Hors du transcrit : aucune jonction à mesurer, mais pas d'exception non plus.
check('position hors transcrit', at(tp53, 7600000).kind, 'outside');

console.log(`\n${pass} vérifications passées, ${fail} en échec`);
process.exit(fail ? 1 : 0);
