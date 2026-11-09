#!/usr/bin/env node
// Tests du générateur de commentaire, sans réseau : chaque branche de GetComment
// est exercée à partir d'un contexte fabriqué, en français et en anglais.
//
//   node tools/test-comment.mjs

import { buildComment, predictionVerdict, varTypeLabel, formatFreq } from '../js/comment.js';

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; return; }
  fail++;
  console.log(`✗ ${name}`);
  console.log(`  attendu : ${JSON.stringify(expected)}`);
  console.log(`  obtenu  : ${JSON.stringify(actual)}`);
}

function contains(name, text, needle, present = true) {
  const has = text.includes(needle);
  if (has === present) { pass++; return; }
  fail++;
  console.log(`✗ ${name} — ${present ? 'absent' : 'présent à tort'} : ${JSON.stringify(needle)}`);
}

const pred = (name, verdict, score) => ({ name, verdict, score: String(score) });

/** Contexte minimal, surchargeable. */
function ctx(over = {}) {
  return {
    variant: {
      gene: 'TP53',
      transcript: 'NM_000546.6',
      genomicHgvs: 'chr17:g.7675088C>T',
      hgvsc: 'NM_000546.6:c.524G>A',
      hgvsp: 'NP_000537.3:p.Arg175His',
      proteinChange: 'p.Arg175His',
      varType: 'missense',
      varTypeNull: false,
      loc: 'exon',
      locNum: '5',
      locField: '5/11',
      ref: 'C',
      alt: 'T',
      ...(over.variant || {}),
    },
    predictions: over.predictions || [pred('CADD', 'del', 25.9), pred('REVEL', 'del', 0.92)],
    conservation: over.conservation || {
      gerp: { score: '5.41', raw: 5.41, conserved: true },
      phylop: { score: '6.16', raw: 6.16, range: '-20–30' },
      phastcons: { score: '1', raw: 1, range: '0–1' },
    },
    domain: 'domain' in over ? over.domain : 'p53, DNA-binding domain',
    clinvar: over.clinvar || { count: 0, accessions: [], significance: null, significances: [] },
    gnomad: over.gnomad || { 'v4.1': null, 'v2.1.1': null },
    phenotypes: over.phenotypes || { source: null, phenotypes: [] },
    intervar: null,
    gene: { symbol: 'TP53' },
    rsid: null,
    errors: {},
  };
}

const fr = (c, o = {}) => buildComment(c, { lang: 'fr', variantClass: 5, ...o });
const en = (c, o = {}) => buildComment(c, { lang: 'en', variantClass: 5, ...o });

/* — 2. Type de variation et localisation — */
contains('FR faux-sens localisation', fr(ctx()),
  "Il s'agit d'une variation faux-sens. Elle est localisée au niveau de l'exon 5 (5/11) du gène TP53.");
contains('EN missense location', en(ctx()),
  'This is a missense variant. It is located in exon 5 (5/11) of the TP53 gene.');
contains('FR intron', fr(ctx({ variant: { varType: 'intronic', loc: 'intron', locNum: '22', locField: '22/26' } })),
  "variation intronique. Elle est localisée au niveau de l'intron 22 (22/26)");
check('inframe 3 nucléotides',
  varTypeLabel({ varType: 'inframe', ref: 'ATCT', alt: 'A' }, 'fr'),
  'variation sans décalage du cadre de lecture (inframe) de 3 nucléotides');
check('inframe sans longueur',
  varTypeLabel({ varType: 'inframe', ref: null, alt: null }, 'fr'),
  'variation sans décalage du cadre de lecture (inframe)');

/* — 3. Fréquence — */
contains('absente si gnomAD n.a.', fr(ctx()),
  "Il s'agit d'une variation absente des bases de données de populations contrôle (gnomAD v4.1).");
contains('absente si AC = 0', fr(ctx({ gnomad: { 'v4.1': { ac: 0, af: 0 } } })),
  'absente des bases de données de populations contrôle');
contains('rare si AC <= 5', fr(ctx({ gnomad: { 'v4.1': { ac: 5, af: 1e-6 } } })),
  "Il s'agit d'une variation rare.");
contains('présente si AC > 5', fr(ctx({ gnomad: { 'v4.1': { ac: 7, af: 0.000004336 } } })),
  'Cette variation est présente dans gnomAD (v4.1, fréq.: 0,0004 %).');
contains('version v2.1.1 reprise dans la phrase',
  fr(ctx({ gnomad: { 'v2.1.1': { ac: 1776, af: 0.00706849 } } }), { gnomadVersion: 'v2.1.1' }),
  'gnomAD (v2.1.1, fréq.: 0,7068 %)');
check('fréquence EN avec point', formatFreq(0.000004336, 'en'), '0.0004 %');

/* — 4. Prédictions — */
check('pathogène si délétères majoritaires et REVEL concordant',
  predictionVerdict([pred('SIFT', 'del', 0), pred('CADD', 'del', 25), pred('REVEL', 'del', 0.9)]).kind,
  'pathogenic');
check('bénin si tolérés majoritaires et REVEL concordant',
  predictionVerdict([pred('SIFT', 'tol', 1), pred('CADD', 'tol', 5), pred('REVEL', 'tol', 0.1)]).kind,
  'benign');
check('discordant si REVEL et MetaLR divergent',
  predictionVerdict([pred('REVEL', 'del', 0.9), pred('MetaLR', 'tol', 0.1), pred('CADD', 'del', 25)]).kind,
  'discordant');
// Corrigé : un seul délétère contre zéro toléré conclut maintenant « pathogène »
// (l'ancien UBound du VBA donnait 0 pour une liste vide comme pour une liste de 1).
// Garde-fou : un seul outil n'affirme pas de direction (cas p.Phe508del, SpliceAI seul).
check('un seul délétère → discordant',
  predictionVerdict([pred('CADD', 'del', 32)]).kind, 'discordant');
check('un seul toléré → discordant',
  predictionVerdict([pred('SpliceAI', 'tol', 0.01)]).kind, 'discordant');
check('deux délétères → pathogène',
  predictionVerdict([pred('CADD', 'del', 32), pred('SpliceAI', 'del', 0.9)]).kind, 'pathogenic');
check('deux tolérés → bénin',
  predictionVerdict([pred('CADD', 'tol', 3), pred('SpliceAI', 'tol', 0.01)]).kind, 'benign');
// Corrigé : REVEL et MetaLR ne notant que les faux-sens, leur absence ne doit plus
// forcer « discordants » pour les variations nulles et d'épissage.
check('épissage : CADD + SpliceAI délétères, méta n.a. → pathogène',
  predictionVerdict([pred('CADD', 'del', 32), pred('SpliceAI', 'del', 0.93)]).kind,
  'pathogenic');
check('méta disponibles et contradictoires → discordant',
  predictionVerdict([pred('SIFT', 'del', 0), pred('CADD', 'del', 25),
    pred('REVEL', 'del', 0.9), pred('MetaLR', 'tol', 0.1)]).kind, 'discordant');
check('REVEL toléré mais les autres délétères → discordant',
  predictionVerdict([pred('SIFT', 'del', 0), pred('CADD', 'del', 25),
    pred('REVEL', 'tol', 0.2)]).kind, 'discordant');
check('délétères et tolérés à égalité → discordant',
  predictionVerdict([pred('CADD', 'del', 32), pred('SpliceAI', 'tol', 0.01)]).kind,
  'discordant');
contains('épissage sans méta → phrase pathogène',
  fr(ctx({ predictions: [pred('CADD', 'del', 32), pred('SpliceAI', 'del', 0.93)] })),
  'en faveur du caractère pathogène de la variation (CADD, SpliceAI).');
// Le rendu « discordants » ne doit jamais afficher de liste vide.
contains('pas de « toléré :  » vide quand discordant',
  fr(ctx({ predictions: [pred('REVEL', 'del', 0.9), pred('MetaLR', 'tol', 0.1)] })),
  'discordants (délétère : REVEL ; toléré : MetaLR).');
contains('phrase absente si aucune prédiction',
  fr(ctx({ predictions: [] })), 'outils de prédictions', false);

/* — 5. Variation nulle — */
contains('perte de fonction si variation nulle',
  fr(ctx({ variant: { varType: 'nonsense', varTypeNull: true } })),
  'La perte de fonction est un mécanisme connu de pathogénicité de ce gène.');
contains('pas de perte de fonction sinon', fr(ctx()), 'La perte de fonction', false);

/* — 6. Conservation (bug de la macro corrigé) — */
contains('conservation si faux-sens, GERP conservé et phyloP > 4', fr(ctx()),
  "La variation est située au niveau d'un résidu conservé au cours de l'évolution.");
contains('pas de conservation si phyloP <= 4',
  fr(ctx({ conservation: { gerp: { conserved: true }, phylop: { raw: 3.6 }, phastcons: {} } })),
  'résidu conservé', false);
contains('pas de conservation si GERP peu conservé',
  fr(ctx({ conservation: { gerp: { conserved: false }, phylop: { raw: 6 }, phastcons: {} } })),
  'résidu conservé', false);
contains('pas de conservation hors faux-sens',
  fr(ctx({ variant: { varType: 'nonsense', varTypeNull: true } })), 'résidu conservé', false);
contains('jamais de « résidu  au cours »', fr(ctx({
  conservation: { gerp: { conserved: false }, phylop: { raw: 1 }, phastcons: {} },
})), 'résidu  au cours', false);

/* — 7. Domaine — */
contains('domaine protéique', fr(ctx()),
  "Elle est localisée au niveau d'un domaine protéique fonctionnel : p53, DNA-binding domain");
contains('pas de phrase si domaine absent', fr(ctx({ domain: null })), 'domaine protéique', false);

/* — 8. ClinVar — */
contains('ClinVar pluriel', fr(ctx({
  clinvar: { count: 2, accessions: ['RCV000013173', 'RCV000131301'], significance: 'Pathogenic', significances: [] },
})), 'Cette variation a été rapportée dans Clinvar comme pathogène (2 soumissions : RCV000013173, RCV000131301).');
contains('ClinVar singulier', fr(ctx({
  clinvar: { count: 1, accessions: ['RCV000013173'], significance: 'Likely_pathogenic', significances: [] },
})), 'comme probablement pathogène (1 soumission : RCV000013173).');
contains('ClinVar conflits → incertaine', fr(ctx({
  clinvar: { count: 3, accessions: ['A', 'B', 'C'], significance: 'Conflicting classifications of pathogenicity', significances: [] },
})), 'comme de signification incertaine (3 soumissions : A, B, C).');
contains('ClinVar EN', en(ctx({
  clinvar: { count: 1, accessions: ['RCV1'], significance: 'Benign/Likely benign', significances: [] },
})), 'reported in ClinVar as benign, likely benign (1 submission: RCV1).');

/* — 9. Phénotypes — */
const phenoCtx = ctx({
  phenotypes: {
    source: 'Monarch',
    phenotypes: [
      { name: 'Li-Fraumeni syndrome', mim: '151623', inheritance: 'AD' },
      { name: 'sickle cell disease', mim: '603903', inheritance: 'AR' },
      { name: 'X thing', mim: '300001', inheritance: 'XLR' },
      { name: 'sans MIM', mim: null, inheritance: 'XLD' },
      { name: 'sans rien', mim: null, inheritance: null },
    ],
  },
});
contains('phéno AD', fr(phenoCtx), 'Li-Fraumeni syndrome (MIM #151623) de transmission autosomique dominante.');
contains('phéno AR', fr(phenoCtx), 'sickle cell disease (MIM #603903) de transmission autosomique récessive.');
contains('phéno XLR', fr(phenoCtx), "X thing (MIM #300001) de transmission récessive liée à l'X.");
contains('phéno sans MIM', fr(phenoCtx), "sans MIM de transmission dominante liée à l'X.");
contains('phéno sans rien', fr(phenoCtx), 'sans rien.');
contains('intro phéno', fr(phenoCtx), 'Les variations pathogènes de ce gène ont été associées à');
contains('phéno EN', en(phenoCtx), 'Li-Fraumeni syndrome (MIM #151623), autosomal dominant inheritance.');

/* — 10. Conclusion — */
contains('classe 5', fr(ctx(), { variantClass: 5 }),
  'Cette variation est donc considérée comme pathogène (variation de classe 5) et en lien avec le phénotype clinique observé chez ce patient.');
contains('classe 4', fr(ctx(), { variantClass: 4 }),
  'comme probablement pathogène (variation de classe 4) et en lien');
contains('classe 3 — texte HAS mot pour mot', fr(ctx(), { variantClass: 3 }),
  "A ce jour, il n'est pas possible d'affirmer ou d'infirmer la participation de cette variation à la symptomatologie de ce patient. Selon les recommandations HAS, les variations de classe 3  ne doivent pas être utilisés pour la prise en charge du patient, pour un diagnostic prénatal ou en conseil génétique.");
contains('classe 3 EN', en(ctx(), { variantClass: 3 }),
  'In line with the French HAS guidelines, class 3 variants must not be used for patient management');
contains('classe 5 EN', en(ctx(), { variantClass: 5 }),
  'This variant is therefore considered pathogenic (class 5 variant) and related to the clinical phenotype observed in this patient.');

/* — 1. Nomenclature et structure — */
const full = fr(phenoCtx, { variantClass: 5 });
check('ligne 1 = nomenclature', full.split('\n')[0],
  'hg38 chr17:g.7675088C>T NM_000546.6(TP53):c.524G>A p.Arg175His');
check('ligne 2 vide', full.split('\n')[1], '');
check('pas d\'espace en fin de ligne', /[ \t]+\n|[ \t]+$/.test(full), false);

console.log(`\n${pass} vérifications passées, ${fail} en échec`);
process.exit(fail ? 1 : 0);
