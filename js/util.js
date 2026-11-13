// Utilitaires partagés : réseau (avec réessais), nombres, accès JSON tolérant.
// Aucun accès au DOM ici : ce module tourne aussi sous Node (voir tools/validate.mjs).

export const NA = 'n.a.';

/** Premier élément non nul d'un scalaire ou d'un tableau (les champs dbNSFP sont souvent des tableaux). */
export function first(v) {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return v;
  for (const x of v) {
    if (x !== null && x !== undefined && x !== '.' && x !== '') return x;
  }
  return null;
}

/** Toutes les valeurs distinctes d'un champ scalaire ou tableau (pour signaler les discordances). */
export function distinct(v) {
  const arr = (Array.isArray(v) ? v : [v])
    .filter((x) => x !== null && x !== undefined && x !== '.' && x !== '');
  return [...new Set(arr.map(String))];
}

/** Accès par chemin pointé, sans lever d'exception : get(o, 'dbnsfp.cadd.phred'). */
export function get(obj, path) {
  let cur = obj;
  for (const k of path.split('.')) {
    if (cur === null || cur === undefined) return null;
    cur = Array.isArray(cur) ? cur.map((x) => (x ? x[k] : null)).find((x) => x != null) : cur[k];
  }
  return cur === undefined ? null : cur;
}

/** Arrondi à n décimales, rendu en chaîne, ou 'n.a.' si la valeur n'est pas un nombre. */
export function round(v, n = 2) {
  const x = typeof v === 'string' ? Number(v) : v;
  if (x === null || x === undefined || Number.isNaN(Number(x))) return NA;
  return String(Number(Number(x).toFixed(n)));
}

/** Séparateur décimal selon la langue : 0,42 en français, 0.42 en anglais. */
export function decimal(s, lang) {
  if (s === NA || s === null || s === undefined) return NA;
  return lang === 'fr' ? String(s).replace('.', ',') : String(s);
}

export function isNum(v) {
  return v !== null && v !== undefined && v !== NA && v !== '' && !Number.isNaN(Number(v));
}

/** Hôte d'une URL, pour nommer le service fautif dans un message d'erreur. */
export function serviceOf(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch (e) { return String(url); }
}

/** Message lisible d'une erreur, quelle que soit sa forme (Error, DOMException, chaîne). */
export function errorText(e) {
  if (!e) return 'erreur inconnue';
  return String(e.message || e);
}

/**
 * Erreur de délai dépassé, **nommée**.
 *
 * `AbortController.abort()` appelé sans motif fait rejeter `fetch` avec une
 * DOMException dont le message — « signal is aborted without reason » — ne dit ni
 * quel service, ni qu'il s'agit d'un délai. Remontée telle quelle jusqu'à
 * l'interface, elle s'affichait en « Échec de l'analyse : signal is aborted without
 * reason », message illisible pour l'utilisateur et inutilisable pour le diagnostic.
 */
function timeoutError(url, ms) {
  const err = new Error(`Délai dépassé (${Math.round(ms / 1000)} s) — ${serviceOf(url)}`);
  err.code = 'TIMEOUT';
  err.service = serviceOf(url);
  return err;
}

/** fetch avec timeout, réessais et délai croissant — Ensembl renvoie des 503 sous charge. */
export async function fetchJSON(url, opts = {}) {
  const { retries = 3, timeout = 30000, expect = 'json', ...init } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Palier croissant, plafonné : Ensembl renvoie par salves des pages d'erreur 503
    // (sans en-tête CORS, donc vues du navigateur comme un simple échec réseau).
    if (attempt > 0) await sleep(Math.min(800 * 2 ** (attempt - 1), 8000));
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeout);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      // 404 = variation absente du service : une réponse, pas une panne. On ne réessaie pas.
      if (res.status === 404) return { __notFound: true, __status: 404 };
      if (!res.ok) {
        const retryable = res.status >= 500 || res.status === 429;
        lastErr = new Error(`HTTP ${res.status} — ${serviceOf(url)}`);
        lastErr.code = `HTTP_${res.status}`;
        lastErr.status = res.status;
        lastErr.service = serviceOf(url);
        if (!retryable || attempt === retries) throw lastErr;
        continue;
      }
      return expect === 'text' ? await res.text() : await res.json();
    } catch (e) {
      // Notre propre délai, et non une annulation venue d'ailleurs : on le nomme.
      lastErr = timedOut ? timeoutError(url, timeout) : e;
      if (attempt === retries) throw lastErr;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Exécute les tâches nommées en parallèle ; une source en panne ne fait pas tomber les autres.
 *
 * `onSettled(out, errors, pending)` est appelé à **chaque** source qui aboutit ou
 * échoue, avec l'état partiel : c'est ce qui permet l'affichage progressif. `pending`
 * dit ce qui est encore en vol, pour que l'interface distingue « pas encore arrivé »
 * d'un « n.a. » qui, lui, affirme une absence de donnée.
 */
export async function settleAll(tasks, onSettled = null) {
  const names = Object.keys(tasks);
  const out = {};
  const errors = {};
  const pending = new Set(names);
  // Clés créées d'emblée : l'ordre de `out` reste celui de la déclaration, pas celui
  // — variable — des réponses.
  names.forEach((n) => { out[n] = null; });

  await Promise.all(names.map(async (name) => {
    try {
      out[name] = await tasks[name]();
    } catch (e) {
      out[name] = null;
      errors[name] = String(e && e.message ? e.message : e);
    }
    pending.delete(name);
    if (onSettled) {
      try { onSettled(out, errors, pending); } catch (e) { /* le rendu partiel ne doit rien casser */ }
    }
  }));

  return { out, errors };
}

/**
 * Lance `primary`, puis `secondary` si `primary` n'a pas répondu au bout de `delay`
 * (ou s'il a échoué avant). Renvoie la **première** réponse obtenue.
 *
 * Ensembl ne tombe pas franchement : il laisse pendre la connexion. Attendre
 * l'expiration d'un délai puis réessayer coûtait jusqu'à 100 s avant d'obtenir une
 * réponse, alors que le service de repli, lui, répondait en moins d'une seconde.
 *
 * @param {() => Promise} primary      source préférée
 * @param {() => Promise} secondary    source de repli
 * @param {object} opts  { delay, onSecondary } — onSecondary est appelé quand le
 *                       repli démarre, pour prévenir l'interface.
 */
export function hedge(primary, secondary, { delay = 2500, onSecondary = null } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let primaryErr = null;
    let secondaryErr = null;
    let primaryDone = false;
    let secondaryDone = false;
    let secondaryStarted = false;
    let timer = null;

    const win = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    /**
     * Les deux sources ont échoué : l'erreur rendue porte les **deux** causes.
     *
     * `reject(primaryErr)` seul effaçait l'information utile. Quand Ensembl laisse
     * pendre la connexion et que VariantValidator répond 503, la cause rendue était
     * le délai d'Ensembl, et le 503 — le vrai motif pour lequel l'analyse n'a pas
     * pu se replier — n'apparaissait nulle part.
     */
    const maybeFail = () => {
      if (settled || !primaryDone || !secondaryDone) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const causes = [primaryErr, secondaryErr].filter(Boolean);
      // `hedge` sert aussi à doubler une même requête (MyVariant) : deux causes
      // identiques ne sont pas deux pannes.
      const seen = [...new Set(causes.map(errorText))];
      const err = new Error(seen.join(' · ') || 'les deux sources ont échoué');
      err.code = 'ALL_FAILED';
      err.causes = causes;
      reject(err);
    };

    const startSecondary = () => {
      if (secondaryStarted || settled) return;
      secondaryStarted = true;
      if (onSecondary) {
        try { onSecondary(); } catch (e) { /* le rapport d'avancement ne doit rien casser */ }
      }
      Promise.resolve()
        .then(secondary)
        .then(win, (e) => { secondaryErr = e; secondaryDone = true; maybeFail(); });
    };

    Promise.resolve()
      .then(primary)
      .then(win, (e) => {
        primaryErr = e;
        primaryDone = true;
        startSecondary(); // échec avant le délai : ne pas attendre
        maybeFail();
      });

    timer = setTimeout(startSecondary, delay);
  });
}

/**
 * Conséquence protéique écrite comme une **prédiction** : `p.(Arg175His)`.
 *
 * Les parenthèses de la nomenclature HGVS disent « déduit, non observé ». Toute
 * conséquence protéique rendue ici est déduite de la variation nucléotidique — ni VEP
 * ni VariantValidator ne lisent la protéine — donc elles s'imposent partout. VEP les
 * omet, VariantValidator les écrit : la forme est fixée ici, une seule fois, pour que
 * l'encart d'identité, la nomenclature complète et le commentaire ne divergent pas.
 *
 * `p.?` — effet protéique indéterminé — reste nu : il n'y a rien de prédit à mettre
 * entre parenthèses.
 */
export function predictedProtein(hgvsp) {
  if (!hgvsp) return hgvsp;
  const s = String(hgvsp);
  const i = s.indexOf(':');
  const prefix = i >= 0 ? s.slice(0, i + 1) : '';
  const m = (i >= 0 ? s.slice(i + 1) : s).trim().match(/^p\.\s*(.+)$/);
  if (!m) return hgvsp;
  const change = m[1].trim();
  if (change === '?' || (change.startsWith('(') && change.endsWith(')'))) return `${prefix}p.${change}`;
  return `${prefix}p.(${change})`;
}
