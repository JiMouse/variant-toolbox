// Câblage de l'interface : saisie → chiffres → liens → commentaire, en FR ou EN.

import { normalize, parseInput } from './variant.js';
import { annotate, DEL, TOL } from './annotate.js';
import { buildComment } from './comment.js';
import { buildLinks, LINK_GROUPS } from './links.js';
import { geneSchema, zoomSchema } from './schema.js';
import { intronBounds } from './structure.js';
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

/* ---------- attente par source ----------
 *
 * Une donnée qui n'est pas encore arrivée ne doit **jamais** s'afficher « n.a. » : en
 * clinique, « n.a. » affirme que la base a répondu et ne connaît pas ce variant.
 * `pending` (voir annotate) dit ce qui est encore en vol, et chaque champ est rattaché
 * à la source qui le fournit.
 */

/** Source MyVariant pour toutes les prédictions sauf SpliceAI, qui a son propre service. */
const PRED_SOURCE = { SpliceAI: 'splice' };

function isPending(...sources) {
  const p = ctx && ctx.pending;
  return Boolean(p && p.length) && sources.some((src) => p.includes(src));
}

/** Texte d'attente, à la place d'un « n.a. » qui serait faux. */
function waitText() {
  return t(lang, 'pending');
}

/** Cellule de tableau en attente. */
function waitCell() {
  return { text: t(lang, 'pending'), cls: 'na pending' };
}

/** Valeur, ou attente si la source n'a pas répondu, ou n.a. si elle a répondu sans rien. */
function orWait(value, ...sources) {
  if (value !== null && value !== undefined && value !== '') return value;
  return isPending(...sources) ? waitText() : NA;
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
    // « exon 5 (5/11) » ; tant que le total manque (repli VariantValidator), « exon 5 … ».
    [t(lang, 'location'), v.loc
      ? `${t(lang, v.loc)} ${v.locNum}`
        + (v.locField && v.locField !== v.locNum ? ` (${v.locField})`
          : (isPending('struct') ? ` (${waitText()})` : ''))
      : null],
    [t(lang, 'hgvsc'), v.hgvsc, 'mono'],
    [t(lang, 'hgvsp'), v.hgvsp, 'mono'],
    [t(lang, 'hgvsg'), `hg38 ${v.genomicHgvs}`, 'mono'],
    [t(lang, 'pseudoVcf'), v.pseudoVcf, 'mono'],
    [t(lang, 'dbsnp'), ctx.rsid, 'mono'],
    [t(lang, 'normSource'), ctx.source && ctx.source !== 'VEP' ? ctx.source : null],
  ]);
}

function renderNumbers() {
  const iv = ctx.intervar;
  const cv = ctx.clinvar;
  const ivText = iv
    ? `${iv.label}${iv.class ? ` — ${lang === 'fr' ? 'classe' : 'class'} ${iv.class}` : ''}`
    : (isPending('iv') ? waitText() : NA);
  const ivNode = document.createElement('span');
  ivNode.textContent = ivText;
  if (!iv && isPending('iv')) ivNode.className = 'na pending';
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
    cvNode.textContent = isPending('mv') ? waitText() : NA;
    cvNode.className = isPending('mv') ? 'na pending' : 'na';
  }

  kv($('numbers'), [
    [t(lang, 'intervar'), ivNode],
    [t(lang, 'clinvar'), cvNode],
    [t(lang, 'domain'), orWait(ctx.domain, 'mv'),
      !ctx.domain && isPending('mv') ? 'na pending' : null],
  ]);

  const rows = [];
  for (const version of ['v4.1', 'v2.1.1']) {
    const g = ctx.gnomad[version];
    // v4.1 vient de l'API gnomAD, v2.1.1 de MyVariant : deux attentes distinctes.
    const src = version === 'v4.1' ? 'g4' : 'mv';
    const cell = (value) => (value === null || value === undefined
      ? (isPending(src) ? waitCell() : NA)
      : value);
    rows.push([
      version,
      cell(g ? g.ac : null),
      cell(g ? g.het : null),
      cell(g ? g.hom : null),
      cell(g && isNum(g.af) ? `${decimal(round(Number(g.af) * 100, 4), lang)} %` : null),
    ]);
  }
  table($('gnomadTable'),
    [t(lang, 'version'), t(lang, 'ac'), t(lang, 'het'), t(lang, 'hom'), t(lang, 'freq')], rows);
}

function renderPredictions() {
  const rows = ctx.predictions.map((p) => {
    const waiting = isPending(PRED_SOURCE[p.name] || 'mv');
    const scoreNode = document.createElement('span');
    scoreNode.textContent = waiting ? waitText() : decimal(p.score, lang);
    if (waiting) scoreNode.className = 'na pending';
    if (!waiting && p.discordant) {
      const n = document.createElement('span');
      n.className = 'note';
      n.textContent = `  ${t(lang, 'discordantNote', { v: p.discordant.join('/') })}`;
      scoreNode.append(n);
    }
    return [p.name, waiting ? waitCell() : verdictCell(p.verdict), scoreNode];
  });
  table($('predTable'), [t(lang, 'tool'), t(lang, 'verdict'), t(lang, 'score')], rows);

  const c = ctx.conservation;
  const consWaiting = isPending('mv'); // les trois scores viennent de dbNSFP
  const consScore = (v) => (consWaiting ? waitCell() : decimal(v, lang));
  table($('consTable'), [t(lang, 'tool'), t(lang, 'verdict'), t(lang, 'score')], [
    [t(lang, 'gerp'),
      consWaiting
        ? waitCell()
        : (c.gerp.conserved === null
          ? { text: t(lang, 'na'), cls: 'na' }
          : { text: t(lang, c.gerp.conserved ? 'conserved' : 'notConserved'), cls: c.gerp.conserved ? 'tol' : 'del' }),
      consScore(c.gerp.score)],
    [t(lang, 'phylop'), { text: `(${c.phylop.range})`, cls: 'na' }, consScore(c.phylop.score)],
    [t(lang, 'phastcons'), { text: `(${c.phastcons.range})`, cls: 'na' }, consScore(c.phastcons.score)],
  ]);
}

function renderPhenotypes() {
  const box = $('phenotypes');
  box.textContent = '';
  const list = ctx.phenotypes.phenotypes || [];
  if (!list.length) {
    if (isPending('phenotypes', 'gene')) {
      const p = document.createElement('p');
      p.className = 'help pending';
      p.textContent = t(lang, 'phenotypesPending');
      box.append(p);
      return;
    }
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

/* ---------- structure exonique ---------- */

/**
 * Où tombe la variation dans la structure du gène, et à combien de paires de bases
 * de la jonction la plus proche.
 *
 * La conséquence rendue par VEP ne répond pas à cette question : « faux-sens » ne dit
 * pas si le nucléotide touché est le dernier de son exon, et « exon 5/11 » ne dit pas
 * où dans l'exon. Les chiffres sont donc écrits avant les schémas — ce sont eux la
 * réponse, le dessin ne fait que la rendre lisible d'un coup d'œil.
 */
function renderStructure() {
  const box = $('structure');
  box.textContent = '';
  const s = ctx.structure;

  // Rien à dessiner : soit la source est encore en vol, soit UCSC ne connaît pas ce
  // transcrit. Le panneau le dit plutôt que de disparaître — un panneau absent
  // laisserait croire que la question de la bordure ne se pose pas.
  if (!s || !s.structure || !s.location) {
    const waiting = isPending('struct');
    const p = document.createElement('p');
    p.className = waiting ? 'help pending' : 'help';
    p.textContent = t(lang, waiting ? 'structPending' : 'structNone');
    box.append(p);
    return;
  }

  const st = s.structure;
  const loc = s.location;
  const site = (k) => t(lang, k === 'donor' ? 'siteDonor' : 'siteAcceptor');
  const bp = (n) => t(lang, 'bpShort', { n: decimal(String(n), lang) });

  // Les avertissements d'abord : ils disent de quoi parle le schéma.
  for (const [cond, key, vars] of [
    [s.mismatch, 'structMismatch', s.mismatch || {}],
    [s.versionMismatch, 'structVersion', { tx: s.versionMismatch }],
  ]) {
    if (!cond) continue;
    const p = document.createElement('p');
    p.className = 'help warn-note';
    p.textContent = t(lang, key, vars);
    box.append(p);
  }

  const rows = [];
  let edgeLabel = null;
  let edgeText = '';
  let edgeKind = '';

  if (loc.kind === 'exon') {
    rows.push([t(lang, 'structPos'), t(lang, 'structPosExon', {
      n: loc.exon, total: st.total, len: decimal(String(loc.exonLength), lang), i: loc.offsetInExon,
    })]);
    rows.push([t(lang, 'structAcceptor'),
      loc.dist5 === null ? t(lang, 'structFirstExon') : bp(loc.dist5),
      loc.dist5 !== null && loc.dist5 < 3 ? 'del' : null]);
    rows.push([t(lang, 'structDonor'),
      loc.dist3 === null ? t(lang, 'structLastExon') : bp(loc.dist3),
      loc.dist3 !== null && loc.dist3 < 3 ? 'del' : null]);
    edgeLabel = t(lang, 'structEdge');
    if (!loc.nearest) edgeText = t(lang, 'edgeExonOnly');
    else {
      const vars = { n: decimal(String(loc.nearest.dist), lang), site: site(loc.nearest.side) };
      // « à 0 pb du site donneur » se lit mal pour ce qui est le cas le plus net :
      // la variation est posée sur la base de bordure.
      const key = loc.edge !== 'edge' ? (loc.edge === 'near' ? 'edgeExonNear' : 'edgeExonInside')
        : (loc.nearest.dist === 0 ? 'edgeExonOn' : 'edgeExonEdge');
      edgeText = t(lang, key, vars);
      edgeKind = loc.edge === 'edge' ? 'alert' : (loc.edge === 'near' ? 'no' : '');
    }
  } else if (loc.kind === 'intron') {
    const b = intronBounds(st, loc.intron);
    rows.push([t(lang, 'structPos'), t(lang, 'structPosIntron', {
      n: loc.intron, total: st.total - 1,
      len: decimal(String(b ? b.end - b.start + 1 : 0), lang),
    })]);
    rows.push([t(lang, 'structDonor'), `+${decimal(String(loc.offsetDonor), lang)}`,
      loc.offsetDonor <= 2 ? 'del' : null]);
    rows.push([t(lang, 'structAcceptor'), `−${decimal(String(loc.offsetAcceptor), lang)}`,
      loc.offsetAcceptor <= 2 ? 'del' : null]);
    edgeLabel = t(lang, 'structSpliceSite');
    const vars = {
      n: decimal(String(loc.nearest.offset), lang),
      site: site(loc.nearest.side),
      sign: loc.nearest.side === 'donor' ? '+' : '−',
    };
    edgeText = t(lang, loc.edge === 'canonical' ? 'edgeIntronCanonical'
      : (loc.edge === 'splice' ? 'edgeIntronSplice' : 'edgeIntronDeep'), vars);
    edgeKind = loc.edge === 'canonical' ? 'alert' : (loc.edge === 'splice' ? 'no' : '');
  } else if (loc.kind === 'junction') {
    rows.push([t(lang, 'structPos'), t(lang, 'structPosJunction', {
      n: loc.exon, total: st.total,
    })]);
    edgeLabel = t(lang, 'structEdge');
    edgeText = t(lang, 'edgeJunctionOn');
    edgeKind = 'alert';
  } else {
    rows.push([t(lang, 'structPos'), t(lang, 'structOutside')]);
  }

  if (edgeLabel) {
    const node = document.createElement('span');
    node.append(badge(edgeText, edgeKind));
    rows.push([edgeLabel, node]);
  }

  const dl = document.createElement('dl');
  dl.className = 'kv';
  kv(dl, rows);
  box.append(dl);

  // Les deux schémas, chacun dans un conteneur qui défile : sur un écran étroit, un
  // SVG mis à l'échelle de la largeur rendrait ses étiquettes illisibles.
  const figure = (titleKey, node) => {
    const h = document.createElement('h3');
    h.textContent = t(lang, titleKey);
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap sch-wrap';
    wrap.append(node);
    box.append(h, wrap);
  };
  figure('schemaGene', geneSchema(st, loc, { lang }));
  if (loc.kind === 'exon' || loc.kind === 'intron' || loc.kind === 'junction') {
    figure('schemaZoom', zoomSchema(st, loc, { lang }));
  }

  for (const key of ['schemaScaleNote', 'structHelp']) {
    const p = document.createElement('p');
    p.className = 'help';
    p.textContent = t(lang, key);
    box.append(p);
  }
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
      // Un lien sans URL parce que sa source n'a pas encore répondu ne doit pas
      // annoncer « données manquantes » : uniprot, MIM et GeneID viennent de
      // genenames, le rsid de gnomAD ou MyVariant, l'identifiant de MobiDetails.
      const waiting = !l.url && isPending('gene', 'mobi', 'mv', 'g4');
      const note = l.url ? l.note : (waiting ? waitText() : t(lang, 'noLinkData'));
      if (note) {
        const n = document.createElement('span');
        n.className = waiting ? 'note pending' : 'note';
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

/** Nom lisible des sources, pour dire ce qui manque encore. */
const SOURCE_LABELS = {
  mv: 'MyVariant', g4: 'gnomAD', splice: 'SpliceAI', iv: 'InterVar',
  gene: 'genenames', phenotypes: 'Monarch', struct: 'UCSC', mobi: 'MobiDetails',
};

function pendingLabels(keys = ctx.pending) {
  return (keys || []).map((k) => SOURCE_LABELS[k] || k).join(', ');
}

/**
 * Le commentaire n'est **pas** rédigé tant qu'une source manque.
 *
 * C'est le seul bloc qui ne s'affiche pas progressivement, et c'est volontaire : une
 * version partielle écrirait « absente des bases de données de populations contrôle »
 * simplement parce que gnomAD n'a pas encore répondu. Le bouton Copier reste donc
 * désactivé jusqu'à ce que tout soit arrivé.
 */
function renderComment() {
  // `pendingComment` et non `pending` : la structure exonique n'est que dessinée, et
  // la faire attendre retarderait le commentaire sans changer un mot de son texte
  // (voir assemble, dans js/annotate.js).
  const waiting = Boolean(ctx.pendingComment && ctx.pendingComment.length);
  $('comment').value = waiting
    ? t(lang, 'commentPending', { src: pendingLabels(ctx.pendingComment) })
    : buildComment(ctx, {
      lang,
      variantClass: currentClass(),
      gnomadVersion: $('gnomadVersion').value,
    });
  $('comment').classList.toggle('awaiting', waiting);
  $('copyBtn').disabled = waiting;
  $('regenBtn').disabled = waiting;
}

function render() {
  renderIdentity();
  renderStructure();
  renderNumbers();
  renderPredictions();
  renderPhenotypes();
  renderLinks();
  renderComment();
  $('results').hidden = false;
}

/**
 * Efface l'écran de résultats.
 *
 * Appelé au début de **chaque** analyse. Sans cela, les panneaux du variant
 * précédent restaient affichés pendant toute la normalisation du suivant — une
 * seconde quand tout va bien, dix quand une source tarde — et rien ne disait
 * qu'ils ne décrivaient pas le variant que l'on venait de saisir. Le commentaire
 * du variant précédent restait même copiable. En diagnostic, cette confusion est
 * inacceptable : l'écran ne doit jamais montrer les chiffres d'un variant sous
 * l'identité d'un autre.
 */
function clearResults() {
  ctx = null;
  $('results').hidden = true;
  ['identity', 'structure', 'numbers', 'gnomadTable', 'predTable', 'consTable', 'phenotypes', 'links']
    .forEach((id) => { $(id).textContent = ''; });
  $('comment').value = '';
  $('comment').classList.remove('awaiting');
  $('copyBtn').disabled = true;
  $('regenBtn').disabled = true;
}

/* ---------- messages ---------- */

function message(text, kind = 'info') {
  const el = $('message');
  if (!text) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = text;
  el.className = `message${kind === 'error' ? ' error' : ''}${kind === 'progress' ? ' progress' : ''}`;
}

function setBusy(on) {
  busy = on;
  $('submitBtn').disabled = on;
  $('submitBtn').textContent = t(lang, on ? 'analysing' : 'analyse');
}

// Compteur d'avancement : une analyse peut durer quelques secondes, et plus encore
// quand une source tarde. Sans retour visible, la page paraît figée.
let progressTimer = null;
let progressStage = 'progressNormalising';
let progressStart = 0;
let progressDetail = '';

function progressText() {
  const secs = Math.round((Date.now() - progressStart) / 1000);
  return t(lang, progressStage, { s: secs }) + (progressDetail ? ` — ${progressDetail}` : '');
}

function startProgress() {
  progressStart = Date.now();
  progressStage = 'progressNormalising';
  progressDetail = '';
  const tick = () => message(progressText(), 'progress');
  tick();
  progressTimer = setInterval(tick, 1000);
}

function setProgressStage(stage) {
  progressStage = stage;
  if (progressTimer) message(progressText(), 'progress');
}

/** Détail de l'attente : les sources qui n'ont pas encore répondu. */
function setProgressDetail(text) {
  progressDetail = text || '';
  if (progressTimer) message(progressText(), 'progress');
}

function stopProgress() {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = null;
  progressDetail = '';
}

/** Garde-fou global : une analyse ne doit jamais rester suspendue indéfiniment. */
function withDeadline(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('DEADLINE')), ms)),
  ]);
}

/* ---------- analyse ---------- */

async function run() {
  if (busy) return;
  const query = $('variantInput').value.trim();
  // Toute nouvelle soumission efface l'écran — y compris quand la saisie est
  // refusée d'emblée : un message d'erreur posé au-dessus des résultats du variant
  // précédent laisse croire qu'ils décrivent celui que l'on vient de taper.
  clearResults();
  const parsed = parseInput(query);
  if (parsed.kind === 'empty') { message(t(lang, 'errEmpty'), 'error'); return; }
  if (parsed.kind === 'unknown') { message(t(lang, 'errUnknown'), 'error'); return; }

  setBusy(true);
  message('');
  startProgress();
  try {
    const variant = await withDeadline(
      normalize(parsed, {
        onProgress: (what) => setProgressStage(what === 'fallbackFailed'
          ? 'progressFallbackFailed'
          : 'progressFallback'),
      }),
      60000,
    );
    setProgressStage('progressAnnotating');

    // Affichage progressif : le premier `onPartial` est émis avant tout appel aux
    // bases, donc l'identité du variant — gène, transcrit, HGVS, exon — s'affiche dès
    // la normalisation (~40 ms avec VEP). Chaque source qui arrive complète le tableau.
    ctx = await withDeadline(annotate(variant, {
      omimKey: store.get('vt.omimKey') || null,
      mobiKey: store.get('vt.mobiKey') || null,
      onPartial: (partial) => {
        ctx = partial;
        render();
        if (partial.pending && partial.pending.length) {
          setProgressDetail(t(lang, 'waitingFor', { src: pendingLabels() }));
        }
      },
    }), 60000);
    stopProgress();
    render();

    const notes = [];
    if (ctx.source && ctx.source !== 'VEP') notes.push(t(lang, 'fallbackSource', { src: ctx.source }));
    if (ctx.degraded === 'CONSEQUENCE_UNKNOWN') notes.push(t(lang, 'degradedConsequence'));
    if (ctx.notFoundInMyVariant) notes.push(t(lang, 'notFound'));
    const failed = Object.keys(ctx.errors);
    if (failed.length) notes.push(`${t(lang, 'errSources')} : ${failed.join(', ')}`);
    message(notes.join(' · '));
    store.set('vt.lastQuery', query);
  } catch (e) {
    stopProgress();
    const msg = String(e && e.message ? e.message : e);
    const code = e && e.code;
    // Délai global dépassé mais des sources ont répondu : on garde ce qui est affiché
    // plutôt que de tout effacer — l'utilisateur voit au moins l'identité et les
    // chiffres arrivés, et le commentaire reste volontairement non rédigé.
    if (msg === 'DEADLINE' && ctx && ctx.variant) {
      message(t(lang, 'errTimeout'), 'error');
      setBusy(false);
      return;
    }
    // Les codes d'abord : le message d'une panne de normalisation agrège les causes
    // des deux services et contient donc parfois « Failed to fetch » ou « VEP: … »,
    // qui ne doivent pas détourner le diagnostic vers une branche moins précise.
    if (code === 'SOURCES_UNAVAILABLE') message(t(lang, 'errSourcesDown', { msg }), 'error');
    else if (code === 'VARIANT_REJECTED') message(t(lang, 'errRejected', { msg }), 'error');
    else if (msg === 'DEADLINE') message(t(lang, 'errTimeout'), 'error');
    else if (msg === 'EMPTY_INPUT') message(t(lang, 'errEmpty'), 'error');
    else if (msg === 'UNRECOGNISED_INPUT') message(t(lang, 'errUnknown'), 'error');
    else if (/Failed to fetch|NetworkError|load failed/i.test(msg)) message(t(lang, 'errNetwork'), 'error');
    else if (msg.startsWith('VEP')) message(t(lang, 'errVep', { msg }), 'error');
    else message(t(lang, 'errGeneric', { msg }), 'error');
    clearResults();
  } finally {
    stopProgress();
    setBusy(false);
  }
}

/* ---------- événements ---------- */

/**
 * Ouvre les connexions TLS vers les services au premier contact avec le champ de
 * saisie — donc pendant que le variant est tapé, et non pendant l'analyse.
 *
 * Un `preconnect` posé dans le `<head>` serait inutile : les navigateurs ferment une
 * connexion préouverte restée inutilisée au bout d'une dizaine de secondes, bien
 * avant qu'un variant soit saisi. Les origines ne sont retenues que si elles sont
 * interrogées à **chaque** analyse : ouvrir une connexion vers un repli qui ne sert
 * presque jamais coûterait plus qu'elle ne rapporte.
 */
const WARM_ORIGINS = [
  'https://rest.ensembl.org',
  'https://myvariant.info',
  'https://rest.genenames.org',
  'https://api.monarchinitiative.org',
  'https://gnomad.broadinstitute.org',
  'https://wintervar.wglab.org',
  'https://api.genome.ucsc.edu',
];
let warmed = false;

function warmUp() {
  if (warmed) return;
  warmed = true;
  for (const origin of WARM_ORIGINS) {
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = origin;
    l.crossOrigin = 'anonymous'; // les appels sont des requêtes CORS : même pool de connexions
    document.head.append(l);
  }
}

$('variantInput').addEventListener('focus', warmUp, { once: true });
$('variantInput').addEventListener('input', warmUp, { once: true });

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
// Aucun résultat à l'ouverture : Copier et Régénérer n'ont rien à opérer.
clearResults();
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
