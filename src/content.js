// Sift for AO3: runs once per AO3 page at document_idle. AO3 pages are server-rendered, so there
// is no MutationObserver; render() is re-run only after settings change.
'use strict';
{
  // Registered before anything can fail, so the popup can always say what happened on this page.
  const state = { hidden: 0, total: 0, unreadable: false };
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg === 'sift-state') reply(state);
  });
  main(state).catch(() => { state.unreadable = true; });
}

async function main(state) {
  const L = globalThis.SiftLib;
  const KEYS = Object.keys(L.DEFAULTS);
  const HOUR = 36e5;
  let cfg = { ...L.DEFAULTS, ...(await chrome.storage.local.get(KEYS)) };
  const kind = L.listingKind(location.href);

  // Auto-apply may redirect once per navigation: the flag survives exactly one page load, so a
  // listing reached through our own redirect never redirects again, even if AO3 dropped the filter.
  let afterAutoApply = false;
  let canGuard = true;
  try {
    afterAutoApply = sessionStorage.getItem('sift-auto') === '1';
    sessionStorage.removeItem('sift-auto');
  } catch { canGuard = false; }
  if (cfg.enabled && cfg.autoApply && kind && canGuard && !afterAutoApply && !L.userFiltered(location.href)) {
    const target = L.withExclusions(location.href, cfg.exclusions, true);
    if (target !== location.href) {
      sessionStorage.setItem('sift-auto', '1');
      location.replace(target);
      return;
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
    return {
      li, header, i,
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
  let bar = null;
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
    const out = [];
    const muted = b.users.filter(u => has(cfg.mutedAuthors, u));
    if (muted.length) out.push('muted author ' + muted.join(', '));
    if (ship && shipNames && b.isWork && !L.isPrimaryShip(b.relationships, shipNames, ship.firstTwo)) out.push('not primary ship');
    return out;
  }

  function rewriteLinks() {
    const exclusions = cfg.enabled ? cfg.exclusions : [];
    for (const a of document.querySelectorAll('a[href]')) {
      // AO3's own filter form (including "Clear Filters") stays AO3's.
      if (a.closest('form, .sift-ui')) continue;
      const orig = a.dataset.siftHref ?? a.getAttribute('href');
      if (!/\/(?:works|bookmarks)(?:\/search)?\/?(?:[?#]|$)/.test(orig)) continue;
      const resolved = new URL(orig, location.href).href;
      const next = L.withExclusions(resolved, exclusions);
      if (next !== resolved) {
        a.dataset.siftHref = orig;
        a.setAttribute('href', next);
      } else if (a.dataset.siftHref != null) {
        a.setAttribute('href', orig);
        delete a.dataset.siftHref;
      }
    }
  }

  function renderBlurb(b) {
    const why = cfg.enabled ? reasons(b) : [];
    b.hidden = why.length > 0;
    if (!b.hidden) b.revealed = false;
    hiddenCount += b.hidden;
    const collapsed = b.hidden && !b.revealed;
    b.li.classList.toggle('sift-collapsed', collapsed && !cfg.removeHidden);
    b.li.classList.toggle('sift-removed', collapsed && cfg.removeHidden);
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
    if (b.panel) renderPanel(b);
  }

  async function toggleName(key, name) {
    const next = has(cfg[key], name) ? cfg[key].filter(x => L.norm(x) !== L.norm(name)) : [...cfg[key], name];
    cfg = { ...cfg, [key]: next };
    render();
    await chrome.storage.local.set({ [key]: next });
  }

  function openPanel(b, btn) {
    if (!b.panel) {
      b.panel = el('div', 'sift-ui sift-panel', null, { id: 'sift-panel-' + b.i, role: 'group', 'aria-label': 'Sift options for ' + (b.title || 'this work') });
      b.toggles = [];
      const row = (label, key, pressedText, idleText) => {
        const t = button(idleText, async () => {
          const adding = !has(cfg[key], label);
          await toggleName(key, label);
          b.status.textContent = key === 'mutedAuthors'
            ? (adding ? `Muted ${label}. Their works are hidden on every listing.` : `${label} is no longer muted.`)
            : (adding ? `Excluded "${label}". ${kind ? 'Reload this listing to leave it out.' : 'AO3 listings you open will leave it out.'}` : `"${label}" is no longer excluded.`);
          b.reload.hidden = !(adding && kind && key === 'exclusions');
          // Muting collapses this work under the pressed button: keep keyboard focus on the work.
          if (b.li.classList.contains('sift-collapsed')) b.barBtn.focus();
          else if (b.li.classList.contains('sift-removed')) ui.showAll.focus();
        });
        b.toggles.push({ t, key, label, pressedText, idleText });
        return el('li', null, [el('span', 'sift-name', label), t]);
      };
      const section = (title, items) => [el('p', 'sift-label', title), el('ul', 'sift-list', items, { 'aria-label': title })];
      b.panel.append(
        ...section('Authors', b.users.length
          ? b.users.map(u => row(u, 'mutedAuthors', 'Muted', 'Mute'))
          : [el('li', null, el('span', 'sift-name', 'No author link (anonymous or orphaned work)'))]),
        ...b.groups.flatMap(([title, tags]) => section(title, tags.map(t => row(t, 'exclusions', 'Excluded', 'Exclude')))),
      );
      b.status = el('p', 'sift-status', '', { 'aria-live': 'polite' });
      b.reload = button('Reload filtered', () => location.assign(L.withExclusions(location.href, cfg.exclusions, true)));
      b.reload.hidden = true;
      b.panel.append(el('div', 'sift-row', [b.status, b.reload]));
      b.header.after(b.panel);
    }
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    b.panel.hidden = !open;
    renderPanel(b);
  }

  function renderPanel(b) {
    for (const { t, key, label, pressedText, idleText } of b.toggles) {
      const on = has(cfg[key], label);
      t.textContent = on ? pressedText : idleText;
      t.setAttribute('aria-label', `${t.textContent} ${label}`);
      t.setAttribute('aria-pressed', String(on));
    }
  }

  function saveShip(entry) {
    const ships = cfg.ships.filter(s => L.norm(s.name) !== shipKey);
    if (entry) ships.push(entry);
    cfg = { ...cfg, ships };
    render();
    return chrome.storage.local.set({ ships });
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
      ui.apply = button('Apply my filters', () => location.assign(L.withExclusions(location.href, cfg.exclusions, true)));
      ui.exRow = el('p', 'sift-row', [ui.exText, ui.apply]);
      bar.append(ui.exRow);
    }

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
    }
  }

  function renderBar() {
    ui.count.textContent = `${hiddenCount} of ${blurbs.length} works hidden on this page`;
    ui.showAll.hidden = !hiddenCount;
    ui.showAll.textContent = blurbs.some(b => b.hidden && !b.revealed) ? 'Show all' : 'Hide again';
    if (ui.exRow) {
      const n = cfg.exclusions.length;
      const applied = L.exclusionsApplied(location.href, cfg.exclusions);
      ui.exRow.hidden = !n;
      ui.exText.textContent = applied
        ? `Your ${n} saved exclusion${n === 1 ? ' is' : 's are'} applied to this listing.`
        : 'Your saved exclusions are not applied to this listing.';
      ui.apply.hidden = applied;
    }
    if (ui.first) {
      ui.first.input.checked = Boolean(ship);
      ui.two.input.checked = Boolean(ship?.firstTwo);
      ui.two.input.disabled = !ship;
      ui.shipNote.textContent = !ship ? ''
        : synState === 'loading' ? 'Checking AO3 for other names of this ship...'
          : synState === 'failed' ? 'AO3 did not answer, so works that use another name for this ship may be hidden too.'
            : 'On for this ship on every page, until you untick it.';
    }
    ui.tip.hidden = Boolean(cfg.exclusions.length || cfg.mutedAuthors.length || cfg.ships.length);
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
    if (!blurbs.length || unreadable) return;
    ship = cfg.enabled && isShipPage ? cfg.ships.find(s => L.norm(s.name) === shipKey) || null : null;
    if (ship && !shipNames) loadShipNames();
    if (!bar) buildBar();
    hiddenCount = 0;
    for (const b of blurbs) renderBlurb(b);
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
      Boolean(kind && cfg.exclusions.length && L.exclusionsApplied(location.href, cfg.exclusions));
    stats.firstUse ??= now;
    stats.hiddenTotal = (stats.hiddenTotal || 0) + hiddenCount;
    if (filtered) stats.listings = (stats.listings || 0) + 1;
    const card = L.nextCard(stats, now);
    if (card) stats.seen = [...(stats.seen || []), card];
    await chrome.storage.local.set({ stats });
    if (card) showCard(card);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !KEYS.some(k => k in changes)) return;
    for (const k of KEYS) if (k in changes) cfg[k] = changes[k].newValue ?? L.DEFAULTS[k];
    render();
  });

  state.unreadable = Boolean(unreadable);
  render();
  await recordLoad();
}
