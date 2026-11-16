#!/usr/bin/env node
// Tests du générateur de commentaire, sans réseau : chaque branche de GetComment
// est exercée à partir d'un contexte fabriqué, en français et en anglais.
//
//   node tools/test-comment.mjs

import { buildComment, predictionVerdict, varTypeLabel, formatFreq } from '../js/comment.js';
import { readFileSync } from 'node:fs';
import { UI } from '../js/i18n.js';
import { ensemblTranscript, maneSelectOf, parseInput, pickManeRows, soTerms } from '../js/variant.js';
import { buildAcmg, acmgCodes, acmgText, TO_SPECIFY } from '../js/acmg.js';
import { buildVarTypeCheck } from '../js/annotate.js';
import { hedge, predictedProtein } from '../js/util.js';

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
      hgvsp: 'NP_000537.3:p.(Arg175His)',
      proteinChange: 'p.(Arg175His)',
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
  'hg38 chr17:g.7675088C>T NM_000546.6(TP53):c.524G>A p.(Arg175His)');
check('ligne 2 vide', full.split('\n')[1], '');
check('pas d\'espace en fin de ligne', /[ \t]+\n|[ \t]+$/.test(full), false);

/* — Parenthèses de la conséquence protéique (prédite, jamais observée) — */
check('VEP : p. sans parenthèses → p.(…)',
  predictedProtein('NP_000537.3:p.Arg175His'), 'NP_000537.3:p.(Arg175His)');
check('VariantValidator : parenthèses déjà posées, pas de doublon',
  predictedProtein('NP_000537.3:p.(Arg175His)'), 'NP_000537.3:p.(Arg175His)');
check('frameshift', predictedProtein('p.Arg134LysfsTer5'), 'p.(Arg134LysfsTer5)');
check('synonyme', predictedProtein('p.Ala123='), 'p.(Ala123=)');
check('effet indéterminé : p.? reste nu', predictedProtein('p.?'), 'p.?');
check('rien à parenthéser', predictedProtein(null), null);
check('ce n\'est pas une conséquence protéique', predictedProtein('c.524G>A'), 'c.524G>A');

/* — Transcrit Ensembl : déduit du transcrit MANE Select, sans appel réseau — */
const ens = await ensemblTranscript({
  transcript: 'NM_000546.6', hgvsc: 'NM_000546.6:c.524G>A', ensemblTranscript: 'ENST00000269305.9',
});
check('MANE Select : ENST apparié', ens.transcript, 'ENST00000269305.9');
check('MANE Select : même numérotation c.', ens.hgvsc, 'ENST00000269305.9:c.524G>A');
check('MANE Select : aucun appel réseau', ens.matched, 'mane');

/* — Table MANE (UCSC) : deux réponses dans la même ligne —
 *
 * Lignes réelles de la piste `mane` au locus de CDKN2A, qui en rend deux : un gène à
 * transcrit MANE Plus Clinical. Le choix se fait sur ncbiId, jamais sur l'ordre. */

const CDKN2A_MANE = [
  {
    name: 'ENST00000304494.10', ncbiId: 'NM_000077.5', maneStat: 'MANE Select', geneName2: 'CDKN2A',
  },
  {
    name: 'ENST00000579755.2', ncbiId: 'NM_058195.4', maneStat: 'MANE Plus Clinical', geneName2: 'CDKN2A',
  },
];

check('MANE Select : ENST apparié',
  pickManeRows(CDKN2A_MANE, 'NM_000077.5', 'CDKN2A').paired.name, 'ENST00000304494.10');
check('MANE Plus Clinical : sa propre ligne, pas la première',
  pickManeRows(CDKN2A_MANE, 'NM_058195.4', 'CDKN2A').paired.name, 'ENST00000579755.2');
check('version ancienne : appariement sur l’accession',
  pickManeRows(CDKN2A_MANE, 'NM_000077.4', 'CDKN2A').paired.name, 'ENST00000304494.10');
// Le MANE Select du gène est nommé même quand le transcrit retenu n'est pas lui :
// c'est le cas que le repli laissait à « MANE = ? ».
check('MANE Select du gène, transcrit non-MANE',
  pickManeRows(CDKN2A_MANE, 'NM_001195132.1', 'CDKN2A').maneRefSeq, 'NM_000077.5');
check('transcrit non-MANE : aucun ENST à montrer',
  pickManeRows(CDKN2A_MANE, 'NM_001195132.1', 'CDKN2A').paired, null);
// Plusieurs gènes peuvent se chevaucher : le MANE d'un autre gène n'est pas le nôtre.
check('gène différent : pas de MANE emprunté',
  pickManeRows(CDKN2A_MANE, 'NM_001400176.1', 'MRPL23').maneRefSeq, null);
check('aucune ligne', pickManeRows([], 'NM_000077.5', 'CDKN2A').maneRefSeq, null);
check('lignes absentes', pickManeRows(null, 'NM_000077.5', 'CDKN2A').paired, null);

/* — Termes SO : le repli doit parler la langue de VEP — */

check('faux-sens', soTerms('missense').join(','), 'missense_variant');
check('non-sens', soTerms('nonsense').join(','), 'stop_gained');
check('inframe, délétion', soTerms('inframe', { ref: 'ATCT', alt: 'A' }).join(','), 'inframe_deletion');
check('inframe, insertion', soTerms('inframe', { ref: 'A', alt: 'ATCT' }).join(','), 'inframe_insertion');
check('5′UTR', soTerms('utr5').join(','), '5_prime_UTR_variant');
check('aucun type', soTerms(null).join(','), '');
// VEP rend deux termes sur une bordure d'exon : la ligne « Conséquence » les montrait
// sur le chemin VEP et pas sur le repli.
check('synonyme en bordure d’exon',
  soTerms('synonymous', { location: { kind: 'exon', edge: 'edge' } }).join(','),
  'synonymous_variant,splice_region_variant');
check('synonyme à distance de la jonction',
  soTerms('synonymous', { location: { kind: 'exon', edge: 'inside' } }).join(','),
  'synonymous_variant');
check('région d’épissage intronique',
  soTerms('splice_region', { location: { kind: 'intron', edge: 'splice' } }).join(','),
  'splice_region_variant,intron_variant');
// Un site canonique n'est pas « dans l'intron » pour VEP : un seul terme.
check('site donneur : un seul terme',
  soTerms('splice_donor', { location: { kind: 'intron', edge: 'canonical' } }).join(','),
  'splice_donor_variant');

/* — Contrôle du type par l'annotation gnomAD —
 *
 * gnomAD apparie son annotation VEP au transcrit RefSeq **sans version** : le
 * rapprochement se fait donc sur l'accession seule, et une version différente ne doit
 * pas empêcher la comparaison du terme. */

const g4 = (tcs) => ({ data: { variant: { transcript_consequences: tcs } } });
const TP53_TC = [
  { refseq_id: 'NM_001126112', consequence_terms: ['intron_variant'] },
  { refseq_id: 'NM_000546', is_mane_select: true, consequence_terms: ['missense_variant'] },
];

const okCheck = buildVarTypeCheck(g4(TP53_TC), { transcript: 'NM_000546.6', varType: 'missense' });
check('gnomAD concordant : terme', okCheck.term, 'missense');
check('gnomAD concordant : verdict', okCheck.agrees, true);
check('gnomAD concordant : source nommée', okCheck.source, 'gnomAD');
// Le transcrit retenu n'est pas forcément le premier de la liste de gnomAD.
check('transcrit reconnu, pas le premier venu',
  buildVarTypeCheck(g4(TP53_TC), { transcript: 'NM_001126112.3', varType: 'intronic' }).term, 'intronic');
check('version différente : comparaison quand même possible',
  buildVarTypeCheck(g4(TP53_TC), { transcript: 'NM_000546.5', varType: 'missense' }).agrees, true);
check('divergence signalée',
  buildVarTypeCheck(g4(TP53_TC), { transcript: 'NM_000546.6', varType: 'intronic' }).agrees, false);
// Le terme le plus sévère l'emporte, comme chez VEP (ordre de CONSEQUENCE_MAP).
check('deux termes : le plus sévère',
  buildVarTypeCheck(g4([{ refseq_id: 'NM_000492', consequence_terms: ['splice_region_variant', 'synonymous_variant'] }]),
    { transcript: 'NM_000492.4', varType: 'synonymous' }).term, 'synonymous');

/* Aucun contrôle possible : le silence ne dit rien du type, donc `null` et non un
 * verdict. Trois silences différents, un seul résultat. */
check('transcrit absent de l’annotation gnomAD',
  buildVarTypeCheck(g4(TP53_TC), { transcript: 'NM_999999.1', varType: 'missense' }), null);
check('variation absente de gnomAD',
  buildVarTypeCheck({ data: { variant: null } }, { transcript: 'NM_000546.6', varType: 'missense' }), null);
check('gnomAD en échec', buildVarTypeCheck(null, { transcript: 'NM_000546.6', varType: 'missense' }), null);
check('aucun transcrit retenu', buildVarTypeCheck(g4(TP53_TC), { varType: 'missense' }), null);

/* — Libellés : les deux langues doivent couvrir exactement les mêmes clés — */
// Une clé absente s'affichait telle quelle dans l'interface (« fallbackSource »).
const frKeys = Object.keys(UI.fr);
const enKeys = Object.keys(UI.en);
check('FR et EN ont le même nombre de clés', frKeys.length, enKeys.length);
check('aucune clé EN absente du FR', enKeys.filter((k) => !(k in UI.fr)).join(',') || '—', '—');
check('aucune clé FR absente de l\'EN', frKeys.filter((k) => !(k in UI.en)).join(',') || '—', '—');
const empty = frKeys.filter((k) => !String(UI.fr[k]).trim() || !String(UI.en[k]).trim());
check('aucun libellé vide', empty.join(',') || '—', '—');
// Toute clé utilisée par la page ou par app.js doit exister dans les deux langues :
// c'est ce qui manquait quand l'interface affichait « fallbackSource » tel quel.
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const html = read('../index.html');
// acmg.js appelle `t` lui-même : ses libellés sont du texte d'interface, et doivent
// donc être couverts par la même vérification que ceux d'app.js.
const appjs = read('../js/app.js') + read('../js/acmg.js');
const used = new Set([
  ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]),
  ...[...appjs.matchAll(/\bt\(lang,\s*'([^']+)'/g)].map((m) => m[1]),
]);
const unknown = [...used].filter((k) => !(k in UI.fr) || !(k in UI.en));
check('toutes les clés utilisées existent en FR et EN', unknown.join(',') || '—', '—');
check('des clés sont bien utilisées', used.size > 20, true);

/* — Reconnaissance de la saisie : quatre formes, et deux sans transcrit — */
const kind = (text) => parseInput(text).kind;

check('HGVS sur transcrit', kind('NM_000546.6:c.524G>A'), 'hgvs');
check('HGVS avec le gène entre parenthèses', kind('NM_000546.6(TP53):c.524G>A'), 'hgvs');
check('pseudo-VCF', kind('chr17-7675088-C-T'), 'vcf');
check('pseudo-VCF à deux-points', kind('17:7675088:C:T'), 'vcf');
check('HGVS g. sur nom de chromosome', kind('chr1:g.11117005T>A'), 'genomic');
check('HGVS g. sans préfixe chr', kind('1:g.11117005T>A'), 'genomic');
check('HGVS g. sur accession NC_ hg38', kind('NC_000001.11:g.11117005T>A'), 'genomic');
check('gène + c.', kind('MTHFR:c.665C>T'), 'gene');
check('gène + n.', kind('H19:n.100A>G'), 'gene');
check('gène à tiret', parseInput('NKX2-5:c.100A>G').gene, 'NKX2-5');
check('gène en minuscules', parseInput('mthfr:c.665C>T').gene, 'MTHFR');
check('saisie vide', kind(''), 'empty');
check('gène seul, sans nomenclature', kind('TP53'), 'unknown');
check('texte quelconque', kind('pouet'), 'unknown');

// Une accession NC_ d'un autre assemblage n'est pas réécrite en hg38 : elle reste une
// saisie HGVS, transmise telle quelle aux services, qui la situent eux-mêmes.
check('accession NC_ hors hg38 (NC_000001.10 = hg19)',
  kind('NC_000001.10:g.11117005T>A'), 'hgvs');

// Les deux formes que chaque service attend, pour la même saisie génomique.
const g1 = parseInput('chr1:g.11117005T>A');
check('HGVS g. : chromosome retenu', g1.chr, '1');
check('HGVS g. : forme pour VEP', g1.hgvs, '1:g.11117005T>A');
check('HGVS g. : forme pour VariantValidator', g1.desc, 'NC_000001.11:g.11117005T>A');
check('HGVS g. sur accession : même forme pour VEP',
  parseInput('NC_000001.11:g.11117005T>A').hgvs, '1:g.11117005T>A');
check('HGVS g. : chrX', parseInput('chrX:g.100del').desc, 'NC_000023.11:g.100del');

/* — MANE Select d'une fiche HGNC : l'accession RefSeq du couple, versionnée — */
check('couple MANE Select',
  maneSelectOf({ mane_select: ['ENST00000376590.9', 'NM_005957.5'] }), 'NM_005957.5');
// Le MANE Select d'un ARN long non codant est un NR_ : filtrer sur NM_ l'aurait écarté.
check('MANE Select non codant (H19)',
  maneSelectOf({ mane_select: ['ENST00000414790.11', 'NR_002196.3'] }), 'NR_002196.3');
check('gène sans MANE Select (MIR21)', maneSelectOf({ symbol: 'MIR21' }), null);
check('fiche absente', maneSelectOf(null), null);

/* — Critères ACMG : ce que les chiffres étayent, et surtout ce qu'ils n'étayent pas —
 *
 * `ctx()` sert de contexte : ni `pending` ni `errors` n'y figurent, donc toutes les
 * sources sont réputées avoir répondu. Les deux derniers blocs les ajoutent, parce que
 * c'est là qu'un critère posé à tort ferait le plus de dégâts.
 */
const codes = (over = {}, opts = {}) => acmgCodes(buildAcmg(ctx(over), { lang: 'fr', ...opts }).supported);
const facts = (over = {}, opts = {}) => acmgText(buildAcmg(ctx(over), { lang: 'fr', ...opts }).supported);

// Faux-sens de TP53, absent de gnomAD, dans un domaine, prédicteurs délétères.
check('faux-sens : domaine, absence, prédicteurs', codes(), 'PM1 PM2_Supporting PP3');
contains('PM2 nomme la version de gnomAD', facts(), 'PM2_Supporting — absente de gnomAD v4.1');
contains('PP3 nomme les outils', facts(), 'PP3 — délétère pour CADD, REVEL');

// AC 0 et absence de la base ne se disent pas de la même façon : la première est une
// réponse de gnomAD sur la variation, la seconde une absence de la variation.
contains('AC 0 est distingué de l’absence',
  facts({ gnomad: { 'v4.1': { ac: 0, af: 0 } } }), 'PM2_Supporting — AC 0 dans gnomAD v4.1');

// Fréquence : BA1 au-delà de 5 %, BS1 au-delà de 1 %, et rien entre les deux.
check('BA1 au-delà de 5 %', codes({ gnomad: { 'v4.1': { ac: 513548, af: 0.3182 } } }),
  'PM1 BA1 PP3');
check('BS1 au-delà de 1 %', codes({ gnomad: { 'v4.1': { ac: 500, af: 0.02 } } }),
  'PM1 BS1 PP3');
check('ni PM2 ni BA1/BS1 entre les deux',
  codes({ gnomad: { 'v4.1': { ac: 7, af: 0.000004 } } }), 'PM1 PP3');
contains('BA1 nomme la fréquence',
  facts({ gnomad: { 'v4.1': { ac: 513548, af: 0.3182 } } }), 'fréquence 31,82 % dans gnomAD v4.1');

// BS2 : un homozygote ne vaut argument que si la maladie est récessive.
const homAR = {
  gnomad: { 'v4.1': { ac: 513548, af: 0.3182, hom: 87723 } },
  phenotypes: { source: 'Monarch', phenotypes: [{ name: 'homocystinurie', inheritance: 'AR' }] },
};
contains('BS2 sur une maladie récessive', facts(homAR), 'BS2 — 87723 homozygotes dans gnomAD v4.1');
check('pas de BS2 sur une maladie dominante', codes({
  ...homAR,
  phenotypes: { source: 'Monarch', phenotypes: [{ name: 'Li-Fraumeni', inheritance: 'AD' }] },
}), 'PM1 BA1 PP3');
check('pas de BS2 sans homozygote', codes({
  ...homAR, gnomad: { 'v4.1': { ac: 513548, af: 0.3182, hom: 0 } },
}), 'PM1 BA1 PP3');

// PVS1 : variation nulle, et la phase du saut d'exon quand elle est connue.
const nullVariant = {
  variant: { varType: 'nonsense', varTypeNull: true, locNum: '50', locField: '50/58' },
  domain: null,
};
check('PVS1 sur une variation nulle', codes(nullVariant), 'PVS1 PM2_Supporting PP3');
contains('PVS1 porte le type et la localisation', facts(nullVariant),
  'PVS1 — variation non-sens, exon 50/58');
contains('PVS1 porte la phase du saut',
  acmgText(buildAcmg(ctx(nullVariant), {
    lang: 'fr', skip: { exons: [5], coding: 184, inFrame: false, carries: [], certain: true },
  }).supported), 'saut de l’exon 5 hors phase');
contains('PVS1 dit le codon d’initiation emporté',
  acmgText(buildAcmg(ctx(nullVariant), {
    lang: 'fr', skip: { exons: [1], coding: 53, inFrame: false, carries: ['start'], certain: true },
  }).supported), 'saut de l’exon 1 emportant le codon d’initiation');
// Le codon d'initiation perdu n'est pas une variation nulle au sens de la macro : son
// PVS1 est ramené à modéré, comme le recommande le SVI.
check('codon d’initiation : PVS1 modéré',
  codes({ variant: { varType: 'start_lost', varTypeNull: false }, domain: null }),
  'PVS1_Moderate PM2_Supporting PP3');

// BP7 : les trois conditions de l'article, et aucune devinée.
const silent = {
  variant: { varType: 'synonymous', varTypeNull: false },
  domain: null,
  predictions: [pred('SpliceAI', 'tol', 0.01), pred('CADD', 'tol', 3)],
  conservation: { gerp: { score: '1.2', raw: 1.2, conserved: false } },
};
check('BP7 : synonyme, SpliceAI bas, base peu conservée', codes(silent),
  'PM2_Supporting BP4 BP7');
contains('BP7 porte ses trois chiffres', facts(silent),
  'BP7 — variation synonyme, SpliceAI 0.01, GERP 1.2');
check('pas de BP7 sur une base conservée', codes({
  ...silent, conservation: { gerp: { score: '5.4', raw: 5.4, conserved: true } },
}), 'PM2_Supporting BP4');
// Une conservation inconnue n'est pas une conservation faible.
check('pas de BP7 sans GERP', codes({
  ...silent, conservation: { gerp: { score: 'n.a.', raw: null, conserved: null } },
}), 'PM2_Supporting BP4');
check('pas de BP7 si SpliceAI est délétère', codes({
  ...silent, predictions: [pred('SpliceAI', 'del', 0.93), pred('CADD', 'del', 25)],
}), 'PM2_Supporting PP3');

/* — Étayé ou conditionnel : la frontière, éprouvée sur CFTR p.Phe508del —
 *
 * La variation de classe 5 la plus fréquente de la mucoviscidose a 1,19 % d'allèles et
 * 58 homozygotes dans gnomAD v4.1. Au seuil conventionnel de 1 %, BS1 se déclenche et
 * les homozygotes sont des patients : ces deux critères-là ne doivent jamais paraître
 * comme posés par le chiffre. */
const f508 = buildAcmg(ctx({
  variant: { gene: 'CFTR', varType: 'inframe', varTypeNull: false, ref: 'ATCT', alt: 'A' },
  domain: null,
  gnomad: { 'v4.1': { ac: 19237, af: 0.011931, hom: 58 } },
  phenotypes: { source: 'Monarch', phenotypes: [{ name: 'mucoviscidose', inheritance: 'AR' }] },
  predictions: [pred('CADD', 'del', 32), pred('SpliceAI', 'tol', 0.01)],
}), { lang: 'fr' });
const firm = (r) => r.supported.filter((c) => !c.conditional).map((c) => c.code).join(' ');
const cond = (r) => r.supported.filter((c) => c.conditional).map((c) => c.code).join(' ');
check('p.Phe508del : seul PM4 est posé par le chiffre', firm(f508), 'PM4');
check('p.Phe508del : BS1 et BS2 restent conditionnels', cond(f508), 'BS1 BS2');
// Le texte copié ne porte que ce que le biologiste a coché : un critère conditionnel
// qui l'a été l'a été par lui, et n'a plus à porter de marque de doute.
check('le texte copié rend le code et le fait',
  acmgText([f508.supported[0]]), 'PM4 — variation sans décalage du cadre de lecture (inframe) de 3 nucléotides');
check('un critère sans fait est rendu seul', acmgText([{ code: 'PS3', fact: null }]), 'PS3');
check('rien de coché, rien de copié', acmgText([]), '');
// BA1 est autonome dans l'article de 2015 : au-delà de 5 %, le chiffre suffit.
check('BA1 n’est pas conditionnel',
  firm(buildAcmg(ctx({ gnomad: { 'v4.1': { ac: 513548, af: 0.3182 } }, domain: null }), { lang: 'fr' })),
  'BA1 PP3');

// PM4 : changement de longueur de la protéine.
check('PM4 sur un inframe', codes({
  variant: { varType: 'inframe', varTypeNull: false, ref: 'ATCT', alt: 'A' }, domain: null,
}), 'PM4 PM2_Supporting PP3');

/* — Une source qui n'a pas répondu n'étaye rien, et une source en panne non plus —
 *
 * C'est la règle qui compte le plus : « absente de gnomAD » posé sur une panne de
 * gnomAD, c'est PM2 inventé. */
const vol = buildAcmg({ ...ctx(), pending: ['g4'] }, { lang: 'fr' });
check('gnomAD en vol : aucun critère de fréquence', acmgCodes(vol.supported), 'PM1 PP3');
check('gnomAD en vol : la source est signalée', vol.waiting.join(','), 'g4');
const down = buildAcmg({ ...ctx(), errors: { g4: new Error('503') } }, { lang: 'fr' });
check('gnomAD en panne : aucun critère de fréquence', acmgCodes(down.supported), 'PM1 PP3');
const noSplice = buildAcmg({ ...ctx(), pending: ['splice'] }, { lang: 'fr' });
check('SpliceAI en vol : pas de verdict de prédicteurs', acmgCodes(noSplice.supported),
  'PM1 PM2_Supporting');
// Sans coordonnées VCF, gnomAD n'a pas été interrogé du tout.
check('sans coordonnées : aucun critère de fréquence',
  codes({ variant: { ref: null, alt: null } }), 'PM1 PP3');

// Les deux langues disent la même chose, et toutes les clés existent (vérifié plus haut).
contains('EN : PM2', acmgText(buildAcmg(ctx(), { lang: 'en' }).supported),
  'PM2_Supporting — absent from gnomAD v4.1');
contains('EN : PP3', acmgText(buildAcmg(ctx(), { lang: 'en' }).supported),
  'PP3 — deleterious for CADD, REVEL');

/* — Le plan ANPGM : une case par critère que les chiffres ne posent pas — */
const topicCodes = TO_SPECIFY.flatMap((sec) => sec.criteria.map((c) => c.code));

check('les rubriques suivent le plan du référentiel',
  TO_SPECIFY.map((sec) => sec.topic).join(' '),
  'acmgTopicPatientFreq acmgTopicClinical acmgTopicCooccurrence acmgTopicSegregation '
  + 'acmgTopicLength acmgTopicTypeContext acmgTopicLocation acmgTopicPredictions '
  + 'acmgTopicFunctional');
check('les critères à préciser, dans l’ordre des rubriques', topicCodes.join(' '),
  'PS4 PP4 BP5 PM3 BP2 PS2 PM6 PP1 BS4 BP3 PP2 BP1 PS1 PM5 PS3 BS3');
check('aucun critère en double', new Set(topicCodes).size, topicCodes.length);
// Les prédictions gardent leur rubrique et n'ont aucune case : elles sont déjà étayées.
check('les prédictions n’ont pas de case',
  TO_SPECIFY.find((sec) => sec.topic === 'acmgTopicPredictions').criteria.length, 0);
check('et disent pourquoi',
  Boolean(TO_SPECIFY.find((sec) => sec.topic === 'acmgTopicPredictions').note), true);

// Un critère ne doit pas être à la fois posé par un chiffre et demandé au biologiste.
const postable = ['PVS1', 'PVS1_Moderate', 'PM1', 'PM2_Supporting', 'PM4', 'PP3', 'BA1',
  'BS1', 'BS2', 'BP4', 'BP7'];
check('aucun chevauchement avec les critères que l’application pose',
  topicCodes.filter((c) => postable.includes(c)).join(',') || '—', '—');

// Les libellés des deux langues, pour des clés construites dans la structure et non
// dans un appel littéral à `t` : la vérification de couverture ne les voit pas.
const topicKeys = TO_SPECIFY.flatMap((sec) => [sec.topic, sec.note,
  ...sec.criteria.map((c) => c.label)].filter(Boolean));
check('tous les libellés du plan existent en FR et EN',
  topicKeys.filter((k) => !(k in UI.fr) || !(k in UI.en)).join(',') || '—', '—');

/* — Course entre source principale et repli — */
const later = (v, ms) => () => new Promise((r) => setTimeout(() => r(v), ms));
const failsAfter = (ms) => () => new Promise((_, rej) => setTimeout(() => rej(new Error('boom')), ms));
const never = () => new Promise(() => {});

check('la principale gagne si elle répond avant le délai',
  await hedge(later('A', 10), later('B', 10), { delay: 200 }), 'A');
check('le repli gagne si la principale pend',
  await hedge(never, later('B', 10), { delay: 30 }), 'B');
check('le repli démarre tout de suite si la principale échoue vite',
  await hedge(failsAfter(5), later('B', 10), { delay: 5000 }), 'B');
check('la principale gagne même si le repli a démarré',
  await hedge(later('A', 60), later('B', 500), { delay: 10 }), 'A');
let hedgeErr = null;
try { await hedge(failsAfter(5), failsAfter(10), { delay: 5 }); } catch (e) { hedgeErr = e.message; }
check('les deux échouent → rejet', hedgeErr, 'boom');
let signalled = false;
await hedge(never, later('B', 5), { delay: 10, onSecondary: () => { signalled = true; } });
check('onSecondary prévient du démarrage du repli', signalled, true);

console.log(`\n${pass} vérifications passées, ${fail} en échec`);
process.exit(fail ? 1 : 0);
