const L = globalThis.SiftLib;
const Store = globalThis.SiftStore;
const $ = id => document.getElementById(id);
let cfg = L.hydrate(L.DEFAULTS);
let later = [];
let readWorks = {};
let syncWarning = '';

const el = (tag, content, attrs = {}) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (content != null) e.append(...[].concat(content));
  return e;
};

const BROWSE_BOXES = ['showRatio', 'showReadingTime', 'sortByRatio', 'hideWip', 'hideRead', 'trackReads'];
const BROWSE_NUMS = ['wordsFrom', 'wordsTo', 'staleDays', 'freshDays', 'wpm'];

async function save(patch) {
  cfg = L.hydrate({ ...cfg, ...patch, browse: patch.browse ? { ...cfg.browse, ...patch.browse } : cfg.browse });
  render();
  cfg = await Store.saveSettings(patch);
  render();
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

function emptyItem(text) {
  return el('li', el('span', text), { class: 'is-empty' });
}

function setNum(id, value) {
  const node = $(id);
  if (document.activeElement === node) return;
  node.value = value ?? '';
}

function render() {
  for (const key of ['exclusions', 'mutedAuthors']) {
    $(key).replaceChildren(...(cfg[key].length
      ? cfg[key].map((name, i) => el('li', [el('span', name),
        chipButton('Remove', `Remove ${name}`, () => removeFrom(key, i))]))
      : [emptyItem(key === 'exclusions' ? 'No saved exclusions yet. Add a tag below, or exclude one from a work on AO3.' : 'No muted authors. Mute someone from a work’s Sift panel, or add a user name below.')]));
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
    : [emptyItem('No saved ships yet. Open a relationship tag’s works page and turn the filter on in the Sift bar.')]));
  const kept = L.cleanKept(cfg.kept);
  const keptRows = KEPT_ROWS.filter(([, keys]) => kept[keys[0]] || kept[keys[1]]);
  $('kept').replaceChildren(...(keptRows.length
    ? keptRows.map(([title, keys]) => {
      const text = L.describeKept(Object.fromEntries(keys.filter(k => kept[k]).map(k => [k, kept[k]])));
      return el('li', [el('span', `${title}: ${text}`), button('Remove', `Remove ${title.toLowerCase()} filter`, () => removeKept(keys))]);
    })
    : [emptyItem('No kept filters yet. Filter a listing with AO3’s sidebar, then press “Keep on every listing”.')]));
  $('presets').replaceChildren(...(cfg.presets.length
    ? cfg.presets.map(p => el('li', [
      el('span', p.name),
      el('span', [
        button('Apply', `Apply ${p.name}`, () => applyPreset(p.id)),
        button('Remove', `Remove preset ${p.name}`, () => save({ presets: L.deletePreset(cfg, p.id) })),
      ], { class: 'actions' }),
    ]))
    : [emptyItem('No presets yet. Name the filters you have now and save them.')]));
  $('later').replaceChildren(...(later.length
    ? later.map(item => {
      const href = 'https://archiveofourown.org/works/' + item.id;
      const link = el('a', item.title, { href, target: '_blank', rel: 'noopener noreferrer' });
      const meta = item.authors.length ? item.authors.join(', ') : 'Anonymous';
      return el('li', [el('span', [link, el('span', meta, { class: 'hint' })]),
        button('Remove', `Remove ${item.title} from saved for later`, () => {
          later = L.toggleLater(later, item, Date.now());
          Store.saveLocal({ later });
          render();
        })]);
    })
    : [emptyItem('Nothing saved for later. Press Later on a work.')]));
  $('autoApply').checked = cfg.autoApply;
  $('removeHidden').checked = cfg.removeHidden;
  $('syncEnabled').checked = cfg.syncEnabled;
  for (const id of BROWSE_BOXES) $(id).checked = Boolean(cfg.browse[id]);
  for (const id of BROWSE_NUMS) setNum(id, cfg.browse[id] || (id === 'wpm' ? cfg.browse.wpm : ''));
  const n = Object.keys(readWorks).length;
  $('read-count').textContent = n ? `${n.toLocaleString()} work${n === 1 ? '' : 's'} remembered.` : 'Nothing remembered yet.';
  $('sync-status').textContent = syncWarning || '';
}

function button(text, label, onClick) {
  const b = el('button', text, { type: 'button', 'aria-label': label });
  b.addEventListener('click', onClick);
  return b;
}

function chipButton(text, label, onClick) {
  const b = button(text, label, onClick);
  b.classList.add('chip-x');
  return b;
}

function browseFromForm(changed) {
  const browse = {
    showRatio: $('showRatio').checked,
    showReadingTime: $('showReadingTime').checked,
    sortByRatio: $('sortByRatio').checked,
    hideWip: $('hideWip').checked,
    hideRead: $('hideRead').checked,
    trackReads: $('trackReads').checked,
    wordsFrom: $('wordsFrom').value,
    wordsTo: $('wordsTo').value,
    staleDays: $('staleDays').value,
    freshDays: $('freshDays').value,
    wpm: $('wpm').value,
  };
  if (changed === 'trackReads' && !browse.trackReads) browse.hideRead = false;
  if (changed === 'hideRead' && browse.hideRead) browse.trackReads = true;
  return browse;
}

function applyPreset(id) {
  const next = L.applyPreset(cfg, id);
  const name = cfg.presets.find(p => p.id === id)?.name || 'Preset';
  save({
    exclusions: next.exclusions,
    mutedAuthors: next.mutedAuthors,
    ships: next.ships,
    kept: next.kept,
    browse: next.browse,
  });
  $('preset-status').textContent = `Applied ${name}.`;
}

for (const form of document.querySelectorAll('form.add')) {
  if (form.id === 'preset-form') continue;
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

$('preset-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('preset-name').value;
  const presets = L.makePreset(cfg, name, Date.now());
  if (presets.length === cfg.presets.length && !presets.some(p => L.norm(p.name) === L.norm(name))) {
    $('preset-status').textContent = 'Give the preset a name.';
    return;
  }
  $('preset-name').value = '';
  save({ presets });
  $('preset-status').textContent = `Saved preset ${name.trim()}.`;
});

for (const key of ['autoApply', 'removeHidden', 'syncEnabled']) {
  $(key).addEventListener('change', e => save({ [key]: e.target.checked }));
}
for (const id of BROWSE_BOXES) $(id).addEventListener('change', () => save({ browse: browseFromForm(id) }));
for (const id of BROWSE_NUMS) $(id).addEventListener('change', () => save({ browse: browseFromForm(id) }));

function arm(buttonId, label, fn) {
  const btn = $(buttonId);
  let armed = false;
  let timer = 0;
  btn.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      btn.textContent = 'Click again to clear';
      timer = setTimeout(() => { armed = false; btn.textContent = label; }, 4000);
      return;
    }
    armed = false;
    clearTimeout(timer);
    btn.textContent = label;
    await fn();
  });
}

arm('clear-reads', 'Clear opened works', async () => {
  readWorks = {};
  await Store.saveLocal({ readWorks: {} });
  render();
});
arm('clear-later', 'Clear saved for later', async () => {
  later = [];
  await Store.saveLocal({ later: [] });
  render();
});

$('export').addEventListener('click', () => {
  const a = el('a', null, {
    href: URL.createObjectURL(new Blob([L.exportSettings({ ...cfg, later, readWorks })], { type: 'application/json' })),
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
  const merged = L.mergeSettings({ ...cfg, later, readWorks }, result.data);
  later = merged.later || later;
  readWorks = merged.readWorks || readWorks;
  await Store.saveLocal({ later, readWorks });
  await save({
    exclusions: merged.exclusions,
    mutedAuthors: merged.mutedAuthors,
    ships: merged.ships,
    autoApply: merged.autoApply,
    removeHidden: merged.removeHidden,
    kept: merged.kept,
    browse: merged.browse,
    presets: merged.presets,
  });
  $('io-status').textContent = 'Imported.' +
    (result.skipped ? ` Skipped ${result.skipped} wildcard ${result.skipped === 1 ? 'entry' : 'entries'}.` : '');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if ('syncWarning' in changes) syncWarning = changes.syncWarning.newValue || '';
  let dirty = 'syncWarning' in changes;
  for (const k of L.SETTING_KEYS) if (k in changes) {
    cfg[k] = changes[k].newValue ?? L.DEFAULTS[k];
    dirty = true;
  }
  if (dirty) cfg = L.hydrate(cfg);
  if ('later' in changes) { later = L.cleanLater(changes.later.newValue || []); dirty = true; }
  if ('readWorks' in changes) { readWorks = L.cleanReadWorks(changes.readWorks.newValue || {}); dirty = true; }
  if (dirty) render();
});

Store.load().then(stored => {
  cfg = stored.settings;
  later = stored.later;
  readWorks = stored.readWorks;
  syncWarning = stored.syncWarning;
  render();
});
