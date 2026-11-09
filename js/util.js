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

/** fetch avec timeout, réessais et délai croissant — Ensembl renvoie des 503 sous charge. */
export async function fetchJSON(url, opts = {}) {
  const { retries = 3, timeout = 30000, expect = 'json', ...init } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Palier croissant, plafonné : Ensembl renvoie par salves des pages d'erreur 503
    // (sans en-tête CORS, donc vues du navigateur comme un simple échec réseau).
    if (attempt > 0) await sleep(Math.min(800 * 2 ** (attempt - 1), 8000));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      // 404 = variation absente du service : une réponse, pas une panne. On ne réessaie pas.
      if (res.status === 404) return { __notFound: true, __status: 404 };
      if (!res.ok) {
        const retryable = res.status >= 500 || res.status === 429;
        lastErr = new Error(`HTTP ${res.status} — ${url}`);
        if (!retryable || attempt === retries) throw lastErr;
        continue;
      }
      return expect === 'text' ? await res.text() : await res.json();
    } catch (e) {
      lastErr = e;
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

/** Exécute les tâches nommées en parallèle ; une source en panne ne fait pas tomber les autres. */
export async function settleAll(tasks) {
  const names = Object.keys(tasks);
  const results = await Promise.allSettled(names.map((n) => tasks[n]()));
  const out = {};
  const errors = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') out[names[i]] = r.value;
    else {
      out[names[i]] = null;
      errors[names[i]] = String(r.reason && r.reason.message ? r.reason.message : r.reason);
    }
  });
  return { out, errors };
}
