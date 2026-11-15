#!/usr/bin/env node
// Tests de la géométrie exonique, sans réseau : la structure RefSeq est fournie telle
// que l'API UCSC la rend, et chaque distance attendue est vérifiable à la main sur la
// nomenclature HGVS correspondante.
//
//   node tools/test-structure.mjs

import {
  variantSpan, exonsFromUcsc, pickRecord, intronBounds, locate,
} from '../js/structure.js';
import {
  consequenceFromStructure, proteinConsequence, inferConsequence,
} from '../js/variant.js';

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

/* — Type de variation établi sur la structure (repli VariantValidator) —
 *
 * Le repli ne donne pas de terme de conséquence. Il est calculé ici à partir des
 * bornes du CDS, des bornes d'exons et de la nomenclature protéique — et doit
 * rendre **le même** terme que VEP, y compris sur les bordures.
 *
 * TP53 est sur le brin − : son CDS va de 7669609 à 7676594, donc tout ce qui est
 * au-dessus de 7676594 est en 5'UTR et tout ce qui est en dessous de 7669609 en 3'UTR. */

const type = (st, pos, hgvsp = null, ref = 'C', alt = 'T') =>
  consequenceFromStructure(st, locate(st, variantSpan({ pos, ref, alt })), hgvsp);

check('TP53 c.524G>A : faux-sens', type(tp53, 7675088, 'NP_000537.3:p.(Arg175His)'), 'missense');
check('TP53 : non-sens', type(tp53, 7675088, 'NP_000537.3:p.(Arg175Ter)'), 'nonsense');
check('TP53 : synonyme', type(tp53, 7675088, 'NP_000537.3:p.(=)'), 'synonymous');
// Le CDS de TP53 commence dans l'exon 2 : l'exon 1 (7687377-7687490) est tout entier
// en amont de l'ATG, donc 5'UTR — et non « intronique », ce que rendait la lecture
// des seules nomenclatures sur un c.-14.
check('TP53 exon 1 : 5′UTR', type(tp53, 7687400, 'NP_000537.3:p.(=)'), 'utr5');
// Exon 11, sous cdsStart : après le codon stop sur le brin −.
check('TP53 exon 11 : 3′UTR', type(tp53, 7669000, 'NP_000537.3:p.(=)'), 'utr3');
check('CFTR exon 1 : 5′UTR (brin +)', type(cftr, 117480050, 'NP_000483.3:p.(=)'), 'utr5');
// c.-28C>T, première base de l'exon 2 (7676622 sur le brin −) : VEP rend
// ["splice_region_variant", "5_prime_UTR_variant"], et la région d'épissage l'emporte.
check('TP53 c.-28C>T : 5′UTR mais en bordure',
  type(tp53, 7676622, 'NP_000537.3:p.(=)', 'G', 'A'), 'splice_region');
check('TP53 5′UTR à distance de la jonction',
  type(tp53, 7676600, 'NP_000537.3:p.(=)'), 'utr5');

// Introns de TP53. Exon 4 = 7675994-7676272, exon 5 = 7675053-7675236 : l'intron 4
// les sépare (7675237-7675993). Sur le brin −, le donneur de l'exon 4 est sa borne
// génomique basse et l'accepteur de l'exon 5 sa borne haute.
check('TP53 intron 4, +1 du donneur', type(tp53, 7675993), 'splice_donor');
check('TP53 intron 4, +2 du donneur', type(tp53, 7675992), 'splice_donor');
check('TP53 intron 4, +5 du donneur', type(tp53, 7675989), 'splice_region');
check('TP53 intron 4, −1 de l’accepteur', type(tp53, 7675237), 'splice_acceptor');
check('TP53 intron 4, −8 de l’accepteur', type(tp53, 7675244), 'splice_region');
check('TP53 intron 4, −9 : intronique', type(tp53, 7675245), 'intronic');
check('TP53 intron 4, profond', type(tp53, 7675600), 'intronic');

// Bordure exonique : VEP place missense_variant avant splice_region_variant, et la
// première base de l'exon 5 (7675236 sur le brin −) reste donc un faux-sens.
check('TP53 bordure d’exon : l’effet protéique l’emporte',
  type(tp53, 7675236, 'NP_000537.3:p.(Thr187Ala)'), 'missense');

// Délétion qui emporte la jonction : le site canonique est détruit.
check('délétion à cheval sur une jonction',
  type(tp53, 7675235, 'NP_000537.3:p.?', 'CTTT', 'C'), 'splice_acceptor');

// Transcrit non codant : aucun CDS, donc aucune conséquence protéique possible.
const nr = exonsFromUcsc({ ...TP53, name: 'NR_000001.1', cdsStart: 7687490, cdsEnd: 7687490 });
check('transcrit non codant', type(nr, 7675088, null), 'noncoding_exon');

// Dans le CDS mais protéine indéterminée : « variation codante » plutôt que rien.
check('CDS sans nomenclature protéique', type(tp53, 7675088, null), 'coding');
check('structure absente', consequenceFromStructure(null, null, 'p.(Arg175His)'), null);
check('hors du transcrit', type(tp53, 7600000, 'p.(Arg175His)'), null);

/* — Conséquence protéique seule — */

check('frameshift', proteinConsequence('NP_1:p.(Phe508LeufsTer2)'), 'frameshift');
check('non-sens', proteinConsequence('NP_1:p.(Arg213Ter)'), 'nonsense');
// p.Ter334Leu est l'inverse d'un non-sens : le codon stop disparaît.
check('codon stop perdu', proteinConsequence('NP_1:p.(Ter334Leu)'), 'stop_lost');
check('codon d’initiation', proteinConsequence('NP_1:p.(Met1?)'), 'start_lost');
check('synonyme', proteinConsequence('NP_1:p.(Gln528=)'), 'synonymous');
check('synonyme sans résidu', proteinConsequence('NP_1:p.(=)'), 'synonymous');
check('inframe', proteinConsequence('NP_1:p.(Phe508del)'), 'inframe');
check('faux-sens', proteinConsequence('NP_1:p.(Arg175His)'), 'missense');
// L'écriture de VEP, sans parenthèses, doit se lire pareil.
check('écriture VEP', proteinConsequence('NP_1:p.Arg175His'), 'missense');
check('protéine indéterminée', proteinConsequence('NP_1:p.?'), null);
check('pas de nomenclature', proteinConsequence(null), null);

/* — Repli du repli : les nomenclatures seules, quand UCSC ne répond pas — */

check('c.-14C>T : 5′UTR', inferConsequence('NM_1:c.-14C>T', null), 'utr5');
check('c.*52C>T : 3′UTR', inferConsequence('NM_1:c.*52C>T', null), 'utr3');
// Un 5'UTR intronique : le décalage l'emporte sur le préfixe.
check('c.-24+3C>T : région d’épissage', inferConsequence('NM_1:c.-24+3C>T', null), 'splice_region');
check('c.5467+1G>A : site donneur', inferConsequence('NM_1:c.5467+1G>A', null), 'splice_donor');
check('c.100-2A>G : site accepteur', inferConsequence('NM_1:c.100-2A>G', null), 'splice_acceptor');
check('c.5+5G>A : région d’épissage', inferConsequence('NM_1:c.5+5G>A', null), 'splice_region');
check('c.3717+12191C>T : intronique', inferConsequence('NM_1:c.3717+12191C>T', null), 'intronic');
check('c.524G>A : lu sur la protéine',
  inferConsequence('NM_1:c.524G>A', 'NP_1:p.(Arg175His)'), 'missense');
check('nomenclature illisible', inferConsequence('n’importe quoi', null), null);

/* — Entrées dégradées : rien ne doit lever — */

check('structure sans exons', exonsFromUcsc({ ...TP53, exonStarts: '', exonEnds: '' }), null);
check('locate sans structure', locate(null, { start: 1, end: 1 }), null);
check('locate sans span', locate(tp53, null), null);
check('span sans position', variantSpan({ pos: 'x', ref: 'A', alt: 'T' }), null);
// Hors du transcrit : aucune jonction à mesurer, mais pas d'exception non plus.
check('position hors transcrit', at(tp53, 7600000).kind, 'outside');

console.log(`\n${pass} vérifications passées, ${fail} en échec`);
process.exit(fail ? 1 : 0);
