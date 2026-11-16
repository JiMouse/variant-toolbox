// Critères ACMG/AMP que les chiffres déjà récupérés **étayent** — et, tout autant,
// ceux qu'aucun chiffre d'ici ne peut étayer.
//
// Trois principes, dont dépend tout le reste du fichier :
//
// 1. **Aucune classe n'est calculée.** Pondérer des critères demande la spécification
//    du gène (VCEP ClinGen quand il en existe une), le mécanisme de la maladie et
//    souvent le contexte du patient : rien de cela n'est ici. La classe reste celle
//    que le biologiste pose dans le formulaire, et ce module ne fait que lui rendre
//    les critères avec le chiffre qui les porte.
// 2. **Un critère n'est posé que si la source a répondu.** Une variation « absente de
//    gnomAD » parce que gnomAD n'a pas répondu, c'est PM2 posé sur une panne : chaque
//    règle vérifie donc que sa source a parlé (`pending`) et qu'elle n'a pas échoué
//    (`errors`). Tant qu'elle est en vol, le critère n'existe pas encore — il ne vaut
//    pas « non rempli ».
// 3. **Chaque critère porte sa réserve.** Les critères sont presque tous
//    conditionnels : PM1 veut un point chaud *sans* variation bénigne, BA1 une
//    population précise, PVS1 un mécanisme de perte de fonction établi. La réserve est
//    rendue avec le critère, jamais implicite.
//
// PP5 et BP6 ne sont volontairement jamais posés : ClinGen les a retirés en 2018
// (Biesecker & Harrison, Genet Med) parce qu'ils reclassent ClinVar avec ClinVar. La
// soumission ClinVar se lit à sa ligne, dans les chiffres.

import { TOL } from './annotate.js';
import { predictionVerdict, formatFreq, varTypeLabel } from './comment.js';
import { t } from './i18n.js';
import { decimal, isNum } from './util.js';

/**
 * Seuils de fréquence.
 *
 * 5 % est le seuil de BA1 dans l'article de 2015, et il est autonome : au-dessus, la
 * variation est bénigne sans autre argument. 1 % n'est en revanche **pas** un seuil
 * ACMG : BS1 demande « une fréquence plus élevée que ne l'explique la maladie », donc
 * un calcul par maladie (prévalence, pénétrance, hétérogénéité, part allélique). 1 %
 * est la convention la plus répandue à défaut de ce calcul — d'où la réserve attachée
 * au critère, qui dit que le seuil est à trancher sur la maladie.
 */
export const BA1_AF = 0.05;
export const BS1_AF = 0.01;

/** Types de variation dont la nomenclature protéique dit une perte de longueur (PM4). */
const LENGTH_TYPES = ['inframe', 'stop_lost'];

/** Types où une variation peut être silencieuse au sens de BP7. */
const SILENT_TYPES = ['synonymous', 'intronic'];

/** Types où un domaine protéique est un argument (PM1). */
const DOMAIN_TYPES = ['missense', 'inframe'];

/**
 * Localisation en clair — « exon 50/58 », « intron 22/26 ».
 * `locField` porte déjà « 50/58 » quand le total est connu, « 50 » sinon.
 */
function locLabel(v, lang) {
  if (!v.loc) return null;
  const n = v.locField || v.locNum;
  return n ? `${t(lang, v.loc)} ${n}` : t(lang, v.loc);
}

/**
 * Clause de saut d'exon ajoutée à PVS1 — l'entrée même de son arbre de décision :
 * un saut en phase et un saut qui décale le cadre n'ont pas la même force.
 *
 * Le détail complet (côté du site, bases codantes, codon d'initiation emporté) est
 * rendu sous « Structure exonique » ; ici on n'en garde que la phase.
 */
function skipClause(skip, lang) {
  if (!skip || !skip.coding) return null;
  // Libellé propre à cette clause plutôt que `skipExonOne`/`skipExonMany` : ici l'exon
  // suit un « saut », et « saut de l'exon 5 » comme « saut des exons 5, 6 » demandent
  // que la préposition soit dans le libellé — sans quoi le pluriel ne s'accorde pas.
  const ex = t(lang, skip.exons.length === 1 ? 'acmgSkipOfOne' : 'acmgSkipOfMany',
    { n: skip.exons[0], list: skip.exons.join(', ') });
  if (skip.carries.length) {
    return t(lang, 'acmgSkipCarries', {
      ex,
      what: skip.carries
        .map((c) => t(lang, c === 'start' ? 'skipAtg' : 'skipStopCodon'))
        .join(t(lang, 'skipAnd')),
    });
  }
  return t(lang, skip.inFrame ? 'acmgSkipInFrame' : 'acmgSkipOutFrame', { ex });
}

/**
 * Transmission récessive parmi les phénotypes du gène — ce que BS2 exige pour lire un
 * homozygote de gnomAD comme un argument bénin.
 *
 * Sur une maladie dominante, un hétérozygote de gnomAD ne dit presque rien (pénétrance,
 * âge de début) ; un **homozygote** sur une maladie récessive, lui, est l'observation
 * que BS2 décrit. Le mode de transmission vient d'OMIM ou de Monarch (voir
 * `buildPhenotypes`).
 */
function recessive(phenotypes) {
  const list = (phenotypes && phenotypes.phenotypes) || [];
  return list.some((p) => p.inheritance === 'AR' || p.inheritance === 'XLR');
}

/**
 * Un critère : le code, le fait qui le porte, la réserve qui reste.
 *
 * `conditional` sépare deux choses que l'affichage ne doit surtout pas confondre. Un
 * critère **étayé** l'est par un chiffre qui suffit à le poser — BA1 au-delà de 5 %
 * est autonome dans l'article de 2015, PM4 se lit sur la nomenclature. Un critère
 * **conditionnel** repose sur un chiffre qui ne vaut qu'une fois rapporté à la
 * maladie, et le rapporter demande ce que ce module n'a pas.
 *
 * Le cas qui a imposé la distinction : CFTR p.Phe508del, variation de classe 5 la plus
 * fréquente de la mucoviscidose, affiche 1,19 % d'allèles et 58 homozygotes dans
 * gnomAD v4.1. Au seuil conventionnel de 1 %, BS1 se déclenche ; et les homozygotes
 * sont des patients, non des témoins. Annoncer « BS1 BS2 étayés » sur cette
 * variation-là serait une faute, alors que montrer les deux chiffres sous la bonne
 * étiquette reste utile : c'est la fréquence de porteurs de la maladie qu'ils
 * mesurent.
 */
function crit(code, fact, caveat = null, conditional = false) {
  return { code, fact, caveat, conditional };
}

/**
 * Critères étayés par les chiffres de `ctx`, dans l'ordre de l'article de 2015
 * (pathogènes du plus fort au plus faible, puis bénins).
 *
 * @param {object} ctx  résultat de annotate()
 * @param {object} opts { lang, gnomadVersion, skip } — `skip` est la sortie de
 *   `exonSkipping` (js/structure.js), déjà calculée pour le schéma du transcrit.
 * @returns {{supported: Array, waiting: string[]}}
 *   `waiting` : les sources dont un critère dépend et qui n'ont pas encore répondu —
 *   l'encart les nomme, pour que la liste ne paraisse pas close.
 */
export function buildAcmg(ctx, { lang = 'fr', gnomadVersion = 'v4.1', skip = null } = {}) {
  const v = (ctx && ctx.variant) || {};
  const pending = (ctx && ctx.pending) || [];
  const errors = (ctx && ctx.errors) || {};
  const answered = (src) => !pending.includes(src);
  const usable = (src) => answered(src) && !errors[src];

  const supported = [];
  const waiting = [];
  /** La source a-t-elle parlé ? Sinon elle est signalée en attente, et rien n'est posé. */
  const needs = (src) => {
    if (answered(src)) return true;
    if (!waiting.includes(src)) waiting.push(src);
    return false;
  };

  /* — PVS1 : variation nulle — */
  if (v.varTypeNull) {
    const clause = skipClause(skip, lang);
    const fact = [varTypeLabel(v, lang), locLabel(v, lang), clause].filter(Boolean).join(', ');
    supported.push(crit('PVS1', fact, t(lang, 'acmgNotePVS1')));
  } else if (v.varType === 'start_lost') {
    // Codon d'initiation : l'ACMG 2015 l'écrit PVS1, le SVI le ramène à modéré faute
    // de savoir si un ATG en aval reprend la lecture.
    supported.push(crit('PVS1_Moderate',
      [t(lang, 'acmgWhyStartLost'), locLabel(v, lang)].filter(Boolean).join(', '),
      t(lang, 'acmgNoteStartLost')));
  }

  /* — PM1 : domaine protéique — */
  if (DOMAIN_TYPES.includes(v.varType) && needs('mv') && ctx.domain) {
    supported.push(crit('PM1', t(lang, 'acmgWhyDomain', { d: ctx.domain }), t(lang, 'acmgNotePM1')));
  }

  /* — PM4 : longueur de la protéine — */
  if (LENGTH_TYPES.includes(v.varType)) {
    supported.push(crit('PM4', varTypeLabel(v, lang),
      v.varType === 'inframe' ? t(lang, 'acmgNotePM4') : null));
  }

  /* — Fréquence : PM2, BA1, BS1, BS2 —
   *
   * La version de gnomAD est celle du commentaire : les deux doivent parler du même
   * chiffre. v4.1 vient de gnomAD lui-même, v2.1.1 de MyVariant — d'où deux sources
   * possibles pour la même règle. Sans coordonnées VCF, aucune des deux n'a été
   * interrogée : un « absente de gnomAD » serait alors une pure invention. */
  const freqSrc = gnomadVersion === 'v2.1.1' ? 'mv' : 'g4';
  if (v.ref && v.alt && needs(freqSrc) && usable(freqSrc)) {
    const g = ((ctx && ctx.gnomad) || {})[gnomadVersion] || null;
    const af = g && isNum(g.af) ? Number(g.af) : null;
    const ac = g && isNum(g.ac) ? Number(g.ac) : null;

    if (!g) {
      supported.push(crit('PM2_Supporting', t(lang, 'acmgWhyAbsent', { v: gnomadVersion }),
        t(lang, 'acmgNotePM2')));
    } else if (ac === 0) {
      supported.push(crit('PM2_Supporting', t(lang, 'acmgWhyAc0', { v: gnomadVersion }),
        t(lang, 'acmgNotePM2')));
    } else if (af !== null && af >= BA1_AF) {
      supported.push(crit('BA1', t(lang, 'acmgWhyFreq', { f: formatFreq(af, lang), v: gnomadVersion }),
        t(lang, 'acmgNoteBA1')));
    } else if (af !== null && af >= BS1_AF) {
      supported.push(crit('BS1', t(lang, 'acmgWhyFreq', { f: formatFreq(af, lang), v: gnomadVersion }),
        t(lang, 'acmgNoteBS1'), true));
    }

    if (g && isNum(g.hom) && Number(g.hom) > 0 && needs('phenotypes') && recessive(ctx.phenotypes)) {
      supported.push(crit('BS2', t(lang, 'acmgWhyHom', {
        n: decimal(String(g.hom), lang), v: gnomadVersion,
      }), t(lang, 'acmgNoteBS2'), true));
    }
  }

  /* — PP3 / BP4 : prédicteurs —
   *
   * Les deux sources des prédictions sont attendues : SpliceAI arrive souvent après
   * MyVariant, et il peut à lui seul retourner le verdict. Un critère qui s'afficherait
   * puis changerait de camp serait pire que pas de critère. */
  if (needs('mv') && needs('splice')) {
    const verdict = predictionVerdict(ctx.predictions || []);
    if (verdict.kind === 'pathogenic') {
      supported.push(crit('PP3', t(lang, 'acmgWhyDel', { list: verdict.del.join(', ') }),
        t(lang, 'acmgNotePred')));
    } else if (verdict.kind === 'benign') {
      supported.push(crit('BP4', t(lang, 'acmgWhyTol', { list: verdict.tol.join(', ') }),
        t(lang, 'acmgNotePred')));
    }
  }

  /* — BP7 : silencieuse, sans effet d'épissage prédit, sur une base peu conservée —
   *
   * Les trois conditions de l'article, et les trois chiffres sont là. « intronic » vaut
   * déjà au-delà de ±8 pb d'une jonction (SPLICE_INTRON_BP), donc au-delà du ±7 que
   * demande BP7. Une conservation inconnue n'est pas une conservation faible : sans le
   * GERP, le critère n'est pas posé. */
  if (SILENT_TYPES.includes(v.varType) && needs('mv') && needs('splice')) {
    const splice = (ctx.predictions || []).find((p) => p.name === 'SpliceAI');
    const gerp = ((ctx.conservation || {}).gerp) || {};
    if (splice && splice.verdict === TOL && gerp.conserved === false) {
      supported.push(crit('BP7', t(lang, 'acmgWhySilent', {
        type: varTypeLabel(v, lang), s: splice.score, g: gerp.score,
      }), t(lang, 'acmgNoteBP7')));
    }
  }

  return { supported, waiting };
}

/** Les codes seuls, pour la ligne qu'on recopie dans un dossier : « PVS1 PM2 PP3 ». */
export function acmgCodes(supported) {
  return supported.map((c) => c.code).join(' ');
}

/** Le bloc d'évidence, une ligne par critère — ce que copie le bouton de l'encart. */
export function acmgText(supported) {
  // Un critère conditionnel est marqué dans le texte copié aussi : collé dans un
  // dossier, « BS1 » sans sa marque se lirait comme un critère posé.
  return supported.map((c) => `${c.code}${c.conditional ? ' (?)' : ''} — ${c.fact}`).join('\n');
}
