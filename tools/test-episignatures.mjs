#!/usr/bin/env node
// Tests de la liste Epi2Diag, sans réseau : cohérence de la table (42 lignes recopiées
// à la main depuis la feuille de septembre 2026), appariement par symbole et par
// alias, départage des deux signatures d'ADNP par la position c., et rendu des
// phrases en FR et EN.
//
//   node tools/test-episignatures.mjs

import {
  EPISIGNATURES, RESEARCH, CONTROLS, WANTED, STATE_LABEL,
  findEpisignatures, hasEpisignature, codingPosition, describeEpisignature, localized,
} from '../js/episignatures.js';
import { UI } from '../js/i18n.js';

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  console.log(`✗ ${name}\n  attendu : ${e}\n  obtenu  : ${a}`);
}

/* — Cohérence de la table — */

check('42 lignes', EPISIGNATURES.length, 42);
check('états connus',
  EPISIGNATURES.filter((e) => !STATE_LABEL[e.state]).map((e) => e.genes.join('/')), []);
check('au moins un gène par ligne',
  EPISIGNATURES.filter((e) => !e.genes.length).map((e) => e.state), []);
// Un pourcentage hors [0, 100] serait une faute de recopie, pas une sensibilité.
check('sensibilités dans [0, 100]',
  EPISIGNATURES.filter((e) => e.sensitivity !== null
    && !(e.sensitivity >= 0 && e.sensitivity <= 100)).map((e) => e.genes[0]), []);
check('témoins positifs entiers',
  EPISIGNATURES.filter((e) => e.controls !== null
    && !Number.isInteger(e.controls)).map((e) => e.genes[0]), []);
// Les comptes par état sont ceux de la feuille : ils changent quand la liste change,
// et doivent alors être remis à jour ici sciemment.
const byState = { [RESEARCH]: 0, [CONTROLS]: 0, [WANTED]: 0 };
EPISIGNATURES.forEach((e) => { byState[e.state]++; });
check('répartition par état', byState, { [RESEARCH]: 14, [CONTROLS]: 22, [WANTED]: 6 });

// Un gène ne porte deux lignes que si elles se départagent par une région : sans
// `cds`, deux lignes pour le même gène s'afficheraient toujours ensemble.
const seen = new Map();
EPISIGNATURES.forEach((e) => e.genes.forEach((g) => {
  seen.set(g, (seen.get(g) || 0) + 1);
}));
check('gènes en double hors région',
  [...seen].filter(([g, n]) => n > 1
    && !EPISIGNATURES.filter((e) => e.genes.includes(g)).every((e) => e.cds)).map(([g]) => g), []);

/* — Textes disponibles dans les deux langues — */

for (const lang of ['fr', 'en']) {
  check(`libellés d'état présents (${lang})`,
    Object.values(STATE_LABEL).filter((s) => !UI[lang][s.label]).map((s) => s.label), []);
  check(`syndromes traduits (${lang})`,
    EPISIGNATURES.filter((e) => e.syndrome && !localized(e.syndrome, lang)).map((e) => e.genes[0]), []);
  check(`périmètres traduits (${lang})`,
    EPISIGNATURES.filter((e) => e.perimeter && !localized(e.perimeter, lang)).map((e) => e.genes[0]), []);
  // Aucune phrase ne doit sortir avec un {jeton} non remplacé.
  check(`aucun jeton résiduel (${lang})`,
    EPISIGNATURES.map((e) => describeEpisignature(e, lang))
      .filter((d) => /[{}]/.test(`${d.state} ${d.facts} ${d.perimeter || ''}`)).length, 0);
}

/* — Appariement par symbole — */

check('gène de la liste', findEpisignatures('ANKRD11').map((e) => e.state), [RESEARCH]);
check('casse indifférente', hasEpisignature('ankrd11'), true);
check('espaces ôtés', hasEpisignature(' RNU2-2 '), true);
check('gène absent', findEpisignatures('TP53'), []);
check('gène vide', findEpisignatures(''), []);
check('gène nul', findEpisignatures(null), []);

// La feuille écrit « KMT6A » en face du syndrome de Kabuki : c'est KDM6A. L'alias
// retrouve la ligne, et EZH2 — dont KMT6A est le synonyme officiel — n'est pas taggé.
check('alias KMT6A → KDM6A', findEpisignatures('KMT6A').map((e) => e.genes[0]), ['KDM6A']);
check('symbole approuvé KDM6A', findEpisignatures('KDM6A').map((e) => e.genes[0]), ['KDM6A']);
check('EZH2 non taggé', findEpisignatures('EZH2'), []);
check('alias RNU5-A1', findEpisignatures('RNU5-A1').map((e) => e.genes.join('/')), ['RNU5A-1/RNU5B-1']);
check('les deux gènes RNU5 taggés',
  [hasEpisignature('RNU5A-1'), hasEpisignature('RNU5B-1')], [true, true]);

/* — Position c. et départage des deux signatures d'ADNP — */

check('position codante', codingPosition('NM_015339.5:c.2157del'), 2157);
check('substitution', codingPosition('NM_015339.5:c.2000A>G'), 2000);
check('intronique rejetée', codingPosition('NM_015339.5:c.2000-5A>G'), null);
check('intronique + rejetée', codingPosition('NM_015339.5:c.2000+1G>A'), null);
check("5'UTR rejeté", codingPosition('NM_015339.5:c.-25C>T'), null);
check("3'UTR rejeté", codingPosition('NM_015339.5:c.*12G>A'), null);
check('nomenclature n. ignorée', codingPosition('NR_002756.2:n.4G>A'), null);
check('sans nomenclature', codingPosition(null), null);

const adnp = (hgvsc) => findEpisignatures('ADNP', hgvsc).map((e) => e.state);
check('ADNP dans la région centrale', adnp('NM_015339.5:c.2157del'), [CONTROLS]);
check('ADNP borne basse', adnp('NM_015339.5:c.2000A>G'), [CONTROLS]);
check('ADNP borne haute', adnp('NM_015339.5:c.2340A>G'), [CONTROLS]);
check('ADNP juste en dessous', adnp('NM_015339.5:c.1999A>G'), [WANTED]);
check('ADNP juste au-dessus', adnp('NM_015339.5:c.2341A>G'), [WANTED]);
check('ADNP en 5′', adnp('NM_015339.5:c.100A>G'), [WANTED]);
// Position indéterminable : les deux lignes restent affichées plutôt qu'un périmètre
// affirmé à tort.
check('ADNP intronique : les deux lignes', adnp('NM_015339.5:c.2000-5A>G'), [CONTROLS, WANTED]);
check('ADNP sans nomenclature : les deux lignes', adnp(null), [CONTROLS, WANTED]);

/* — Phrases rendues — */

const kbg = describeEpisignature(findEpisignatures('ANKRD11')[0], 'fr');
check('KBG : état', kbg.state, 'KBG syndrome — analyse de VSI possible au titre de la recherche');
check('KBG : faits', kbg.facts, '23 témoins positifs · sensibilité 91 % · liste Epi2Diag, sept. 2026');
check('KBG : pas de périmètre', kbg.perimeter, null);
check('KBG : couleur', kbg.cls, 'ready');

const smc1a = describeEpisignature(findEpisignatures('SMC1A')[0], 'en');
check('SMC1A : signature partagée signalée', /shared by a few genes/.test(smc1a.facts), true);
check('SMC1A : périmètre', smc1a.perimeter, 'Perimeter: missense variants only');

// Sans syndrome dans la feuille, la phrase commence par l'état — pas par un tiret.
const setd2 = describeEpisignature(findEpisignatures('SETD2')[0], 'fr');
check('SETD2 : sans syndrome', setd2.state, 'témoins positifs nécessaires');
check('SETD2 : sensibilité absente', /sensibilité/.test(setd2.facts), false);

// 37,5 % en FR, 37.5% en EN.
const smc3 = findEpisignatures('SMC3')[0];
check('décimale FR', /37,5/.test(describeEpisignature(smc3, 'fr').facts), true);
check('décimale EN', /37\.5/.test(describeEpisignature(smc3, 'en').facts), true);

// Validation interne et effectif en hommes seulement : deux précisions qui changent la
// lecture du chiffre qu'elles suivent.
check('validation interne signalée',
  /\(validation interne\)/.test(describeEpisignature(findEpisignatures('RNU4-2')[0], 'fr').facts), true);
check('effectif précisé',
  /\(hommes\)/.test(describeEpisignature(findEpisignatures('KDM5C')[0], 'fr').facts), true);

console.log(`\n${pass} vérifications passées, ${fail} en échec`);
process.exit(fail ? 1 : 0);
