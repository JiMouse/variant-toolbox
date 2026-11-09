// Génère le commentaire, dans le même ordre que comment.GetComment (VBA).
//
// Le texte français est repris mot pour mot de la macro, y compris ses petites
// bizarreries (voir README, « Écarts avec la macro ») : la comparaison avec les
// commentaires déjà validés doit être exempte de bruit cosmétique.
// Seule exception, demandée par la spécification : la phrase de conservation.

import { DEL, TOL } from './annotate.js';
import { NA, decimal, isNum } from './util.js';

const VAR_TYPE = {
  fr: {
    missense: 'variation faux-sens',
    nonsense: 'variation non-sens',
    frameshift: 'variation aboutissant à un décalage du cadre de lecture (frameshift)',
    synonymous: 'variation synonyme',
    intronic: 'variation intronique',
    inframe: 'variation sans décalage du cadre de lecture (inframe)',
    inframe_n: 'variation sans décalage du cadre de lecture (inframe) de {n} nucléotides',
    splice_acceptor: "variation au niveau du site accepteur d'épissage",
    splice_donor: "variation au niveau du site donneur d'épissage",
    splice_region: "variation de la région d'épissage",
    start_lost: "variation du codon d'initiation",
    stop_lost: 'variation du codon stop',
    utr5: "variation de la région 5' non traduite",
    utr3: "variation de la région 3' non traduite",
    upstream: 'variation en amont du gène',
    downstream: 'variation en aval du gène',
    noncoding_exon: 'variation exonique non codante',
    coding: 'variation codante',
  },
  en: {
    missense: 'missense variant',
    nonsense: 'nonsense variant',
    frameshift: 'frameshift variant',
    synonymous: 'synonymous variant',
    intronic: 'intronic variant',
    inframe: 'in-frame variant',
    inframe_n: 'in-frame variant of {n} nucleotides',
    splice_acceptor: 'splice acceptor site variant',
    splice_donor: 'splice donor site variant',
    splice_region: 'splice region variant',
    start_lost: 'start codon variant',
    stop_lost: 'stop codon variant',
    utr5: "5' untranslated region variant",
    utr3: "3' untranslated region variant",
    upstream: 'upstream gene variant',
    downstream: 'downstream gene variant',
    noncoding_exon: 'non-coding exon variant',
    coding: 'coding variant',
  },
};

const INHERITANCE = {
  fr: {
    AD: 'autosomique dominante',
    AR: 'autosomique récessive',
    XLR: "récessive liée à l'X",
    XLD: "dominante liée à l'X",
    XL: "liée à l'X",
    MT: 'mitochondriale',
  },
  en: {
    AD: 'autosomal dominant',
    AR: 'autosomal recessive',
    XLR: 'X-linked recessive',
    XLD: 'X-linked dominant',
    XL: 'X-linked',
    MT: 'mitochondrial',
  },
};

const CLINVAR_SIG = {
  fr: {
    pathogenic: 'pathogène',
    'likely pathogenic': 'probablement pathogène',
    'pathogenic/likely pathogenic': 'pathogène, probablement pathogène',
    benign: 'bénigne, probablement bénigne',
    'likely benign': 'bénigne, probablement bénigne',
    'benign/likely benign': 'bénigne, probablement bénigne',
    'uncertain significance': 'de signification incertaine',
    'conflicting interpretations of pathogenicity': 'de signification incertaine',
    'conflicting classifications of pathogenicity': 'de signification incertaine',
  },
  en: {
    pathogenic: 'pathogenic',
    'likely pathogenic': 'likely pathogenic',
    'pathogenic/likely pathogenic': 'pathogenic, likely pathogenic',
    benign: 'benign, likely benign',
    'likely benign': 'benign, likely benign',
    'benign/likely benign': 'benign, likely benign',
    'uncertain significance': 'of uncertain significance',
    'conflicting interpretations of pathogenicity': 'of uncertain significance',
    'conflicting classifications of pathogenicity': 'of uncertain significance',
  },
};

const T = {
  fr: {
    isA: "Il s'agit d'une {type}.",
    located: "Elle est localisée au niveau de l'{loc} {num} ({field}) du gène {gene}.",
    locatedNoExon: "Elle est localisée au niveau du gène {gene}.",
    exon: 'exon',
    intron: 'intron',
    absent: "Il s'agit d'une variation absente des bases de données de populations contrôle (gnomAD {version}).",
    rare: "Il s'agit d'une variation rare.",
    present: 'Cette variation est présente dans gnomAD ({version}, fréq.: {freq}).',
    predPrefix: 'Les outils de prédictions in silico sont ',
    predPath: 'en faveur du caractère pathogène de la variation ({del}).',
    predBenign: 'en faveur du caractère bénin de la variation ({tol}).',
    predDiscordant: 'discordants (délétère : {del} ; toléré : {tol}).',
    lof: 'La perte de fonction est un mécanisme connu de pathogénicité de ce gène.',
    conserved: "La variation est située au niveau d'un résidu conservé au cours de l'évolution.",
    // La macro n'écrit pas de point final après le domaine : conservé tel quel.
    domain: "Elle est localisée au niveau d'un domaine protéique fonctionnel : {domain}",
    clinvar: 'Cette variation a été rapportée dans Clinvar comme {sig} ({accessions}).',
    submissions: '{n} soumissions : {list}',
    submission: '{n} soumission : {list}',
    submissionNone: '{n} soumission',
    phenoLead: 'Les variations pathogènes de ce gène ont été associées à ',
    phenoItem: '{name} (MIM #{mim}) de transmission {inh}.',
    phenoItemNoInh: '{name} (MIM #{mim}).',
    phenoItemNoMim: '{name} de transmission {inh}.',
    phenoItemBare: '{name}.',
    // Texte HAS repris mot pour mot de la macro (double espace et accord inclus).
    class3: "A ce jour, il n'est pas possible d'affirmer ou d'infirmer la participation de cette variation à la symptomatologie de ce patient. Selon les recommandations HAS, les variations de classe 3  ne doivent pas être utilisés pour la prise en charge du patient, pour un diagnostic prénatal ou en conseil génétique.",
    class45: 'Cette variation est donc considérée comme {class} et en lien avec le phénotype clinique observé chez ce patient.',
    class5Label: 'pathogène (variation de classe 5)',
    class4Label: 'probablement pathogène (variation de classe 4)',
  },
  en: {
    isA: 'This is a {type}.',
    located: 'It is located in {loc} {num} ({field}) of the {gene} gene.',
    locatedNoExon: 'It is located in the {gene} gene.',
    exon: 'exon',
    intron: 'intron',
    absent: 'This variant is absent from control population databases (gnomAD {version}).',
    rare: 'This is a rare variant.',
    present: 'This variant is present in gnomAD ({version}, freq.: {freq}).',
    predPrefix: 'In silico prediction tools are ',
    predPath: 'in favour of a pathogenic effect of the variant ({del}).',
    predBenign: 'in favour of a benign effect of the variant ({tol}).',
    predDiscordant: 'discordant (deleterious: {del}; tolerated: {tol}).',
    lof: 'Loss of function is a known disease mechanism for this gene.',
    conserved: 'The variant affects a residue that is conserved through evolution.',
    domain: 'It is located in a functional protein domain: {domain}',
    clinvar: 'This variant has been reported in ClinVar as {sig} ({accessions}).',
    submissions: '{n} submissions: {list}',
    submission: '{n} submission: {list}',
    submissionNone: '{n} submission',
    phenoLead: 'Pathogenic variants in this gene have been associated with ',
    phenoItem: '{name} (MIM #{mim}), {inh} inheritance.',
    phenoItemNoInh: '{name} (MIM #{mim}).',
    phenoItemNoMim: '{name}, {inh} inheritance.',
    phenoItemBare: '{name}.',
    class3: "To date, it is not possible to confirm or exclude the contribution of this variant to this patient's symptoms. In line with the French HAS guidelines, class 3 variants must not be used for patient management, for prenatal diagnosis or in genetic counselling.",
    class45: 'This variant is therefore considered {class} and related to the clinical phenotype observed in this patient.',
    class5Label: 'pathogenic (class 5 variant)',
    class4Label: 'likely pathogenic (class 4 variant)',
  },
};

function fill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : String(vars[k])));
}

/** Ligne de nomenclature — équivalent de ExportNomen.GetNomen. */
export function buildNomenclature(v) {
  const cPart = v.hgvsc ? v.hgvsc.split(':').slice(1).join(':') : null;
  const nomen = cPart && v.transcript
    ? `${v.transcript}(${v.gene}):${cPart}`
    : (v.hgvsc || '');
  const parts = [`hg38 ${v.genomicHgvs}`, nomen, v.proteinChange || ''];
  return parts.filter(Boolean).join(' ').trim();
}

/** Libellé du type de variation, avec le nombre de nucléotides pour les inframe. */
export function varTypeLabel(v, lang) {
  const dict = VAR_TYPE[lang];
  if (v.varType === 'inframe') {
    const n = v.ref && v.alt ? Math.abs(v.ref.length - v.alt.length) : null;
    return n ? fill(dict.inframe_n, { n }) : dict.inframe;
  }
  return dict[v.varType] || v.varType || null;
}

/**
 * Verdict des prédictions, en reproduisant la logique VBA.
 * `UBound(Split(s, ","))` vaut 0 pour une liste vide **et** pour une liste à un seul
 * outil : une liste de 1 ne « gagne » donc jamais contre une liste de 0. Ce
 * comportement est conservé pour que la comparaison avec la macro reste fidèle.
 */
export function predictionVerdict(predictions) {
  const del = predictions.filter((p) => p.verdict === DEL).map((p) => p.name);
  const tol = predictions.filter((p) => p.verdict === TOL).map((p) => p.name);
  const ubound = (list) => (list.length === 0 ? 0 : list.length - 1);

  const revel = predictions.find((p) => p.name === 'REVEL');
  const metalr = predictions.find((p) => p.name === 'MetaLR');
  const revelNA = !revel || revel.verdict === null;
  const metalrNA = !metalr || metalr.verdict === null;

  const inDel = (n) => del.includes(n);
  const concordant = (inDel('REVEL') === inDel('MetaLR')) || revelNA || metalrNA;
  const concordantDel = inDel('REVEL') || inDel('MetaLR');
  const concordantTol = tol.includes('REVEL') || tol.includes('MetaLR');

  let kind;
  if (ubound(del) > ubound(tol) && concordant && concordantDel) kind = 'pathogenic';
  else if (ubound(del) < ubound(tol) && concordant && concordantTol) kind = 'benign';
  else kind = 'discordant';

  return { kind, del, tol, any: del.length > 0 || tol.length > 0 };
}

/** Fréquence allélique au format de l'UserForm : AF × 100, 4 décimales, suivi de « % ». */
export function formatFreq(af, lang) {
  if (!isNum(af)) return NA;
  const pct = Number((Number(af) * 100).toFixed(4));
  return `${decimal(String(pct), lang)} %`;
}

/**
 * Construit le commentaire complet.
 * @param {object} ctx  résultat de annotate()
 * @param {object} opts { lang: 'fr'|'en', variantClass: 3|4|5, gnomadVersion: 'v4.1'|'v2.1.1' }
 */
export function buildComment(ctx, opts = {}) {
  const lang = opts.lang === 'en' ? 'en' : 'fr';
  const t = T[lang];
  const v = ctx.variant;
  const version = opts.gnomadVersion || 'v4.1';
  const lines = [];

  // 1 — Nomenclature, puis une ligne vide.
  lines.push(buildNomenclature(v));
  lines.push('');

  // 2 — Type de variation et localisation.
  const typeLabel = varTypeLabel(v, lang);
  let loc2 = typeLabel ? fill(t.isA, { type: typeLabel }) : '';
  if (v.loc && v.locNum) {
    loc2 += `${loc2 ? ' ' : ''}${fill(t.located, {
      loc: t[v.loc], num: v.locNum, field: v.locField, gene: v.gene,
    })}`;
  } else if (v.gene) {
    loc2 += `${loc2 ? ' ' : ''}${fill(t.locatedNoExon, { gene: v.gene })}`;
  }
  if (loc2) lines.push(loc2);

  // 3 — Fréquence : absente (AC = 0 ou n.a.), rare (AC <= 5), ou présente.
  const g = ctx.gnomad[version];
  const ac = g && typeof g.ac === 'number' ? g.ac : null;
  if (ac === null || ac === 0) {
    lines.push(fill(t.absent, { version }));
  } else if (ac <= 5) {
    lines.push(t.rare);
  } else {
    lines.push(fill(t.present, { version, freq: formatFreq(g.af, lang) }));
  }

  // 4 — Prédictions in silico.
  const verdict = predictionVerdict(ctx.predictions);
  if (verdict.any) {
    const body = verdict.kind === 'pathogenic'
      ? fill(t.predPath, { del: verdict.del.join(', ') })
      : verdict.kind === 'benign'
        ? fill(t.predBenign, { tol: verdict.tol.join(', ') })
        : fill(t.predDiscordant, { del: verdict.del.join(', '), tol: verdict.tol.join(', ') });
    lines.push(t.predPrefix + body);
  }

  // 5 — Variation nulle : perte de fonction.
  if (v.varTypeNull) lines.push(t.lof);

  // 6 — Conservation (faux-sens seulement).
  // Bug de la macro corrigé : le test portait sur var_type après remplacement par
  // « variation faux-sens », donc la phrase ne sortait jamais ; et elle s'écrivait
  // « résidu  au cours de l'évolution » quand le résidu n'était pas conservé.
  // Ici : phrase écrite uniquement si faux-sens ET GERP conservé ET phyloP > 4.
  if (v.varType === 'missense') {
    const { gerp, phylop } = ctx.conservation;
    if (gerp.conserved === true && phylop.raw !== null && phylop.raw > 4) {
      lines.push(t.conserved);
    }
  }

  // 7 — Domaine protéique.
  if (ctx.domain && ctx.domain !== NA) {
    lines.push(fill(t.domain, { domain: ctx.domain }));
  }

  // 8 — ClinVar.
  const cv = ctx.clinvar;
  if (cv && cv.count > 0 && cv.significance) {
    const key = String(cv.significance).toLowerCase().replace(/_/g, ' ');
    const sig = CLINVAR_SIG[lang][key] || cv.significance;
    const list = cv.accessions.join(', ');
    const accessions = cv.count > 1
      ? fill(t.submissions, { n: cv.count, list })
      : fill(t.submission, { n: cv.count, list });
    lines.push(fill(t.clinvar, { sig, accessions }));
  }

  // 9 — Phénotypes.
  const phenos = (ctx.phenotypes && ctx.phenotypes.phenotypes) || [];
  if (phenos.length) {
    const items = phenos.map((p) => {
      const inh = p.inheritance ? INHERITANCE[lang][p.inheritance] || p.inheritance : null;
      if (p.mim && inh) return fill(t.phenoItem, { name: p.name, mim: p.mim, inh });
      if (p.mim) return fill(t.phenoItemNoInh, { name: p.name, mim: p.mim });
      if (inh) return fill(t.phenoItemNoMim, { name: p.name, inh });
      return fill(t.phenoItemBare, { name: p.name });
    });
    lines.push('');
    lines.push(t.phenoLead);
    items.forEach((i) => lines.push(i));
  }

  // 10 — Conclusion selon la classe.
  const cls = Number(opts.variantClass);
  let conclusion = '';
  if (cls === 3) conclusion = t.class3;
  else if (cls === 4) conclusion = fill(t.class45, { class: t.class4Label });
  else if (cls === 5) conclusion = fill(t.class45, { class: t.class5Label });
  if (conclusion) {
    lines.push('');
    lines.push(conclusion);
  }

  return lines.map((l) => l.replace(/[ \t]+$/, '')).join('\n');
}
