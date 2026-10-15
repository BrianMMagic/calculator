'use strict';
const APP_VERSION = '1.2.1'; // shown in Settings. Each release also bumps the build number: ?v= in index.html and the cache name in sw.js
// Toxic+-style force calculator. See HOW-TOXIC-PLUS-WORKS.md for the behaviour this follows.

// ---------- settings ----------
const SLOT_NAMES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Date/Time', 'Adhoc', 'Replacement', 'Confederate', 'No force'];
const DATE_SLOT = 10, ADHOC_SLOT = 11, REPL_SLOT = 12, CONFED_SLOT = 13, NOFORCE_SLOT = 14;
const DEFAULT_PEEK = ['All Fields', 'Zodiac', 'ChineseZodiac', 'Birthdate (long)', 'Age', 'Celebrity', 'City', 'Phone',
  'NoForceListItem', 'Remainder Hint', 'Confederate (+/-)', 'Calculation Total', 'Force Number (n)', 'Traits', 'ChineseTraits'];
const SIGNS_TEXT = [
  'Capricorn (Earth)|disciplined, responsible, ambitious|rigid, pessimistic, unforgiving',
  'Aquarius (Air)|original, independent, humanitarian|aloof, unpredictable, detached',
  'Pisces (Water)|compassionate, artistic, gentle|escapist, overly trusting, fearful',
  'Aries (Fire)|courageous, energetic, direct|impatient, impulsive, short-tempered',
  'Taurus (Earth)|reliable, patient, devoted|stubborn, possessive, set in their ways',
  'Gemini (Air)|curious, witty, adaptable|restless, indecisive, inconsistent',
  'Cancer (Water)|loyal, caring, intuitive|moody, oversensitive, clingy',
  'Leo (Fire)|generous, warm, confident|proud, dramatic, attention-seeking',
  'Virgo (Earth)|practical, analytical, hardworking|critical, worrisome, perfectionist',
  'Libra (Air)|diplomatic, fair-minded, sociable|indecisive, conflict-avoiding, self-pitying',
  'Scorpio (Water)|passionate, resourceful, determined|jealous, secretive, resentful',
  'Sagittarius (Fire)|optimistic, adventurous, honest|careless, tactless, impatient',
].join('\n');
const CHINESE_TEXT = [
  'Rat|quick-witted, resourceful, versatile', 'Ox|diligent, dependable, strong', 'Tiger|brave, competitive, confident',
  'Rabbit|quiet, elegant, kind', 'Dragon|confident, intelligent, enthusiastic', 'Snake|wise, enigmatic, intuitive',
  'Horse|animated, active, energetic', 'Goat|calm, gentle, sympathetic', 'Monkey|sharp, smart, curious',
  'Rooster|observant, hardworking, courageous', 'Dog|loyal, honest, prudent', 'Pig|compassionate, generous, diligent',
].join('\n');

function defaultSlots() {
  const slots = SLOT_NAMES.map(() => ({ force: '', note: '', fields: [], peek: [...DEFAULT_PEEK], speech: [] }));
  Object.assign(slots[0], { force: '2742', fields: ['Day', 'Month', 'Year'] });
  Object.assign(slots[DATE_SLOT], { force: 'dMhmm+60', fields: ['Day', 'Month', 'Year'] });
  Object.assign(slots[REPL_SLOT], { force: '07;39;43;51', fields: ['Day', 'Month', 'Year'] });
  Object.assign(slots[CONFED_SLOT], { fields: ['Day', 'Month', 'Year', 'Number', 'Number'] });
  Object.assign(slots[NOFORCE_SLOT], { force: 'No force', fields: ['Day', 'Month', 'Year'] });
  return slots;
}
const DEFAULTS = {
  current: 0, slots: defaultSlots(), adhoc: {}, replIdx: 0,
  peek: { zero: 1, dot: 0, eq: 1, tl: 0, tr: 0 }, autoHide: false, traitsOnZero: true, invert: false, peekFont: 13,
  showTips: true, lockForceKeys: false, quickSet: false, adhocKeys: false, confirmAdhoc: false, hideConfed: false,
  dateOrder: /^en-US|^en-CA/.test(navigator.language) ? 'MDY' : 'DMY', maxDigits: 16, tapLabel: 'off',
  speech: false, speechRate: 1, splitAbove: 9999, thump: false,
  history: [], look: 'builtin', keypad: 'auto', remCue: 'clock', textScale: 100, textDX: 0, textDY: 0, textWeight: 'auto', exprOnForce: 'hide',
  lists: Array.from({ length: 20 }, () => ({ name: '', text: '' })), signs: SIGNS_TEXT, chinese: CHINESE_TEXT, log: '',
};

function loadSettings() {
  let s;
  try { s = JSON.parse(localStorage.getItem('txp-settings') || 'null'); } catch { s = null; }
  if (!s) s = migrateOld();
  const out = { ...DEFAULTS, ...(s || {}) };
  out.peek = { ...DEFAULTS.peek, ...(out.peek || {}) };
  if (!Array.isArray(out.slots) || out.slots.length !== SLOT_NAMES.length) out.slots = defaultSlots();
  while (out.lists.length < 20) out.lists.push({ name: '', text: '' });
  return out;
}
// Carry the force number, date format and lists over from the first version of this app.
function migrateOld() {
  let o;
  try { o = JSON.parse(localStorage.getItem('tx-settings') || 'null'); } catch { o = null; }
  if (!o) return null;
  const s = { slots: defaultSlots(), lists: DEFAULTS.lists.map((l) => ({ ...l })) };
  if (o.number) s.slots[0].force = String(o.number);
  if (o.type === 'date') {
    const f = { MMDDYYYY: 'MMddyyyy', DDMMYYYY: 'ddMMyyyy', MMDDYY: 'MMddyy', DDMMYY: 'ddMMyy' }[o.datefmt] || 'MMddyyyy';
    const t = o.time === 'HHMM' ? 'HHmm' : o.time === 'hhmm' ? 'hhmm' : '';
    s.slots[DATE_SLOT].force = f + t + (Number(o.offset) ? '+' + Number(o.offset) * 60 : '');
    s.current = DATE_SLOT;
  }
  String(o.lists || '').split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length > 1).slice(0, 20)
    .forEach(([name, ...items], i) => { s.lists[i] = { name, text: items.map((it, j) => `${j + 1}|${it}`).join('\n') }; });
  return s;
}
const S = loadSettings();
function saveSettings() {
  try { localStorage.setItem('txp-settings', JSON.stringify(S)); } catch {}
}

// ---------- calculator state ----------
let tokens = [];          // [num, op, num, op, ...] as strings, real values
let entry = '';           // operand being typed
let pendingOp = null;
let justEvaluated = false;
let lastResult = '0';     // what "=" last displayed (chaining continues from it)
let lastReal = null;      // real total at the last "="
let items = [];           // data items, in order: stored on each operator and on "="
let forceShown = false;   // force (or final result) has been produced since the last AC
let zdeLock = false;      // hidden lock on short 0 . = after the force (until C/AC or a 1-9 digit)
let rem = null;           // remainder force: { diff, sign, digits, pos, armed }
let remDone = false;      // remainder entry has been typed (force arrives on the next "=")
let confed = null;        // { add, mul } for the confederate label
let lastExpr = '';        // the grey sum line shown above a result
let repeatOp = null;      // [op, operand] repeated by pressing "=" again (5×5=25, = → 125)
let chained = false;      // tokens[0] is the previous result, not a typed data item

const $ = (id) => document.getElementById(id);
const display = $('display'), peekEl = $('peek'), noteEl = $('note'), extraEl = $('extra');
const slot = () => S.slots[S.current];

// ---------- numbers ----------
const isInt = (s) => /^-?\d+$/.test(s);
function plain(v) {
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'number') {
    if (!isFinite(v)) return 'Error';
    const n = Number(v.toPrecision(15));
    return Math.abs(n) < 1e21 ? n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 15 }) : String(n);
  }
  return String(v);
}
// Standard precedence (× ÷ before + −). Whole numbers without ÷ use BigInt, so long honest totals stay exact.
function resolvePct(t) {
  if (!t.some((x, i) => i % 2 === 0 && /%$/.test(x))) return t;
  const out = [];
  t.forEach((x, i) => {
    if (i % 2 === 0 && /%$/.test(x)) {
      const p = Number(x.slice(0, -1)) / 100, op = out[out.length - 1];
      x = i > 0 && (op === '+' || op === '-') ? plain(Number(plain(evaluate(out.slice(0, -1)))) * p) : plain(p);
    }
    out.push(x);
  });
  return out;
}
function evaluate(t) {
  if (!t.length) return 0;
  t = resolvePct(t);
  if (t.every((x, i) => (i % 2 ? x !== '/' : isInt(x)))) {
    const terms = [BigInt(t[0])];
    for (let i = 1; i < t.length; i += 2) {
      const n = BigInt(t[i + 1]);
      if (t[i] === '*') terms.push(terms.pop() * n); else terms.push(t[i] === '-' ? -n : n);
    }
    return terms.reduce((a, b) => a + b, 0n);
  }
  const terms = [Number(t[0])];
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], n = Number(t[i + 1]);
    if (op === '*') terms.push(terms.pop() * n);
    else if (op === '/') terms.push(terms.pop() / n);
    else terms.push(op === '-' ? -n : n);
  }
  return terms.reduce((a, b) => a + b, 0);
}
function sub(a, b) { // a − b, exact for whole numbers
  a = plain(a); b = plain(b);
  return isInt(a) && isInt(b) ? String(BigInt(a) - BigInt(b)) : plain(Number(a) - Number(b));
}

function format(v) {
  const s = plain(v);
  if (s === 'Error' || /e/.test(s)) return s === 'Error' ? s : Number(s).toExponential(5).replace('e+', 'e');
  const neg = s.startsWith('-'); const [i, f] = s.replace('-', '').split('.');
  if ((i || '').replace(/^0+/, '').length > S.maxDigits) return Number(s).toExponential(5).replace('e+', 'e');
  return (neg ? '-' : '') + (i || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f !== undefined ? '.' + f : '');
}
const digitsOf = (s) => String(s).replace(/[^\d]/g, '');

// Remainder cue: after the subtotal "=", the slash in +/− tilts left (add) or right (subtract) until an operator is pressed.
function remCue() {
  Skin.cueStyle = S.remCue;
  Skin.setCue(rem && !rem.armed ? (rem.diff.startsWith('-') ? 'sub' : 'add') : '');
  // Clock: how many taps (counting down as they tap) and whether to add or subtract.
  if (rem && !rem.armed) Skin.setClock({ n: rem.diff.replace('-', '').length, sub: rem.diff.startsWith('-') });
  else if (rem && rem.armed) Skin.setClock({ n: rem.digits.length - rem.pos, sub: pendingOp === '-' });
  else Skin.setClock(null);
}

// Like iOS 26+: while typing, the main line shows the whole sum (11×24); after "=", the result,
// with the sum small and grey above it.
const OPS = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const minus = (s) => s.replace(/^-/, '−');
const exprText = (t) => t.map((x, i) => (i % 2 ? OPS[x] : minus(format(x)))).join('');
function mainText() {
  if (justEvaluated) return minus(format(lastResult));
  const t = tokens.concat(entry !== '' ? [entry] : []);
  return t.length ? exprText(t) : '0';
}
// render() shows the calculator state; render(v) shows a value directly (force selection, etc.).
function render(v) {
  remCue();
  Skin.setDisplay(v !== undefined ? format(v) : mainText(), v === undefined && justEvaluated ? lastExpr : '');
  Skin.setClear(v === undefined && !justEvaluated && entry !== '');
}
function selectOp() {} // iOS 26+ no longer highlights the operator key; the sum line shows it

// ---------- forces ----------
function forceSpec(i = S.current) {
  const raw = String(S.adhoc[i] ?? S.slots[i].force ?? '').trim();
  const tag = raw.match(/\|\s*(\??[^|]+?)\s*$/);
  const list = tag ? tag[1] : null;
  if (i === NOFORCE_SLOT || /booktest|no ?force/i.test(raw)) return { type: 'nof', list };
  if (i === CONFED_SLOT) return { type: 'confed', value: digitsOf(raw) };
  if (i === REPL_SLOT) return { type: 'repl', values: raw.split(';').map(digitsOf).filter(Boolean) };
  if (/^dayssincebirth$/i.test(raw)) return { type: 'dsb', forcing: true };
  if (/[dMyHhm]/.test(raw)) return { type: 'date', fmt: raw, forcing: true };
  if (/\d/.test(raw)) return { type: 'num', value: raw.replace(/[^\d.]/g, ''), forcing: true };
  return { type: 'none' }; // empty slot: plain calculator
}

// Date/time format: d dd M MM yy yyyy h hh H HH m mm (s ss), literal digits, optional "+seconds".
function dateForce(fmt, when = Date.now()) {
  const m = fmt.match(/^(.*?)(?:\+\s*(\d+))?\s*$/);
  const d = new Date(when + (Number(m[2]) || 0) * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const h12 = d.getHours() % 12 || 12;
  const map = { yyyy: d.getFullYear(), yy: p(d.getFullYear() % 100), MM: p(d.getMonth() + 1), M: d.getMonth() + 1,
    dd: p(d.getDate()), d: d.getDate(), HH: p(d.getHours()), H: d.getHours(), hh: p(h12), h: h12,
    mm: p(d.getMinutes()), m: d.getMinutes(), ss: p(d.getSeconds()), s: d.getSeconds() };
  const out = m[1].replace(/yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|\d+|./g, (t) => (t in map ? map[t] : /\d/.test(t) ? t : ''));
  return out.replace(/^0+(?=\d)/, ''); // a calculator drops the leading zero
}

function targetValue(spec = forceSpec()) {
  if (spec.type === 'num' || spec.type === 'confed') return spec.value || null;
  if (spec.type === 'date') return dateForce(spec.fmt);
  if (spec.type === 'dsb') { const p = collect().people[1]; return p && p.y ? String(daysSince(p)) : null; }
  if (spec.type === 'repl') return spec.values.length ? spec.values[S.replIdx % spec.values.length] : null;
  return null;
}
function replaceTail(real, v) {
  const s = plain(real);
  if (!isInt(s)) return s;
  const neg = s.startsWith('-'), body = s.replace('-', '');
  const out = body.length > v.length ? body.slice(0, body.length - v.length) + v : v;
  return (neg ? '-' : '') + out.replace(/^0+(?=\d)/, '');
}
const remainderIndex = () => slot().fields.findIndex((f) => /^remainder$/i.test(f.trim()));

// ---------- key handling ----------
function digit(d) {
  if (rem && rem.armed) return; // remainder entry is being typed for them; extra taps do nothing
  if (zdeLock && (d === '0' || d === '.')) return;
  if (zdeLock && /[1-9]/.test(d)) zdeLock = false;
  if (justEvaluated) newCalc();
  if (d === '.' && entry.includes('.')) return;
  if (digitsOf(entry).length >= S.maxDigits) return;
  if (entry.endsWith('%')) return;
  entry = ((entry === '0' || entry === '-0') && d !== '.' ? entry.slice(0, -1) : entry) + d;
  if (entry === '.') entry = '0.';
  render();
  selectOp(null);
}

function operator(op) {
  if (entry !== '') {
    items.push(entry); tokens.push(entry); entry = '';
    if (rem && rem.armed) { remDone = true; rem = null; }
  } else if (justEvaluated) {
    tokens = [lastResult]; chained = true;
  } else if (!tokens.length) {
    tokens = ['0']; chained = true;
  } else {
    tokens.pop(); // change operator
  }
  justEvaluated = false;
  tokens.push(op); pendingOp = op;
  // Remainder force: "+" (or "−") straight after the subtotal arms auto-entry of the remainder.
  if (rem && !rem.armed && tokens.length === 2 && (op === '+' || op === '-')) {
    const need = op === '+' ? rem.diff : sub('0', rem.diff);
    if (!need.startsWith('-') && need !== '0') { rem.armed = true; rem.digits = need; rem.pos = 0; speakRemainder(); }
    else rem = null;
  }
  render();
}

function remTap() {
  if (!rem || !rem.armed || rem.pos >= rem.digits.length) return false;
  entry += rem.digits[rem.pos++];
  render();
  selectOp(null);
  speakRemainder();
  return true;
}

function equals() {
  if (zdeLock) return;
  if (entry === '' && !tokens.length) {
    if (justEvaluated && repeatOp) { // repeat the last operation
      const t = [lastResult, ...repeatOp], v = evaluate(t);
      lastReal = plain(v); lastResult = plain(v); lastExpr = exprText(t);
      render(); addHistory(lastExpr, lastResult);
    }
    return;
  }
  if (entry !== '') items.push(entry);
  const t = tokens.concat(entry !== '' ? [entry] : []);
  if (t.length % 2 === 0) t.pop();
  const real = evaluate(t);
  let shown = real, final = false;
  const spec = forceSpec(), remIdx = remainderIndex(), need = slot().fields.length;

  if (!forceShown) {
    if (remIdx >= 0 && spec.forcing) {
      if (remDone || (rem && rem.armed)) final = true; // the remainder went in: the honest total is the force
      else if (items.length >= remIdx) {
        const T = targetValue(spec);
        if (T !== null) {
          const diff = sub(T, real);
          rem = diff === '0' ? null : { diff, armed: false };
          if (diff === '0') final = true; else speakRemainder();
        }
      }
    } else if (spec.type === 'confed') {
      const T = spec.value;
      if (T) {
        const add = sub(T, real);
        confed = add === '0' ? null : { add, mul: Number(real) ? plain(Number((Number(T) / Number(real)).toPrecision(8))) : null };
        final = add === '0';
      }
    } else if (items.length >= need && spec.type !== 'none') {
      final = true;
      if (spec.type === 'repl') {
        const v = targetValue(spec);
        if (v) { shown = replaceTail(real, v); S.replIdx = (S.replIdx + 1) % spec.values.length; }
      } else if (spec.forcing) {
        const T = targetValue(spec);
        if (T !== null) shown = T;
      }
    }
  }

  lastReal = plain(real);
  lastResult = plain(shown);
  // A forced result doesn't match its sum, so the sum line is hidden unless set to show.
  lastExpr = plain(shown) === plain(real) || S.exprOnForce === 'show' ? exprText(t) : '';
  repeatOp = t.length >= 3 ? t.slice(-2) : null;
  tokens = []; entry = ''; pendingOp = null; justEvaluated = true; chained = false;
  if (rem && rem.armed) rem = null;
  render();
  addHistory(lastExpr, lastResult);
  showConfed();
  if (final) finish(spec);
}

function finish(spec) {
  forceShown = true; remDone = false; rem = null; remCue();
  if (spec.forcing || spec.type === 'repl') zdeLock = true;
  const pk = buildPeek();
  log(pk);
  speakItems(slot().speech);
  if (S.thump) thump(lastReal);
  if (S.adhoc[S.current] !== undefined) delete S.adhoc[S.current]; // one-shot adhoc numbers
  if (S.current === ADHOC_SLOT && S.slots[ADHOC_SLOT].force) {
    S.slots[ADHOC_SLOT].force = '';
    S.current = S.prevSlot ?? 0;
  }
  saveSettings();
}

// iOS 26+: "C" (shown while a number is being typed) clears just that number; "AC" clears the whole calculation.
// Holding C, or holding ⌫, also clears everything.
function clear() {
  stopSelector();
  zdeLock = false;
  if (entry !== '') {
    entry = '';
    if (rem && rem.armed) rem.pos = 0; // they can tap the remainder in again
    render(); return;
  }
  resetAll(); render();
}
function clearAll() { stopSelector(); zdeLock = false; resetAll(); render(); }
function newCalc() { tokens = []; entry = ''; pendingOp = null; justEvaluated = false; chained = false; lastExpr = ''; repeatOp = null; }
function resetAll() {
  newCalc(); items = []; forceShown = false; rem = null; remDone = false; confed = null; lastReal = null;
  lastResult = '0'; zdeLock = false; noteEl.textContent = ''; showConfed();
}

function unary(kind) {
  if (justEvaluated) { const r = lastResult; newCalc(); entry = r; }
  if (kind === 'pct') {
    if (entry === '') return;
    entry = entry.endsWith('%') ? entry.slice(0, -1) : entry + '%';
  } else entry = entry === '' ? '-0' : entry.startsWith('-') ? entry.slice(1) : '-' + entry;
  render();
}

function backspace() {
  if (justEvaluated || (rem && rem.armed)) return;
  if (entry !== '') {
    entry = entry.slice(0, -1);
    if (entry === '-') entry = '';
  } else if (tokens.length) { // remove the operator and go back to editing the number before it
    tokens.pop();
    entry = tokens.pop() ?? '';
    if (!tokens.length && chained) { chained = false; if (entry === '0') entry = ''; }
    else items.pop();
    pendingOp = tokens.length ? tokens[tokens.length - 1] : null;
  }
  render();
}

function press(k) {
  if (sel.active && (k === 'neg' || k === 'pct' || k === 'paren')) { cycleSlot(k === 'pct' ? -1 : 1); return; }
  if (sel.timer || sel.tips) { stopSelector(); if (k === 'clear') { resetAll(); render(); return; } }
  if (k === '-' && speaking()) { toggleSpeechPause(); return; }
  if (rem && rem.armed && k !== '=' && k !== 'clear' && !'+-*/'.includes(k)) { remTap(); return; }
  if (/^[0-9.]$/.test(k)) digit(k);
  else if ('+-*/'.includes(k)) operator(k);
  else if (k === '=') equals();
  else if (k === 'clear') clear();
  else if (k === 'back') backspace();
  else if (k === 'paren') return; // ( ) on Android: not supported yet
  else unary(k);
}

// ---------- force selector (+/− and % keys) ----------
const sel = { active: false, timer: null, tips: null };
const slotUsable = (i) => i === NOFORCE_SLOT || String(S.adhoc[i] ?? S.slots[i].force).trim() !== '';
function slotLabel(i) { return `#${i + 1} ${i >= 10 ? SLOT_NAMES[i] : ''}`.trim(); }
function showSlot() {
  const spec = forceSpec();
  const v = spec.type === 'nof' ? '0' : targetValue(spec) ?? '0';
  newCalc(); entry = ''; render(v);
  noteEl.textContent = [slotLabel(S.current), slot().note].filter(Boolean).join('  ');
}
function unlockSelector() {
  sel.active = true;
  showSlot();
  armRelock();
}
function cycleSlot(dir) {
  let i = S.current;
  for (let n = 0; n < SLOT_NAMES.length; n++) {
    i = (i + dir + SLOT_NAMES.length) % SLOT_NAMES.length;
    if (slotUsable(i)) break;
  }
  S.current = i;
  if (i === REPL_SLOT) S.replIdx = 0; // reselecting Replacement restarts its list
  saveSettings();
  showSlot();
  armRelock();
}
function armRelock() {
  clearTimeout(sel.timer);
  sel.timer = setTimeout(() => {
    sel.active = false; sel.timer = null;
    if (S.showTips) {
      const f = slot().fields, r = remainderIndex();
      noteEl.textContent = [slotLabel(S.current), slot().note].filter(Boolean).join('  ') + '\n' +
        (f.length ? f.join(' · ') : 'no fields') + `  (${r >= 0 ? r + ' then remainder' : f.length + ' before force'})`;
      sel.tips = setTimeout(() => { stopSelector(); resetAll(); render(); }, 2000);
    } else { stopSelector(); resetAll(); render(); }
  }, 1000);
}
function stopSelector() {
  clearTimeout(sel.timer); clearTimeout(sel.tips);
  sel.active = false; sel.timer = null; sel.tips = null; noteEl.textContent = '';
}
function selectSlotDirect(i) {
  S.current = i; if (i === REPL_SLOT) S.replIdx = 0; saveSettings();
  resetAll(); stopSelector(); showSlot(); armRelock(); // same note/tips sequence as the +/− selector
  buzz();
}

const displayedDigits = () => digitsOf(entry !== '' ? entry : (justEvaluated ? lastResult : '0'));

function setAdhoc() {
  const v = displayedDigits();
  if (!Number(v)) return;
  if (S.current !== ADHOC_SLOT) S.prevSlot = S.current;
  S.slots[ADHOC_SLOT].force = v; S.current = ADHOC_SLOT;
  saveSettings(); resetAll(); render(); buzz();
}
function numberLongPress(k) {
  const i = Number(k) - 1, v = displayedDigits();
  const zero = !Number(v);
  if (S.adhocKeys && !zero) {
    if (S.confirmAdhoc && !confirm(`Use ${v} once as force #${k}?`)) return;
    S.adhoc[i] = v; S.current = i; saveSettings(); resetAll(); render(); buzz();
  } else if (S.quickSet && (zero || !S.adhocKeys)) selectSlotDirect(i);
}
function showIntendedForce() {
  const v = targetValue();
  if (v === null) return;
  newCalc(); lastResult = v; justEvaluated = true; lastExpr = ''; render();
}

// ---------- birthdays & lookups ----------
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ANIMALS = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
const CN_ELEM = ['Wood', 'Wood', 'Fire', 'Fire', 'Earth', 'Earth', 'Metal', 'Metal', 'Water', 'Water'];
const SIGN_ENDS = [[1, 19], [2, 18], [3, 20], [4, 19], [5, 20], [6, 20], [7, 22], [8, 22], [9, 22], [10, 22], [11, 21], [12, 21]]; // Capricorn first

function signIndex(m, d) {
  const i = SIGN_ENDS.findIndex(([mm, dd]) => m === mm && d <= dd);
  return i >= 0 ? i : m % 12;
}
function signInfo(m, d) {
  const lines = S.signs.split('\n');
  const [name, pos, neg] = (lines[signIndex(m, d)] || '').split('|');
  return { name: (name || '').trim(), pos: (pos || '').trim(), neg: (neg || '').trim() };
}
function fixYear(y) {
  y = Number(y);
  if (y < 100) y += y > new Date().getFullYear() % 100 ? 1900 : 2000;
  return y;
}
function applyBirth(p, kind, v) {
  const s = digitsOf(v);
  const set = (d, m, y, order) => { p.d = Number(d); p.m = Number(m); if (y) p.y = fixYear(y); p.order = order; };
  if (kind === 'day') { p.d = Number(s); p.order ??= 'dm'; }
  else if (kind === 'month') { p.m = Number(s); p.order ??= 'md'; }
  else if (kind === 'year') p.y = fixYear(s);
  else if (kind === 'age') p.age = Number(s);
  else if (kind === 'ddmm' || kind === 'mmdd') {
    const x = s.padStart(4, '0');
    kind === 'ddmm' ? set(x.slice(0, 2), x.slice(2, 4), null, 'dm') : set(x.slice(2, 4), x.slice(0, 2), null, 'md');
  } else {
    const x = s.length <= 6 ? s.padStart(6, '0') : s.padStart(8, '0');
    const a = x.slice(0, 2), b = x.slice(2, 4), y = x.slice(4);
    kind === 'ddmmyy' ? set(a, b, y, 'dm') : set(b, a, y, 'md');
  }
}
function finishPerson(p) {
  if (!p.d || !p.m) return null;
  const now = new Date();
  if (!p.y && p.age) {
    const hadBirthday = now.getMonth() + 1 > p.m || (now.getMonth() + 1 === p.m && now.getDate() >= p.d);
    p.y = now.getFullYear() - p.age - (hadBirthday ? 0 : 1);
  }
  const dt = new Date(p.y || 2000, p.m - 1, p.d);
  if (dt.getMonth() !== p.m - 1 || dt.getDate() !== p.d) return null;
  return p;
}
function daysSince(p) { return Math.floor((Date.now() - new Date(p.y, p.m - 1, p.d)) / 86400000); }
function ageOf(p) {
  const now = new Date(); let a = now.getFullYear() - p.y;
  if (now.getMonth() + 1 < p.m || (now.getMonth() + 1 === p.m && now.getDate() < p.d)) a--;
  return a;
}
function shortDate(p) {
  const dd = String(p.d).padStart(2, '0'), mm = String(p.m).padStart(2, '0');
  return (S.dateOrder === 'MDY' ? `${mm}/${dd}` : `${dd}/${mm}`) + (p.y ? '/' + p.y : '');
}
function longDate(p) {
  const dow = p.y ? DAYS[new Date(p.y, p.m - 1, p.d).getDay()] + ' ' : '';
  return dow + (S.dateOrder === 'MDY' ? `${MONTHS[p.m - 1]} ${p.d}` : `${p.d} ${MONTHS[p.m - 1]}`) + (p.y ? ' ' + p.y : '');
}
function chinese(p) {
  // Lunar New Year falls Jan 21 – Feb 20, so early-year births are marked "~" (could be the previous animal).
  const early = p.m === 1 || (p.m === 2 && p.d <= 20);
  const i = ((p.y - 4) % 12 + 12) % 12;
  const traits = (S.chinese.split('\n')[i] || '').split('|')[1] || '';
  return { name: `${early ? '~' : ''}${CN_ELEM[((p.y - 4) % 10 + 10) % 10]} ${ANIMALS[i]}`, traits: traits.trim() };
}

// Custom lists: "index|value" lines. A list is referred to by number (1-20) or by name.
const listCache = new Map();
function findList(ref) {
  if (ref === null || ref === undefined) return null;
  ref = String(ref).trim().replace(/^\?/, '');
  if (/^\d+$/.test(ref)) return S.lists[Number(ref) - 1] || null;
  return S.lists.find((l) => l.name && l.name.trim() === ref) || null;
}
function lookup(list, v) {
  if (!list || !list.text) return null;
  let map = listCache.get(list.text);
  if (!map) {
    map = new Map();
    for (const line of list.text.split('\n')) {
      const i = line.indexOf('|');
      if (i > 0) map.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
    }
    listCache.set(list.text, map);
  }
  const key = String(v).trim();
  if (map.has(key)) return map.get(key);
  for (const [k, val] of map) if (k !== '' && !isNaN(k) && !isNaN(key) && Number(k) === Number(key)) return val;
  return null;
}

function collect() {
  const fields = slot().fields;
  const vals = items.concat(entry !== '' && !justEvaluated ? [entry] : []);
  const people = { 1: {}, 2: {}, 3: {} };
  const rows = []; const phone = {}; let city = null;
  vals.forEach((v, i) => {
    const raw = fields[i];
    if (raw === undefined) { rows.push({ name: '+', v, extra: null }); return; }
    const bar = raw.lastIndexOf('|');
    const name = (bar > 0 ? raw.slice(0, bar) : raw).trim(), listRef = bar > 0 ? raw.slice(bar + 1) : null;
    const kw = name.toLowerCase().replace(/\s+/g, '');
    let m, extra = null;
    if ((m = kw.match(/^(day|month|year|age|ddmm|mmdd|ddmmyy|mmddyy)([1-3])?$/))) applyBirth(people[m[2] || 1], m[1], v);
    else if ((m = kw.match(/^phone([1-3])$/))) phone[m[1]] = digitsOf(v);
    else if (/^(post|postcode|postalcode|zip|zipcode)$/.test(kw)) {
      const L = S.lists.find((l) => /city$/i.test(l.name.trim()));
      city = L ? lookup(L, v) : null;
    }
    if (listRef) extra = lookup(findList(listRef), v);
    else if (!m) { const L = findList(name); if (L) extra = lookup(L, v); if (/city$/i.test(name) && extra) city = extra; }
    rows.push({ name: raw, v, extra });
  });
  for (const k of [1, 2, 3]) people[k] = finishPerson(people[k]);
  const multi = [2, 3].some((k) => people[k]);
  return { rows, people, multi, city, phone: ['1', '2', '3'].map((k) => phone[k] || '').join('') };
}

// ---------- peek ----------
function remainderHint() {
  if (rem && rem.armed) return `${rem.digits.length - rem.pos} to go`;
  if (rem) return `${rem.diff.startsWith('-') ? 'Subtract' : 'Add'} ${digitsOf(rem.diff).length} digits`;
  return null;
}
function itemLines(item, c) {
  const key = item.toLowerCase().replace(/[\s#()]/g, '');
  if (key === '' || key === '-blankline-' || key === 'blankline') return [''];
  const m = key.match(/^(celebrity|zodiac|chinesezodiac|age|dayssincebirth|dayofweek|birthdate|birthdatelong|traits|chinesetraits)([1-3])?$/);
  if (m) {
    const who = m[2] ? [Number(m[2])] : [1, 2, 3];
    const out = [];
    for (const n of who) {
      const p = c.people[n];
      if (!p || (!m[2] && n > 1 && !c.multi)) continue;
      const tag = c.multi ? `${n}: ` : '';
      let s = null;
      if (m[1] === 'zodiac') s = signInfo(p.m, p.d).name;
      else if (m[1] === 'celebrity') {
        const key = p.order === 'md' ? String(p.m).padStart(2, '0') + String(p.d).padStart(2, '0')
          : String(p.d).padStart(2, '0') + String(p.m).padStart(2, '0');
        s = lookup(findList('Celebrity'), key);
      } else if (m[1] === 'birthdate') s = shortDate(p);
      else if (m[1] === 'birthdatelong') s = longDate(p);
      else if (m[1] === 'traits') { const t = signInfo(p.m, p.d); s = `${t.name}\n+ ${t.pos}\n− ${t.neg}`; }
      else if (p.y) {
        if (m[1] === 'chinesezodiac') s = chinese(p).name;
        else if (m[1] === 'chinesetraits') { const ch = chinese(p); s = `${ch.name}\n${ch.traits}`; }
        else if (m[1] === 'age') s = `Age ${ageOf(p)}`;
        else if (m[1] === 'dayssincebirth') s = `${daysSince(p).toLocaleString('en-US')} days`;
        else if (m[1] === 'dayofweek') s = `Born ${DAYS[new Date(p.y, p.m - 1, p.d).getDay()]}`;
      }
      if (s) out.push(tag + s);
    }
    return out;
  }
  const f = key.match(/^field(\d+)$/);
  const row = (r) => `${r.name}: ${r.v}${r.extra ? ' → ' + r.extra : ''}`;
  if (f) { const r = c.rows[Number(f[1]) - 1]; return r ? [row(r)] : []; }
  switch (key) {
    case 'allfields': return c.rows.map(row);
    case 'city': return c.city ? [c.city] : [];
    case 'phone': return c.phone ? [c.phone] : [];
    case 'calculationtotal': return lastReal !== null ? [`Total ${format(lastReal)}`] : [];
    case 'forcenumbern': {
      const v = targetValue();
      return v ? [`Force ${format(v)} (${digitsOf(v).length})`] : [];
    }
    case 'confederate+/-': return confed ? [(confed.add.startsWith('-') ? '− ' + confed.add.slice(1) : '+ ' + confed.add)] : [];
    case 'confederatex': return confed && confed.mul ? ['× ' + confed.mul] : [];
    case 'noforcelistitem': {
      const spec = forceSpec();
      const v = spec.type === 'nof' && spec.list && lastReal !== null ? lookup(findList(spec.list), lastReal) : null;
      return v ? [v] : [];
    }
    case 'remainderhint': case 'remaindertogo': { const h = remainderHint(); return h ? [h] : []; }
    default: return [];
  }
}
function buildPeek() {
  const c = collect();
  const main = [], pages = [];
  for (const item of slot().peek) {
    const isTrait = /^(chinese)?traits\s*#?\s*[1-3]?$/i.test(item.trim());
    const lines = itemLines(item, c);
    if (isTrait) lines.forEach((l) => pages.push(l.split('\n')));
    else main.push(...lines);
  }
  if (!main.length) main.push(`${slotLabel(S.current)} — nothing collected yet`);
  return { main, pages };
}

const peekState = { on: false, page: 0, pages: [] };
function showPeek(traitsFirst = false) {
  const pk = buildPeek();
  peekState.pages = [pk.main, ...pk.pages];
  peekState.page = traitsFirst && pk.pages.length ? 1 : 0;
  peekState.on = true;
  peekEl.classList.toggle('invert', !!S.invert);
  peekEl.style.fontSize = S.peekFont + 'px';
  drawPeek();
  peekEl.classList.add('on');
}
function drawPeek() {
  const n = peekState.pages.length;
  peekEl.textContent = peekState.pages[peekState.page].join('\n') + (n > 1 ? `\n\n${peekState.page + 1}/${n}` : '');
}
function hidePeek() { peekState.on = false; peekEl.classList.remove('on'); }

// ---------- log ----------
function log(pk) {
  const stamp = new Date().toLocaleString();
  const block = [`— ${stamp} · ${slotLabel(S.current)}`, ...pk.main, ...pk.pages.flat()].join('\n');
  S.log = (block + '\n\n' + (S.log || '')).slice(0, 60000);
}

// ---------- speech (reaches a Bluetooth earpiece like any audio) ----------
const synth = window.speechSynthesis;
const speaking = () => !!(S.speech && synth && (synth.speaking || synth.paused));
function speakText(text) {
  if (!S.speech || !synth || !text) return;
  synth.cancel();
  const say = text.replace(/\d[\d,]*(\.\d+)?/g, (n) => (Number(n.replace(/,/g, '')) > S.splitAbove ? n.replace(/\D/g, '').split('').join(' ') : n));
  for (const part of say.split('\n').filter(Boolean)) {
    const u = new SpeechSynthesisUtterance(part);
    u.rate = Number(S.speechRate) || 1;
    synth.speak(u); // one utterance per item gives a natural pause between items
  }
}
let lastSpoken = '';
function speakItems(list) {
  if (!list || !list.length) return;
  const c = collect();
  lastSpoken = list.flatMap((it) => itemLines(it, c)).join('\n').replace(/[−→×]/g, (ch) => ({ '−': 'minus', '→': ',', '×': 'times' }[ch]));
  speakText(lastSpoken);
}
function speakRemainder() {
  const want = slot().speech.map((s) => s.toLowerCase().replace(/\s/g, ''));
  if (rem && rem.armed ? want.includes('remaindertogo') : want.includes('remainderhint')) speakText(remainderHint());
}
function toggleSpeechPause() { if (synth.paused) synth.resume(); else synth.pause(); }
function replaySpeech() { if (speaking()) synth.cancel(); else speakText(lastSpoken); }

// ---------- feedback ----------
function buzz() { if (navigator.vibrate) navigator.vibrate(30); }
function showConfed() {
  extraEl.textContent = confed && !S.hideConfed
    ? (confed.add.startsWith('-') ? '−' + format(confed.add.slice(1)) : '+' + format(confed.add)) + (confed.mul ? `  ×${confed.mul}` : '')
    : '';
}
// Thumper (Android/Chrome only; iOS Safari has no vibration API): the real total as digit pulses.
function thump(n) {
  if (!navigator.vibrate || n === null) return;
  const pattern = [];
  for (const ch of digitsOf(n)) {
    const d = Number(ch);
    if (d === 0) pattern.push(600, 300);
    else for (let i = 0; i < d; i++) pattern.push(120, 150);
    pattern.push(0, 700);
  }
  setTimeout(() => navigator.vibrate(pattern), 1500);
}

// ---------- input wiring ----------
function holdMs(k) {
  if (k === 'clear') return 700;
  if (k === 'back') return 600;
  if ((k === 'neg' || k === 'pct' || k === 'paren') && !S.lockForceKeys) return 1000;
  if (k === '0' && S.peek.zero) return S.peek.zero * 1000;
  if (k === '.' && S.peek.dot) return S.peek.dot * 1000;
  if (k === '=' && S.peek.eq) return S.peek.eq * 1000;
  if (k === '/' || k === '+') return 1000;
  if (k === '-' && S.speech) return 1000;
  if (/^[1-9]$/.test(k) && (S.quickSet || S.adhocKeys)) return 1000;
  return 0;
}
function longPress(k) {
  if (k === 'clear' || k === 'back') clearAll();
  else if (k === 'neg' || k === 'pct' || k === 'paren') unlockSelector();
  else if (k === '0' || k === '.' || k === '=') showPeek(k === '0' && S.traitsOnZero);
  else if (k === '/') showIntendedForce();
  else if (k === '+') setAdhoc();
  else if (k === '-') replaySpeech();
  else numberLongPress(k);
}

document.querySelectorAll('.k').forEach((b) => {
  let holdTimer = null, settingsTimer = null, held = false, down = false, k = null;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault(); held = false; down = true; k = b.dataset.k;
    try { b.setPointerCapture(e.pointerId); } catch {} // a slight wobble during a long hold must not count as leaving the key
    if (Skin.stale()) { // keys still laid out for the other orientation: fix it, then use the key under the finger
      Skin.layout();
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const kb = hit && hit.closest('.k');
      k = kb ? kb.dataset.k : null;
      if (!k) { down = false; return; } // nothing under the finger: ignore the tap
    }
    b.classList.add('down');
    const ms = holdMs(k);
    if (ms) holdTimer = setTimeout(() => { held = true; longPress(k); }, ms);
    if (k === 'clear') settingsTimer = setTimeout(openSettings, 3000); // secret: keep holding AC
  });
  const end = (fire) => {
    if (!down) return;
    down = false; clearTimeout(holdTimer); clearTimeout(settingsTimer); b.classList.remove('down');
    if (fire && !held) press(k);
  };
  b.addEventListener('pointerup', () => end(true));
  b.addEventListener('pointercancel', () => end(false));
  b.addEventListener('pointerleave', () => end(false));
});

// Top buttons: tap opens history / the mode menu like iOS; long-press is a peek hotspot when switched on.
for (const [id, key] of [['tl', 'tl'], ['tr', 'tr']]) {
  let t = null, held = false, down = false;
  $(id).addEventListener('pointerdown', (e) => {
    e.preventDefault(); held = false; down = true;
    if (S.peek[key]) t = setTimeout(() => { held = true; showPeek(); }, S.peek[key] * 1000);
  });
  $(id).addEventListener('pointerup', () => {
    clearTimeout(t);
    if (down && !held && Skin.phone === 'ios') (key === 'tl' ? openHistory : openModeMenu)(); // the sheets are iOS-styled
    down = false;
  });
  $(id).addEventListener('pointercancel', () => { clearTimeout(t); down = false; });
}

// Auto-hide: the peek goes away as soon as the finger lifts.
document.addEventListener('pointerup', () => { if (peekState.on && S.autoHide) hidePeek(); }, true);

// Without auto-hide the peek stays up: tap anywhere to hide, swipe left/right for the traits pages.
(() => {
  let x0 = null;
  peekEl.addEventListener('pointerdown', (e) => { x0 = e.clientX; e.stopPropagation(); });
  peekEl.addEventListener('pointerup', (e) => {
    if (x0 === null) return; // the release of the long press that opened it
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 40 && peekState.pages.length > 1) {
      const n = peekState.pages.length;
      peekState.page = (peekState.page + (dx < 0 ? 1 : -1) + n) % n;
      drawPeek();
    } else hidePeek();
  });
})();

// Display area: swipe left/right deletes the last character; tap can copy or dial.
(() => {
  let x0 = null;
  const zone = $('dispzone');
  let menuTimer = null;
  zone.addEventListener('pointerdown', (e) => {
    x0 = e.clientX;
    clearTimeout(menuTimer); menuTimer = setTimeout(() => { x0 = null; if (window.closeIosPopups) closeIosPopups(); openSettings(); }, 3000); // backup way into the menu
  });
  ['pointerup', 'pointercancel'].forEach((t) => zone.addEventListener(t, () => clearTimeout(menuTimer)));
  zone.addEventListener('pointermove', (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 30) clearTimeout(menuTimer); });
  zone.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 30) { backspace(); return; }
    const v = displayedDigits();
    if (S.tapLabel === 'copy' && navigator.clipboard) navigator.clipboard.writeText(v).catch(() => {});
    if (S.tapLabel === 'dial') location.href = 'tel:' + v;
  });
})();

// Remainder force: while the remainder is being "typed", a tap anywhere on the screen enters the next digit.
document.addEventListener('pointerdown', (e) => {
  if (!rem || !rem.armed || peekState.on || $('settings').classList.contains('on')) return;
  if (e.target.closest('.k')) return; // keys route through press()
  if (remTap()) e.preventDefault();
}, true);

document.addEventListener('keydown', (e) => {
  if ($('settings').classList.contains('on')) return;
  const map = { Enter: '=', Escape: 'clear', x: '*', X: '*' };
  if (e.key === 'Backspace') { backspace(); return; }
  const k = map[e.key] || e.key;
  if (/^[0-9.+\-*/=]$/.test(k) || k === 'clear') { e.preventDefault(); press(k); }
});

// ---------- settings UI ----------
const lines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);
let editSlot = 0, editList = 0;
function fillSlot() {
  const sl = S.slots[editSlot];
  $('s-force').value = sl.force; $('s-note').value = sl.note;
  $('s-fields').value = sl.fields.join('\n'); $('s-peek').value = sl.peek.join('\n'); $('s-speech').value = sl.speech.join('\n');
}
function readSlot() {
  const sl = S.slots[editSlot];
  sl.force = $('s-force').value.trim(); sl.note = $('s-note').value.trim();
  sl.fields = lines($('s-fields').value).slice(0, 10);
  const r = sl.fields.findIndex((f) => /^remainder$/i.test(f));
  if (r >= 0) sl.fields = sl.fields.slice(0, r + 1); // Remainder must be the last field
  sl.peek = lines($('s-peek').value); sl.speech = lines($('s-speech').value);
}
function fillList() { $('s-listname').value = S.lists[editList].name; $('s-listtext').value = S.lists[editList].text; }
function readList() { S.lists[editList] = { name: $('s-listname').value.trim(), text: $('s-listtext').value }; }

const CHECKS = { autoHide: 's-autohide', traitsOnZero: 's-traitszero', invert: 's-invert', showTips: 's-tips',
  lockForceKeys: 's-lockkeys', quickSet: 's-quickset', adhocKeys: 's-adhockeys', confirmAdhoc: 's-confirmadhoc',
  hideConfed: 's-hideconfed', speech: 's-speechon', thump: 's-thump' };
const NUMS = { peekFont: 's-peekfont', maxDigits: 's-maxdigits', speechRate: 's-rate', splitAbove: 's-split', textScale: 's-tscale' };
const SELECTS = { remCue: 's-remcue', keypad: 's-keypad', look: 's-look', textWeight: 's-tweight', exprOnForce: 's-exprforce' };
const PEEKS = ['zero', 'dot', 'eq', 'tl', 'tr'];

function openSettings() {
  hidePeek(); stopSelector();
  editSlot = S.current;
  $('s-slot').innerHTML = SLOT_NAMES.map((n, i) => `<option value="${i}">${slotLabel(i)}${S.slots[i].note ? ' — ' + S.slots[i].note.replace(/</g, '&lt;') : ''}</option>`).join('');
  $('s-slot').value = editSlot; fillSlot();
  $('s-list').innerHTML = S.lists.map((l, i) => `<option value="${i}">${i + 1}${l.name ? ' ' + l.name.replace(/</g, '&lt;') : ''}</option>`).join('');
  editList = 0; $('s-list').value = 0; fillList();
  for (const [k, id] of Object.entries(CHECKS)) $(id).checked = !!S[k];
  for (const [k, id] of Object.entries(NUMS)) $(id).value = S[k];
  for (const p of PEEKS) $('s-peek-' + p).value = S.peek[p];
  $('s-dateorder').value = S.dateOrder; $('s-taplabel').value = S.tapLabel;
  for (const [k, id] of Object.entries(SELECTS)) $(id).value = S[k];
  $('s-tdx').value = S.textDX; $('s-tdy').value = S.textDY; $('s-check').checked = Skin.check;
  $('s-skinmsg').textContent = '';
  const v = Skin.view;
  $('s-viewinfo').textContent = `Screen check: page ${v.inner}, screen ${v.screen}, status bar ${v.safeTop}, home-screen app ${v.standalone ? 'yes' : 'no'}, using ${v.used}, page starts ${v.top} down, scrolled ${v.scroll}, visible ${v.vv}`;
  $('s-signs').value = S.signs; $('s-chinese').value = S.chinese;
  $('log').textContent = S.log || '—';
  $('settings').classList.add('on');
}
$('s-slot').addEventListener('change', () => { readSlot(); editSlot = Number($('s-slot').value); fillSlot(); });
$('s-list').addEventListener('change', () => { readList(); editList = Number($('s-list').value); fillList(); });
$('s-clearlog').addEventListener('click', () => { if (confirm('Clear the log?')) { S.log = ''; saveSettings(); $('log').textContent = '—'; } });
$('s-copylog').addEventListener('click', () => navigator.clipboard && navigator.clipboard.writeText(S.log || '').catch(() => {}));
$('s-save').addEventListener('click', async () => {
  if (skinPending() && !(await importSkin())) return; // stay in settings to show the problem
  readSlot(); readList();
  if (S.current !== editSlot) { S.current = editSlot; if (editSlot === REPL_SLOT) S.replIdx = 0; } // the slot being edited becomes current
  for (const [k, id] of Object.entries(CHECKS)) S[k] = $(id).checked;
  for (const [k, id] of Object.entries(NUMS)) S[k] = Number($(id).value) || DEFAULTS[k];
  for (const p of PEEKS) S.peek[p] = Math.max(0, Number($('s-peek-' + p).value) || 0);
  S.maxDigits = Math.min(21, Math.max(9, S.maxDigits));
  S.dateOrder = $('s-dateorder').value; S.tapLabel = $('s-taplabel').value;
  for (const [k, id] of Object.entries(SELECTS)) S[k] = $(id).value;
  S.textDX = Number($('s-tdx').value) || 0; S.textDY = Number($('s-tdy').value) || 0;
  Skin.check = $('s-check').checked;
  S.signs = $('s-signs').value; S.chinese = $('s-chinese').value;
  if (S.speech && synth) synth.speak(new SpeechSynthesisUtterance('')); // iOS unlocks speech on a user gesture
  saveSettings();
  $('settings').classList.remove('on');
  applyLook();
  resetAll(); render();
});

const readFile = (input) => new Promise((ok) => {
  const f = input.files && input.files[0];
  if (!f) return ok(null);
  const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(f);
});
const SKIN_INPUTS = ['s-img-p', 's-img-pt', 's-img-l', 's-img-lt'];
const skinPending = () => SKIN_INPUTS.some((id) => $(id).files && $(id).files.length);
async function importSkin() {
  const msg = $('s-skinmsg');
  msg.textContent = 'Reading screenshots…';
  try {
    const report = await Skin.import({
      portrait: { base: await readFile($('s-img-p')), typing: await readFile($('s-img-pt')) },
      landscape: { base: await readFile($('s-img-l')), typing: await readFile($('s-img-lt')) },
    });
    S.look = 'mine'; $('s-look').value = 'mine'; saveSettings();
    await Skin.load('mine', S.keypad);
    const names = { ios: 'iPhone', pixel: 'Google Pixel' };
    const lines = report.map((r) => `${r.orient}: ${r.keys} keys, ${names[r.phone] || r.phone} layout, number ${r.text === 'estimate' ? 'position estimated (add a "while typing" screenshot to match it exactly)' : r.text === 'typing' ? 'placed from the typing screenshot' : 'matched'}`);
    msg.textContent = '✓ Imported. ' + lines.join(' · ');
    showPreview();
    toast('✓ Screenshots imported', lines.join('\n'));
    SKIN_INPUTS.forEach((id) => { $(id).value = ''; });
    return true;
  } catch (err) { msg.textContent = '✕ ' + String(err.message || err); toast('✕ Not imported', String(err.message || err)); return false; }
}
$('s-import').addEventListener('click', importSkin);
// Remove imported screenshots and go back to the built-in iPhone look (tap twice to confirm).
$('s-removeskin').addEventListener('click', async () => {
  const b = $('s-removeskin');
  if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to remove them'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Remove my screenshots'; }, 4000); return; }
  b.dataset.armed = ''; b.textContent = 'Remove my screenshots';
  try { await SkinDB.set('skin', {}); } catch {}
  S.look = 'builtin'; S.keypad = 'auto'; $('s-look').value = 'builtin'; $('s-keypad').value = 'auto'; saveSettings();
  await applyLook();
  $('s-skinmsg').textContent = '✓ Removed. Back to the built-in iPhone look.';
  toast('✓ Screenshots removed', 'Back to the built-in iPhone look.');
});
SKIN_INPUTS.forEach((id) => $(id).addEventListener('change', importSkin));

function showPreview() {
  const box = $('s-preview'); if (!box) return;
  box.innerHTML = '';
  for (const o of ['portrait', 'landscape']) { const c = Skin.preview(o); if (c) box.append(c); }
  box.hidden = !box.children.length || S.look !== 'mine';
}
function toast(title, body) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); t.addEventListener('click', () => t.classList.remove('on')); }
  t.innerHTML = ''; const b = document.createElement('b'); b.textContent = title; const p = document.createElement('div'); p.textContent = body;
  t.append(b, p); t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 5000);
}
function applyLook() {
  Skin.tweak = { scale: (Number(S.textScale) || 100) / 100, dx: Number(S.textDX) || 0, dy: Number(S.textDY) || 0, weight: S.textWeight };
  return Skin.load(S.look, S.keypad).then(showPreview);
}

applyLook().then(() => render());
render();
