const L = globalThis.SiftLib;
const KEYS = Object.keys(L.DEFAULTS);
const $ = id => document.getElementById(id);
let cfg = { ...L.DEFAULTS };

const el = (tag, content, attrs = {}) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (content != null) e.append(...[].concat(content));
  return e;
};

async function save(patch) {
  cfg = { ...cfg, ...patch };
  render();
  await chrome.storage.local.set(patch);
}

// Removing a row re-renders its list; keep keyboard focus on the row that took its place.
function removeFrom(key, index) {
  const list = cfg[key].filter((_, i) => i !== index);
  save({ [key]: list });
  const buttons = $(key).querySelectorAll('button');
  (buttons[Math.min(index, buttons.length - 1)] || $(key === 'ships' ? 'h-ships' : 'add-' + key))?.focus();
}

// One row per kept filter; the word count range is one row.
const KEPT_ROWS = [
  ['Completion', ['complete']],
  ['Crossovers', ['crossover']],
  ['Language', ['language_id', 'languageName']],
  ['Word count', ['words_from', 'words_to']],
];

function removeKept(keys) {
  const kept = { ...cfg.kept };
  for (const k of keys) delete kept[k];
  save({ kept: L.cleanKept(kept) });
  const buttons = $('kept').querySelectorAll('button');
  (buttons[0] || $('h-kept')).focus();
}

function render() {
  for (const key of ['exclusions', 'mutedAuthors']) {
    $(key).replaceChildren(...(cfg[key].length
      ? cfg[key].map((name, i) => el('li', [el('span', name),
        button('Remove', `Remove ${name}`, () => removeFrom(key, i))]))
      : [el('li', el('span', key === 'exclusions' ? 'No saved exclusions yet.' : 'No muted authors.'))]));
  }
  $('ships').replaceChildren(...(cfg.ships.length
    ? cfg.ships.map((ship, i) => {
      const select = el('select', [el('option', 'Listed first', { value: 'first' }), el('option', 'In the first two', { value: 'two' })],
        { 'aria-label': `Where ${ship.name} must be listed` });
      select.value = ship.firstTwo ? 'two' : 'first';
      select.addEventListener('change', () =>
        save({ ships: cfg.ships.map((s, j) => (j === i ? { ...s, firstTwo: select.value === 'two' } : s)) }));
      return el('li', [el('span', ship.name), el('span', [select, button('Remove', `Remove ${ship.name}`, () => removeFrom('ships', i))], { class: 'actions' })]);
    })
    : [el('li', el('span', 'No saved ships yet.'))]));
  const kept = L.cleanKept(cfg.kept);
  const keptRows = KEPT_ROWS.filter(([, keys]) => kept[keys[0]] || kept[keys[1]]);
  $('kept').replaceChildren(...(keptRows.length
    ? keptRows.map(([title, keys]) => {
      const text = L.describeKept(Object.fromEntries(keys.filter(k => kept[k]).map(k => [k, kept[k]])));
      return el('li', [el('span', `${title}: ${text}`), button('Remove', `Remove ${title.toLowerCase()} filter`, () => removeKept(keys))]);
    })
    : [el('li', el('span', 'No kept filters yet.'))]));
  $('autoApply').checked = cfg.autoApply;
  $('removeHidden').checked = cfg.removeHidden;
}

function button(text, label, onClick) {
  const b = el('button', text, { type: 'button', 'aria-label': label });
  b.addEventListener('click', onClick);
  return b;
}

for (const form of document.querySelectorAll('form.add')) {
  form.addEventListener('submit', e => {
    e.preventDefault();
    const key = form.dataset.list;
    const box = form.querySelector('textarea');
    const { names, skipped } = L.parseList(box.value);
    const fresh = names.filter(n => !cfg[key].some(x => L.norm(x) === L.norm(n)));
    if (fresh.length) save({ [key]: [...cfg[key], ...fresh] });
    box.value = '';
    form.querySelector('.status').textContent = `Added ${fresh.length}.` +
      (skipped ? ` Skipped ${skipped} wildcard ${skipped === 1 ? 'entry' : 'entries'}.` : '');
  });
}

for (const key of ['autoApply', 'removeHidden']) $(key).addEventListener('change', e => save({ [key]: e.target.checked }));

$('export').addEventListener('click', () => {
  const a = el('a', null, {
    href: URL.createObjectURL(new Blob([L.exportSettings(cfg)], { type: 'application/json' })),
    download: `sift-ao3-backup-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('import-button').addEventListener('click', () => $('import').click());
$('import').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const result = L.parseImport(await file.text());
  if (result.error) {
    $('io-status').textContent = `${result.error} Nothing was changed.`;
    return;
  }
  const merged = L.mergeSettings(cfg, result.data);
  await save(Object.fromEntries(KEYS.map(k => [k, merged[k]])));
  $('io-status').textContent = 'Imported.' +
    (result.skipped ? ` Skipped ${result.skipped} wildcard ${result.skipped === 1 ? 'entry' : 'entries'}.` : '');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !KEYS.some(k => k in changes)) return;
  for (const k of KEYS) if (k in changes) cfg[k] = changes[k].newValue ?? L.DEFAULTS[k];
  render();
});

chrome.storage.local.get(KEYS).then(stored => {
  cfg = { ...L.DEFAULTS, ...stored };
  render();
});
