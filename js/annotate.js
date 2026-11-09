// Récupère les chiffres affichés par l'UserForm et applique les seuils de la macro.
// Seuils : CADD > 15, REVEL > 0,5, SpliceAI > 0,5, GERP >= 2 = conservé,
// AlphaMissense pred B = toléré, SIFT/PolyPhen/MetaLR : T/B = toléré, D/P/A = délétère.

import {
  myVariant, gnomad4, spliceai, intervar, mygene, ncbiGeneId,
  monarchDiseases, monarchDisease, omimGeneMap, mobiDetailsId,
} from './sources.js';
import { NA, first, distinct, get, round, isNum, settleAll } from './util.js';

export const DEL = 'del';
export const TOL = 'tol';

/** Un outil de prédiction : verdict (del/tol/null), score, et valeurs discordantes éventuelles. */
function entry(name, verdict, score, extra = {}) {
  return { name, verdict, score: score === null ? NA : score, ...extra };
}

/** T/B = toléré ; D/P/N/A = délétère — règle MyLabel de la macro. */
function predFromLetter(pred) {
  if (!pred) return null;
  const p = String(pred).toUpperCase();
  if (p.includes('T') || p.includes('B')) return TOL;
  if (p.includes('D') || p.includes('P') || p.includes('N') || p.includes('A')) return DEL;
  return null;
}

function letterEntry(name, mv, predPath, scorePath) {
  const predRaw = get(mv, predPath);
  const pred = first(predRaw);
  const values = distinct(predRaw);
  return entry(name, predFromLetter(pred), round(first(get(mv, scorePath)), 2), {
    raw: pred,
    discordant: values.length > 1 ? values : null,
  });
}

/** Seuil numérique : au-dessus = délétère. */
function thresholdEntry(name, value, threshold, decimals = 2) {
  const v = first(value);
  if (!isNum(v)) return entry(name, null, NA);
  return entry(name, Number(v) > threshold ? DEL : TOL, round(v, decimals), { raw: Number(v) });
}

/** Construit les prédictions dans l'ordre d'affichage de l'UserForm. */
export function buildPredictions(mv, spliceaiRes) {
  const preds = [];
  preds.push(letterEntry('SIFT', mv, 'dbnsfp.sift.pred', 'dbnsfp.sift.score'));
  preds.push(letterEntry('PolyPhen-2', mv, 'dbnsfp.polyphen2.hdiv.pred', 'dbnsfp.polyphen2.hdiv.score'));
  preds.push(thresholdEntry('CADD', get(mv, 'dbnsfp.cadd.phred') ?? get(mv, 'cadd.phred'), 15));
  preds.push(thresholdEntry('REVEL', get(mv, 'dbnsfp.revel.score'), 0.5));
  preds.push(letterEntry('MetaLR', mv, 'dbnsfp.metalr.pred', 'dbnsfp.metalr.score'));

  // AlphaMissense : seul « B » est toléré, tout le reste est délétère.
  const amPredRaw = get(mv, 'dbnsfp.alphamissense.pred');
  const amPred = first(amPredRaw);
  preds.push(entry('AlphaMissense',
    amPred ? (String(amPred).toUpperCase() === 'B' ? TOL : DEL) : null,
    round(first(get(mv, 'dbnsfp.alphamissense.score')), 2),
    { raw: amPred, discordant: distinct(amPredRaw).length > 1 ? distinct(amPredRaw) : null }));

  preds.push(spliceaiEntry(spliceaiRes));
  return preds;
}

/** SpliceAI : score retenu = maximum des quatre delta scores (gain/perte, accepteur/donneur). */
export function spliceaiEntry(res) {
  const scores = res && res.scores && res.scores.length ? res.scores[0] : null;
  if (!scores) return entry('SpliceAI', null, NA);
  const ds = ['DS_AG', 'DS_AL', 'DS_DG', 'DS_DL']
    .map((k) => Number(scores[k]))
    .filter((x) => !Number.isNaN(x));
  if (!ds.length) return entry('SpliceAI', null, NA);
  const max = Math.max(...ds);
  return entry('SpliceAI', max > 0.5 ? DEL : TOL, round(max, 2), {
    raw: max,
    detail: { DS_AG: scores.DS_AG, DS_AL: scores.DS_AL, DS_DG: scores.DS_DG, DS_DL: scores.DS_DL },
  });
}

/** Conservation : GERP (seuil 2), phyloP100way et phastCons100way. */
export function buildConservation(mv) {
  const gerpRaw = first(get(mv, 'dbnsfp.gerp++.rs'));
  const phylop = first(get(mv, 'dbnsfp.phylop.100way_vertebrate.score'));
  const phastcons = first(get(mv, 'dbnsfp.phastcons.100way_vertebrate.score'));
  return {
    gerp: {
      score: round(gerpRaw, 2),
      raw: isNum(gerpRaw) ? Number(gerpRaw) : null,
      conserved: isNum(gerpRaw) ? Number(gerpRaw) >= 2 : null,
    },
    phylop: { score: round(phylop, 2), raw: isNum(phylop) ? Number(phylop) : null, range: '-20–30' },
    phastcons: { score: round(phastcons, 2), raw: isNum(phastcons) ? Number(phastcons) : null, range: '0–1' },
  };
}

/** Domaine InterPro : premier domaine, découpé sur « | » comme dans la macro. */
export function buildDomain(mv) {
  const d = first(get(mv, 'dbnsfp.interpro.domain'));
  if (!d) return null;
  return String(d).split('|')[0].trim() || null;
}

const SIG_ORDER = ['pathogenic', 'likely pathogenic', 'uncertain significance', 'likely benign', 'benign'];

/**
 * Signification ClinVar agrégée à partir des RCV (MyVariant ne fournit pas le champ agrégé
 * que lisait la macro dans la colonne SOPHiA clinvar_significance).
 */
export function buildClinvar(mv) {
  const rcvRaw = get(mv, 'clinvar.rcv');
  if (!rcvRaw) return { count: 0, accessions: [], significance: null, significances: [] };
  const rcvs = Array.isArray(rcvRaw) ? rcvRaw : [rcvRaw];
  const accessions = rcvs.map((r) => r.accession).filter(Boolean);
  const sigs = [...new Set(rcvs
    .map((r) => String(r.clinical_significance || '').trim())
    .filter(Boolean))];

  const norm = sigs.map((s) => s.toLowerCase().replace(/_/g, ' '));
  const hasP = norm.some((s) => s === 'pathogenic');
  const hasLP = norm.some((s) => s === 'likely pathogenic');
  const hasB = norm.some((s) => s === 'benign');
  const hasLB = norm.some((s) => s === 'likely benign');
  const hasVUS = norm.some((s) => s.includes('uncertain'));

  let significance = null;
  const pathSide = hasP || hasLP;
  const benignSide = hasB || hasLB;
  if (pathSide && (benignSide || hasVUS)) significance = 'Conflicting classifications of pathogenicity';
  else if (benignSide && hasVUS) significance = 'Conflicting classifications of pathogenicity';
  else if (hasP && hasLP) significance = 'Pathogenic/Likely pathogenic';
  else if (hasP) significance = 'Pathogenic';
  else if (hasLP) significance = 'Likely pathogenic';
  else if (hasB && hasLB) significance = 'Benign/Likely benign';
  else if (hasB) significance = 'Benign';
  else if (hasLB) significance = 'Likely benign';
  else if (hasVUS) significance = 'Uncertain significance';
  else significance = sigs[0] || null;

  // Nombre de soumissions = nombre d'accessions RCV, comme CompteOccurrences dans la macro.
  return {
    count: accessions.length,
    accessions,
    significance,
    significances: sigs.sort((a, b) => SIG_ORDER.indexOf(a.toLowerCase()) - SIG_ORDER.indexOf(b.toLowerCase())),
    submitters: rcvs.reduce((n, r) => n + (Number(r.number_submitters) || 0), 0),
  };
}

/** gnomAD v4.1 (exomes + génomes) et v2.1.1 exomes (MyVariant), aux formats de l'UserForm. */
export function buildGnomad(g4, mv) {
  const v = g4 && g4.data && g4.data.variant ? g4.data.variant : null;
  const part = (p) => (p ? {
    ac: p.ac, an: p.an, af: p.af, hom: p.homozygote_count,
    het: typeof p.ac === 'number' ? p.ac - 2 * (p.homozygote_count || 0) : null,
  } : null);

  const exome = part(v && v.exome);
  const genome = part(v && v.genome);
  const ac = (exome ? exome.ac : 0) + (genome ? genome.ac : 0);
  const an = (exome ? exome.an : 0) + (genome ? genome.an : 0);
  const hom = (exome ? exome.hom : 0) + (genome ? genome.hom : 0);
  const combined = (exome || genome)
    ? { ac, an, hom, het: ac - 2 * hom, af: an ? ac / an : null }
    : null;

  // gnomAD v2.1.1 exomes : ac.ac / hom.hom / af.af, comme lisait la macro.
  const v2ac = get(mv, 'gnomad_exome.ac.ac');
  const v2hom = get(mv, 'gnomad_exome.hom.hom');
  const v2af = get(mv, 'gnomad_exome.af.af');
  const v2 = v2ac !== null && v2ac !== undefined
    ? {
      ac: Number(v2ac),
      hom: v2hom === null || v2hom === undefined ? null : Number(v2hom),
      af: v2af === null || v2af === undefined ? null : Number(v2af),
      het: Number(v2ac) - 2 * (Number(v2hom) || 0),
    }
    : null;

  return {
    'v4.1': combined ? { ...combined, exome, genome } : null,
    'v2.1.1': v2,
    rsids: v && v.rsids ? v.rsids : null,
  };
}

const INTERVAR_CLASS = {
  Benign: 1, 'Likely benign': 2, 'Uncertain significance': 3,
  'Likely pathogenic': 4, Pathogenic: 5,
};

export function buildIntervar(res) {
  if (!res || !res.Intervar) return null;
  const label = String(res.Intervar).trim();
  const criteria = Object.entries(res)
    .filter(([k, val]) => /^(PVS1|PS\d|PM\d|PP\d|BA1|BS\d|BP\d)$/.test(k) && Number(val) > 0)
    .map(([k]) => k);
  return { label, class: INTERVAR_CLASS[label] || null, criteria, gene: res.Gene || null };
}

const INHERITANCE_HPO = {
  'HP:0000006': 'AD', 'HP:0000007': 'AR', 'HP:0001417': 'XL',
  'HP:0001419': 'XLR', 'HP:0001423': 'XLD', 'HP:0001427': 'MT',
  'HP:0010985': 'AD',
};

/** Phénotypes : OMIM si une clé est fournie et passe, sinon Monarch (nom + MIM + transmission). */
export async function buildPhenotypes({ hgncId, geneMim, omimKey, maxPhenotypes = 12 }) {
  if (omimKey && geneMim) {
    try {
      const r = await omimGeneMap(geneMim, omimKey);
      const list = get(r, 'omim.entryList');
      const pml = list && list[0] && get(list[0], 'entry.geneMap.phenotypeMapList');
      if (pml && pml.length) {
        const phenos = pml.map((p) => {
          const pm = p.phenotypeMap || p;
          return {
            name: pm.phenotype,
            mim: pm.phenotypeMimNumber,
            inheritance: normaliseInheritance(pm.phenotypeInheritance),
          };
        }).filter((p) => p.name);
        if (phenos.length) return { source: 'OMIM', phenotypes: phenos };
      }
    } catch (e) {
      // OMIM n'envoie pas d'en-tête CORS : échec attendu depuis un navigateur, on continue.
    }
  }

  if (!hgncId) return { source: null, phenotypes: [], note: 'NO_HGNC' };

  const assoc = await monarchDiseases(hgncId, maxPhenotypes);
  const items = (assoc && assoc.items) || [];
  const seen = new Set();
  const unique = [];
  for (const it of items) {
    if (!it.object || seen.has(it.object)) continue;
    if (/^obsolete\b/i.test(String(it.object_label || ''))) continue;
    seen.add(it.object);
    unique.push(it);
    if (unique.length >= maxPhenotypes) break;
  }

  // Les fiches maladie sont demandées en parallèle : une par maladie, sinon la
  // récupération dure plusieurs dizaines de secondes sur un gène très annoté.
  const details = await Promise.all(unique.map(async (it) => {
    try {
      const d = await monarchDisease(it.object);
      const mapping = ((d && d.mappings) || []).find((m) => String(m.id).startsWith('OMIM:'));
      const inh = d && d.inheritance;
      return {
        mim: mapping ? String(mapping.id).replace('OMIM:', '') : null,
        inheritance: inh && inh.id ? (INHERITANCE_HPO[inh.id] || null) : null,
      };
    } catch (e) {
      return { mim: null, inheritance: null }; // une maladie sans fiche ne bloque pas les autres
    }
  }));

  const out = unique.map((it, i) => ({
    name: it.object_label, mim: details[i].mim, inheritance: details[i].inheritance, mondo: it.object,
  }));
  return { source: 'Monarch', phenotypes: out };
}

/** « Autosomal dominant », « AD », « X-linked recessive »… → AD / AR / XLR / XLD. */
export function normaliseInheritance(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (/x-linked recessive|xlr/.test(t)) return 'XLR';
  if (/x-linked dominant|xld/.test(t)) return 'XLD';
  if (/x-linked|\bxl\b/.test(t)) return 'XL';
  if (/autosomal dominant|\bad\b/.test(t)) return 'AD';
  if (/autosomal recessive|\bar\b/.test(t)) return 'AR';
  if (/mitochondrial/.test(t)) return 'MT';
  return null;
}

/**
 * Interroge toutes les sources en parallèle et assemble le contexte complet du variant.
 * Une source en panne laisse « n.a. » dans son champ et une entrée dans `errors`.
 */
export async function annotate(variant, { omimKey = null, mobiKey = null, maxPhenotypes = 12 } = {}) {
  const id = variant.gnomadId;
  const { out, errors } = await settleAll({
    mv: () => myVariant(variant.myVariantId),
    g4: () => (id ? gnomad4(id) : Promise.resolve(null)),
    splice: () => (id ? spliceai(id) : Promise.resolve(null)),
    iv: () => (variant.ref ? intervar(variant.chr, variant.pos, variant.ref, variant.alt) : Promise.resolve(null)),
    gene: () => (variant.transcript ? mygene(variant.transcript) : Promise.resolve(null)),
    geneId: () => (variant.gene ? ncbiGeneId(variant.gene) : Promise.resolve(null)),
    mobi: () => (mobiKey && variant.hgvsc ? mobiDetailsId(variant.hgvsc, mobiKey) : Promise.resolve(null)),
  });

  const mv = out.mv && !out.mv.__notFound ? out.mv : null;
  const hit = out.gene && out.gene.hits && out.gene.hits[0] ? out.gene.hits[0] : null;
  const uniprot = hit ? (get(hit, 'uniprot.Swiss-Prot') || null) : null;
  const hgncId = hit ? (hit.HGNC ? String(hit.HGNC) : null) : null;
  const geneMim = hit ? (Array.isArray(hit.MIM) ? hit.MIM[0] : hit.MIM) : null;

  let phenotypes = { source: null, phenotypes: [] };
  try {
    phenotypes = await buildPhenotypes({ hgncId, geneMim, omimKey, maxPhenotypes });
  } catch (e) {
    errors.phenotypes = String(e.message || e);
  }

  return {
    variant,
    notFoundInMyVariant: Boolean(out.mv && out.mv.__notFound),
    predictions: buildPredictions(mv, out.splice),
    conservation: buildConservation(mv),
    domain: buildDomain(mv) || (variant.domains || []).map((d) => d.name).find(Boolean) || null,
    clinvar: buildClinvar(mv),
    gnomad: buildGnomad(out.g4, mv),
    intervar: buildIntervar(out.iv),
    gene: {
      symbol: variant.gene,
      uniprot: first(uniprot),
      hgncId,
      mim: geneMim,
      ncbiGeneId: out.geneId || null,
    },
    phenotypes,
    mobiDetailsId: out.mobi || null,
    rsid: variant.rsid || (out.g4 && get(out.g4, 'data.variant.rsids') ? first(get(out.g4, 'data.variant.rsids')) : null)
      || first(get(mv, 'dbsnp.rsid')) || null,
    errors,
  };
}
