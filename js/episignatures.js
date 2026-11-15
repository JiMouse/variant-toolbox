// Épisignatures suivies par le projet Epi2Diag : quels gènes en ont une, et dans
// quelles conditions une VSI peut y être reclassée.
//
// Le projet Epi2Diag évalue et valide de façon indépendante les épisignatures publiées
// utilisées pour reclasser les VSI des chromatinopathies. Pour
// le biologiste qui rédige un commentaire, la question n'est pas « ce gène a-t-il une
// épisignature dans la littérature ? » mais « puis-je, aujourd'hui, faire trancher
// cette VSI par une épisignature ? ». Les trois états ci-dessous répondent à cette
// question ; le nombre de témoins positifs et la sensibilité disent ce qu'on peut
// attendre du résultat.
//
// Les chiffres sont ceux de la liste Epi2Diag de septembre 2026 (SNAPSHOT) : ils
// bougent à mesure que les témoins positifs sont analysés, et la date doit rester
// affichée avec eux.
//
// Aucun accès au DOM ici : table de données et fonctions pures, testées sous Node
// (tools/test-episignatures.mjs). Les libellés des trois états sont dans js/i18n.js —
// ce sont des libellés d'interface ; les textes propres à une ligne (syndrome,
// périmètre) sont ici, avec la ligne qu'ils décrivent. js/app.js ne fait que poser
// dans le DOM les phrases rendues par describeEpisignature.

import { t } from './i18n.js';
import { decimal, isNum } from './util.js';

/** Date de la liste. Toute valeur de `controls` ou `sensitivity` s'entend à cette date. */
export const SNAPSHOT = { fr: 'sept. 2026', en: 'Sept. 2026' };

/**
 * Les trois états du tableau Epi2Diag, du plus au moins exploitable :
 *   RESEARCH — analyse de VSI possible au titre de la recherche ;
 *   CONTROLS — analyse possible, mais témoins positifs complémentaires requis pour
 *              améliorer les performances ;
 *   WANTED   — témoins positifs nécessaires : la signature n'est pas encore utilisable,
 *              et le projet cherche des échantillons de classe 4 ou 5 dans ce gène.
 */
export const RESEARCH = 'research';
export const CONTROLS = 'controls';
export const WANTED = 'wanted';

/**
 * Une ligne de la liste Epi2Diag.
 *
 * `genes`     symbole(s) HGNC approuvé(s) couvert(s) par la signature ;
 * `aliases`   symboles alternatifs par lesquels le gène peut arriver ici ;
 * `syndrome`  nom clinique — chaîne éponyme (identique FR/EN) ou paire { fr, en }
 *             pour les intitulés descriptifs ; `null` quand la liste ne le donne pas ;
 * `controls`  nombre de témoins positifs de référence déjà analysés ;
 * `sensitivity` sensibilité estimée, en pourcentage ;
 * `internalOnly` sensibilité issue d'une validation interne seulement ;
 * `scope`     'single' = signature de gène unique, 'shared' = partagée par quelques
 *             gènes (une signature partagée ne désigne pas le gène à elle seule) ;
 * `cds`       [début, fin] en coordonnées c. quand la signature ne vaut que dans une
 *             région du transcrit, `outside: true` pour la signature complémentaire ;
 * `perimeter` limite de validité, telle que la liste la formule ;
 * `pmid`      publication de référence de la signature.
 */
export const EPISIGNATURES = [
  {
    genes: ['KDM5C'], syndrome: 'Claes-Jensen syndrome',
    controls: 9, controlsNote: { fr: 'hommes', en: 'males' }, sensitivity: 88,
    state: RESEARCH, scope: 'single', pmid: '23356856',
    perimeter: {
      fr: 'périmètre réduit : les variations du linker ARID-PHD1 N-terminal donnent '
        + 'une signature inverse ; 100 % en dehors de cette région',
      en: 'reduced perimeter: variants in the N-terminal ARID-PHD1 linker region '
        + 'display an opposite signature; 100% outside it',
    },
  },
  {
    genes: ['DNMT1'],
    syndrome: {
      fr: 'ataxie cérébelleuse, surdité et narcolepsie, autosomique dominante',
      en: 'cerebellar ataxia, deafness and narcolepsy, autosomal dominant',
    },
    controls: null, sensitivity: null, state: WANTED, scope: 'single', pmid: '32109418',
  },
  {
    genes: ['CREBBP'], syndrome: 'Rubinstein-Taybi syndrome',
    controls: 32, sensitivity: 94, state: RESEARCH, scope: 'shared', pmid: '32109418',
  },
  {
    genes: ['CHD3'], syndrome: null,
    controls: 24, sensitivity: 92, internalOnly: true, state: CONTROLS,
  },
  {
    genes: ['ANKRD11'], syndrome: 'KBG syndrome',
    controls: 23, sensitivity: 91, state: RESEARCH, scope: 'single', pmid: '36440975',
  },
  {
    genes: ['NIPBL'], syndrome: 'Cornelia de Lange syndrome',
    controls: 22, sensitivity: 100, state: RESEARCH, scope: 'shared', pmid: '32109418',
  },
  {
    genes: ['EP300'], syndrome: 'Rubinstein-Taybi syndrome',
    controls: 21, sensitivity: 95, state: RESEARCH,
  },
  {
    genes: ['SETD5'],
    syndrome: {
      fr: 'déficience intellectuelle autosomique dominante 23',
      en: 'mental retardation, autosomal dominant 23',
    },
    controls: 21, sensitivity: 95, state: RESEARCH, scope: 'single', pmid: '35047860',
  },
  {
    genes: ['CHD8'],
    syndrome: { fr: 'susceptibilité à l’autisme 18', en: 'autism, susceptibility to, 18' },
    controls: 20, sensitivity: 100, state: RESEARCH, scope: 'single', pmid: '32109418',
  },
  {
    genes: ['KMT2A'], syndrome: 'Wiedemann-Steiner syndrome',
    controls: 20, sensitivity: 100, state: RESEARCH, scope: 'single', pmid: '32109418',
  },
  {
    genes: ['DNMT3A'], syndrome: 'Tatton-Brown-Rahman syndrome',
    controls: 19, sensitivity: 95, state: RESEARCH, scope: 'single', pmid: '32109418',
  },
  {
    genes: ['CHD7'], syndrome: 'CHARGE syndrome',
    controls: 18, sensitivity: 94, state: RESEARCH, scope: 'single', pmid: '32109418',
  },
  {
    genes: ['ARID1B'], syndrome: 'Coffin-Siris syndrome',
    controls: 17, sensitivity: 100, state: RESEARCH, scope: 'shared', pmid: '32109418',
  },
  // ADNP porte deux signatures distinctes, qui se départagent sur la position c. :
  // celle de la région centrale est exploitable, celle des extrémités attend ses
  // témoins. Un variant dont la position c. n'est pas déterminable (intronique, UTR)
  // laisse les deux lignes affichées — voir findEpisignatures.
  {
    genes: ['ADNP'],
    syndrome: { fr: 'syndrome ADNP — région centrale', en: 'ADNP syndrome — central' },
    cds: [2000, 2340],
    controls: 15, sensitivity: 100, state: CONTROLS, scope: 'single', pmid: '32109418',
    perimeter: {
      fr: 'signature à confirmer',
      en: 'signature to be confirmed',
    },
  },
  {
    genes: ['ADNP'],
    syndrome: {
      fr: 'syndrome ADNP — extrémités 5′ et 3′',
      en: 'ADNP syndrome — 5′ and 3′ terminal ends',
    },
    cds: [2000, 2340], outside: true,
    controls: null, sensitivity: null, state: WANTED, scope: 'single', pmid: '32109418',
  },
  {
    genes: ['EHMT1'], syndrome: 'Kleefstra syndrome 1',
    controls: 13, sensitivity: 100, state: CONTROLS, scope: 'single', pmid: '32109418',
  },
  { genes: ['CDK13'], syndrome: null, controls: 12, sensitivity: 100, state: CONTROLS },
  { genes: ['CHD2'], syndrome: null, controls: 12, sensitivity: 100, state: CONTROLS },
  {
    genes: ['KMT2D'], syndrome: 'Kabuki syndrome',
    controls: 12, sensitivity: 92, state: CONTROLS, scope: 'shared', pmid: '32109418',
  },
  // La liste écrit « KMT6A » en face du syndrome de Kabuki. KMT6A est un synonyme
  // d'EZH2 (syndrome de Weaver) ; la signature de Kabuki de type 2 est celle de KDM6A.
  // Le gène retenu est donc KDM6A, et « KMT6A » reste accepté en alias pour que la
  // ligne se retrouve sous le nom de la liste.
  {
    genes: ['KDM6A'], aliases: ['KMT6A'], syndrome: 'Kabuki syndrome',
    controls: 12, sensitivity: 100, state: CONTROLS, scope: 'shared', pmid: '32109418',
  },
  {
    genes: ['NSD1'], syndrome: 'Sotos syndrome',
    controls: 11, sensitivity: 100, state: CONTROLS, scope: 'single', pmid: '26690673',
  },
  {
    genes: ['SRCAP'], syndrome: 'Floating-Harbor syndrome',
    controls: 11, sensitivity: 100, state: CONTROLS, scope: 'single', pmid: '32109418',
  },
  {
    genes: ['SMARCA2'], syndrome: 'Nicolaides-Baraitser syndrome (NCBRS)',
    controls: 10, sensitivity: 60, state: CONTROLS,
  },
  { genes: ['CTCF'], syndrome: null, controls: 10, sensitivity: 90, state: CONTROLS },
  {
    genes: ['RNU2-2'], aliases: ['RNU2-2P'], syndrome: 'ReNU syndrome',
    controls: 9, sensitivity: 100, internalOnly: true, state: WANTED, scope: 'single',
    perimeter: {
      fr: 'variation n.4 seulement ; en dehors, signatures plus faibles et incertaines',
      en: 'n.4 variant only; weaker, uncertain signatures outside it',
    },
  },
  {
    genes: ['KAT6A'], syndrome: 'Arboleda-Tham syndrome',
    controls: 8, sensitivity: 50, state: WANTED, scope: 'single', pmid: '35047860',
  },
  {
    genes: ['SMC3'], syndrome: 'Cornelia de Lange syndrome',
    controls: 8, sensitivity: 37.5, state: CONTROLS, scope: 'shared', pmid: '32109418',
  },
  {
    genes: ['SMC1A'], syndrome: 'Cornelia de Lange syndrome',
    controls: 8, sensitivity: 50, state: CONTROLS, scope: 'shared', pmid: '32109418',
    perimeter: { fr: 'faux-sens seulement', en: 'missense variants only' },
  },
  {
    genes: ['MAU2'], syndrome: 'Cornelia de Lange syndrome',
    controls: 8, sensitivity: 75, state: CONTROLS, scope: 'shared', pmid: '32109418',
  },
  { genes: ['PURA'], syndrome: null, controls: 8, sensitivity: 37.5, state: CONTROLS },
  { genes: ['BCL11B'], syndrome: null, controls: 7, sensitivity: 100, state: CONTROLS },
  { genes: ['KANSL1'], syndrome: null, controls: 7, sensitivity: 100, state: CONTROLS },
  { genes: ['SET'], syndrome: null, controls: 7, sensitivity: 100, state: CONTROLS },
  { genes: ['SETD1B'], syndrome: null, controls: 7, sensitivity: 71, state: CONTROLS },
  { genes: ['TCF4'], syndrome: null, controls: 7, sensitivity: 86, state: CONTROLS },
  { genes: ['TRIP12'], syndrome: null, controls: 7, sensitivity: 71, state: CONTROLS },
  {
    genes: ['ATRX'],
    syndrome: {
      fr: 'alpha-thalassémie avec déficience intellectuelle (ATR-X)',
      en: 'alpha-thalassemia mental retardation syndrome (ATR-X)',
    },
    controls: 6, sensitivity: 100, state: RESEARCH, scope: 'single', pmid: '32109418',
  },
  { genes: ['KMT2B'], syndrome: null, controls: 5, sensitivity: 100, state: RESEARCH },
  {
    genes: ['RAD21'], syndrome: 'Cornelia de Lange syndrome',
    controls: 5, sensitivity: 100, state: CONTROLS, scope: 'shared', pmid: '32109418',
  },
  {
    genes: ['SETD2'], syndrome: null,
    controls: 3, sensitivity: null, state: WANTED, scope: 'single', pmid: '35047860',
  },
  {
    genes: ['RNU4-2'], syndrome: 'ReNU syndrome',
    controls: null, sensitivity: 100, internalOnly: true, state: RESEARCH,
    scope: 'single', pmid: '40379786',
    perimeter: {
      fr: 'signal plus fort et phénotype plus sévère pour les variations de la T-loop ; '
        + 'performances et phénotype plus modérés en dehors',
      en: 'stronger signal and more severe phenotype for T-loop variants; milder '
        + 'performance and phenotype outside',
    },
  },
  {
    genes: ['RNU5A-1', 'RNU5B-1'], aliases: ['RNU5-A1', 'RNU5-B1'], syndrome: null,
    controls: null, sensitivity: null, state: WANTED, scope: 'shared',
  },
];

/** Symbole comparable : majuscules, espaces et caractères invisibles ôtés. */
function norm(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

/**
 * Position c. d'une nomenclature, quand elle est **codante et sans décalage**.
 *
 * Seule une position de ce type permet de dire dans quelle région du transcrit tombe
 * la variation. `c.2157del` donne 2157 ; `c.2000-5A>G` (intronique), `c.-25C>T` et
 * `c.*12G>A` (UTR) donnent `null` — leur numéro ne se compare pas aux bornes d'une
 * région codante.
 */
export function codingPosition(hgvsc) {
  const m = /c\.(-|\*)?(\d+)([+-]\d+)?/.exec(String(hgvsc || ''));
  if (!m || m[1] || m[3]) return null;
  return Number(m[2]);
}

/** La ligne couvre-t-elle cette position ? `null` = indécidable (position inconnue). */
function covers(entry, hgvsc) {
  if (!entry.cds) return true;
  const pos = codingPosition(hgvsc);
  if (pos === null) return null;
  const inside = pos >= entry.cds[0] && pos <= entry.cds[1];
  return entry.outside ? !inside : inside;
}

/**
 * Les épisignatures Epi2Diag du gène, région prise en compte.
 *
 * Un gène porte en général une seule ligne. Quand il en porte plusieurs (ADNP), la
 * position c. les départage ; si elle n'est pas déterminable, toutes sont renvoyées —
 * mieux vaut deux lignes à lire qu'un périmètre affirmé à tort.
 *
 * @param {string} gene   symbole du gène (VEP / HGNC)
 * @param {string} [hgvsc] nomenclature c., pour les signatures limitées à une région
 * @returns {Array<object>} lignes de EPISIGNATURES, dans l'ordre de la liste
 */
export function findEpisignatures(gene, hgvsc = null) {
  const sym = norm(gene);
  if (!sym) return [];
  const hits = EPISIGNATURES.filter((e) => e.genes.some((g) => norm(g) === sym)
    || (e.aliases || []).some((a) => norm(a) === sym));
  if (hits.length < 2) return hits;
  const decided = hits.filter((e) => covers(e, hgvsc) === true);
  return decided.length ? decided : hits;
}

/** Vrai dès que le gène figure dans la liste, quelle que soit la région. */
export function hasEpisignature(gene) {
  return findEpisignatures(gene).length > 0;
}

/** Texte d'une valeur qui peut être une chaîne ou une paire { fr, en }. */
export function localized(value, lang) {
  if (!value) return null;
  return typeof value === 'string' ? value : (value[lang] || value.fr || null);
}

/** Libellé du niveau d'exploitabilité, et classe CSS qui en porte la couleur. */
export const STATE_LABEL = {
  [RESEARCH]: { label: 'epiResearch', cls: 'ready' },
  [CONTROLS]: { label: 'epiControls', cls: 'partial' },
  [WANTED]: { label: 'epiWanted', cls: 'wanted' },
};

/**
 * Les phrases d'une ligne Epi2Diag, prêtes à poser dans l'interface.
 *
 * L'étiquette seule ne suffirait pas : une signature validée sur 32 témoins positifs
 * et une signature qui attend encore les siens n'autorisent pas la même conclusion.
 * `state` dit ce qu'on peut faire de la signature, `facts` sur quoi cela repose, et
 * `perimeter` où cela cesse d'être vrai. La date de la liste est toujours dans
 * `facts` : ces chiffres bougent à chaque témoin analysé.
 *
 * @returns {{state: string, cls: string, facts: string, perimeter: ?string}}
 */
export function describeEpisignature(entry, lang) {
  const syndrome = localized(entry.syndrome, lang);
  const level = t(lang, STATE_LABEL[entry.state].label);

  const bits = [];
  if (isNum(entry.controls)) {
    const key = entry.controls === 1 ? 'epiOneControl' : 'epiControlsCount';
    bits.push(t(lang, key, { n: entry.controls })
      + (entry.controlsNote ? ` (${localized(entry.controlsNote, lang)})` : ''));
  }
  if (isNum(entry.sensitivity)) {
    bits.push(t(lang, 'epiSensitivity', { s: decimal(entry.sensitivity, lang) })
      + (entry.internalOnly ? ` (${t(lang, 'epiInternal')})` : ''));
  }
  if (entry.scope === 'shared') bits.push(t(lang, 'epiShared'));
  bits.push(t(lang, 'epiAsOf', { d: localized(SNAPSHOT, lang) }));

  const perimeter = localized(entry.perimeter, lang);
  return {
    state: syndrome ? `${syndrome} — ${level}` : level,
    cls: STATE_LABEL[entry.state].cls,
    facts: bits.join(' · '),
    perimeter: perimeter ? t(lang, 'epiPerimeter', { p: perimeter }) : null,
  };
}
