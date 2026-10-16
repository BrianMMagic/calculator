'use strict';
// Screenshot skin: finds the keys, the two top buttons and the display "0" in a screenshot of the real
// Calculator, so invisible keys and live text can be laid exactly over it (the way Toxic+ uses screenshots).

function loadImage(src) {
  return new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = src; });
}

// Runs of indices where test(i) holds, at least minLen long.
function runs(n, test, minLen = 3) {
  const out = []; let start = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && test(i)) { if (start < 0) start = i; }
    else if (start >= 0) { if (i - start >= minLen) out.push([start, i - 1]); start = -1; }
  }
  return out;
}

// Returns geometry in image pixels: { w, h, keys:[{x,y,w,h}] row-major, buttons:[{x,y,w,h}], zero:{x,y,w,h}, statusBottom }.
function detectSkin(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  const px = cx.getImageData(0, 0, w, h).data;
  const lum = (x, y) => { const i = (y * w + x) * 4; return (px[i] * 3 + px[i + 1] * 6 + px[i + 2]) / 10; };
  const lit = (x, y) => lum(x, y) > 24;               // not background black
  const rowCount = (y, x0 = 0, x1 = w, f = lit) => { let c = 0; for (let x = x0; x < x1; x += 2) if (f(x, y)) c++; return c * 2; };

  // Keypad: rows where a large share of the width is covered by keys.
  const keyRows = runs(h, (y) => rowCount(y) > w * 0.45, Math.round(h * 0.02));
  const bands = keyRows.filter(([a, b]) => b - a > h * 0.03);
  const keys = [];
  for (const [a, b] of bands) {
    const mid = Math.round((a + b) / 2);
    const cols = runs(w, (x) => { let c = 0; for (let y = a; y <= b; y += 3) if (lit(x, y)) c++; return c > (b - a) / 3 / 2; }, Math.round(w * 0.04));
    for (const [l, r] of cols) {
      // tighten vertically for this key (round keys are narrower than the band edges)
      const cxm = Math.round((l + r) / 2);
      let t = mid, bt = mid;
      while (t > a && lit(cxm, t - 1)) t--;
      while (bt < b && lit(cxm, bt + 1)) bt++;
      keys.push({ x: l, y: t, w: r - l + 1, h: bt - t + 1 });
    }
  }
  const padTop = keys.length ? Math.min(...keys.map((k) => k.y)) : h;

  // Top buttons: first band below the status bar made of grey (not white, not black) pixels.
  const grey = (x, y) => { const l = lum(x, y); return l > 24 && l < 120; };
  const greyRows = runs(padTop, (y) => y > h * 0.03 && rowCount(y, 0, w, grey) > w * 0.04, Math.round(h * 0.015));
  const buttons = [];
  let statusBottom = 0;
  const bgAt = (x, y) => { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
  const bg = bgAt(Math.round(w / 2), Math.round(padTop * 0.45));
  const fg = (x, y) => { const [r, g2, b] = bgAt(x, y); return Math.abs(r - bg[0]) + Math.abs(g2 - bg[1]) + Math.abs(b - bg[2]) > 90; };
  if (greyRows.length && greyRows[0][0] < h * 0.2) {
    const [a, b] = greyRows[0];
    statusBottom = Math.max(0, a - 2);
    const mid = Math.round((a + b) / 2);
    for (const [l, r] of runs(w, (x) => grey(x, mid) || lum(x, mid) >= 120, Math.round(w * 0.04))) {
      buttons.push({ x: l, y: a, w: r - l + 1, h: b - a + 1 });
    }
  }
  if (!buttons.length) {
    // Icons without a circle behind them (e.g. Android): the first band of foreground pixels below the status bar.
    const band = runs(Math.round(h * 0.22), (y) => y > h * 0.055 && rowCount(y, 0, w, fg) > 0, 4)[0];
    if (band) {
      const [a, b] = band, mid = Math.round((a + b) / 2), size = Math.max(b - a + 1, Math.round(Math.min(w, h) * 0.11));
      const xs = []; for (let x = 0; x < w; x++) for (let y = a; y <= b; y += 2) if (fg(x, y)) { xs.push(x); break; }
      const left = xs.filter((x) => x < w / 2), right = xs.filter((x) => x >= w / 2);
      const sq = (c) => ({ x: Math.round(c - size / 2), y: Math.round(mid - size / 2), w: size, h: size });
      if (left.length) buttons.push(sq((Math.min(...left) + Math.max(...left)) / 2));
      if (right.length) buttons.push(sq((Math.min(...right) + Math.max(...right)) / 2));
      statusBottom = Math.max(0, Math.round(mid - size / 2) - 2);
    } else statusBottom = Math.round(h * 0.05);
  }
  const dispTop = buttons.length ? buttons[0].y + buttons[0].h : Math.round(h * 0.1);

  // Display text: the bright cluster nearest above the keypad.
  const bright = (x, y) => lum(x, y) > 150;
  const textLimit = Math.round(padTop - h * 0.012); // skip the glass highlight along the top of the keys
  // Only text on the right half counts (a cleared Android display is blank; icons sit on the left). Biggest wins.
  const x0 = Math.round(w * 0.35);
  const textRows = runs(textLimit, (y) => y > dispTop && rowCount(y, x0, w, bright) > 0, 3).filter(([a, b]) => b - a + 1 >= h * 0.025);
  let zero = null;
  if (textRows.length) {
    const [a, b] = textRows.reduce((m, r) => (r[1] - r[0] > m[1] - m[0] ? r : m));
    let l = w, r = 0, cr = 0, cg = 0, cb = 0, n = 0;
    for (let y = a; y <= b; y++) for (let x = x0; x < w; x++) if (bright(x, y)) {
      if (x < l) l = x; if (x > r) r = x;
      const i = (y * w + x) * 4; if (lum(x, y) > 200) { cr += px[i]; cg += px[i + 1]; cb += px[i + 2]; n++; }
    }
    if (r > w * 0.6 && (r - l + 1) > (b - a + 1) * 0.2) { // not a thin typing cursor
      // stroke width of the left side of the first glyph at mid-height
      const my = Math.round((a + b) / 2); let sw = 0;
      for (let x = l; x < r && bright(x, my); x++) sw++;
      zero = { x: l, y: a, w: r - l + 1, h: b - a + 1, stroke: sw };
      if (n) zero.color = `rgb(${Math.round(cr / n)},${Math.round(cg / n)},${Math.round(cb / n)})`;
    }
  }
  // Phone type: on a Pixel the AC key (top-left portrait, 4th in landscape) is strongly coloured; on iPhone that key is grey.
  let phone = 'ios';
  const acKey = keys[w > h ? 3 : 0];
  if (acKey) {
    const [r, g2, b] = bgAt(Math.round(acKey.x + acKey.w * 0.15), Math.round(acKey.y + acKey.h / 2));
    if (Math.max(r, g2, b) - Math.min(r, g2, b) > 100) phone = 'pixel';
  }
  // Key-label colour (the "7"), used for the number when the screenshot shows none.
  let label = null;
  const k7 = keys[w > h ? 0 : 4];
  if (k7) {
    let best = -1;
    for (let y = k7.y; y < k7.y + k7.h; y += 2) for (let x = k7.x; x < k7.x + k7.w; x += 2) {
      const l2 = lum(x, y); if (l2 > best) { best = l2; const i = (y * w + x) * 4; label = `rgb(${px[i]},${px[i + 1]},${px[i + 2]})`; }
    }
  }
  return { w, h, keys, buttons, zero, statusBottom, padTop, dispTop, phone, bg: `rgb(${bg.join(',')})`, label };
}

// The history icon's clock: centre, inner radius of its ring, and the angle of the hand nearest 12 o'clock.
// Only the disc inside the ring (the hands) gets rotated for the remainder cue, so the icon stays the phone's own.
function findClock(img, r) {
  if (!r) return null;
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
  const bw = Math.min(w - x0, Math.round(r.w)), bh = Math.min(h - y0, Math.round(r.h));
  const d = cx.getImageData(x0, y0, bw, bh).data;
  const lumAt = (x, y) => { x = Math.round(x - x0); y = Math.round(y - y0); if (x < 0 || y < 0 || x >= bw || y >= bh) return 0; const i = (y * bw + x) * 4; return (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10; };
  // Icon pixels are much brighter than the button behind them.
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 16) { const l = (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10; if (l < lo) lo = l; if (l > hi) hi = l; }
  if (hi - lo < 60) return null;
  const fg = (x, y) => lumAt(x, y) > lo + (hi - lo) * 0.5;
  // Centre: middle of the icon's bounding box.
  let l = 1e9, rr = -1, t = 1e9, b = -1;
  for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) if (fg(x, y)) { if (x < l) l = x; if (x > rr) rr = x; if (y < t) t = y; if (y > b) b = y; }
  if (rr < 0) return null;
  let cxm = (l + rr) / 2, cym = (t + b) / 2;
  const R = Math.max(rr - l, b - t) / 2;
  // Distance from (x, y) to the first icon pixel in direction k of 24 (0 = up, clockwise), starting past the hands' hub.
  const distAt = (x, y, k) => {
    const a = k / 24 * Math.PI * 2; let s2 = R * 0.25;
    while (s2 < R * 1.2 && !fg(x + Math.sin(a) * s2, y - Math.cos(a) * s2)) s2 += 0.5;
    return s2;
  };
  // The ring's true centre: an arrowhead (Android's history icon) skews the bounding box, so nudge the centre
  // until opposite ring distances match, ignoring directions that hit a hand (short) or a gap (long).
  for (let it = 0; it < 4; it++) {
    const d = Array.from({ length: 24 }, (_, k) => distAt(cxm, cym, k));
    const ok = d.filter((v) => v > R * 0.5 && v < R * 1.15).sort((p, q) => p - q);
    if (!ok.length) break;
    const med = ok[Math.floor(ok.length / 2)];
    let dx = 0, dy = 0, n = 0;
    for (let k = 0; k < 12; k++) {
      const p = d[k], q = d[k + 12];
      if (Math.abs(p - med) > med * 0.2 || Math.abs(q - med) > med * 0.2) continue;
      const a = k / 24 * Math.PI * 2, shift = (p - q) / 2;
      dx += Math.sin(a) * shift; dy += -Math.cos(a) * shift; n++;
    }
    if (!n) break;
    cxm += dx / n; cym += dy / n;
  }
  const dist = Array.from({ length: 24 }, (_, k) => distAt(cxm, cym, k)).sort((p, q) => p - q);
  const ring = dist[Math.floor(dist.length * 0.75)];
  if (!(ring > R * 0.4)) return null;
  // Hands: angles (0 = 12 o'clock, clockwise) with icon pixels at ~55% of the ring radius.
  const hands = []; let run = null;
  for (let deg = 0; deg < 360 + 6; deg += 2) {
    const a = (deg % 360) / 180 * Math.PI, on = fg(cxm + Math.sin(a) * ring * 0.55, cym - Math.cos(a) * ring * 0.55);
    if (on && !run) run = [deg, deg]; else if (on) run[1] = deg; else if (run) { hands.push(((run[0] + run[1]) / 2) % 360); run = null; }
  }
  if (!hands.length) return null;
  const pointer = hands.reduce((m, a) => (Math.min(a, 360 - a) < Math.min(m, 360 - m) ? a : m));
  // Cut just enough to hold the hands, so no part of the ring or its arrow is rotated with them.
  let reach = 0;
  for (const h2 of hands) {
    const a = h2 / 180 * Math.PI; let s2 = 0;
    while (s2 < ring && fg(cxm + Math.sin(a) * s2, cym - Math.cos(a) * s2)) s2 += 0.5;
    reach = Math.max(reach, s2);
  }
  // Shrink until the disc's edge (away from the hands) holds no ring or arrow pixels.
  const nearHand = (deg) => hands.some((h2) => Math.min(Math.abs(deg - h2), 360 - Math.abs(deg - h2)) < 20);
  // Closest point of the ring in any direction (looking past a hand where one is in the way).
  let ringMin = ring;
  for (let deg = 0; deg < 360; deg += 3) {
    const a = deg / 180 * Math.PI, at = (s2) => fg(cxm + Math.sin(a) * s2, cym - Math.cos(a) * s2);
    let s2 = 1;
    while (s2 < ring * 1.2 && at(s2)) s2 += 0.5;   // through the hub/hand
    while (s2 < ring * 1.2 && !at(s2)) s2 += 0.5;  // across the gap
    if (s2 < ring * 1.2 && s2 > reach + 0.5) ringMin = Math.min(ringMin, s2); // the ring lies beyond the hands
  }
  let rad = Math.min(ringMin - 2.5, reach + 1.5); // keep clear of the ring's soft edge
  while (rad > reach * 0.9) {
    let hit = 0, n = 0;
    for (let deg = 0; deg < 360; deg += 4) {
      if (nearHand(deg)) continue;
      const a = deg / 180 * Math.PI;
      for (let s2 = rad - 1.5; s2 <= rad; s2 += 0.75) { n++; if (fg(cxm + Math.sin(a) * s2, cym - Math.cos(a) * s2)) hit++; }
    }
    if (!n || hit / n < 0.01) break;
    rad -= 0.5;
  }
  return { cx: cxm, cy: cym, r: Math.max(2, rad), pointer: pointer > 180 ? pointer - 360 : pointer };
}

// Crop a region of an image to a data URL (optionally a centred circle).
function cropImage(img, r, circle = 0) {
  const cv = document.createElement('canvas'); cv.width = r.w; cv.height = r.h;
  const cx = cv.getContext('2d');
  if (circle) { cx.beginPath(); cx.arc(r.w / 2, r.h / 2, Math.min(r.w, r.h) / 2 * circle, 0, Math.PI * 2); cx.clip(); }
  cx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return cv.toDataURL('image/png');
}

// ---------- layout ----------
const FAMILY = '-apple-system, "SF Pro Display", "SF Pro", system-ui, "Helvetica Neue", Arial, sans-serif';
const LAYOUTS = {
  ios: {
    portrait: ['back', 'clear', 'pct', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', 'neg', '0', '.', '='],
    landscape: ['7', '8', '9', 'back', '/', '4', '5', '6', 'clear', '*', '1', '2', '3', 'pct', '-', 'neg', '0', '.', '=', '+'],
  },
  pixel: { // Google Calculator on Pixel
    portrait: ['clear', 'paren', 'pct', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'back', '='],
    landscape: ['7', '8', '9', 'clear', '*', '4', '5', '6', 'paren', '-', '1', '2', '3', 'pct', '+', '0', '.', 'back', '/', '='],
  },
};
const KEYMAP = LAYOUTS.ios;
const keymap = (orient) => (LAYOUTS[Skin.phone] || LAYOUTS.ios)[orient];
const KIND = (k) => (['back', 'clear', 'pct', 'paren'].includes(k) ? 'fn' : '/*-+='.includes(k) ? 'op' : 'num');
const BACK_SVG = '<svg viewBox="0 0 40 28" width="1.05em" height="0.75em" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2h24a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H12L2 14z"/><path d="M18 9l10 10M28 9L18 19"/></svg>';
const LABELS = { paren: '( )', back: BACK_SVG, clear: 'AC', pct: '%', '/': '÷', '*': '×', '-': '−', '+': '+', '=': '=', neg: '<sup>+</sup><span class="slash">/</span><sub>−</sub>' };
const CLOCK_SVG = '<svg viewBox="0 0 24 24" width="50%" height="50%" fill="none" stroke="#fff" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6H7"/></svg>';
const CALC_SVG = '<svg viewBox="0 0 24 24" width="46%" height="46%" fill="#fff"><rect x="5" y="2" width="14" height="20" rx="3" fill="none" stroke="#fff" stroke-width="1.8"/><rect x="8" y="5" width="8" height="3" rx="1"/><circle cx="9" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="15.5" r="1.2"/><circle cx="12" cy="15.5" r="1.2"/><circle cx="15" cy="15.5" r="1.2"/><circle cx="9" cy="19" r="1.2"/><circle cx="12" cy="19" r="1.2"/><circle cx="15" cy="19" r="1.2"/></svg>';

// Geometry measured from the bundled screenshots (iPhone Pro, 1179×2556), used unless a custom skin is imported.
function grid(cols, rows, w, h) { const k = []; for (const y of rows) for (const x of cols) k.push({ x, y, w, h }); return k; }
const BUILTIN = {
  portrait: { w: 1179, h: 2556, keys: grid([60, 337, 614, 890], [1029, 1306, 1582, 1859, 2135], 229, 217),
    buttons: [{ x: 48, y: 178, w: 132, h: 130 }, { x: 999, y: 178, w: 132, h: 130 }],
    zero: { x: 1022, y: 804, w: 100, h: 140, stroke: 17 }, statusBottom: 176, padTop: 1029, dispTop: 308 },
  landscape: { w: 2556, h: 1179, keys: grid([234, 660, 1086, 1512, 1937], [456, 622, 788, 953], 385, 142),
    buttons: [{ x: 114, y: 77, w: 132, h: 122 }, { x: 2310, y: 77, w: 132, h: 122 }],
    zero: { x: 2262, y: 326, w: 62, h: 86, stroke: 11 }, statusBottom: 75, padTop: 456, dispTop: 199 },
};

const Skin = {
  geo: { portrait: BUILTIN.portrait, landscape: BUILTIN.landscape },
  img: { portrait: null, landscape: null },
  cSprite: { portrait: null, landscape: null },
  cueSprite: { portrait: null, landscape: null },
  pressSprite: { portrait: null, landscape: null },
  clock: { portrait: null, landscape: null }, clockCue: null, cueStyle: 'clock',
  drawn: false, check: false, phone: 'ios',
  tweak: { scale: 1, dx: 0, dy: 0, weight: 'auto' },
  orient: 'portrait', cal: null, text: { main: '0', expr: '' }, isC: false, cue: '',
};

const mk = (tag, id, cls) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; return e; };
const stage = document.getElementById('stage');
stage.style.visibility = 'hidden'; // until the screenshots have loaded
const skinImg = mk('img', 'skinimg'); skinImg.alt = '';
const coverStatus = mk('div', 'cover-status'), dispZone = mk('div', 'dispzone');
const exprEl = mk('div', 'expr', 'txt'), mainEl = mk('div', 'display', 'txt');
stage.append(skinImg, coverStatus, dispZone, exprEl, mainEl, mk('div', 'extra'), mk('div', 'note'));
const keyEls = KEYMAP.portrait.map(() => {
  const b = mk('div', null, 'k');
  b.append(mk('i', null, 'press'), mk('span', null, 'lbl'), mk('i', null, 'spr'), mk('i', null, 'cue'), mk('i', null, 'tintov'), mk('i', null, 'flash'));
  stage.append(b); return b;
});
const hot = [mk('div', 'tl', 'hot'), mk('div', 'tr', 'hot')];
const clockEl = mk('i', null, 'clockhands');
// Alignment check: key outlines (CSS), a line of layout numbers and a dot where each touch lands.
const diag = mk('div', 'diag');
document.addEventListener('pointerdown', (e) => {
  if (!Skin.check) return;
  const dot = mk('i', null, 'diagdot'); dot.className = 'diagdot';
  dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px';
  stage.append(dot); setTimeout(() => dot.remove(), 900);
  const k = document.elementFromPoint(e.clientX, e.clientY)?.closest('.k');
  diag.textContent = diag.textContent.replace(/ ⇒.*$/, '') + ` ⇒ ${Math.round(e.clientX)},${Math.round(e.clientY)} ${k ? k.dataset.k : 'none'}`;
}, true);
hot[0].innerHTML = CLOCK_SVG; hot[1].innerHTML = CALC_SVG;
stage.append(...hot, clockEl, diag);

// Where the baseline sits inside a line box, as a fraction of font size.
function baselineRatio(weight) {
  const d = mk('div'); d.style.cssText = `position:absolute;visibility:hidden;font:${weight} 100px/100px ${FAMILY}`;
  d.innerHTML = '0<span style="display:inline-block;width:0;height:0;vertical-align:baseline"></span>';
  document.body.append(d);
  const r = (d.lastChild.getBoundingClientRect().top - d.getBoundingClientRect().top) / 100;
  d.remove(); return r;
}

// Match font size and weight to the "0" in the screenshot.
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function calibrate(g, s, ox, oy) {
  const cv = document.createElement('canvas'); cv.width = 400; cv.height = 320;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const weights = Skin.tweak.weight === 'auto' ? [200, 300, 400, 500] : [Number(Skin.tweak.weight)];
  let best = null;
  for (const wt of weights) {
    cx.clearRect(0, 0, 400, 320);
    cx.font = `${wt} 200px ${FAMILY}`; cx.fillStyle = '#fff';
    const m = cx.measureText('0');
    const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
    cx.fillText('0', 50, 260);
    const row = cx.getImageData(0, Math.round(260 + (desc - asc) / 2), 400, 1).data;
    let x = 0; while (x < 400 && row[x * 4 + 3] < 128) x++;
    let sw = 0; while (x < 400 && row[x * 4 + 3] >= 128) { sw++; x++; }
    const err = Math.abs(sw / (asc + desc) - g.zero.stroke / g.zero.h);
    if (!best || err < best.err) best = { weight: wt, cap: (asc + desc) / 200, err, rsb: (m.width - m.actualBoundingBoxRight) / 200, desc: desc / 200 };
  }
  const capPx = g.zero.h * s;
  const F = capPx / best.cap * Skin.tweak.scale;
  return { ...best, F, capPx, base: baselineRatio(best.weight),
    // On iPhone, Safari's canvas measures SF with a different right side-bearing than the page renders it
    // (likely optical sizing); measured on an iPhone Pro: the text sat 0.057 em too far left.
    right: ox + (g.zero.x + g.zero.w) * s + Skin.tweak.dx + (IOS ? 0.057 * capPx / best.cap * Skin.tweak.scale : 0),
    baseline: oy + (g.zero.y + g.zero.h) * s - best.desc * F + Skin.tweak.dy,
    left: ox + Math.min(...g.keys.map((k) => k.x)) * s };
}

function placeText(e, text, F, baseline, c) {
  e.textContent = text;
  e.style.fontWeight = c.weight;
  let f = F;
  e.style.fontSize = f + 'px'; e.style.lineHeight = f + 'px';
  const maxW = c.right - c.left;
  const w = e.scrollWidth;
  if (w > maxW) { f = Math.max(F * 0.3, F * maxW / w); e.style.fontSize = f + 'px'; e.style.lineHeight = f + 'px'; }
  e.style.right = (parseFloat(stage.style.width || innerWidth) - c.right - c.rsb * f) + 'px';
  e.style.top = (baseline - c.base * f) + 'px';
}

Skin.setDisplay = function (main, expr) {
  Skin.text = { main, expr };
  const c = Skin.cal; if (!c) return;
  // Alignment check over the real "264" screenshot: draw the same text in red to compare widths.
  if (Skin.check && Skin.checkImg && Skin.orient === 'portrait') { main = '264'; expr = '11×24'; }
  if (Skin.phone === 'pixel' && main === '0' && !expr) main = ''; // Google Calculator shows nothing when cleared
  placeText(mainEl, main, c.F, c.baseline, c);
  // The sum line after "=" is ~0.42× the size, grey, its baseline 1.54 cap-heights above the result's.
  placeText(exprEl, expr, c.F * 0.42, c.baseline - c.capPx * 1.543, c);
};
Skin.setClear = function (isC) {
  Skin.isC = isC;
  const k = keyEls[keymap(Skin.orient).indexOf('clear')];
  if (!k) return;
  k.querySelector('.lbl').textContent = isC ? 'C' : 'AC';
  k.classList.toggle('c', isC && !!Skin.cSprite[Skin.orient]);
};
Skin.setCue = function (cue) {
  Skin.cue = cue;
  if (Skin.cueStyle !== 'slash' && Skin.cueStyle !== 'both') cue = '';
  const k = keyEls[keymap(Skin.orient).indexOf('neg')];
  if (!k) return; // no ± key on this phone
  k.classList.toggle('add', cue === 'add'); k.classList.toggle('sub', cue === 'sub');
};

// Remainder cue on the clock: the hand that normally points up turns to the number of taps still needed (1–12);
// mirrored = subtract. null puts the icon back exactly as in the screenshot.
Skin.setClock = function (cue) {
  Skin.clockCue = cue;
  const on = cue && cue.n > 0 && (Skin.cueStyle === 'clock' || Skin.cueStyle === 'both');
  const ck = Skin.clock[Skin.orient], drawnSvg = hot[0].querySelector('svg');
  const target = on ? ((cue.n - 1) % 12 + 1) * 30 : 0;
  if (ck && !stage.classList.contains('drawn')) {
    clockEl.style.display = on ? 'block' : 'none';
    if (on) {
      const p = cue.sub ? -ck.pointer : ck.pointer;
      clockEl.style.transform = `rotate(${target - p}deg)` + (cue.sub ? ' scaleX(-1)' : '');
    }
  } else {
    clockEl.style.display = 'none';
    if (drawnSvg) drawnSvg.style.transform = on ? `rotate(${target}deg)` + (cue.sub ? ' scaleX(-1)' : '') : '';
  }
};

// Remainder cue: a faint tint over the given keys (e.g. '+' and '9'); [] clears it.
// Brightness (0-255) of each key's face, sampled beside its label, so tints can darken bright keys.
function keyLums(img, g) {
  const cv = document.createElement('canvas'); cv.width = g.w; cv.height = g.h;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  return g.keys.map((k) => {
    const d = cx.getImageData(Math.round(k.x + k.w * 0.14), Math.round(k.y + k.h * 0.45), 3, Math.max(1, Math.round(k.h * 0.1))).data;
    let t = 0; for (let i = 0; i < d.length; i += 4) t += (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10;
    return t / (d.length / 4);
  });
}
Skin.setTint = function (keys) {
  Skin.tintKeys = keys;
  keyEls.forEach((b) => b.classList.toggle('tint', keys.includes(b.dataset.k)));
};

function squareish(r) {
  if (Math.abs(r.w - r.h) / Math.max(r.w, r.h) > 0.15) return r;
  const d = Math.max(r.w, r.h);
  return { x: r.x + r.w / 2 - d / 2, y: r.y + r.h / 2 - d / 2, w: d, h: d };
}

// Home Screen web apps on iOS report a page height that is short by the status bar (with a see-through status
// bar the page really starts at the top of the screen), which shifted everything up. Use the screen size there.
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const safeProbe = mk('div'); safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;visibility:hidden;padding-top:env(safe-area-inset-top)';
document.body.append(safeProbe);
Skin.view = {};
const touch = IOS || /Android/i.test(navigator.userAgent);
function isLandscape() {
  if (touch) {
    const t = screen.orientation && screen.orientation.type;
    if (t) return t.startsWith('landscape');
    if (typeof window.orientation === 'number') return Math.abs(window.orientation) === 90;
  }
  return innerWidth > innerHeight;
}
Skin.stale = () => (Skin.orient === 'landscape') !== isLandscape();
function viewSize() {
  let W = innerWidth, H = innerHeight;
  // iOS can report the old page size for a moment while rotating; trust the device orientation on phones.
  const land = isLandscape();
  if ((W > H) !== land) [W, H] = [H, W];
  const sw = Math.min(screen.width, screen.height), sh = Math.max(screen.width, screen.height);
  const SW = land ? sh : sw, SH = land ? sw : sh;
  const safeTop = parseFloat(getComputedStyle(safeProbe).paddingTop) || 0;
  // Short by exactly the status bar = the Home Screen bug (a Safari tab is short by far more: its toolbars).
  // Home Screen app, page shorter than the screen:
  //  - see-through status bar (safe-area inset > 0): iOS under-reports the height; the page really fills the screen.
  //  - solid status bar (inset 0): the page starts below the status bar; the screenshot is placed as if full screen.
  let top = 0;
  const home = (standalone() || W === SW) && SW && SH && H < SH && W === SW;
  if (home && safeTop > 0 && Math.abs(SH - H - safeTop) <= 3) H = SH;
  else if (home && safeTop === 0 && standalone()) top = SH - H;
  const vv = window.visualViewport;
  Skin.view = { inner: `${innerWidth}×${innerHeight}`, screen: `${SW}×${SH}`, safeTop, standalone: standalone(), used: `${W}×${H}`, top,
    scroll: `${Math.round(scrollX)},${Math.round(scrollY)}`, vv: vv ? `${Math.round(vv.width)}×${Math.round(vv.height)}@${Math.round(vv.offsetTop)}` : '-' };
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  document.documentElement.style.setProperty('--appH', H + 'px'); // settings and peek use the same height
  return { W, H, top };
}

Skin.layout = function () {
  const { W, H, top } = viewSize();
  const orient = W > H ? 'landscape' : 'portrait';
  Skin.orient = orient;
  const g = Skin.geo[orient], img = Skin.img[orient];
  const drawn = Skin.drawn || !img;
  stage.classList.toggle('drawn', drawn);
  stage.classList.toggle('check', Skin.check);
  // Fill the width and sit on the bottom like the real app. If the page is shorter than the screen (a Safari tab,
  // with its toolbar), shrink to fit so the top buttons aren't cut off.
  const s = Math.min(W / g.w, (H + top) / g.h), ox = (W - g.w * s) / 2, oy = H - g.h * s;
  const box = (e, r) => Object.assign(e.style, { left: ox + r.x * s + 'px', top: oy + r.y * s + 'px', width: r.w * s + 'px', height: r.h * s + 'px' });
  const shown = Skin.check && Skin.checkImg && orient === 'portrait' ? Skin.checkImg : img;
  if (!drawn) {
    if (skinImg.src !== shown.src) skinImg.src = shown.src;
    Object.assign(skinImg.style, { left: ox + 'px', top: oy + 'px', width: g.w * s + 'px', height: g.h * s + 'px' });
  }
  coverStatus.style.height = Math.max(0, oy + g.statusBottom * s) + 'px';
  // Covers and the stage use the screenshot's own background colour; the number uses its text colour.
  const bg = !drawn && g.bg ? g.bg : '';
  stage.style.background = bg; coverStatus.style.background = bg; dispZone.style.background = Skin.check ? 'transparent' : bg;
  // Ask iOS to tint the status bar with the screenshot's colour too (theme colour and page background).
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = bg || '#000000';
  document.documentElement.style.background = document.body.style.background = bg || '';
  mainEl.style.color = Skin.check ? '' : (!drawn && (g.textColor || (g.zero && g.zero.color))) || '';
  exprEl.style.color = Skin.check ? '' : (!drawn && g.exprColor) || '';
  mainEl.style.fontFamily = exprEl.style.fontFamily = Skin.phone === 'pixel' ? `"Google Sans", "Product Sans", Roboto, ${FAMILY}` : '';
  Object.assign(dispZone.style, { top: oy + g.dispTop * s + 'px', height: (g.padTop - g.dispTop - g.h * 0.012) * s + 'px' });
  if (!drawn && !g.keyLum) g.keyLum = keyLums(img, g);
  // Pressed look (iOS 26/27): the key itself grows and lightens, so each key gets a crop of itself from the
  // screenshot, a little larger than the detected circle so its rim is covered too.
  const PAD = 0.04;
  if (!drawn && !Skin.pressSprite[orient]) Skin.pressSprite[orient] = g.keys.map((r0) => {
    const r = squareish(r0), dx = r.w * PAD, dy = r.h * PAD;
    return cropImage(img, { x: r.x - dx, y: r.y - dy, w: r.w + dx * 2, h: r.h + dy * 2 });
  });
  keymap(orient).forEach((k, i) => {
    const b = keyEls[i], r = squareish(g.keys[i]);
    b.dataset.k = k;
    // Bright keys (e.g. orange operators) get a dark tint; dark keys a light one.
    const bright = drawn ? KIND(k) === 'op' : g.keyLum[i] > 110;
    b.className = 'k ' + KIND(k) + (bright ? ' brightkey' : '') + (b.classList.contains('down') ? ' down' : '');
    box(b, r);
    b.style.borderRadius = Math.min(r.w, r.h) * s / 2 + 'px';
    b.style.fontSize = Math.min(r.w, r.h) * s * (KIND(k) === 'op' ? 0.4 : 0.36) + 'px';
    b.querySelector('.lbl').innerHTML = LABELS[k] || k;
    b.querySelector('.press').style.backgroundImage = drawn ? '' : `url(${Skin.pressSprite[orient][i]})`;
    // round keys: keep the enlarged layers round (a pill / rounded-square key keeps the key's own radius)
    for (const el of b.querySelectorAll('.press, .flash')) el.style.borderRadius = Math.abs(r.w - r.h) < 2 ? '50%' : '';
    b.querySelector('.spr').style.backgroundImage = k === 'clear' && Skin.cSprite[orient] ? `url(${Skin.cSprite[orient]})` : '';
    if (k === 'neg' && !drawn && !Skin.cueSprite[orient]) Skin.cueSprite[orient] = cropImage(img, r, 0.62);
    b.querySelector('.cue').style.backgroundImage = k === 'neg' && !drawn ? `url(${Skin.cueSprite[orient]})` : '';
  });
  hot.forEach((e, i) => { const r = g.buttons[i]; e.style.display = r ? '' : 'none'; if (r) box(e, r); });
  if (!drawn && Skin.clock[orient] === null && g.buttons[0]) {
    const c = findClock(img, g.buttons[0]);
    Skin.clock[orient] = c ? { ...c, url: cropImage(img, { x: c.cx - c.r, y: c.cy - c.r, w: c.r * 2, h: c.r * 2 }, 1) } : false;
  }
  const ck = !drawn && Skin.clock[orient];
  if (ck) Object.assign(clockEl.style, { left: ox + (ck.cx - ck.r) * s + 'px', top: oy + (ck.cy - ck.r) * s + 'px',
    width: ck.r * 2 * s + 'px', height: ck.r * 2 * s + 'px', backgroundImage: `url(${ck.url})` });
  Skin.setClock(Skin.clockCue);
  Skin.cal = calibrate(g, s, ox, oy);
  Skin.setClear(Skin.isC); Skin.setCue(Skin.cue); Skin.setTint(Skin.tintKeys || []); // className was reset above
  Skin.setDisplay(Skin.text.main, Skin.text.expr);
  const v = Skin.view;
  diag.textContent = `${v.inner} scr ${v.screen} top ${v.top} sc ${v.scroll} vv ${v.vv} ${orient}`;
};
// Re-lay out several times after a rotation: the reported sizes settle over a few hundred ms.
let relayoutTimers = [];
// iOS Home Screen apps can be left scrolled by about the status-bar height after rotating, which shifts
// what you see away from where taps land. Scroll back to the top each time before laying out.
function unscroll() {
  if (scrollX || scrollY) scrollTo(0, 0);
  document.documentElement.scrollTop = 0; document.body.scrollTop = 0;
}
function relayoutSoon() {
  relayoutTimers.forEach(clearTimeout);
  relayoutTimers = [0, 100, 300, 700, 1200].map((t) => setTimeout(() => { unscroll(); Skin.layout(); }, t));
}
addEventListener('scroll', unscroll, { passive: true });
addEventListener('resize', relayoutSoon);
addEventListener('orientationchange', relayoutSoon);
if (screen.orientation) screen.orientation.addEventListener('change', relayoutSoon);
document.addEventListener('visibilitychange', () => { if (!document.hidden) relayoutSoon(); });

// ---------- skin files (bundled, or imported into IndexedDB) ----------
const SkinDB = {
  open() {
    return new Promise((ok, fail) => {
      const r = indexedDB.open('calc-skin', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
    });
  },
  async get(k) {
    const db = await this.open();
    return new Promise((ok) => { const q = db.transaction('files').objectStore('files').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); });
  },
  async set(k, v) {
    const db = await this.open();
    return new Promise((ok, fail) => { const t = db.transaction('files', 'readwrite'); t.objectStore('files').put(v, k); t.oncomplete = ok; t.onerror = () => fail(t.error); });
  },
};

// A cleared screenshot (plus optional "typing" one for the C key) → skin data for one orientation.
// The number's position, size and colour come from the screenshot's "0"; if it shows none (Android), from the
// typing screenshot's text; failing that, an estimate just above the keypad.
async function buildSkin(baseSrc, typingSrc, knownGeo, phoneOverride) {
  const base = await loadImage(baseSrc);
  // Imports saved by an older version (before phone types) are analysed again.
  const geo = knownGeo && (knownGeo.v >= 2 || knownGeo === BUILTIN.portrait || knownGeo === BUILTIN.landscape) ? knownGeo : detectSkin(base);
  geo.v = 2;
  if (geo.keys.length !== 20) throw new Error(`Found ${geo.keys.length} keys instead of 20 in that screenshot. Use a screenshot of the calculator itself, without anything covering it.`);
  const orient = geo.w > geo.h ? 'landscape' : 'portrait';
  const phone = phoneOverride && phoneOverride !== 'auto' ? phoneOverride : geo.phone || 'ios';
  let typing = null;
  if (typingSrc) typing = await loadImage(typingSrc);
  if (!geo.zero && typing) {
    const t = detectSkin(typing);
    if (t.zero) { geo.zero = t.zero; geo.textFrom = 'typing'; }
  }
  if (!geo.zero) {
    const row = geo.keys[4].y - geo.keys[0].y || geo.keys[0].h;
    const capH = Math.round(row * 0.32), right = Math.max(...geo.keys.map((k) => k.x + k.w)) - Math.round(geo.w * 0.02);
    const bottom = Math.round(geo.padTop - row * 0.45);
    geo.zero = { x: right - Math.round(capH * 0.7), y: bottom - capH, w: Math.round(capH * 0.7), h: capH, stroke: Math.round(capH * 0.11) };
    geo.textFrom = 'estimate';
  }
  geo.textColor = geo.zero.color || (phone === 'pixel' ? geo.label : null);
  if (geo.textColor && geo.bg) { // the sum line: halfway between text and background
    const p = (c) => c.match(/\d+/g).map(Number), a = p(geo.textColor), b = p(geo.bg);
    geo.exprColor = `rgb(${a.map((v, i) => Math.round((v + b[i]) / 2)).join(',')})`;
  }
  let c = null;
  if (typing) c = cropImage(typing, squareish(geo.keys[LAYOUTS[phone][orient].indexOf('clear')]));
  return { img: base, geo, c, phone };
}

Skin.load = async function (look, keypad = 'auto') {
  Skin.drawn = look === 'drawn';
  Skin.phone = 'ios';
  let files = null;
  if (look === 'mine') { try { files = await SkinDB.get('skin'); } catch { files = null; } }
  for (const orient of ['portrait', 'landscape']) {
    try {
      const f = files && files[orient];
      const r = f ? await buildSkin(f.base, f.typing, f.geo, keypad)
        : await buildSkin(`skin/${orient}.png`, orient === 'portrait' ? 'skin/portrait-typing.png' : null, BUILTIN[orient], 'ios');
      Object.assign(Skin.img, { [orient]: r.img }); Skin.geo[orient] = r.geo; Skin.cSprite[orient] = r.c;
      if (orient === 'portrait' || !files || !files.portrait) Skin.phone = r.phone;
    } catch { Skin.img[orient] = null; Skin.geo[orient] = BUILTIN[orient]; Skin.cSprite[orient] = null; }
    Skin.cueSprite[orient] = null; Skin.clock[orient] = null; Skin.pressSprite[orient] = null;
  }
  // The real "264" result screenshot (bundled skin only) for the alignment check.
  Skin.checkImg = look === 'mine' ? null : await loadImage('skin/portrait-result.png').catch(() => null);
  Skin.layout();
  stage.style.visibility = '';
};

// Import from settings: { portrait: {base, typing}, landscape: {base, typing} } as data URLs (any may be missing).
Skin.import = async function (files) {
  const saved = (await SkinDB.get('skin')) || {};
  const report = [];
  for (const orient of ['portrait', 'landscape']) {
    const f = files[orient];
    if (!f || (!f.base && !f.typing)) continue;
    const base = f.base || (saved[orient] && saved[orient].base);
    if (!base) throw new Error(`Add a cleared ${orient} screenshot first.`);
    const typing = f.typing || (saved[orient] && saved[orient].typing) || null;
    const geo = detectSkin(await loadImage(base));
    const got = geo.w > geo.h ? 'landscape' : 'portrait';
    if (got !== orient) throw new Error(`That ${orient} screenshot looks ${got}.`);
    const r = await buildSkin(base, typing, geo, null);
    saved[orient] = { base, typing, geo: r.geo };
    report.push({ orient, phone: r.phone, keys: r.geo.keys.length, text: r.geo.textFrom || 'screenshot' });
  }
  await SkinDB.set('skin', saved);
  return report;
};

// A small picture of a skin with every detected key outlined and labelled, to check the mapping after importing.
Skin.preview = function (orient) {
  const img = Skin.img[orient], g = Skin.geo[orient];
  if (!img || !g) return null;
  const W = orient === 'portrait' ? 220 : 340, sc = W / g.w;
  const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = Math.round(g.h * sc) * 2;
  const cx = cv.getContext('2d'); cx.scale(2, 2);
  cx.drawImage(img, 0, 0, W, g.h * sc);
  cx.lineWidth = 1.5; cx.strokeStyle = '#30d158'; cx.fillStyle = '#30d158'; cx.font = 'bold 10px -apple-system, sans-serif';
  const names = { back: '⌫', clear: 'AC', pct: '%', paren: '()', neg: '±', '/': '÷', '*': '×', '-': '−' };
  (LAYOUTS[Skin.phone] || LAYOUTS.ios)[orient].forEach((k, i) => {
    const r = g.keys[i]; if (!r) return;
    cx.strokeRect(r.x * sc, r.y * sc, r.w * sc, r.h * sc);
    cx.fillText(names[k] || k, r.x * sc + 3, r.y * sc + 11);
  });
  cx.strokeStyle = '#ff453a';
  if (g.zero) cx.strokeRect(g.zero.x * sc, g.zero.y * sc, g.zero.w * sc, g.zero.h * sc);
  g.buttons.forEach((r) => { cx.strokeStyle = '#0a84ff'; cx.strokeRect(r.x * sc, r.y * sc, r.w * sc, r.h * sc); });
  cv.style.width = W + 'px';
  return cv;
};

Skin.layout();
