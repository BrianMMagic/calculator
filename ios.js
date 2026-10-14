'use strict';
// iOS 26/27 Calculator extras, matched to iOS 27 screenshots: the History sheet (clock button), the mode
// menu (calculator button) and the Copy/Paste bubble (long-press the number). Uses the state from app.js.

(() => {
  const css = document.createElement('style');
  css.textContent = `
  .ios-font { font-family:-apple-system, "SF Pro Text", system-ui, sans-serif; -webkit-font-smoothing:antialiased; }
  .ios-dim { position:fixed; left:0; right:0; top:0; height:var(--appH, 100%); z-index:5; background:rgba(0,0,0,.5);
    opacity:0; pointer-events:none; transition:opacity .3s; }
  .ios-dim.on { opacity:1; pointer-events:auto; }
  .ios-sheet { position:fixed; left:8px; right:8px; z-index:6; /* 440 pt tall, 8 pt above the bottom on a 393 pt wide phone */
    height:calc(100vw * 440 / 393); top:calc(var(--appH, 100vh) - 8px - 100vw * 440 / 393); border-radius:44px 44px 54px 54px; overflow:hidden; color:#fff;
    background:rgba(38,38,38,.82); -webkit-backdrop-filter:blur(40px) saturate(1.4); backdrop-filter:blur(40px) saturate(1.4);
    box-shadow:inset 0 0.5px 0 rgba(255,255,255,.25), 0 -4px 30px rgba(0,0,0,.35);
    transform:translateY(110%); transition:transform .35s cubic-bezier(.2,.9,.25,1); display:flex; flex-direction:column; }
  .ios-sheet.on { transform:translateY(0); }
  .ios-grab { width:57px; height:5px; border-radius:3px; background:rgba(255,255,255,.3); margin:7px auto 0; flex:none; }
  .ios-head { flex:none; display:flex; justify-content:space-between; align-items:center; padding:3px 15px 0 15px; height:46px; }
  .ios-pill, .ios-x { background:rgba(255,255,255,.08); border:0; color:#fff; font:inherit; font-size:17px;
    box-shadow:inset 0 0.5px 0 rgba(255,255,255,.3), inset 0 -0.5px 0 rgba(255,255,255,.08); }
  .ios-pill { height:42px; padding:0 17px; border-radius:21px; }
  .ios-pill.red { color:#ff453a; margin-left:8px; }
  .ios-x { width:42px; height:42px; border-radius:50%; display:flex; align-items:center; justify-content:center; padding:0; }
  .ios-hist { flex:1; overflow:auto; padding:0 15px 40px 20px; -webkit-overflow-scrolling:touch; }
  .ios-day { color:#8d8d93; font-size:16px; line-height:20px; padding:41px 0 10px; border-bottom:0.5px solid rgba(255,255,255,.18); }
  .ios-row { position:relative; overflow:hidden; border-bottom:0.5px solid rgba(255,255,255,.18); }
  .ios-row .in { position:relative; display:flex; align-items:center; gap:12px; padding:19px 0 21px; transition:transform .2s; }
  .ios-row .tx { flex:1; min-width:0; }
  .ios-row .ex { color:#8d8d93; font-size:12.5px; line-height:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ios-row .re { font-size:17px; line-height:22px; margin-top:3px; }
  .ios-row .mn { display:none; width:22px; height:22px; border-radius:50%; background:#ff453a; color:#fff; border:0; flex:none;
    font-size:18px; line-height:20px; padding:0; }
  .ios-hist.edit .ios-row .mn { display:block; }
  .ios-row .del { visibility:hidden; position:absolute; right:-15px; top:0; bottom:0; width:96px; background:#ff453a; color:#fff; border:0; font:inherit; font-size:16px; }
  .ios-empty { color:#8d8d93; font-size:17px; text-align:center; padding-top:80px; }
  .ios-menu { position:fixed; z-index:6; right:8px; width:249px; border-radius:34px; padding:10px 0 9px; color:#fff;
    background:rgba(34,34,34,.9); -webkit-backdrop-filter:blur(40px) saturate(1.4); backdrop-filter:blur(40px) saturate(1.4);
    box-shadow:inset 0 0.5px 0 rgba(255,255,255,.22), 0 12px 40px rgba(0,0,0,.45);
    transform-origin:top right; transform:scale(.6); opacity:0; pointer-events:none; transition:transform .25s, opacity .2s; }
  .ios-menu.on { transform:scale(1); opacity:1; pointer-events:auto; }
  .ios-row.open .del { visibility:visible; }
  .ios-menu .it { display:flex; align-items:center; height:42px; padding:0 20px 0 18px; font-size:17px; }
  .ios-menu .ck { width:26px; font-size:17px; }
  .ios-menu .ic { width:34px; display:flex; align-items:center; }
  .ios-menu .it:active { background:rgba(255,255,255,.08); }
  .ios-menu .sep { height:0.5px; background:rgba(255,255,255,.18); margin:9px 24px 9px 24px; }
  .ios-shade { position:fixed; inset:0; z-index:5; display:none; }
  .ios-shade.on { display:block; }
  .ios-edit { position:fixed; z-index:6; display:none; border-radius:10px; overflow:hidden;
    background:rgba(44,44,46,.92); -webkit-backdrop-filter:blur(30px); backdrop-filter:blur(30px); font-size:15px; color:#fff; }
  .ios-edit.on { display:flex; }
  .ios-edit button { background:none; border:0; color:#fff; font:inherit; padding:9px 14px; }
  .ios-edit button + button { border-left:0.5px solid rgba(255,255,255,.25); }`;
  document.head.append(css);

  const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
  const shade = mk('div', 'ios-shade');
  document.body.append(shade);
  const closeAll = () => { shade.classList.remove('on'); menu.classList.remove('on'); edit.classList.remove('on'); $('tr').style.visibility = ''; };
  shade.addEventListener('pointerdown', (e) => { e.preventDefault(); closeAll(); });

  // ---------- history sheet ----------
  if (!Array.isArray(S.history)) S.history = [];
  window.addHistory = (expr, result) => {
    S.history.push({ expr, result, at: Date.now() });
    if (S.history.length > 200) S.history.splice(0, S.history.length - 200);
    saveSettings();
  };
  const X_SVG = '<svg width="17" height="17" viewBox="0 0 17 17" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M2 2l13 13M15 2L2 15"/></svg>';
  const dim = mk('div', 'ios-dim');
  const sheet = mk('div', 'ios-sheet ios-font');
  const head = mk('div', 'ios-head');
  const left = mk('div');
  const editBtn = mk('button', 'ios-pill', 'Edit'), clearBtn = mk('button', 'ios-pill red', 'Clear');
  clearBtn.style.display = 'none';
  left.append(editBtn, clearBtn);
  const xBtn = mk('button', 'ios-x', X_SVG);
  head.append(left, xBtn);
  const list = mk('div', 'ios-hist');
  sheet.append(mk('div', 'ios-grab'), head, list);
  document.body.append(dim, sheet);

  function dayLabel(ts) {
    const d = new Date(ts), now = new Date();
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  function drawHistory() {
    list.innerHTML = '';
    if (!S.history.length) { list.append(mk('div', 'ios-empty', 'No History')); return; }
    let lastDay = null;
    for (let i = S.history.length - 1; i >= 0; i--) { // newest first
      const h = S.history[i], label = dayLabel(h.at || Date.now());
      if (label !== lastDay) { list.append(mk('div', 'ios-day', label)); lastDay = label; }
      const row = mk('div', 'ios-row'), inner = mk('div', 'in'), del = mk('button', 'del', 'Delete');
      const mn = mk('button', 'mn', '−'), tx = mk('div', 'tx');
      tx.append(mk('div', 'ex'), mk('div', 're'));
      tx.firstChild.textContent = h.expr;
      tx.lastChild.textContent = minus(format(h.result));
      inner.append(mn, tx);
      row.append(del, inner);
      const remove = () => { S.history.splice(i, 1); saveSettings(); drawHistory(); };
      mn.addEventListener('click', (e) => { e.stopPropagation(); remove(); });
      del.addEventListener('click', remove);
      let x0 = null, open = false;
      inner.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
      inner.addEventListener('pointerup', (e) => {
        if (x0 === null || list.classList.contains('edit')) return;
        const dx = e.clientX - x0; x0 = null;
        if (dx < -40) { open = true; row.classList.add('open'); inner.style.transform = 'translateX(-96px)'; return; }
        if (open || dx > 40) { open = false; inner.style.transform = ''; setTimeout(() => row.classList.remove('open'), 200); return; }
        newCalc(); lastResult = h.result; lastExpr = h.expr; justEvaluated = true; // reload where it left off
        closeHistory(); render();
      });
      list.append(row);
    }
  }
  function setEdit(on) {
    list.classList.toggle('edit', on);
    editBtn.textContent = on ? 'Done' : 'Edit';
    clearBtn.style.display = on && S.history.length ? '' : 'none';
    clearBtn.textContent = 'Clear';
  }
  function closeHistory() { sheet.classList.remove('on'); dim.classList.remove('on'); }
  window.openHistory = () => { closeAll(); setEdit(false); drawHistory(); list.scrollTop = 0; dim.classList.add('on'); sheet.classList.add('on'); };
  xBtn.addEventListener('click', closeHistory);
  dim.addEventListener('pointerdown', (e) => { e.preventDefault(); closeHistory(); });
  editBtn.addEventListener('click', () => setEdit(!list.classList.contains('edit')));
  clearBtn.addEventListener('click', () => {
    if (clearBtn.textContent === 'Clear') { clearBtn.textContent = 'Clear All?'; return; }
    S.history = []; saveSettings(); setEdit(false); drawHistory();
  });
  // Drag the grab bar / header down to dismiss.
  (() => {
    let y0 = null;
    const start = (e) => { if (e.target.closest('button')) return; y0 = e.clientY; sheet.style.transition = 'none'; };
    const move = (e) => { if (y0 !== null) sheet.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; };
    const end = (e) => {
      if (y0 === null) return;
      const dy = e.clientY - y0; y0 = null;
      sheet.style.transition = ''; sheet.style.transform = '';
      if (dy > 80) closeHistory();
    };
    head.addEventListener('pointerdown', start); sheet.firstChild.addEventListener('pointerdown', start);
    addEventListener('pointermove', move); addEventListener('pointerup', end);
  })();

  // ---------- mode menu ----------
  const ICONS = {
    basic: '<svg width="22" height="20" viewBox="0 0 22 20" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M5 1.5v6M2 4.5h6M14 4.5h6M2.5 12.5l5 5M7.5 12.5l-5 5M14 15h6"/><circle cx="17" cy="12.3" r=".9" fill="#fff" stroke="none"/><circle cx="17" cy="17.7" r=".9" fill="#fff" stroke="none"/></svg>',
    sci: '<span style="font-size:17px;letter-spacing:-.5px"><i style="font-family:Georgia,serif">ƒ</i>(x)</span>',
    notes: '<svg width="24" height="22" viewBox="0 0 24 22" stroke="#fff" stroke-width="1.5" stroke-linecap="round" fill="none"><path d="M2 9h13M6 3c-1 6 0 13 4 17M3 15l5-5M3 10l5 5"/><path d="M15 1.5l2 3 2-3M17 4.5v3M15.5 12l4 5M19.5 12l-4 5"/></svg>',
    convert: '<svg width="22" height="22" viewBox="0 0 22 22" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M20 7H3M7 3L3 7l4 4M2 15h17M15 11l4 4-4 4"/></svg>',
  };
  const menu = mk('div', 'ios-menu ios-font');
  const item = (label, icon, checked) => {
    const it = mk('div', 'it');
    it.append(mk('span', 'ck', checked ? '✓' : ''), mk('span', 'ic', ICONS[icon]), mk('span', null, label));
    it.addEventListener('click', closeAll); // only Basic is implemented
    return it;
  };
  menu.append(item('Basic', 'basic', true), item('Scientific', 'sci'), item('Math Notes', 'notes'), mk('div', 'sep'), item('Convert', 'convert'));
  document.body.append(menu);
  window.openModeMenu = () => {
    closeAll();
    const r = $('tr').getBoundingClientRect();
    menu.style.top = r.top + 'px'; // grows out of the button, covering it
    $('tr').style.visibility = 'hidden';
    shade.classList.add('on'); menu.classList.add('on');
  };

  // ---------- Copy / Paste (long-press the number) ----------
  const edit = mk('div', 'ios-edit ios-font');
  const copyBtn = mk('button', null, 'Copy'), pasteBtn = mk('button', null, 'Paste');
  edit.append(copyBtn, pasteBtn);
  document.body.append(edit);
  const shownValue = () => (justEvaluated ? plain(lastResult) : entry !== '' ? entry : tokens.length ? mainText().replace(/,/g, '') : '0');
  copyBtn.addEventListener('click', () => {
    const v = shownValue().replace(/−/g, '-');
    if (navigator.clipboard) navigator.clipboard.writeText(v).catch(() => {});
    closeAll();
  });
  pasteBtn.addEventListener('click', async () => {
    closeAll();
    let t = '';
    try { t = await navigator.clipboard.readText(); } catch { return; }
    const n = t.trim().replace(/[,\s]/g, '').replace(/−/g, '-');
    if (!/^-?(\d+\.?\d*|\.\d+)%?$/.test(n)) return;
    if (justEvaluated) newCalc();
    entry = n; render();
  });
  const zone = $('dispzone');
  let lp = null, sx = 0;
  zone.addEventListener('pointerdown', (e) => {
    sx = e.clientX;
    lp = setTimeout(() => {
      lp = null;
      const r = $('display').getBoundingClientRect();
      edit.classList.add('on'); shade.classList.add('on');
      const w = edit.offsetWidth;
      edit.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
      edit.style.top = Math.max(8, r.top - edit.offsetHeight - 10) + 'px';
    }, 500);
  });
  zone.addEventListener('pointermove', (e) => { if (lp && Math.abs(e.clientX - sx) > 10) { clearTimeout(lp); lp = null; } });
  const cancel = () => { if (lp) { clearTimeout(lp); lp = null; } };
  zone.addEventListener('pointerup', cancel); zone.addEventListener('pointercancel', cancel);
})();
