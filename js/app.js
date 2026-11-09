// Câblage de l'interface : saisie → chiffres → liens → commentaire, en FR ou EN.

import { normalize, parseInput } from './variant.js';
import { annotate, DEL, TOL } from './annotate.js';
import { buildComment } from './comment.js';
import { buildLinks, LINK_GROUPS } from './links.js';
import { UI, t, initialLang } from './i18n.js';
import { NA, decimal, isNum, round } from './util.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, fallback = '') {
    try { const v = localStorage.getItem(k); return v === null ? fallback : v; } catch (e) { return fallback; }
  },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* mode privé */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

let lang = initialLang();
let ctx = null;        // dernier résultat d'annotate()
let busy = false;

/* ---------- langue ---------- */

function applyLang() {
  document.documentElement.lang = lang;
  $('langLabel').textContent = lang.toUpperCase();
  $('langToggle').setAttribute('aria-label', lang === 'fr' ? 'Passer en anglais' : 'Switch to French');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(lang, el.dataset.i18n);
  });
  $('variantInput').placeholder = t(lang, 'inputPlaceholder');
  $('footNote').textContent = lang === 'fr'
    ? 'Aucune donnée patient n’est transmise : seules les coordonnées du variant sont envoyées aux services interrogés.'
    : 'No patient data leaves the page: only the variant coordinates are sent to the queried services.';
  if (ctx) render();
}

/* ---------- rendu ---------- */

function kv(dl, pairs) {
  dl.textContent = '';
  for (const [key, value, cls] of pairs) {
    if (value === null || value === undefined || value === '') continue;
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    if (value instanceof Node) dd.append(value);
    else dd.textContent = value;
    if (cls) dd.className = cls;
    dl.append(dt, dd);
  }
}

function table(el, headers, rows) {
  el.textContent = '';
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  headers.forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    htr.append(th);
  });
  thead.append(htr);
  const tbody = document.createElement('tbody');
  rows.forEach((cells) => {
    const tr = document.createElement('tr');
    cells.forEach((c) => {
      const td = document.createElement('td');
      if (c instanceof Node) td.append(c);
      else if (c && typeof c === 'object') { td.textContent = c.text; td.className = c.cls || ''; }
      else td.textContent = c === null || c === undefined ? NA : String(c);
      tr.append(td);
    });
    tbody.append(tr);
  });
  el.append(thead, tbody);
}

function verdictCell(verdict) {
  if (verdict === DEL) return { text: t(lang, 'del'), cls: 'del' };
  if (verdict === TOL) return { text: t(lang, 'tol'), cls: 'tol' };
  return { text: t(lang, 'na'), cls: 'na' };
}

function badge(text, kind) {
  const s = document.createElement('span');
  s.className = `badge ${kind}`;
  s.textContent = text;
  return s;
}

function renderIdentity() {
  const v = ctx.variant;
  const maneBox = document.createElement('span');
  maneBox.append(badge(v.isMane ? t(lang, 'maneYes') : t(lang, 'maneNo'), v.isMane ? 'yes' : 'no'));
  if (!v.isMane && v.maneTranscript) {
    const n = document.createElement('span');
    n.className = 'note';
    n.textContent = ` ${t(lang, 'maneIs', { tx: v.maneTranscript })}`;
    maneBox.append(n);
  }
  kv($('identity'), [
    [t(lang, 'gene'), v.gene],
    [t(lang, 'transcript'), v.transcript, 'mono'],
    [t(lang, 'mane'), maneBox],
    [t(lang, 'consequence'), (v.consequenceTerms || []).join(', ')],
    [t(lang, 'location'), v.loc ? `${t(lang, v.loc)} ${v.locNum} (${v.locField})` : null],
    [t(lang, 'hgvsc'), v.hgvsc, 'mono'],
    [t(lang, 'hgvsp'), v.hgvsp, 'mono'],
    [t(lang, 'hgvsg'), `hg38 ${v.genomicHgvs}`, 'mono'],
    [t(lang, 'pseudoVcf'), v.pseudoVcf, 'mono'],
    [t(lang, 'dbsnp'), ctx.rsid, 'mono'],
  ]);
}

function renderNumbers() {
  const iv = ctx.intervar;
  const cv = ctx.clinvar;
  const ivText = iv ? `${iv.label}${iv.class ? ` — ${lang === 'fr' ? 'classe' : 'class'} ${iv.class}` : ''}` : NA;
  const ivNode = document.createElement('span');
  ivNode.textContent = ivText;
  if (iv && iv.criteria.length) {
    const n = document.createElement('span');
    n.className = 'note';
    n.textContent = `  ${iv.criteria.join(' ')}`;
    ivNode.append(n);
  }

  const cvNode = document.createElement('span');
  if (cv.count) {
    cvNode.textContent = `${cv.significance || NA} — ${t(lang, 'clinvarCount', { n: cv.count })}`;
    const n = document.createElement('span');
    n.className = 'note mono';
    n.textContent = `  ${cv.accessions.join(', ')}`;
    cvNode.append(n);
  } else {
    cvNode.textContent = NA;
  }

  kv($('numbers'), [
    [t(lang, 'intervar'), ivNode],
    [t(lang, 'clinvar'), cvNode],
    [t(lang, 'domain'), ctx.domain || NA],
  ]);

  const rows = [];
  for (const version of ['v4.1', 'v2.1.1']) {
    const g = ctx.gnomad[version];
    rows.push([
      version,
      g ? g.ac : NA,
      g && g.het !== null ? g.het : NA,
      g && g.hom !== null ? g.hom : NA,
      g && isNum(g.af) ? `${decimal(round(Number(g.af) * 100, 4), lang)} %` : NA,
    ]);
  }
  table($('gnomadTable'),
    [t(lang, 'version'), t(lang, 'ac'), t(lang, 'het'), t(lang, 'hom'), t(lang, 'freq')], rows);
}

function renderPredictions() {
  const rows = ctx.predictions.map((p) => {
    const scoreNode = document.createElement('span');
    scoreNode.textContent = decimal(p.score, lang);
    if (p.discordant) {
      const n = document.createElement('span');
      n.className = 'note';
      n.textContent = `  ${t(lang, 'discordantNote', { v: p.discordant.join('/') })}`;
      scoreNode.append(n);
    }
    return [p.name, verdictCell(p.verdict), scoreNode];
  });
  table($('predTable'), [t(lang, 'tool'), t(lang, 'verdict'), t(lang, 'score')], rows);

  const c = ctx.conservation;
  table($('consTable'), [t(lang, 'tool'), t(lang, 'verdict'), t(lang, 'score')], [
    [t(lang, 'gerp'),
      c.gerp.conserved === null
        ? { text: t(lang, 'na'), cls: 'na' }
        : { text: t(lang, c.gerp.conserved ? 'conserved' : 'notConserved'), cls: c.gerp.conserved ? 'tol' : 'del' },
      decimal(c.gerp.score, lang)],
    [t(lang, 'phylop'), { text: `(${c.phylop.range})`, cls: 'na' }, decimal(c.phylop.score, lang)],
    [t(lang, 'phastcons'), { text: `(${c.phastcons.range})`, cls: 'na' }, decimal(c.phastcons.score, lang)],
  ]);
}

function renderPhenotypes() {
  const box = $('phenotypes');
  box.textContent = '';
  const list = ctx.phenotypes.phenotypes || [];
  if (!list.length) {
    box.textContent = NA;
    return;
  }
  const src = document.createElement('p');
  src.className = 'help';
  src.textContent = `${t(lang, 'source')} : ${ctx.phenotypes.source}`;
  const ul = document.createElement('ul');
  ul.className = 'phenos';
  list.forEach((p) => {
    const li = document.createElement('li');
    li.textContent = `${p.name}${p.mim ? ` (MIM #${p.mim})` : ''}${p.inheritance ? ` — ${p.inheritance}` : ''}`;
    ul.append(li);
  });
  box.append(src, ul);
}

function renderLinks() {
  const box = $('links');
  box.textContent = '';
  const links = buildLinks(ctx, { lang });
  const groups = LINK_GROUPS[lang];
  for (const [key, title] of Object.entries(groups)) {
    const items = links.filter((l) => l.group === key);
    if (!items.length) continue;
    const wrap = document.createElement('div');
    wrap.className = 'link-group';
    const h = document.createElement('h3');
    h.textContent = title;
    const list = document.createElement('div');
    list.className = 'link-list';
    items.forEach((l) => {
      const el = document.createElement(l.url ? 'a' : 'span');
      if (l.url) {
        el.href = l.url;
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
      }
      el.textContent = l.label;
      const note = l.url ? l.note : t(lang, 'noLinkData');
      if (note) {
        const n = document.createElement('span');
        n.className = 'note';
        n.textContent = note;
        el.append(n);
      }
      list.append(el);
    });
    wrap.append(h, list);
    box.append(wrap);
  }
}

function currentClass() {
  const el = document.querySelector('input[name=vclass]:checked');
  return el ? Number(el.value) : 3;
}

function renderComment() {
  $('comment').value = buildComment(ctx, {
    lang,
    variantClass: currentClass(),
    gnomadVersion: $('gnomadVersion').value,
  });
}

function render() {
  renderIdentity();
  renderNumbers();
  renderPredictions();
  renderPhenotypes();
  renderLinks();
  renderComment();
  $('results').hidden = false;
}

/* ---------- messages ---------- */

function message(text, kind = 'info') {
  const el = $('message');
  if (!text) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = text;
  el.className = `message${kind === 'error' ? ' error' : ''}`;
}

function setBusy(on) {
  busy = on;
  $('submitBtn').disabled = on;
  $('submitBtn').textContent = t(lang, on ? 'analysing' : 'analyse');
}

/* ---------- analyse ---------- */

async function run() {
  if (busy) return;
  const query = $('variantInput').value.trim();
  const parsed = parseInput(query);
  if (parsed.kind === 'empty') { message(t(lang, 'errEmpty'), 'error'); return; }
  if (parsed.kind === 'unknown') { message(t(lang, 'errUnknown'), 'error'); return; }

  setBusy(true);
  message('');
  try {
    const variant = await normalize(parsed);
    ctx = await annotate(variant, {
      omimKey: store.get('vt.omimKey') || null,
      mobiKey: store.get('vt.mobiKey') || null,
    });
    render();

    const notes = [];
    if (ctx.notFoundInMyVariant) notes.push(t(lang, 'notFound'));
    const failed = Object.keys(ctx.errors);
    if (failed.length) notes.push(`${t(lang, 'errSources')} : ${failed.join(', ')}`);
    message(notes.join(' · '));
    store.set('vt.lastQuery', query);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (msg === 'EMPTY_INPUT') message(t(lang, 'errEmpty'), 'error');
    else if (/Failed to fetch|NetworkError|load failed/i.test(msg)) message(t(lang, 'errNetwork'), 'error');
    else if (msg === 'UNRECOGNISED_INPUT') message(t(lang, 'errUnknown'), 'error');
    else if (msg.startsWith('VEP')) message(t(lang, 'errVep', { msg }), 'error');
    else message(t(lang, 'errGeneric', { msg }), 'error');
    $('results').hidden = true;
    ctx = null;
  } finally {
    setBusy(false);
  }
}

/* ---------- événements ---------- */

$('queryForm').addEventListener('submit', (e) => { e.preventDefault(); run(); });

$('langToggle').addEventListener('click', () => {
  lang = lang === 'fr' ? 'en' : 'fr';
  store.set('vt.lang', lang);
  applyLang();
});

$('settingsToggle').addEventListener('click', () => {
  const p = $('settings');
  p.hidden = !p.hidden;
  if (!p.hidden) $('omimKey').focus();
});

$('saveKeys').addEventListener('click', () => {
  store.set('vt.omimKey', $('omimKey').value.trim());
  store.set('vt.mobiKey', $('mobiKey').value.trim());
  store.set('vt.gnomadVersion', $('gnomadVersion').value);
  $('keysStatus').textContent = t(lang, 'saved');
  setTimeout(() => { $('keysStatus').textContent = ''; }, 2000);
});

$('clearKeys').addEventListener('click', () => {
  ['vt.omimKey', 'vt.mobiKey'].forEach(store.del);
  $('omimKey').value = '';
  $('mobiKey').value = '';
  $('keysStatus').textContent = t(lang, 'saved');
  setTimeout(() => { $('keysStatus').textContent = ''; }, 2000);
});

$('gnomadVersion').addEventListener('change', () => {
  store.set('vt.gnomadVersion', $('gnomadVersion').value);
  if (ctx) renderComment();
});

$('classGroup').addEventListener('change', () => { if (ctx) renderComment(); });
$('regenBtn').addEventListener('click', () => { if (ctx) renderComment(); });

$('copyBtn').addEventListener('click', async () => {
  const text = $('comment').value;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    $('comment').select();
    document.execCommand('copy');
  }
  $('copyBtn').textContent = t(lang, 'copied');
  setTimeout(() => { $('copyBtn').textContent = t(lang, 'copy'); }, 1500);
});

/* ---------- démarrage ---------- */

$('omimKey').value = store.get('vt.omimKey');
$('mobiKey').value = store.get('vt.mobiKey');
$('gnomadVersion').value = store.get('vt.gnomadVersion', 'v4.1');
$('variantInput').value = store.get('vt.lastQuery');
applyLang();

// Partage d'un variant par l'URL : ?v=chr17-7675088-C-T&class=5&lang=fr
const params = new URLSearchParams(location.search);
if (params.get('lang') === 'fr' || params.get('lang') === 'en') {
  lang = params.get('lang');
  applyLang();
}
if (params.get('class')) {
  const el = document.querySelector(`input[name=vclass][value="${params.get('class')}"]`);
  if (el) el.checked = true;
}
if (params.get('v')) {
  $('variantInput').value = params.get('v');
  run();
}
