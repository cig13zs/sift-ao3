// Sift for AO3: runs once per AO3 page at document_idle. AO3 pages are server-rendered, so there
// is no MutationObserver; render() is re-run only after settings change.
'use strict';
{
  // Registered before anything can fail, so the popup can always say what happened on this page.
  const state = { hidden: 0, total: 0, unreadable: false };
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg !== 'sift-state') return;
    if (sender.id !== chrome.runtime.id) return;
    reply(state);
  });
  main(state).catch(() => { state.unreadable = true; });
}

async function main(state) {
  const L = globalThis.SiftLib;
  const Store = globalThis.SiftStore;
  const HOUR = 36e5;
  const loaded = await Store.load();
  let cfg = loaded.settings;
  let readWorks = loaded.readWorks;
  let later = loaded.later;
  const kind = L.listingKind(location.href);
  const pageWorkId = L.workIdFromPath(location.pathname);

  // Auto-apply may redirect once per navigation: the flag survives exactly one page load, so a
  // listing reached through our own redirect never redirects again, even if AO3 dropped the filter.
  let afterAutoApply = false;
  let canGuard = true;
  try {
    afterAutoApply = sessionStorage.getItem('sift-auto') === '1';
    sessionStorage.removeItem('sift-auto');
  } catch { canGuard = false; }
  if (cfg.enabled && cfg.autoApply && kind && canGuard && !afterAutoApply && !L.userFiltered(location.href)) {
    const target = L.withFilters(location.href, cfg, true);
    if (target !== location.href) {
      sessionStorage.setItem('sift-auto', '1');
      location.replace(target);
      return;
    }
  }

  if (cfg.enabled && cfg.browse.trackReads && pageWorkId) {
    const next = L.rememberRead(readWorks, pageWorkId, Date.now());
    if (JSON.stringify(next) !== JSON.stringify(readWorks)) {
      readWorks = next;
      await Store.saveLocal({ readWorks });
    }
  }

  const el = (tag, cls, content, attrs = {}) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (content != null) e.append(...[].concat(content));
    return e;
  };
  const button = (text, onClick, attrs) => {
    const b = el('button', 'sift-btn', text, { type: 'button', ...attrs });
    b.addEventListener('click', onClick);
    return b;
  };
  const has = (list, name) => list.some(x => L.norm(x) === L.norm(name));

  const blurbs = [...document.querySelectorAll('li.work.blurb, li.bookmark.blurb, li.series.blurb')].map((li, i) => {
    // Scoped to direct children: bookmark blurbs nest the bookmarker's own blurb inside.
    const texts = sel => [...new Set([...li.querySelectorAll(sel)].map(a => a.textContent.trim()).filter(Boolean))];
    const header = li.querySelector(':scope > .header');
    const users = [...li.querySelectorAll(':scope > .header h4.heading a[rel="author"]')]
      .map(a => L.userFromHref(a.getAttribute('href'))).filter(Boolean);
    const titleA = li.querySelector(':scope > .header h4.heading a[href*="/works/"]')
      || li.querySelector('h4.heading a[href*="/works/"]');
    const id = L.workIdFromHref(titleA?.getAttribute('href') || '') || '';
    const dd = name => (li.querySelector(':scope > dl.stats dd.' + name) || li.querySelector('dl.stats dd.' + name))?.textContent || '';
    const symbol = li.querySelector(':scope > .header span.complete-yes, :scope > .header span.complete-no');
    const updatedText = dd('status') || dd('published') || li.querySelector(':scope > .header p.datetime')?.textContent || '';
    return {
      li, header, i, id,
      isWork: li.classList.contains('work'),
      title: li.querySelector(':scope > .header h4.heading a')?.textContent.trim() || '',
      users: [...new Set(users)],
      relationships: texts(':scope > ul.tags li.relationships a.tag'),
      groups: [
        ['Fandoms', texts(':scope > .header h5.fandoms a.tag')],
        ['Warnings', texts(':scope > ul.tags li.warnings a.tag')],
        ['Relationships', texts(':scope > ul.tags li.relationships a.tag')],
        ['Characters', texts(':scope > ul.tags li.characters a.tag')],
        ['Additional tags', texts(':scope > ul.tags li.freeforms a.tag')],
      ].filter(g => g[1].length),
      words: L.parseCount(dd('words')),
      kudos: L.parseCount(dd('kudos')),
      hits: L.parseCount(dd('hits')),
      wip: L.workIsWip(symbol?.getAttribute('title') || '', dd('chapters')),
      updated: L.parseAo3Date(updatedText),
      hidden: false, revealed: false, bar: null, panel: null,
    };
  });

  const headings = [...document.querySelectorAll('#main h2.heading, #main h3.heading')].map(h => h.textContent).join(' ');
  const unreadable = (kind && !blurbs.length && /\b[1-9][\d,]*\s+(?:Works?|Bookmarked Items?|Found)\b/.test(headings)) ||
    (blurbs.length > 0 && !blurbs.some(b => b.title));

  // The primary ship toggle appears on a relationship tag's works page. AO3's filter sidebar lists
  // the page's own tag in its category facet, so no extra request is needed to know the type.
  const pageTagLink = kind === 'works' ? document.querySelector('#main h2.heading a.tag') : null;
  const pageTag = pageTagLink?.textContent.trim() || '';
  const shipKey = L.norm(pageTag);
  const isShipPage = Boolean(pageTag) && (
    [...document.querySelectorAll('#include_relationship_tags label')]
      .some(l => L.norm(l.textContent.replace(/\(\d+\)\s*$/, '')) === shipKey) ||
    blurbs.some(b => b.relationships.some(r => L.norm(r) === shipKey)));

  let ship = null;          // the saved ship when the filter is on for this page
  let shipNames = null;     // page tag + synonyms, once known
  let synState = '';        // '' | 'loading' | 'failed'
  let synLoad = null;
  let hiddenCount = 0;
  let keptJustNow = false;
  let bar = null;
  let workUi = null;
  const ui = {};

  // One same-origin fetch of the public tag page per ship per week (a failed one retries after an hour).
  function loadShipNames() {
    synLoad ??= (async () => {
      synState = 'loading';
      const { synonyms = {} } = await chrome.storage.local.get('synonyms');
      const now = Date.now();
      let entry = synonyms[shipKey];
      if (!entry || now - entry.at >= (entry.ok ? 7 * L.DAY : HOUR)) {
        entry = { ok: false, names: [], at: now };
        try {
          const url = new URL(pageTagLink.getAttribute('href'), location.origin);
          if (url.origin !== location.origin || !url.pathname.startsWith('/tags/')) throw new Error('not an AO3 tag page');
          const res = await fetch(url);
          const names = res.ok ? L.parseTagPage(await res.text()) : null;
          if (names) entry = { ok: true, names, at: now };
        } catch { /* reported in the bar */ }
        for (const k of Object.keys(synonyms)) if (now - synonyms[k].at >= 7 * L.DAY) delete synonyms[k];
        synonyms[shipKey] = entry;
        await chrome.storage.local.set({ synonyms });
      }
      shipNames = [pageTag, ...entry.names];
      synState = entry.ok ? '' : 'failed';
      render();
    })();
    return synLoad;
  }

  function reasons(b) {
    return L.hideReasons({
      users: b.users, relationships: b.relationships, isWork: b.isWork,
      words: b.words, wip: b.wip, updated: b.updated, opened: Boolean(b.id && readWorks[b.id]),
    }, cfg, {
      now: Date.now(),
      ship: ship && shipNames ? { names: shipNames, firstTwo: ship.firstTwo } : null,
    });
  }

  function rewriteLinks() {
    const filters = cfg.enabled ? cfg : { exclusions: [], kept: {} };
    for (const a of document.querySelectorAll('a[href]')) {
      // AO3's own filter form (including "Clear Filters") stays AO3's.
      if (a.closest('form, .sift-ui')) continue;
      const orig = a.dataset.siftHref ?? a.getAttribute('href');
      if (!/\/(?:works|bookmarks)(?:\/search)?\/?(?:[?#]|$)/.test(orig)) continue;
      const resolved = new URL(orig, location.href).href;
      const next = L.withFilters(resolved, filters);
      if (next !== resolved) {
        a.dataset.siftHref = orig;
        a.setAttribute('href', next);
      } else if (a.dataset.siftHref != null) {
        a.setAttribute('href', orig);
        delete a.dataset.siftHref;
      }
    }
  }

  function orderBlurbs() {
    const parent = blurbs[0]?.li.parentElement;
    if (!parent) return;
    const indexes = cfg.enabled && cfg.browse.sortByRatio
      ? L.orderByRatio(blurbs.map(b => ({ index: b.i, ratio: L.kudosPerHit(b.kudos, b.hits) })))
      : blurbs.map(b => b.i);
    for (const i of indexes) parent.append(blurbs[i].li);
  }

  function statPair(b, cls, label) {
    const dl = b.li.querySelector(':scope > dl.stats') || b.li.querySelector('dl.stats');
    if (!dl) return null;
    let dd = dl.querySelector(':scope > dd.sift-' + cls);
    let dt = dl.querySelector(':scope > dt.sift-' + cls);
    if (!dd) {
      dt = el('dt', 'sift-ui sift-' + cls, label);
      dd = el('dd', 'sift-ui sift-' + cls, '');
      dl.append(dt, dd);
    }
    return { dt, dd };
  }

  function badge(b, cls) {
    if (!b.header) return null;
    const heading = b.header.querySelector('h4.heading');
    if (!heading) return null;
    let node = heading.querySelector(':scope > .sift-badge.sift-' + cls);
    if (!node) {
      node = el('span', 'sift-ui sift-badge sift-' + cls, '');
      heading.append(node);
    }
    return node;
  }

  function syncLaterButton(btn, id, title) {
    if (!btn) return;
    const on = L.laterHas(later, id);
    btn.textContent = on ? 'Saved' : 'Later';
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Saved for later' : 'Save for later');
    btn.title = on ? 'Remove ' + (title || 'this work') + ' from saved for later' : 'Save ' + (title || 'this work') + ' for later';
  }

  async function toggleLater(item, btn) {
    later = L.toggleLater(later, item, Date.now());
    syncLaterButton(btn, item.id, item.title);
    await Store.saveLocal({ later });
  }

  function renderBlurb(b) {
    const why = cfg.enabled ? reasons(b) : [];
    b.hidden = why.length > 0;
    if (!b.hidden) b.revealed = false;
    hiddenCount += b.hidden;
    const collapsed = b.hidden && !b.revealed;
    b.li.classList.toggle('sift-collapsed', collapsed && !cfg.removeHidden);
    b.li.classList.toggle('sift-removed', collapsed && cfg.removeHidden);
    const fresh = cfg.enabled && !b.hidden && L.isFresh(b, cfg.browse, Date.now());
    b.li.classList.toggle('sift-fresh', fresh);
    if (!b.hidden) {
      b.bar?.remove();
      b.bar = null;
    } else {
      if (!b.bar) {
        b.bar = el('div', 'sift-ui sift-hidebar');
        b.barText = el('span');
        b.barBtn = button('Show', () => { b.revealed = !b.revealed; render(); });
        b.bar.append(b.barText, b.barBtn);
        b.li.prepend(b.bar);
      }
      b.barText.textContent = 'Hidden by Sift: ' + why.join('; ');
      b.barBtn.textContent = b.revealed ? 'Hide' : 'Show';
      b.barBtn.setAttribute('aria-label', `${b.revealed ? 'Hide' : 'Show'} ${b.title || 'this work'}`);
    }
    const ratio = statPair(b, 'ratio', 'Kudos/hits:');
    if (ratio) {
      const text = cfg.enabled && cfg.browse.showRatio ? L.formatRatio(b.kudos, b.hits) : '';
      ratio.dd.textContent = text;
      ratio.dt.hidden = !text;
      ratio.dd.hidden = !text;
      if (text) ratio.dd.title = text + ' of hits left a kudos';
    }
    const time = statPair(b, 'time', 'Reading time:');
    if (time) {
      const text = cfg.enabled && cfg.browse.showReadingTime ? L.formatReadingTime(b.words, cfg.browse.wpm) : '';
      time.dd.textContent = text;
      time.dt.hidden = !text;
      time.dd.hidden = !text;
    }
    const opened = badge(b, 'opened');
    if (opened) {
      const show = cfg.enabled && cfg.browse.trackReads && b.id && readWorks[b.id] && !b.hidden;
      opened.hidden = !show;
      opened.textContent = show ? 'Opened' : '';
    }
    const updated = badge(b, 'updated');
    if (updated) {
      updated.hidden = !fresh;
      updated.textContent = fresh ? 'Updated' : '';
    }
    syncLaterButton(b.laterBtn, b.id, b.title);
    if (b.panel) renderPanel(b);
  }

  async function toggleName(key, name) {
    const next = has(cfg[key], name) ? cfg[key].filter(x => L.norm(x) !== L.norm(name)) : [...cfg[key], name];
    cfg = { ...cfg, [key]: next };
    render();
    cfg = await Store.saveSettings({ [key]: next });
  }

  async function excludeNames(names) {
    const fresh = names.filter(n => n && !has(cfg.exclusions, n));
    if (!fresh.length) return [];
    const next = [...cfg.exclusions, ...fresh];
    cfg = { ...cfg, exclusions: next };
    render();
    cfg = await Store.saveSettings({ exclusions: next });
    return fresh;
  }

  function wirePanel(panel, toggles, status, reload) {
    const refresh = () => {
      for (const { t, key, label, pressedText, idleText } of toggles) {
        const on = has(cfg[key], label);
        t.textContent = on ? pressedText : idleText;
        t.setAttribute('aria-label', `${t.textContent} ${label}`);
        t.setAttribute('aria-pressed', String(on));
      }
    };
    const after = (adding, key, label) => {
      status.textContent = key === 'mutedAuthors'
        ? (adding ? `Muted ${label}. Their works are hidden on every listing.` : `${label} is no longer muted.`)
        : (adding
          ? `Excluded "${label}". ${kind ? 'Reload this listing to leave it out.' : 'AO3 listings you open will leave it out.'}`
          : `"${label}" is no longer excluded.`);
      reload.hidden = !(adding && kind && key === 'exclusions');
    };
    return { refresh, after };
  }

  function openPanel(b, btn) {
    if (!b.panel) {
      b.panel = el('div', 'sift-ui sift-panel', null, { id: 'sift-panel-' + b.i, role: 'group', 'aria-label': 'Sift options for ' + (b.title || 'this work') });
      b.toggles = [];
      const row = (label, key, pressedText, idleText) => {
        const t = button(idleText, async () => {
          const adding = !has(cfg[key], label);
          await toggleName(key, label);
          panelApi.after(adding, key, label);
          // Muting collapses this work under the pressed button: keep keyboard focus on the work.
          if (b.li.classList.contains('sift-collapsed')) b.barBtn.focus();
          else if (b.li.classList.contains('sift-removed')) ui.showAll.focus();
        });
        t.classList.add('sift-chip');
        const box = key === 'exclusions'
          ? el('input', 'sift-pick', null, { type: 'checkbox', 'aria-label': 'Select ' + label })
          : null;
        b.toggles.push({ t, key, label, pressedText, idleText, box });
        return el('li', null, box ? [box, el('span', 'sift-name', label), t] : [el('span', 'sift-name', label), t]);
      };
      const section = (title, items) => [el('p', 'sift-label', title), el('ul', 'sift-list', items, { 'aria-label': title })];
      const free = b.groups.find(g => g[0] === 'Additional tags')?.[1] || [];
      b.panel.append(
        ...section('Authors', b.users.length
          ? b.users.map(u => row(u, 'mutedAuthors', 'Muted', 'Mute'))
          : [el('li', null, el('span', 'sift-name', 'No author link (anonymous or orphaned work)'))]),
        ...b.groups.flatMap(([title, tags]) => section(title, tags.map(t => row(t, 'exclusions', 'Excluded', 'Exclude')))),
      );
      b.status = el('p', 'sift-status', '', { 'aria-live': 'polite' });
      b.reload = button('Reload filtered', () => location.assign(L.withFilters(location.href, cfg, true)));
      b.reload.hidden = true;
      const bulk = [];
      const checked = () => b.toggles.filter(t => t.box?.checked).map(t => t.label);
      bulk.push(button('Exclude checked', async () => {
        const names = checked().filter(n => !has(cfg.exclusions, n));
        const added = await excludeNames(names);
        b.status.textContent = added.length
          ? `Excluded ${added.length} ${added.length === 1 ? 'tag' : 'tags'}. ${kind ? 'Reload this listing to leave them out.' : 'AO3 listings you open will leave them out.'}`
          : 'Those tags are already excluded.';
        b.reload.hidden = !(added.length && kind);
        for (const t of b.toggles) if (t.box) t.box.checked = false;
      }));
      if (free.length) {
        bulk.push(button('Exclude all additional tags', async () => {
          const added = await excludeNames(free);
          b.status.textContent = added.length
            ? `Excluded ${added.length} additional ${added.length === 1 ? 'tag' : 'tags'}. ${kind ? 'Reload this listing to leave them out.' : 'AO3 listings you open will leave them out.'}`
            : 'Those additional tags are already excluded.';
          b.reload.hidden = !(added.length && kind);
        }));
      }
      b.panel.append(el('div', 'sift-actions', bulk), el('div', 'sift-row', [b.status, b.reload]));
      b.header.after(b.panel);
      b.panelApi = wirePanel(b.panel, b.toggles, b.status, b.reload);
    }
    const panelApi = b.panelApi;
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    b.panel.hidden = !open;
    panelApi.refresh();
  }

  function renderPanel(b) {
    b.panelApi?.refresh();
  }

  function saveShip(entry) {
    const ships = cfg.ships.filter(s => L.norm(s.name) !== shipKey);
    if (entry) ships.push(entry);
    cfg = { ...cfg, ships };
    render();
    return Store.saveSettings({ ships }).then(next => { cfg = next; });
  }

  function buildBar() {
    bar = el('div', 'sift-ui sift-bar', null, { role: 'region', 'aria-label': 'Sift' });
    ui.count = el('span', 'sift-count', '', { 'aria-live': 'polite' });
    ui.showAll = button('Show all', () => {
      const reveal = blurbs.some(b => b.hidden && !b.revealed);
      for (const b of blurbs) b.revealed = reveal && b.hidden;
      render();
    });
    bar.append(el('p', 'sift-row', [el('strong', null, 'Sift'), ui.count, ui.showAll]));

    if (kind) {
      ui.exText = el('span');
      ui.apply = button('Apply my filters', () => location.assign(L.withFilters(location.href, cfg, true)));
      ui.exRow = el('p', 'sift-row', [ui.exText, ui.apply]);
      bar.append(ui.exRow);
    }

    // Filters picked in AO3's own sidebar (complete only, language, crossovers, word count) can be
    // kept on for every listing, the same way as exclusions.
    if (kind === 'works') {
      ui.keepText = el('span');
      ui.keep = button('Keep on every listing', async () => {
        const kept = keptOnPage();
        cfg = { ...cfg, kept };
        keptJustNow = true;
        render();
        cfg = await Store.saveSettings({ kept });
      });
      ui.keepRow = el('p', 'sift-row', [ui.keepText, ui.keep], { 'aria-live': 'polite' });
      bar.append(ui.keepRow);
    }

    ui.rules = el('p', 'sift-row sift-note');
    ui.sort = button('Sort this page by kudos per hit', () => {
      Store.saveSettings({ browse: { sortByRatio: !cfg.browse.sortByRatio } });
    });
    ui.sortRow = el('p', 'sift-row', [ui.sort]);
    bar.append(ui.rules, ui.sortRow);

    if (isShipPage) {
      const box = (label, onChange) => {
        const input = el('input', null, null, { type: 'checkbox' });
        input.addEventListener('change', () => onChange(input.checked));
        return { input, label: el('label', 'sift-check', [input, label]) };
      };
      ui.first = box('Only works where this ship is listed first', on => saveShip(on ? { name: pageTag, firstTwo: false } : null));
      ui.two = box('Ship in the first two relationship tags', on => saveShip({ name: pageTag, firstTwo: on }));
      ui.shipNote = el('span', 'sift-note', '', { 'aria-live': 'polite' });
      bar.append(el('div', 'sift-row', [ui.first.label, ui.two.label, ui.shipNote], { role: 'group', 'aria-label': 'Primary ship filter' }));
    }

    ui.tip = el('p', 'sift-row sift-note', 'Tip: press the Sift button on any work to mute its author or exclude one of its tags from every listing.');
    ui.card = el('div', 'sift-row sift-card');
    ui.card.hidden = true;
    bar.append(ui.tip, ui.card);
    blurbs[0].li.parentElement.before(bar);

    for (const b of blurbs) {
      if (!b.header) continue;
      const btn = button('Sift', () => openPanel(b, btn), {
        class: 'sift-btn sift-ui sift-open', 'aria-expanded': 'false', 'aria-controls': 'sift-panel-' + b.i,
        'aria-label': 'Sift options for ' + (b.title || 'this work'),
      });
      b.header.append(btn);
      if (b.id) {
        b.laterBtn = button('Later', () => toggleLater({
          id: b.id, title: b.title, authors: b.users, words: b.words,
        }, b.laterBtn), { class: 'sift-btn sift-ui sift-later', 'aria-label': 'Save for later' });
        b.header.append(b.laterBtn);
      }
    }
  }

  function tagGroups(root) {
    const take = (sel, title) => {
      const names = [...new Set([...root.querySelectorAll(sel)].map(a => a.textContent.trim()).filter(Boolean))];
      return names.length ? [title, names] : null;
    };
    return [
      take('dd.warning.tags a.tag, dd.warning a.tag', 'Warnings'),
      take('dd.fandom.tags a.tag, dd.fandom a.tag', 'Fandoms'),
      take('dd.relationship.tags a.tag, dd.relationship a.tag', 'Relationships'),
      take('dd.character.tags a.tag, dd.character a.tag', 'Characters'),
      take('dd.freeform.tags a.tag, dd.freeform a.tag', 'Additional tags'),
    ].filter(Boolean);
  }

  function renderWorkPage() {
    if (!pageWorkId) return;
    const host = document.querySelector('#main');
    if (!host) return;
    if (!workUi) {
      const title = document.querySelector('#workskin h2.title, #main h2.title')?.textContent.trim()
        || document.title.replace(/\s*\|.*$/, '').trim();
      const users = [...new Set([...host.querySelectorAll('a[rel="author"]')]
        .map(a => L.userFromHref(a.getAttribute('href'))).filter(Boolean))];
      const groups = tagGroups(host);
      const words = L.parseCount(document.querySelector('dd.words')?.textContent || '');
      workUi = { toggles: [] };
      workUi.bar = el('div', 'sift-ui sift-bar', null, { role: 'region', 'aria-label': 'Sift' });
      workUi.later = button('Later', () => toggleLater({ id: pageWorkId, title, authors: users, words }, workUi.later), {
        class: 'sift-btn sift-ui sift-later', 'aria-label': 'Save for later',
      });
      workUi.opened = el('span', 'sift-ui sift-badge sift-opened', 'Opened');
      const openBtn = button('Sift', () => {
        const open = openBtn.getAttribute('aria-expanded') !== 'true';
        openBtn.setAttribute('aria-expanded', String(open));
        workUi.panel.hidden = !open;
        workUi.refresh();
      }, {
        class: 'sift-btn sift-ui sift-open', 'aria-expanded': 'false', 'aria-controls': 'sift-panel-work',
        'aria-label': 'Sift options for this work',
      });
      workUi.panel = el('div', 'sift-ui sift-panel', null, {
        id: 'sift-panel-work', role: 'group', 'aria-label': 'Sift options for this work', hidden: '',
      });
      const row = (label, key, pressedText, idleText) => {
        const t = button(idleText, async () => {
          const adding = !has(cfg[key], label);
          await toggleName(key, label);
          workUi.after(adding, key, label);
        });
        t.classList.add('sift-chip');
        const box = key === 'exclusions'
          ? el('input', 'sift-pick', null, { type: 'checkbox', 'aria-label': 'Select ' + label })
          : null;
        workUi.toggles.push({ t, key, label, pressedText, idleText, box });
        return el('li', null, box ? [box, el('span', 'sift-name', label), t] : [el('span', 'sift-name', label), t]);
      };
      const section = (heading, items) => [el('p', 'sift-label', heading), el('ul', 'sift-list', items, { 'aria-label': heading })];
      workUi.panel.append(
        ...section('Authors', users.length
          ? users.map(u => row(u, 'mutedAuthors', 'Muted', 'Mute'))
          : [el('li', null, el('span', 'sift-name', 'No author link (anonymous or orphaned work)'))]),
        ...groups.flatMap(([heading, tags]) => section(heading, tags.map(t => row(t, 'exclusions', 'Excluded', 'Exclude')))),
      );
      workUi.status = el('p', 'sift-status', '', { 'aria-live': 'polite' });
      workUi.reload = button('Reload filtered', () => location.assign(L.withFilters(location.href, cfg, true)));
      workUi.reload.hidden = true;
      const wired = wirePanel(workUi.panel, workUi.toggles, workUi.status, workUi.reload);
      workUi.refresh = wired.refresh;
      workUi.after = wired.after;
      const free = groups.find(g => g[0] === 'Additional tags')?.[1] || [];
      const bulk = [button('Exclude checked', async () => {
        const names = workUi.toggles.filter(t => t.box?.checked).map(t => t.label);
        const added = await excludeNames(names);
        workUi.status.textContent = added.length
          ? `Excluded ${added.length} ${added.length === 1 ? 'tag' : 'tags'}. AO3 listings you open will leave them out.`
          : 'Those tags are already excluded.';
        for (const t of workUi.toggles) if (t.box) t.box.checked = false;
      })];
      if (free.length) {
        bulk.push(button('Exclude all additional tags', async () => {
          const added = await excludeNames(free);
          workUi.status.textContent = added.length
            ? `Excluded ${added.length} additional ${added.length === 1 ? 'tag' : 'tags'}. AO3 listings you open will leave them out.`
            : 'Those additional tags are already excluded.';
        }));
      }
      workUi.panel.append(el('div', 'sift-actions', bulk), el('div', 'sift-row', [workUi.status, workUi.reload]));
      workUi.bar.append(el('p', 'sift-row', [el('strong', null, 'Sift'), workUi.later, workUi.opened, openBtn]), workUi.panel);
      const skin = document.querySelector('#workskin');
      if (skin) skin.before(workUi.bar);
      else host.prepend(workUi.bar);
    }
    syncLaterButton(workUi.later, pageWorkId, '');
    workUi.opened.hidden = !(cfg.browse.trackReads && readWorks[pageWorkId]);
    workUi.refresh();
  }

  // The page's kept-able filters, with the language's name from AO3's own language menu.
  function keptOnPage() {
    const fromUrl = L.keptFromUrl(location.href);
    const option = fromUrl.language_id &&
      [...document.querySelectorAll('#work_search_language_id option')].find(o => o.value === fromUrl.language_id);
    return L.cleanKept({ ...fromUrl, languageName: option?.textContent || '' });
  }

  function renderBar() {
    ui.count.textContent = `${hiddenCount} of ${blurbs.length} works hidden on this page`;
    ui.showAll.hidden = !hiddenCount;
    ui.showAll.textContent = blurbs.some(b => b.hidden && !b.revealed) ? 'Show all' : 'Hide again';
    if (ui.exRow) {
      const n = cfg.exclusions.length;
      const kept = kind === 'works' ? L.describeKept(cfg.kept) : '';
      const exclusions = `${n} saved exclusion${n === 1 ? '' : 's'}`;
      const applied = L.filtersApplied(location.href, cfg);
      ui.exRow.hidden = !n && !kept;
      ui.exText.textContent = !applied
        ? `Your saved ${kept ? 'filters' : 'exclusions'} are not applied to this listing.`
        : !kept ? `Your ${exclusions} ${n === 1 ? 'is' : 'are'} applied to this listing.`
          : n ? `Your ${exclusions} and kept filters (${kept}) are applied to this listing.`
            : `Your kept filters (${kept}) are applied to this listing.`;
      ui.apply.hidden = applied;
    }
    if (ui.keepRow) {
      const fromUrl = keptOnPage();
      const offer = L.keptCount(fromUrl) > 0 && !L.sameKept(fromUrl, cfg.kept);
      ui.keepRow.hidden = !offer && !keptJustNow;
      ui.keep.hidden = !offer;
      ui.keepText.textContent = offer
        ? `This listing uses ${L.describeKept(fromUrl)}.`
        : 'Kept. Every AO3 listing you open now uses these filters; change them in Sift\'s options.';
    }
    const rules = cfg.enabled ? L.describeBrowse(cfg.browse) : '';
    ui.rules.hidden = !rules;
    ui.rules.textContent = rules ? 'On this page: ' + rules + '.' : '';
    const canSort = blurbs.some(b => L.kudosPerHit(b.kudos, b.hits) != null);
    ui.sortRow.hidden = !canSort;
    ui.sort.textContent = cfg.browse.sortByRatio ? "Back to AO3's order" : 'Sort this page by kudos per hit';
    ui.sort.setAttribute('aria-pressed', String(Boolean(cfg.browse.sortByRatio)));
    if (ui.first) {
      ui.first.input.checked = Boolean(ship);
      ui.two.input.checked = Boolean(ship?.firstTwo);
      ui.two.input.disabled = !ship;
      ui.shipNote.textContent = !ship ? ''
        : synState === 'loading' ? 'Checking AO3 for other names of this ship...'
          : synState === 'failed' ? 'AO3 did not answer, so works that use another name for this ship may be hidden too.'
            : 'On for this ship on every page, until you untick it.';
    }
    ui.tip.hidden = Boolean(cfg.exclusions.length || cfg.mutedAuthors.length || cfg.ships.length || L.keptCount(cfg.kept));
  }

  function showCard(id) {
    const rating = id === 'rating';
    const close = (forever) => async () => {
      ui.card.hidden = true;
      if (!forever) return;
      const { stats = {} } = await chrome.storage.local.get('stats');
      await chrome.storage.local.set({ stats: { ...stats, noAsks: true } });
    };
    const link = el('a', 'sift-btn', rating ? 'Rate Sift' : 'Support on Ko-fi', {
      href: rating ? L.STORE_URL : L.KOFI_URL, target: '_blank', rel: 'noopener noreferrer',
    });
    ui.card.replaceChildren(
      el('span', null, rating
        ? 'Has Sift made AO3 easier to browse? A quick store rating helps other readers find it.'
        : `Sift has filtered ${id === 'm500' ? '500' : '5,000'} AO3 listings for you.`),
      link,
      button(rating ? 'No thanks' : 'Close', close(false)),
      button("Don't show again", close(true)),
    );
    ui.card.hidden = false;
  }

  function render() {
    document.documentElement.classList.toggle('sift-off', !cfg.enabled);
    rewriteLinks();
    renderWorkPage();
    if (!blurbs.length || unreadable) return;
    ship = cfg.enabled && isShipPage ? cfg.ships.find(s => L.norm(s.name) === shipKey) || null : null;
    if (ship && !shipNames) loadShipNames();
    if (!bar) buildBar();
    hiddenCount = 0;
    for (const b of blurbs) renderBlurb(b);
    orderBlurbs();
    renderBar();
    state.hidden = hiddenCount;
    state.total = blurbs.length;
  }

  // Counts the page toward the milestone when at least one Sift filter is in effect.
  async function recordLoad() {
    if (!cfg.enabled || !blurbs.length || unreadable) return;
    if (ship) await loadShipNames();
    const { stats = {} } = await chrome.storage.local.get('stats');
    const now = Date.now();
    const filtered = hiddenCount > 0 || Boolean(ship) ||
      Boolean(kind && (cfg.exclusions.length || L.keptCount(cfg.kept)) && L.filtersApplied(location.href, cfg));
    stats.firstUse ??= now;
    stats.hiddenTotal = (stats.hiddenTotal || 0) + hiddenCount;
    if (filtered) stats.listings = (stats.listings || 0) + 1;
    const card = L.nextCard(stats, now);
    if (card) stats.seen = [...(stats.seen || []), card];
    await chrome.storage.local.set({ stats });
    if (card) showCard(card);
  }

  Store.watch((changes, area) => {
    if (area === 'sync') {
      if (!cfg.syncEnabled) return;
      Store.load().then(fresh => {
        cfg = fresh.settings;
        render();
      }).catch(() => {});
      return;
    }
    if (area !== 'local') return;
    let dirty = false;
    for (const k of L.SETTING_KEYS) if (k in changes) {
      cfg[k] = changes[k].newValue ?? L.DEFAULTS[k];
      dirty = true;
    }
    if (dirty) cfg = L.hydrate(cfg);
    if ('readWorks' in changes) { readWorks = changes.readWorks.newValue || {}; dirty = true; }
    if ('later' in changes) { later = L.cleanLater(changes.later.newValue || []); dirty = true; }
    if (dirty) render();
  });

  state.unreadable = Boolean(unreadable);
  render();
  await recordLoad();
}
