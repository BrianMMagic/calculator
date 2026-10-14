'use strict';
// Tap-to-choose editors for the Force and Data pages. They read and write the plain-text settings fields
// (#s-force, #s-fields, #s-peek, #s-speech) that app.js fills and saves, so "Edit as text" stays in sync.

(() => {
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const opt = (sel, list, value) => {
    sel.innerHTML = list.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    sel.value = value;
    return sel;
  };
  const write = (id, value) => { const f = $(id); f.value = value; f.dispatchEvent(new Event('input', { bubbles: true })); };
  const listChoices = () => S.lists.map((l, i) => [String(i + 1), `${i + 1}${l.name ? ' · ' + l.name : ''}`]);
  const slotIndex = () => Number($('s-slot').value);

  // ---------- Force ----------
  const fb = $('force-builder');
  const kindOf = (i, raw) => {
    if (i === REPL_SLOT) return 'repl';
    if (i === CONFED_SLOT) return 'confed';
    if (i === NOFORCE_SLOT || /booktest|no ?force/i.test(raw)) return 'nof';
    if (/^dayssincebirth$/i.test(raw)) return 'dsb';
    if (/[dMyHhm]/.test(raw)) return 'date';
    return 'number';
  };
  function parseDate(raw) {
    const plus = raw.match(/\+\s*(\d+)\s*$/);
    const body = raw.replace(/\+\s*\d+\s*$/, '').trim();
    const d = {
      order: body.search(/M/) < body.search(/d/) ? 'md' : 'dm',
      zeros: /dd|MM|hh|HH/.test(body),
      year: /yyyy/.test(body) ? '4' : /yy/.test(body) ? '2' : '0',
      time: /H/.test(body) ? '24' : /h/.test(body) ? '12' : '0',
      ahead: plus ? plus[1] : '0',
    };
    d.custom = composeDate({ ...d, ahead: '0' }) !== body;
    return d;
  }
  function composeDate(d) {
    const day = d.zeros ? 'dd' : 'd', mon = d.zeros ? 'MM' : 'M';
    let s = d.order === 'md' ? mon + day : day + mon;
    if (d.year === '2') s += 'yy'; else if (d.year === '4') s += 'yyyy';
    if (d.time === '12') s += (d.zeros ? 'hh' : 'h') + 'mm'; else if (d.time === '24') s += (d.zeros ? 'HH' : 'H') + 'mm';
    return s + (Number(d.ahead) ? '+' + Number(d.ahead) : '');
  }
  let previewTimer = null;

  function drawForce() {
    clearInterval(previewTimer);
    const i = slotIndex(), raw = $('s-force').value.trim();
    const kind = kindOf(i, raw);
    fb.innerHTML = '';
    const group = el('div', 'group form');
    const row = (label, control) => { const r = el('label', 'field'); r.append(el('span', null, label), control); group.append(r); return control; };

    if (i !== REPL_SLOT && i !== CONFED_SLOT && i !== NOFORCE_SLOT) {
      const type = row('Force type', el('select'));
      opt(type, [['number', 'Number'], ['date', 'Date & time'], ['nof', 'Real maths / book test'], ['dsb', 'Days since birth']], kind);
      type.addEventListener('change', () => {
        const v = type.value;
        write('s-force', v === 'date' ? 'dMhmm+60' : v === 'nof' ? 'No force' : v === 'dsb' ? 'DaysSinceBirth' : '');
        drawForce();
      });
    }

    if (kind === 'number' || kind === 'confed') {
      const n = row(kind === 'confed' ? 'Target number' : 'Force number', el('input'));
      n.inputMode = 'decimal'; n.placeholder = 'e.g. 2742'; n.value = raw;
      n.addEventListener('input', () => write('s-force', n.value.replace(/[^\d.]/g, '')));
    } else if (kind === 'repl') {
      const n = row('Last digits', el('input'));
      n.placeholder = '07;39;43'; n.value = raw;
      n.addEventListener('input', () => write('s-force', n.value.replace(/[^\d;]/g, '')));
      group.append(el('div', 'hint2', 'The real total is kept and only its last digits are replaced. Separate several with ";" to use them in turn.'));
    } else if (kind === 'nof') {
      const tag = raw.match(/\|\s*(\d+)\s*$/);
      const l = row('Look result up in', el('select'));
      opt(l, [['', 'Nothing (just real maths)'], ...listChoices()], tag ? tag[1] : '');
      l.addEventListener('change', () => write('s-force', l.value ? 'Booktest|' + l.value : 'No force'));
    } else if (kind === 'dsb') {
      group.append(el('div', 'hint2', 'Forces the number of days since the birthday they enter. Add Birth day, Birth month and Birth year to the data fields.'));
    } else if (kind === 'date') {
      const d = parseDate(raw);
      if (d.custom) {
        const c = row('Custom code', el('input'));
        c.value = raw; c.autocapitalize = 'off';
        c.addEventListener('input', () => write('s-force', c.value.trim()));
        const reset = el('button', 'btn', 'Use the simple choices instead');
        reset.type = 'button';
        reset.addEventListener('click', () => { write('s-force', 'dMhmm+60'); drawForce(); });
        group.append(reset);
      } else {
        const update = () => { write('s-force', composeDate(d)); showPreview(); };
        const sel = (label, list, key) => { const s = row(label, el('select')); opt(s, list, String(d[key])); s.addEventListener('change', () => { d[key] = s.value; update(); }); };
        sel('Date order', [['dm', 'Day then month'], ['md', 'Month then day']], 'order');
        sel('Year', [['0', 'None'], ['2', '2 digits (26)'], ['4', '4 digits (2026)']], 'year');
        sel('Time', [['12', '12-hour + minutes'], ['24', '24-hour + minutes'], ['0', 'No time']], 'time');
        sel('Seconds ahead', [['0', '0'], ['30', '30 s'], ['60', '60 s (1 min)'], ['90', '90 s'], ['120', '2 min'], ['180', '3 min'], ['300', '5 min'], ['600', '10 min']], 'ahead');
        const z = el('label', 'sw'); const zc = el('input'); zc.type = 'checkbox'; zc.checked = d.zeros;
        z.append(el('span', null, 'Leading zeros (07 instead of 7)'), zc); group.append(z);
        zc.addEventListener('change', () => { d.zeros = zc.checked; update(); });
      }
      const pv = el('div', 'preview'); group.append(pv);
      const showPreview = () => {
        const code = $('s-force').value.trim();
        let v = '';
        try { v = dateForce(code); } catch { v = '?'; }
        pv.innerHTML = `Right now this forces <b>${format(v || '0')}</b><small>Code: ${code.replace(/</g, '&lt;')}</small>`;
      };
      showPreview();
      previewTimer = setInterval(() => { if ($('settings').classList.contains('on')) showPreview(); else clearInterval(previewTimer); }, 1000);
    }
    fb.append(group);
  }

  // ---------- Data fields ----------
  const FIELD_TYPES = [
    ['Number', 'Any number'], ['Day', 'Birth day'], ['Month', 'Birth month'], ['Year', 'Birth year'], ['Age', 'Age'],
    ['ddmm', 'Birthday as ddmm'], ['mmdd', 'Birthday as mmdd'], ['ddmmyy', 'Full birthday ddmmyy'], ['mmddyy', 'Full birthday mmddyy'],
    ['Postcode', 'Zip / postcode'], ['Phone', 'Phone number part'], ['List', 'Number, looked up in a list'],
    ['Remainder', 'Remainder (typed for them)'], ['Custom', 'Other (type a label)'],
  ];
  const PERSON = ['Day', 'Month', 'Year', 'Age', 'ddmm', 'mmdd', 'ddmmyy', 'mmddyy'];
  function parseField(f) {
    let m;
    if (/^remainder$/i.test(f)) return { type: 'Remainder' };
    if ((m = f.match(/^(day|month|year|age|ddmm|mmdd|ddmmyy|mmddyy)([1-3])?$/i))) {
      const t = PERSON.find((p) => p.toLowerCase() === m[1].toLowerCase());
      return { type: t, person: m[2] || '1' };
    }
    if ((m = f.match(/^phone([1-3])$/i))) return { type: 'Phone', part: m[1] };
    if (/^(post|postcode|postalcode|zip|zipcode)$/i.test(f)) return { type: 'Postcode' };
    if ((m = f.match(/^number\|(\d+)$/i))) return { type: 'List', list: m[1] };
    if (/^number$/i.test(f)) return { type: 'Number' };
    return { type: 'Custom', text: f };
  }
  function composeField(x) {
    if (PERSON.includes(x.type)) return x.type + (x.person && x.person !== '1' ? x.person : '');
    if (x.type === 'Phone') return 'Phone' + (x.part || '1');
    if (x.type === 'List') return 'Number|' + (x.list || '1');
    if (x.type === 'Custom') return (x.text || 'Number').trim();
    return x.type;
  }
  const db = $('fields-builder');
  let fields = [];
  const saveFields = () => {
    const r = fields.findIndex((x) => x.type === 'Remainder');
    if (r >= 0 && r !== fields.length - 1) fields.push(fields.splice(r, 1)[0]); // Remainder must be last
    write('s-fields', fields.map(composeField).join('\n'));
  };
  function drawFields() {
    db.innerHTML = '';
    const group = el('div', 'group');
    fields.forEach((x, i) => {
      const r = el('div', 'frow');
      const top = el('div', 'ftop');
      top.append(el('span', 'fnum', String(i + 1)));
      const type = el('select', 'ftype'); opt(type, FIELD_TYPES, x.type);
      type.addEventListener('change', () => { fields[i] = { type: type.value, person: '1', part: '1', list: '1' }; saveFields(); drawFields(); });
      top.append(type);
      const btns = el('div', 'fbtns');
      const mkb = (txt, label, fn, off) => { const b = el('button', 'fb', txt); b.type = 'button'; b.ariaLabel = label; b.disabled = off; b.addEventListener('click', fn); btns.append(b); };
      mkb('↑', 'Move up', () => { [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]]; saveFields(); drawFields(); }, i === 0);
      mkb('↓', 'Move down', () => { [fields[i + 1], fields[i]] = [fields[i], fields[i + 1]]; saveFields(); drawFields(); }, i === fields.length - 1);
      mkb('✕', 'Remove', () => { fields.splice(i, 1); saveFields(); drawFields(); }, false);
      top.append(btns);
      r.append(top);
      const extra = (label, list, key) => {
        const s = el('select', 'fextra'); opt(s, list, x[key] || '1');
        s.addEventListener('change', () => { x[key] = s.value; saveFields(); });
        const w = el('label', 'fsub'); w.append(el('span', null, label), s); r.append(w);
      };
      if (PERSON.includes(x.type)) extra('Person', [['1', 'Spectator 1'], ['2', 'Spectator 2'], ['3', 'Spectator 3']], 'person');
      if (x.type === 'Phone') extra('Part', [['1', 'Part 1'], ['2', 'Part 2'], ['3', 'Part 3']], 'part');
      if (x.type === 'List') extra('List', listChoices(), 'list');
      if (x.type === 'Custom') {
        const t = el('input', 'fextra'); t.value = x.text || ''; t.placeholder = 'e.g. House number';
        t.addEventListener('input', () => { x.text = t.value; saveFields(); });
        const w = el('label', 'fsub'); w.append(el('span', null, 'Label'), t); r.append(w);
      }
      group.append(r);
    });
    if (fields.length < 10) {
      const add = el('button', 'row addrow', '<span class="lbl">+ Add field</span>'); add.type = 'button';
      add.addEventListener('click', () => {
        const r = fields.findIndex((x) => x.type === 'Remainder');
        const nf = { type: 'Number' };
        if (r >= 0) fields.splice(r, 0, nf); else fields.push(nf);
        saveFields(); drawFields();
      });
      group.append(add);
    }
    db.append(group);
    const n = fields.filter((x) => x.type !== 'Remainder').length, rem = fields.some((x) => x.type === 'Remainder');
    db.append(el('p', 'foot', fields.length
      ? (rem ? `After ${n} number${n === 1 ? '' : 's'}, "=" shows the subtotal; then their taps type the remainder and "=" gives the force.`
        : `"=" shows the force once ${n} number${n === 1 ? ' has' : 's have'} been entered.`)
      : 'No fields: the first "=" shows the force.'));
  }

  // ---------- Peek / spoken items ----------
  const ITEMS = [
    ['All Fields', 'Everything they entered'], ['Zodiac', 'Star sign'], ['ChineseZodiac', 'Chinese zodiac'],
    ['Birthdate (long)', 'Birthday (with weekday)'], ['Birthdate', 'Birthday (short)'], ['Age', 'Age'],
    ['DayOfWeek', 'Day of week born'], ['DaysSinceBirth', 'Days since birth'], ['Celebrity', 'Celebrity, same birthday'],
    ['City', 'City from zip'], ['Phone', 'Joined phone number'], ['NoForceListItem', 'Book test / list result'],
    ['Remainder Hint', 'Remainder hint (add/subtract, digits)'], ['Remainder to go', 'Remainder countdown'],
    ['Confederate (+/-)', 'Confederate + / −'], ['Confederate (x)', 'Confederate ×'],
    ['Calculation Total', 'Real total'], ['Force Number (n)', 'Force number and digit count'],
    ['Traits', 'Star sign traits (swipe)'], ['ChineseTraits', 'Chinese traits (swipe)'],
  ];
  const norm = (s) => s.toLowerCase().replace(/[\s#()]/g, '');
  function drawItems(box, id, skip) {
    box.innerHTML = '';
    const current = $(id).value.split('\n').map((l) => l.trim()).filter(Boolean);
    const on = new Set(current.map(norm));
    const known = new Set(ITEMS.map(([k]) => norm(k)));
    const extras = current.filter((c) => !known.has(norm(c))); // e.g. "Field 2" or "Zodiac #2", kept as typed
    const group = el('div', 'group');
    ITEMS.filter(([k]) => !skip.includes(k)).forEach(([k, label]) => {
      const r = el('label', 'sw'); const c = el('input'); c.type = 'checkbox'; c.checked = on.has(norm(k));
      r.append(el('span', null, label), c); group.append(r);
      c.addEventListener('change', () => {
        const chosen = ITEMS.filter(([kk]) => group.querySelector(`[data-k="${kk}"]`).checked).map(([kk]) => kk);
        write(id, [...chosen, ...extras].join('\n'));
      });
      c.dataset.k = k;
    });
    ITEMS.filter(([k]) => skip.includes(k)).forEach(([k]) => { const c = el('input'); c.type = 'checkbox'; c.dataset.k = k; c.hidden = true; c.checked = false; group.append(c); });
    box.append(group);
    if (extras.length) box.append(el('p', 'foot', 'Also included (from "Edit as text"): ' + extras.join(', ').replace(/</g, '&lt;')));
  }

  // ---------- sync ----------
  function sync() {
    drawForce();
    fields = $('s-fields').value.split('\n').map((l) => l.trim()).filter(Boolean).map(parseField);
    drawFields();
    drawItems($('peek-builder'), 's-peek', ['Remainder to go']);
    drawItems($('speech-builder'), 's-speech', []);
  }
  $('s-slot').addEventListener('change', sync); // after app.js has filled the fields for the new slot
  ['s-force', 's-fields', 's-peek', 's-speech'].forEach((id) => $(id).addEventListener('change', sync)); // edits as text
  let wasOpen = false;
  new MutationObserver(() => {
    const open = $('settings').classList.contains('on');
    if (open && !wasOpen) sync();
    wasOpen = open;
  }).observe($('settings'), { attributes: true, attributeFilter: ['class'] });
})();
