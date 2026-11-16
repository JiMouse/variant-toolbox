// Deux schémas SVG : le gène entier, puis le zoom sur la jonction.
//
// Le premier situe la variation parmi les exons, le second répond à la question posée —
// est-elle en bordure ? — à l'échelle de la paire de bases, avec la distance écrite.
// Les deux sont dessinés **dans le sens du transcrit** : la gauche est toujours le 5',
// y compris sur un gène du brin −, où les coordonnées génomiques décroissent. Lire un
// schéma à l'envers de la nomenclature serait pire que ne rien dessiner.
//
// Aucune couleur en dur : tout passe par les classes de css/app.css, qui portent les
// variables de thème (clair et sombre).

import { t } from './i18n.js';

const SVG = 'http://www.w3.org/2000/svg';

/** Largeur du repère des deux schémas, en unités de viewBox. */
const W = 1000;

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  return node;
}

function text(str, x, y, cls, anchor = 'middle') {
  const node = el('text', { x, y, class: cls, 'text-anchor': anchor });
  node.textContent = str;
  return node;
}

/**
 * Demi-largeur d'un caractère, en unités de viewBox.
 *
 * Le SVG est tracé sur 1 000 unités et affiché au plus étroit sur 680 px (`.sch`), où
 * un caractère de 13 px en pèse une dizaine. Majorer est sans conséquence — l'étiquette
 * se décale un peu plus tôt — là où minorer la fait couper par le bord du cadre.
 */
const HALF_CHAR = 5;

/** Étiquette recentrée pour ne pas sortir du cadre, d'autant plus tôt qu'elle est longue. */
function labelAt(str, x, y, cls) {
  const half = Math.min(W / 2, str.length * HALF_CHAR);
  if (x < half) return text(str, 2, y, cls, 'start');
  if (x > W - half) return text(str, W - 2, y, cls, 'end');
  return text(str, x, y, cls);
}

function svg(height, title) {
  const s = el('svg', {
    class: 'sch',
    viewBox: `0 0 ${W} ${height}`,
    role: 'img',
    'aria-label': title,
  });
  const ttl = el('title');
  ttl.textContent = title;
  s.append(ttl);
  return s;
}

/* ------------------------------------------------------------------ *
 * Schéma du gène
 * ------------------------------------------------------------------ */

/** Largeur d'un intron, identique pour tous : les introns ne sont pas à l'échelle. */
const INTRON_W = 9;
/** Largeur minimale d'un exon : un exon de 22 pb doit rester visible et cliquable. */
const MIN_EXON_W = 7;
/** Largeur totale visée pour les exons, le reste allant aux introns. */
const EXON_TOTAL_W = 620;

/**
 * Largeur de chaque exon, sur une échelle **compressée en racine carrée**.
 *
 * À l'échelle linéaire, le dernier exon de TP53 (1 270 pb, 3'UTR compris) prend à lui
 * seul la moitié du schéma et l'exon 3 (22 pb) disparaît : on ne voit plus la
 * structure, qui est pourtant tout ce qu'on demande à cette vue. La racine carrée
 * garde l'ordre des tailles — un grand exon reste visiblement grand — en rendant les
 * petits lisibles. La position de la variation **dans** son exon reste, elle,
 * strictement proportionnelle : c'est la seule distance que cette vue laisse lire.
 */
function exonWidths(exons) {
  const roots = exons.map((e) => Math.sqrt(e.length));
  const sum = roots.reduce((a, b) => a + b, 0) || 1;
  return roots.map((r) => Math.max(MIN_EXON_W, (r / sum) * EXON_TOTAL_W));
}

/**
 * Le gène : exons en boîtes, introns en traits, variation épinglée sur son exon.
 *
 * @param {object} st  structure (voir js/structure.js)
 * @param {object} loc position de la variation
 * @param {object} opts { lang, skip } — `skip` = sortie d'`exonSkipping`, ou null
 */
export function geneSchema(st, loc, { lang = 'fr', skip = null } = {}) {
  const H = 76;
  const TOP = 30;       // ligne du haut de la piste
  const BOX = 22;       // hauteur d'un exon codant
  const UTR = 11;       // hauteur d'un exon non traduit
  const mid = TOP + BOX / 2;

  const widths = exonWidths(st.exons);
  const total = widths.reduce((a, b) => a + b, 0) + INTRON_W * (st.exons.length - 1);
  const k = W / total;

  const s = svg(H, t(lang, 'schemaGeneAlt', {
    gene: st.gene || st.transcript, n: st.total,
  }));

  // Piste d'introns : un seul trait continu sous les boîtes.
  s.append(el('line', { class: 'sch-intron', x1: 0, y1: mid, x2: W, y2: mid }));

  let x = 0;
  const placed = [];
  st.exons.forEach((e, i) => {
    const w = widths[i] * k;
    placed.push({ e, x, w });
    // Part traduite de l'exon : le reste est un UTR, dessiné moitié moins haut.
    const codingLo = Math.max(e.start, st.cdsStart);
    const codingHi = Math.min(e.end, st.cdsEnd);
    const hasCoding = st.coding && codingHi >= codingLo;
    const frac = (g) => (st.strand === 1 ? g - e.start : e.end - g) / e.length;

    const hit = loc && loc.exon === e.number;
    s.append(el('rect', {
      class: `sch-exon${hit ? ' hit' : ''}`,
      x, y: TOP + (BOX - UTR) / 2, width: w, height: UTR, rx: 1,
    }));
    if (hasCoding) {
      const a = frac(st.strand === 1 ? codingLo : codingHi);
      const b = frac(st.strand === 1 ? codingHi : codingLo);
      s.append(el('rect', {
        class: `sch-exon cds${hit ? ' hit' : ''}`,
        x: x + Math.min(a, b) * w,
        y: TOP,
        width: Math.max(1.2, Math.abs(b - a) * w),
        height: BOX,
        rx: 1,
      }));
    }
    x += w + INTRON_W * k;
  });

  /* L'exon dont le saut est en question, encadré en pointillés.
   *
   * Ce n'est pas toujours celui que l'épingle désigne : une variation intronique met en
   * cause le site de l'exon **voisin**, et c'est lui que le saut emporterait. Le cadre
   * est neutre — il dit lequel, pas ce qu'il en coûte : la phase est écrite au-dessus. */
  if (skip) {
    for (const n of skip.exons) {
      const p = placed.find((q) => q.e.number === n);
      if (!p) continue;
      s.append(el('rect', {
        class: 'sch-skip', x: p.x - 2, y: TOP - 4, width: p.w + 4, height: BOX + 8, rx: 2,
      }));
    }
  }

  /* Numéros d'exon : un sur N, N choisi pour laisser ~45 unités entre deux étiquettes.
   *
   * Les numéroter d'après la largeur de leur propre boîte produisait des trous
   * arbitraires — CFTR affichait 15 puis 17, l'exon 16 étant trop étroit, ce qui se lit
   * comme une erreur et non comme une omission. Un pas régulier se lit comme une
   * graduation. Le premier, le dernier et celui de la variation sont toujours écrits. */
  const pitch = W / st.total;
  const step = [1, 5, 10, 25, 50].find((n) => n * pitch >= 45) || 100;
  placed.forEach(({ e, x: ex, w }) => {
    const keep = e.number % step === 0 || e.number === 1 || e.number === st.total
      || (loc && loc.exon === e.number);
    if (keep) s.append(text(String(e.number), ex + w / 2, H - 4, 'sch-num'));
  });

  s.append(text("5'", 2, TOP - 16, 'sch-end', 'start'));
  s.append(text("3'", W - 2, TOP - 16, 'sch-end', 'end'));

  // L'épingle de la variation, posée à sa place réelle dans l'exon ; pour une
  // variation intronique, du côté de la jonction dont elle est proche.
  const mark = markX(st, loc, placed, k);
  if (mark !== null) {
    s.append(el('line', { class: 'sch-mark', x1: mark, y1: TOP - 11, x2: mark, y2: TOP + BOX + 5 }));
    s.append(el('path', {
      class: 'sch-mark-head',
      d: `M${mark - 5} ${TOP - 13} L${mark + 5} ${TOP - 13} L${mark} ${TOP - 4} Z`,
    }));
    s.append(labelAt(locLabel(st, loc, lang), mark, TOP - 18, 'sch-pin'));
  }
  return s;
}

/** Abscisse de la variation dans le schéma du gène. */
function markX(st, loc, placed, k) {
  if (!loc) return null;
  if (loc.exon) {
    const p = placed.find((q) => q.e.number === loc.exon);
    if (!p) return null;
    const { e } = p;
    const g = st.strand === 1 ? loc.span.start : loc.span.end;
    const frac = Math.min(1, Math.max(0, (st.strand === 1 ? g - e.start : e.end - g) / e.length));
    return p.x + frac * p.w;
  }
  if (loc.intron) {
    const a = placed.find((q) => q.e.number === loc.intron);
    const b = placed.find((q) => q.e.number === loc.intron + 1);
    if (!a || !b) return null;
    /* Position **relative** dans l'intron, et non son milieu.
     *
     * Posée au milieu, l'épingle dessinait `c.548+1` et `c.548+1700` au même endroit :
     * le schéma montrait un intron profond là où la variation est sur le site donneur,
     * c'est-à-dire dans le cas où cette vue doit le moins se tromper. Ces neuf unités
     * restent hors échelle et ne mesurent aucune distance ; la fraction ne dit pas
     * combien de paires de bases, elle dit **de quel bord** la variation est proche,
     * et c'est ce qui manquait. Le décalage chiffré est dans l'étiquette. */
    const frac = loc.offsetDonor + loc.offsetAcceptor > 0
      ? loc.offsetDonor / (loc.offsetDonor + loc.offsetAcceptor)
      : 0.5;
    return a.x + a.w + frac * (INTRON_W * k);
  }
  return null;
}

function locLabel(st, loc, lang) {
  if (loc.kind === 'intron') {
    // Le décalage HGVS écrit en toutes lettres : un intron hors échelle ne saura jamais
    // distinguer à l'œil un +1 d'un +1 700, l'étiquette le fait.
    const n = loc.nearest ? loc.nearest.offset : null;
    const sign = loc.nearest && loc.nearest.side === 'acceptor' ? '−' : '+';
    return `${t(lang, 'intron')} ${loc.intron}${n === null ? '' : ` (${sign}${n})`}`;
  }
  if (loc.kind === 'junction') return t(lang, 'schemaOnJunction');
  if (loc.exon) return `${t(lang, 'exon')} ${loc.exon}`;
  return '';
}

/* ------------------------------------------------------------------ *
 * Zoom sur la jonction
 * ------------------------------------------------------------------ */

/**
 * Le zoom : une **seule** échelle linéaire, en paires de bases.
 *
 * Pas de rupture d'échelle, pas d'exon raccourci : ce que l'œil mesure sur ce schéma
 * est la distance réelle. C'est la condition pour qu'il réponde à la question posée.
 * Les chiffres sont écrits de toute façon — le dessin confirme, il ne remplace pas.
 */
export function zoomSchema(st, loc, { lang = 'fr' } = {}) {
  const H = 148;
  const TOP = 48;
  const BOX = 24;
  const mid = TOP + BOX / 2;
  const ws = loc.window.start;
  const we = loc.window.end;
  const L = we - ws + 1;

  // Position du bord 5' de la base `g` sur l'axe du transcrit (0 … L).
  const uLo = (g) => (st.strand === 1 ? g - ws : we - g);
  const xOf = (u) => (u / L) * W;
  const xRange = (a, b) => {
    const x1 = xOf(uLo(st.strand === 1 ? a : b));
    const x2 = xOf(uLo(st.strand === 1 ? b : a) + 1);
    return [Math.min(x1, x2), Math.max(x1, x2)];
  };

  const s = svg(H, t(lang, 'schemaZoomAlt', { n: L }));

  // Trait d'intron sur toute la fenêtre, recouvert par les boîtes d'exon.
  s.append(el('line', { class: 'sch-intron', x1: 0, y1: mid, x2: W, y2: mid }));

  // Repère de la variation, mesuré avant de dessiner quoi que ce soit : c'est lui qui
  // décide quelles jonctions ont encore un trait à tracer (voir `coincides`).
  const [vx1, vx2] = xRange(loc.span.start, loc.span.end);
  const vw = Math.max(2, vx2 - vx1);
  const vc = (vx1 + vx2) / 2;
  /* Jonction confondue avec la variation : **une** marque, et non deux.
   *
   * Sur `c.548+1G>A`, le trait de jonction tombe exactement sur le bord du rectangle de
   * la variation et dans la même couleur : on lisait deux repères rouges pour un seul
   * fait, le trait débordant du rectangle en haut et en bas comme s'il le barrait, et
   * les deux étiquettes, posées l'une sous l'autre, se lisaient comme les deux lignes
   * d'une même légende. Une jonction emportée par une délétion donnait la même image en
   * plus large : le trait passe sous le rectangle, qui le recouvre, et seuls ses
   * débords dépassent.
   *
   * Dès que la jonction tombe sur le rectangle, c'est donc le rectangle qui la montre —
   * et le bord de la boîte d'exon avec lui. Le trait n'ajoute rien ; son nom, lui, est
   * gardé et rejoint l'étiquette de la variation. */
  const merged = [];
  const coincides = (x) => x >= vx1 - 1 && x <= vx1 + vw + 1;

  // Graduation à la base, quand la fenêtre est assez courte pour qu'on puisse compter :
  // c'est ce qui permet de vérifier à l'œil un « 1 pb » ou un « 3 pb » annoncé.
  if (L <= 130) {
    for (let g = ws; g <= we; g++) {
      const [x1] = xRange(g, g);
      const tall = (g - ws) % 10 === 0;
      s.append(el('line', {
        class: 'sch-base', x1, y1: TOP + BOX + 2, x2: x1, y2: TOP + BOX + (tall ? 9 : 5),
      }));
    }
  }

  // Exons visibles dans la fenêtre, avec leur part traduite.
  for (const e of st.exons) {
    if (e.end < ws || e.start > we) continue;
    const lo = Math.max(e.start, ws);
    const hi = Math.min(e.end, we);
    const [x1, x2] = xRange(lo, hi);
    const hit = loc.exon === e.number;
    s.append(el('rect', {
      class: `sch-exon${hit ? ' hit' : ''}`,
      x: x1, y: TOP + 6, width: Math.max(1, x2 - x1), height: BOX - 12, rx: 1,
    }));
    const cLo = Math.max(lo, st.cdsStart);
    const cHi = Math.min(hi, st.cdsEnd);
    if (st.coding && cHi >= cLo) {
      const [c1, c2] = xRange(cLo, cHi);
      s.append(el('rect', {
        class: `sch-exon cds${hit ? ' hit' : ''}`,
        x: c1, y: TOP, width: Math.max(1, c2 - c1), height: BOX, rx: 1,
      }));
    }
    // Les jonctions présentes dans la fenêtre, nommées et datées en pb.
    const donorBase = st.strand === 1 ? e.end : e.start;
    const accBase = st.strand === 1 ? e.start : e.end;
    // La jonction la plus proche passe en rouge quand la variation la touche ou la
    // frôle : c'est elle que le schéma doit faire ressortir.
    const flag = (b) => loc.nearest && loc.nearest.boundary === b
      && ['edge', 'canonical', 'junction'].includes(loc.edge);
    const mark = (x, label, flagged) => {
      if (coincides(x)) merged.push(label);
      else junction(s, x, TOP, BOX, label, flagged);
    };
    if (e.number > 1 && accBase >= ws && accBase <= we) {
      mark(xOf(uLo(accBase)), t(lang, 'schemaAcceptor', { p: e.number - 1, n: e.number }),
        flag(accBase));
    }
    if (e.number < st.total && donorBase >= ws && donorBase <= we) {
      mark(xOf(uLo(donorBase) + 1), t(lang, 'schemaDonor', { n: e.number }), flag(donorBase));
    }
    // Nom de l'exon calé à gauche de sa boîte, et non centré : centré, il se place à
    // l'aplomb de la cote — elle aussi centrée — et les deux textes se lisent comme
    // deux lignes d'une même étiquette.
    if (x2 - x1 > 60) {
      s.append(text(`${t(lang, 'exon')} ${e.number}`, x1 + 4, TOP + BOX + 16, 'sch-num', 'start'));
    }
  }

  // La variation : un trait pour une substitution, une boîte pour un indel.
  s.append(el('rect', {
    class: 'sch-var', x: vx1, y: TOP - 6, width: vw, height: BOX + 12, rx: 1,
  }));
  // Une ligne au-dessus des étiquettes de jonction, qui restent lisibles quand la
  // variation les longe sans les toucher — `c.548+5`, où les deux repères sont à cinq
  // bases l'un de l'autre. Quand la jonction est **sous** la variation, elle n'a plus
  // de trait et son nom passe ici, sur une seule ligne.
  s.append(labelAt(merged.length
    ? t(lang, 'schemaVariantOn', { j: merged.join(' · ') })
    : t(lang, 'schemaVariant'), vc, TOP - 26, 'sch-pin'));

  // Cotes : de chaque jonction présente dans la fenêtre jusqu'à la base que le chiffre
  // compte, sous la ligne des numéros d'exon — superposées, les deux textes se
  // recouvrent exactement sur un exon large, où l'étiquette d'exon est centrée comme
  // l'est celle de la cote.
  let y = TOP + BOX + 40;
  for (const d of dimensions(st, loc)) {
    const a = xOf(d.at);
    const b = xOf(d.from);
    dimension(s, Math.min(a, b), Math.max(a, b), y, t(lang, 'bpShort', { n: d.bp }), d.edge);
    y += 18;
  }
  return s;
}

/** Jonction exon/intron : trait pointillé et étiquette. */
function junction(s, x, top, box, label, edge) {
  const cls = edge ? ' edge' : '';
  s.append(el('line', { class: `sch-junction${cls}`, x1: x, y1: top - 10, x2: x, y2: top + box + 10 }));
  s.append(labelAt(label, x, top - 12, `sch-junction-label${cls}`));
}

/** Cote horizontale avec embouts, et sa valeur en pb. */
function dimension(s, x1, x2, y, label, edge) {
  const cls = `sch-dim${edge ? ' edge' : ''}`;
  s.append(el('line', { class: cls, x1, y1: y, x2, y2: y }));
  s.append(el('line', { class: cls, x1, y1: y - 4, x2: x1, y2: y + 4 }));
  s.append(el('line', { class: cls, x1: x2, y1: y - 4, x2: x2, y2: y + 4 }));
  const mx = (x1 + x2) / 2;
  s.append(labelAt(label, mx, y - 6, `sch-dim-label${edge ? ' edge' : ''}`));
}

/**
 * Cotes à tracer : jonction, distance en pb, et si cette distance vaut « bordure ».
 * Le bord de la fenêtre (`uLo`) sert d'abscisse, pour rester sur la même échelle.
 *
 * Chaque cote court de la jonction (`at`) jusqu'à la base que le chiffre compte
 * (`from`), soit exactement `bp` bases de graduation — et non jusqu'au centre du
 * rectangle de la variation, qui sur un « 1 pb » dessinait une cote d'une demi-base
 * sous un chiffre qui en annonce une. La graduation n'est là que pour qu'on puisse
 * compter : elle doit tomber juste.
 */
function dimensions(st, loc) {
  const out = [];
  const inWindow = (g) => g >= loc.window.start && g <= loc.window.end;
  // `toward` : de quel côté de la jonction sont les bases comptées, dans le sens du
  // transcrit — l'exon avant le site donneur, l'intron après, et l'inverse en 5'.
  const push = (base, after, bp, edge, toward) => {
    if (!bp || !inWindow(base)) return;
    const u = st.strand === 1 ? base - loc.window.start : loc.window.end - base;
    const at = u + (after ? 1 : 0);
    out.push({ at, from: at + toward * bp, bp, edge });
  };
  if (loc.kind === 'exon') {
    const e = st.exons[loc.exon - 1];
    const donorBase = st.strand === 1 ? e.end : e.start;
    const accBase = st.strand === 1 ? e.start : e.end;
    push(donorBase, true, loc.dist3, loc.dist3 !== null && loc.dist3 < 3, -1);
    push(accBase, false, loc.dist5, loc.dist5 !== null && loc.dist5 < 3, 1);
  } else if (loc.kind === 'intron') {
    const prev = st.exons[loc.intron - 1];
    const next = st.exons[loc.intron];
    const donorBase = st.strand === 1 ? prev.end : prev.start;
    const accBase = st.strand === 1 ? next.start : next.end;
    push(donorBase, true, loc.offsetDonor, loc.offsetDonor <= 2, 1);
    push(accBase, false, loc.offsetAcceptor, loc.offsetAcceptor <= 2, -1);
  }
  return out;
}
