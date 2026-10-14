'use strict';
// Settings navigation: a main list of topics, one page per topic, a fixed top bar with Back / ? / Done.
// The form fields themselves are filled and saved by app.js (openSettings / the Done button).

(() => {
  const root = $('settings');
  const pages = [...root.querySelectorAll('.page')];
  const backBtn = $('nav-back'), backLabel = $('nav-back-label'), title = $('nav-title'), helpBtn = $('nav-help');
  let current = 'main';

  function go(name) {
    current = name;
    pages.forEach((p) => p.classList.toggle('on', p.dataset.page === name));
    const page = pages.find((p) => p.dataset.page === name);
    title.textContent = page.dataset.title;
    backLabel.textContent = name === 'main' ? 'Calculator' : 'Settings';
    root.classList.remove('showhelp');
    helpBtn.style.visibility = page.querySelector('.help') ? '' : 'hidden';
    if (name === 'routine') $('routine-slot').textContent = 'For ' + $('s-slot').selectedOptions[0]?.textContent;
    root.scrollTop = 0;
  }

  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  // On the main page "‹ Calculator" saves and closes, like Done; elsewhere it returns to the main list.
  backBtn.addEventListener('click', () => (current === 'main' ? $('s-save').click() : go('main')));
  helpBtn.addEventListener('click', () => { root.classList.toggle('showhelp'); root.scrollTop = 0; });

  function summaries() {
    const opt = $('s-slot').selectedOptions[0];
    $('sum-force').textContent = (opt ? opt.textContent.split(' — ')[0] : '') + ($('s-force').value ? ' · ' + $('s-force').value : '');
    const fields = $('s-fields').value.split('\n').map((l) => l.trim()).filter(Boolean);
    $('sum-routine').textContent = fields.length ? fields.length + ' fields' : 'no fields';
    const hot = { zero: '0', dot: '.', eq: '=', tl: 'history', tr: 'mode' };
    $('sum-peek').textContent = Object.keys(hot).filter((k) => Number($('s-peek-' + k).value) > 0).map((k) => hot[k]).join(', ') || 'off';
    $('sum-speech').textContent = $('s-speechon').checked ? 'On' : 'Off';
    $('sum-lists').textContent = S.lists.filter((l) => l.text.trim()).length + ' used';
    $('sum-look').textContent = $('s-look').selectedOptions[0]?.textContent || '';
  }
  root.addEventListener('input', summaries);
  root.addEventListener('change', summaries);

  // Each time the menu opens, start on the main list with fresh summaries.
  let wasOpen = false;
  new MutationObserver(() => {
    const open = root.classList.contains('on');
    if (open && !wasOpen) { go('main'); summaries(); }
    wasOpen = open;
  }).observe(root, { attributes: true, attributeFilter: ['class'] });
})();
