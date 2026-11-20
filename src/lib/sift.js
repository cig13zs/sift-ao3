// Pure logic for Sift for AO3: no DOM and no chrome.* calls. Loaded as a content script,
// by the options page, and by the Node unit tests.
(function (root) {
  'use strict';

  const AO3 = 'https://archiveofourown.org';
  const DAY = 864e5;
  // Chrome Web Store reviews page for the one-time rating card.
  const STORE_URL = 'https://chromewebstore.google.com/detail/nonieoiidaeaeheddaifgdmecgcbfgpl/reviews';
  const KOFI_URL = 'https://ko-fi.com/jju1s';
  // On-the-page rules. Empty strings mean "off". Defaults add nothing that hides a work,
  // so an existing install keeps the same listings until the reader turns a rule on.
  const DEFAULT_BROWSE = Object.freeze({
    hideRead: false, trackReads: false, hideWip: false,
    wordsFrom: '', wordsTo: '', staleDays: '', freshDays: '',
    showRatio: true, showReadingTime: true, wpm: 250, sortByRatio: false,
  });
  const DEFAULTS = Object.freeze({
    enabled: true, exclusions: [], mutedAuthors: [], ships: [], autoApply: false, removeHidden: false,
    kept: {}, browse: DEFAULT_BROWSE, presets: [], syncEnabled: false, settingsVersion: 2, updatedAt: 0,
  });
  const LISTS = ['exclusions', 'mutedAuthors'];
  const FLAGS = ['autoApply', 'removeHidden'];
  const SETTING_KEYS = Object.freeze([
    'enabled', 'exclusions', 'mutedAuthors', 'ships', 'autoApply', 'removeHidden', 'kept',
    'browse', 'presets', 'syncEnabled', 'settingsVersion', 'updatedAt',
  ]);
  const SYNC_KEYS = Object.freeze(['sift-meta', 'sift-exclusions', 'sift-muted', 'sift-ships', 'sift-presets']);
  // Chrome's per-item sync quota is 8,192 bytes. Stay under it so a big list fails clearly
  // instead of rejecting the whole save.
  const SYNC_ITEM_MAX = 8000;
  const READ_CAP = 2000;
  const LATER_CAP = 300;
  const PRESET_CAP = 24;

  const norm = s => String(s).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

  function parse(href) {
    try { return new URL(href, AO3); } catch { return null; }
  }

  // Listings AO3 filters server-side. Checked live on 2026-09-25 for tag works, /works?tag_id=,
  // search results, user works and tag bookmarks; collections use the same controller.
  const LISTING_PATH = /^\/(?:(?:tags|collections)\/[^/]+(?:\/tags\/[^/]+)?|users\/[^/]+(?:\/pseuds\/[^/]+)?)\/(works|bookmarks)$/;
  const OWNER_KEYS = ['tag_id', 'user_id', 'pseud_id', 'collection_id', 'fandom_id'];
  const PARAM = { works: 'work_search[excluded_tag_names]', bookmarks: 'bookmark_search[excluded_tag_names]' };

  // 'works' | 'bookmarks' | null
  function listingKind(href) {
    const u = parse(href);
    if (!u || u.hostname !== 'archiveofourown.org') return null;
    const path = u.pathname.replace(/\/+$/, '');
    const m = LISTING_PATH.exec(path);
    if (m) return m[1];
    const keys = [...u.searchParams.keys()];
    if (path === '/works' || path === '/bookmarks') {
      return keys.some(k => OWNER_KEYS.includes(k)) ? path.slice(1) : null;
    }
    // The bare search pages are forms; only result pages carry search parameters.
    const search = /^\/(works|bookmarks)\/search$/.exec(path);
    if (search) {
      const prefix = search[1] === 'works' ? 'work_search[' : 'bookmark_search[';
      return keys.some(k => k.startsWith(prefix)) ? search[1] : null;
    }
    return null;
  }

  const splitNames = s => String(s || '').split(',').map(t => t.trim()).filter(Boolean);

  // Adds the saved exclusions to a listing URL, appending to any excluded list already there and
  // keeping every other parameter. Returns href unchanged when there is nothing to add.
  function withExclusions(href, exclusions, resetPage = false) {
    const kind = listingKind(href);
    if (!kind || !exclusions || !exclusions.length) return href;
    const u = parse(href);
    const key = PARAM[kind];
    const current = splitNames(u.searchParams.getAll(key).join(','));
    const seen = new Set(current.map(norm));
    const added = [];
    for (const t of exclusions) {
      const n = norm(t);
      if (n && !seen.has(n)) { seen.add(n); added.push(t.trim()); }
    }
    if (!added.length) return href;
    u.searchParams.set(key, current.concat(added).join(','));
    if (resetPage) u.searchParams.delete('page');
    return u.href;
  }

  const exclusionsApplied = (href, exclusions) => withExclusions(href, exclusions) === href;

  // Other AO3 work filters Sift can keep on, as named in AO3's filter form (otwarchive
  // app/views/works/_filters.html.erb). Bookmark listings use different fields, so these only
  // go on work listings and searches.
  const KEPT = {
    complete: v => v === 'T' || v === 'F',
    crossover: v => v === 'T' || v === 'F',
    language_id: v => /^[A-Za-z][A-Za-z-]{0,15}$/.test(v),
    words_from: v => /^\d{1,9}$/.test(v),
    words_to: v => /^\d{1,9}$/.test(v),
  };
  const keptParam = k => `work_search[${k}]`;

  // Only the fields Sift knows, with values AO3 accepts. languageName is display text.
  function cleanKept(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [k, valid] of Object.entries(KEPT)) {
      const v = typeof raw[k] === 'string' ? raw[k].trim().replace(/,/g, '') : '';
      if (v && valid(v)) out[k] = v;
    }
    if (out.language_id && typeof raw.languageName === 'string' && raw.languageName.trim()) {
      out.languageName = raw.languageName.trim().slice(0, 60);
    }
    return out;
  }

  // The keepable filters a works listing URL carries, e.g. after the reader used AO3's sidebar.
  function keptFromUrl(href) {
    if (listingKind(href) !== 'works') return {};
    const u = parse(href);
    return cleanKept(Object.fromEntries(Object.keys(KEPT).map(k => [k, u.searchParams.get(keptParam(k)) || ''])));
  }

  const keptCount = kept => Object.keys(cleanKept(kept)).filter(k => k !== 'languageName').length;

  // Same filters, ignoring the language's display name.
  const sameKept = (a, b) => {
    const x = cleanKept(a);
    const y = cleanKept(b);
    return Object.keys(KEPT).every(k => (x[k] || '') === (y[k] || ''));
  };

  // Fills kept filters into a works listing URL. A field the URL already sets is left as it is,
  // so a choice made in AO3's sidebar wins over the saved one. The sidebar submits every field,
  // so on its results (and their page links) an empty field is the reader's "any" and stays.
  function withKept(href, kept, resetPage = false) {
    const k = cleanKept(kept);
    if (listingKind(href) !== 'works' || !keptCount(k)) return href;
    const u = parse(href);
    const byHand = u.searchParams.has('commit');
    let changed = false;
    for (const key of Object.keys(KEPT)) {
      const param = keptParam(key);
      if (!k[key] || u.searchParams.get(param) || (byHand && u.searchParams.has(param))) continue;
      u.searchParams.set(param, k[key]);
      changed = true;
    }
    if (!changed) return href;
    if (resetPage) u.searchParams.delete('page');
    return u.href;
  }

  // Everything Sift adds to a listing link: saved exclusions, then kept filters.
  const withFilters = (href, cfg, resetPage = false) =>
    withKept(withExclusions(href, cfg.exclusions, resetPage), cfg.kept, resetPage);
  const filtersApplied = (href, cfg) => withFilters(href, cfg) === href;

  // "complete works only, no crossovers, English, 1,000 to 50,000 words"
  function describeKept(kept) {
    const k = cleanKept(kept);
    const n = v => Number(v).toLocaleString('en-US');
    const parts = [];
    if (k.complete) parts.push(k.complete === 'T' ? 'complete works only' : 'works in progress only');
    if (k.crossover) parts.push(k.crossover === 'F' ? 'no crossovers' : 'crossovers only');
    if (k.language_id) parts.push(k.languageName || `language ${k.language_id}`);
    if (k.words_from && k.words_to) parts.push(`${n(k.words_from)} to ${n(k.words_to)} words`);
    else if (k.words_from) parts.push(`at least ${n(k.words_from)} words`);
    else if (k.words_to) parts.push(`at most ${n(k.words_to)} words`);
    return parts.join(', ');
  }

  // AO3's own filter form submits commit=Sort+and+Filter: the reader picked these filters by hand.
  const userFiltered = href => Boolean(parse(href)?.searchParams.has('commit'));

  // "/users/<user>/pseuds/<pseud>" -> "<user>", so every pseud of a user matches.
  function userFromHref(href) {
    const m = /^(?:https?:\/\/[^/]+)?\/users\/([^/?#]+)/.exec(href || '');
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }

  // names: the page's ship plus the names AO3 treats as the same ship.
  function isPrimaryShip(relationships, names, firstTwo) {
    const wanted = new Set(names.map(norm));
    return relationships.slice(0, firstTwo ? 2 : 1).some(r => wanted.has(norm(r)));
  }

  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: String.fromCharCode(160) };
  const decode = s => s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, dec, hex, name) =>
    dec ? String.fromCodePoint(+dec) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name.toLowerCase()] ?? m);

  // AO3 listbox sections use a fixed class set but attribute order can vary between skins.
  function listboxBody(html, kind) {
    const patterns = [
      '<div class="' + kind + ' listbox group">',
      '<div class="listbox group ' + kind + '">',
      '<div class="' + kind + ' listbox group" ',
    ];
    for (const start of patterns) {
      const i = html.indexOf(start);
      if (i < 0) continue;
      const open = html.indexOf('>', i) + 1;
      let depth = 1;
      let p = open;
      while (depth > 0 && p < html.length) {
        const nextOpen = html.indexOf('<div', p);
        const nextClose = html.indexOf('</div>', p);
        if (nextClose < 0) break;
        if (nextOpen >= 0 && nextOpen < nextClose) { depth++; p = nextOpen + 4; }
        else { depth--; p = nextClose + 6; if (depth === 0) return html.slice(open, nextClose); }
      }
    }
  return '';
  }

  // Reads a public /tags/<tag> page: "Tags with the same meaning" plus subtags (more specific
  // versions of a ship still count as that ship). Returns null if it isn't a tag page.
  function parseTagPage(html) {
    if (!/\btag home profile\b/.test(html)) return null;
    const names = [];
    for (const box of ['synonym', 'sub']) {
      const body = listboxBody(html, box);
      if (body) for (const a of body.matchAll(/<a class="tag"[^>]*>([^<]*)<\/a>/g)) names.push(decode(a[1]).trim());
    }
    return names;
  }

  // Cleans pasted or imported names. AO3 tag names can't contain "*", so wildcard patterns
  // from other tools can't become AO3 filters and are skipped.
  function cleanNames(list) {
    const names = [];
    const seen = new Set();
    let skipped = 0;
    for (const raw of list) {
      const s = String(raw).replace(/^[\s'"[\]]+|[\s'"[\],]+$/g, '').replace(/\s+/g, ' ');
      if (!s) continue;
      if (s.includes('*')) { skipped++; continue; }
      if (!seen.has(norm(s))) { seen.add(norm(s)); names.push(s); }
    }
    return { names, skipped };
  }

  // A pasted list, comma or line separated (quotes and brackets from copied script settings are ignored).
  const parseList = text => cleanNames(String(text).split(/[\n,]/));

  const MONTHS = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };

  // "1,234" -> 1234. Anything that is not a plain count (a "?", a blank) is null.
  function parseCount(text) {
    const s = String(text ?? '').replace(/,/g, '').trim();
    if (!/^\d{1,12}$/.test(s)) return null;
    return Number(s);
  }

  // AO3 blurb dates are "20 Sep 2026" in the header and "2026-09-20" in the stats.
  function parseAo3Date(text) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    let y; let m; let d;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    const long = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(s);
    if (iso) { y = +iso[1]; m = +iso[2] - 1; d = +iso[3]; }
    else if (long && MONTHS[long[2].toLowerCase()] != null) { y = +long[3]; m = MONTHS[long[2].toLowerCase()]; d = +long[1]; }
    else return null;
    const t = Date.UTC(y, m, d);
    const check = new Date(t);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m || check.getUTCDate() !== d) return null;
    return t;
  }

  // "/works/123", "/works/123/chapters/4", and the blurb link. Null when it isn't a work.
  function workIdFromHref(href) {
    const m = /^(?:https?:\/\/[^/]+)?\/works\/(\d+)(?:\/|$|\?)/.exec(String(href || ''));
    return m ? m[1] : null;
  }
  const workIdFromPath = path => workIdFromHref(path);

  // Title comes from AO3's completion symbol ("Complete Work" / "Work in Progress").
  // The symbol span also carries the class "iswip" on complete works, so the class is not a signal.
  // Chapters "3/?" and "3/10" (current under total) are unfinished. Unknown stays null so a rule
  // does not hide a work Sift could not read.
  function workIsWip(completeTitle, chaptersText) {
    const title = String(completeTitle || '').toLowerCase();
    if (title.includes('work in progress')) return true;
    if (title.includes('complete work')) return false;
    const m = String(chaptersText || '').replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+|\?)/);
    if (!m) return null;
    if (m[2] === '?') return true;
    return Number(m[1]) < Number(m[2]);
  }

  // kudos / hits. Null when hits are missing or zero, so a brand-new work is not "0%".
  function kudosPerHit(kudos, hits) {
    if (kudos == null || hits == null || hits <= 0) return null;
    return kudos / hits;
  }

  function formatRatio(kudos, hits) {
    const r = kudosPerHit(kudos, hits);
    if (r == null) return '';
    const pct = r * 100;
    if (pct > 0 && pct < 0.1) return '<0.1%';
    return (Math.round(pct * 10) / 10).toFixed(1) + '%';
  }

  function formatReadingTime(words, wpm) {
    if (words == null || words <= 0) return '';
    const speed = cleanBrowse({ wpm }).wpm;
    const mins = Math.max(1, Math.ceil(words / speed));
    if (mins < 60) return mins + ' min';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? h + ' h ' + m + ' min' : h + ' h';
  }

  // Only keys the reader actually sent, and only values AO3-shaped numbers can be.
  // Missing keys are left out so a partial import does not reset the rest of the rules.
  function browsePatch(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const k of ['hideRead', 'trackReads', 'hideWip', 'showRatio', 'showReadingTime', 'sortByRatio']) {
      if (typeof raw[k] === 'boolean') out[k] = raw[k];
    }
    for (const k of ['wordsFrom', 'wordsTo', 'staleDays', 'freshDays']) {
      if (raw[k] === undefined || raw[k] === null) continue;
      const v = String(raw[k]).trim().replace(/,/g, '');
      if (v === '' || v === '0' && (k === 'staleDays' || k === 'freshDays')) { out[k] = ''; continue; }
      if (!/^\d{1,9}$/.test(v)) continue;
      const n = Number(v);
      if ((k === 'staleDays' || k === 'freshDays') && (n < 1 || n > 3650)) continue;
      out[k] = String(n);
    }
    if (raw.wpm !== undefined && raw.wpm !== '') {
      const n = Number(String(raw.wpm).trim());
      if (Number.isInteger(n) && n >= 80 && n <= 1000) out.wpm = n;
    }
    if (out.hideRead) out.trackReads = true;
    if (out.trackReads === false) out.hideRead = false;
    return out;
  }

  function cleanBrowse(raw) {
    const out = { ...DEFAULT_BROWSE, ...browsePatch(raw || {}) };
    if (out.hideRead) out.trackReads = true;
    return out;
  }

  function cleanShips(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const s of list) {
      if (!s || typeof s.name !== 'string') continue;
      const name = s.name.trim();
      if (!name || seen.has(norm(name))) continue;
      seen.add(norm(name));
      out.push({ name, firstTwo: Boolean(s.firstTwo) });
    }
    return out;
  }

  function cleanPreset(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const name = String(raw.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const id = String(raw.id || '').trim().slice(0, 40);
    if (!name || !id || !/^[\w.-]+$/.test(id)) return null;
    return {
      id, name,
      exclusions: cleanNames(Array.isArray(raw.exclusions) ? raw.exclusions : []).names,
      mutedAuthors: cleanNames(Array.isArray(raw.mutedAuthors) ? raw.mutedAuthors : []).names,
      ships: cleanShips(raw.ships),
      kept: cleanKept(raw.kept),
      browse: cleanBrowse(raw.browse),
    };
  }

  function cleanPresets(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const raw of list) {
      const p = cleanPreset(raw);
      if (!p || seen.has(p.id) || seen.has(norm(p.name))) continue;
      seen.add(p.id);
      seen.add(norm(p.name));
      out.push(p);
    }
    return out.slice(-PRESET_CAP);
  }

  function makePreset(current, name, now, id) {
    const preset = cleanPreset({
      id: id || ('p' + Number(now).toString(36)),
      name,
      exclusions: current.exclusions,
      mutedAuthors: current.mutedAuthors,
      ships: current.ships,
      kept: current.kept,
      browse: current.browse,
    });
    if (!preset) return cleanPresets(current.presets);
    const rest = cleanPresets(current.presets).filter(p => p.id !== preset.id && norm(p.name) !== norm(preset.name));
    return [...rest, preset].slice(-PRESET_CAP);
  }

  function deletePreset(current, id) {
    return cleanPresets(current.presets).filter(p => p.id !== id);
  }

  function applyPreset(current, id) {
    const p = cleanPresets(current.presets).find(x => x.id === id);
    const base = hydrate(current);
    if (!p) return base;
    return hydrate({
      ...base,
      exclusions: p.exclusions,
      mutedAuthors: p.mutedAuthors,
      ships: p.ships,
      kept: p.kept,
      browse: p.browse,
    });
  }

  function cleanLater(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const id = String(raw.id || '');
      if (!/^\d{1,12}$/.test(id) || seen.has(id)) continue;
      seen.add(id);
      const title = String(raw.title || 'Untitled').trim().replace(/\s+/g, ' ').slice(0, 200) || 'Untitled';
      const authors = Array.isArray(raw.authors)
        ? raw.authors.map(a => String(a).trim().slice(0, 80)).filter(Boolean).slice(0, 12) : [];
      const words = parseCount(raw.words);
      const at = Number(raw.at);
      const row = { id, title, authors, at: Number.isFinite(at) ? at : 0 };
      if (words != null) row.words = words;
      out.push(row);
    }
    return out.slice(0, LATER_CAP);
  }

  function toggleLater(list, item, now) {
    const cur = cleanLater(list);
    const id = String(item?.id || '');
    if (!/^\d{1,12}$/.test(id)) return cur;
    if (cur.some(x => x.id === id)) return cur.filter(x => x.id !== id);
    return cleanLater([{ ...item, id, at: now }, ...cur]);
  }

  const laterHas = (list, id) => cleanLater(list).some(x => x.id === String(id));

  function cleanReadWorks(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [id, at] of Object.entries(raw)) {
      if (!/^\d{1,12}$/.test(id)) continue;
      const n = Number(at);
      if (!Number.isFinite(n)) continue;
      out[id] = n;
    }
    return capReads(out);
  }

  function capReads(map) {
    const ids = Object.keys(map);
    if (ids.length <= READ_CAP) return map;
    ids.sort((a, b) => map[a] - map[b]);
    const next = { ...map };
    for (const id of ids.slice(0, ids.length - READ_CAP)) delete next[id];
    return next;
  }

  function rememberRead(map, id, now) {
    if (!/^\d{1,12}$/.test(String(id || ''))) return cleanReadWorks(map);
    return capReads({ ...cleanReadWorks(map), [String(id)]: now });
  }

  // A full settings object. Unknown keys are dropped. Lists are cleaned, never emptied
  // because a key was absent on an older save: absent means the default.
  function hydrate(raw) {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      enabled: r.enabled !== false,
      exclusions: cleanNames(Array.isArray(r.exclusions) ? r.exclusions : []).names,
      mutedAuthors: cleanNames(Array.isArray(r.mutedAuthors) ? r.mutedAuthors : []).names,
      ships: cleanShips(r.ships),
      autoApply: r.autoApply === true,
      removeHidden: r.removeHidden === true,
      kept: cleanKept(r.kept),
      browse: cleanBrowse(r.browse),
      presets: cleanPresets(r.presets),
      syncEnabled: r.syncEnabled === true,
      settingsVersion: 2,
      updatedAt: Number.isFinite(Number(r.updatedAt)) ? Number(r.updatedAt) : 0,
    };
  }

  function settingsRecord(s) {
    const h = hydrate(s);
    return Object.fromEntries(SETTING_KEYS.map(k => [k, h[k]]));
  }

  // Why a listing row is folded. ship is { names, firstTwo } or null. opened is the local read list.
  function hideReasons(work, cfg, ctx = {}) {
    if (!cfg || cfg.enabled === false) return [];
    const out = [];
    const settings = hydrate(cfg);
    const muted = (work.users || []).filter(u => settings.mutedAuthors.some(a => norm(a) === norm(u)));
    if (muted.length) out.push('muted author ' + muted.join(', '));
    if (ctx.ship && work.isWork && ctx.ship.names &&
      !isPrimaryShip(work.relationships || [], ctx.ship.names, ctx.ship.firstTwo)) {
      out.push('not primary ship');
    }
    const b = settings.browse;
    const now = ctx.now || 0;
    if (b.hideRead && work.opened) out.push('already opened');
    if (b.hideWip && work.wip === true) out.push('unfinished');
    const n = v => Number(v).toLocaleString('en-US');
    if (b.wordsFrom && work.words != null && work.words < Number(b.wordsFrom)) out.push('under ' + n(b.wordsFrom) + ' words');
    if (b.wordsTo && work.words != null && work.words > Number(b.wordsTo)) out.push('over ' + n(b.wordsTo) + ' words');
    if (b.staleDays && work.updated != null && now - work.updated > Number(b.staleDays) * DAY) {
      out.push('not updated in ' + b.staleDays + ' days');
    }
    return out;
  }

  function isFresh(work, browse, now) {
    const b = cleanBrowse(browse);
    if (!b.freshDays || work.updated == null) return false;
    return now - work.updated <= Number(b.freshDays) * DAY;
  }

  function describeBrowse(browse) {
    const b = cleanBrowse(browse);
    const n = v => Number(v).toLocaleString('en-US');
    const parts = [];
    if (b.hideRead) parts.push('hiding works you have opened');
    if (b.hideWip) parts.push('hiding unfinished works');
    if (b.wordsFrom && b.wordsTo) parts.push(n(b.wordsFrom) + ' to ' + n(b.wordsTo) + ' words on this page');
    else if (b.wordsFrom) parts.push('at least ' + n(b.wordsFrom) + ' words on this page');
    else if (b.wordsTo) parts.push('at most ' + n(b.wordsTo) + ' words on this page');
    if (b.staleDays) parts.push('hiding works not updated in ' + b.staleDays + ' days');
    if (b.freshDays) parts.push('highlighting updates from the last ' + b.freshDays + ' days');
    if (b.sortByRatio) parts.push('sorted by kudos per hit');
    return parts.join(', ');
  }

  // Highest kudos-per-hit first. Works with no hits stay in their original order at the end.
  function orderByRatio(entries) {
    return entries
      .map(e => ({ index: e.index, ratio: e.ratio }))
      .sort((a, b) => {
        if (a.ratio == null && b.ratio == null) return a.index - b.index;
        if (a.ratio == null) return 1;
        if (b.ratio == null) return -1;
        if (b.ratio !== a.ratio) return b.ratio - a.ratio;
        return a.index - b.index;
      })
      .map(e => e.index);
  }

  function jsonBytes(value) {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  }

  function packSync(settings) {
    const s = hydrate({ ...settings, syncEnabled: true });
    const items = {
      'sift-meta': {
        app: 'sift-ao3', version: 2, updatedAt: s.updatedAt, settingsVersion: 2,
        enabled: s.enabled, autoApply: s.autoApply, removeHidden: s.removeHidden,
        syncEnabled: true, kept: s.kept, browse: s.browse,
      },
      'sift-exclusions': s.exclusions,
      'sift-muted': s.mutedAuthors,
      'sift-ships': s.ships,
      'sift-presets': s.presets,
    };
    const skipped = [];
    for (const key of Object.keys(items)) {
      if (jsonBytes(items[key]) <= SYNC_ITEM_MAX) continue;
      if (key === 'sift-meta') return { items: null, skipped, error: 'Settings are too large to sync.' };
      skipped.push(key);
      delete items[key];
    }
    const error = skipped.length
      ? 'Some lists are over the browser sync limit (about 8 KB each) and stayed on this device.'
      : '';
    return { items, skipped, error };
  }

  function unpackSync(items) {
    if (!items || typeof items !== 'object') return null;
    const meta = items['sift-meta'];
    if (!meta || meta.app !== 'sift-ao3' || typeof meta !== 'object') return null;
    const present = {
      meta: true,
      exclusions: Object.prototype.hasOwnProperty.call(items, 'sift-exclusions'),
      muted: Object.prototype.hasOwnProperty.call(items, 'sift-muted'),
      ships: Object.prototype.hasOwnProperty.call(items, 'sift-ships'),
      presets: Object.prototype.hasOwnProperty.call(items, 'sift-presets'),
    };
    const raw = {
      enabled: meta.enabled,
      autoApply: meta.autoApply,
      removeHidden: meta.removeHidden,
      kept: meta.kept,
      browse: meta.browse,
      syncEnabled: meta.syncEnabled === true,
      updatedAt: meta.updatedAt,
    };
    if (present.exclusions) raw.exclusions = items['sift-exclusions'];
    if (present.muted) raw.mutedAuthors = items['sift-muted'];
    if (present.ships) raw.ships = items['sift-ships'];
    if (present.presets) raw.presets = items['sift-presets'];
    return { settings: hydrate(raw), present, updatedAt: Number(meta.updatedAt) || 0 };
  }

  function browseIsDefault(browse) {
    const b = cleanBrowse(browse);
    return Object.keys(DEFAULT_BROWSE).every(k => String(b[k]) === String(DEFAULT_BROWSE[k]));
  }

  // Turning sync on must not replace either device's lists with the other's.
  // Tags, authors, ships, and presets are united. Kept filters and on-the-page rules
  // stay as this device left them, unless this device never changed the on-the-page rules.
  function absorbSync(localRaw, syncItems) {
    const local = hydrate({ ...(localRaw || {}), syncEnabled: true });
    const unpacked = unpackSync(syncItems);
    if (!unpacked?.settings.syncEnabled) return local;
    const remote = unpacked.settings;
    const p = unpacked.present;
    const ships = p.ships ? cleanShips([...(local.ships || []), ...(remote.ships || [])]) : local.ships;
    const presets = p.presets ? cleanPresets([...(local.presets || []), ...(remote.presets || [])]) : local.presets;
    return hydrate({
      ...local,
      exclusions: p.exclusions ? cleanNames([...(local.exclusions || []), ...(remote.exclusions || [])]).names : local.exclusions,
      mutedAuthors: p.muted ? cleanNames([...(local.mutedAuthors || []), ...(remote.mutedAuthors || [])]).names : local.mutedAuthors,
      ships, presets,
      kept: keptCount(local.kept) ? local.kept : remote.kept,
      browse: browseIsDefault(local.browse) ? remote.browse : local.browse,
      syncEnabled: true,
    });
  }

  function mergePresent(base, unpacked) {
    const raw = { ...base };
    const s = unpacked.settings;
    const p = unpacked.present;
    if (p.meta) {
      raw.enabled = s.enabled;
      raw.autoApply = s.autoApply;
      raw.removeHidden = s.removeHidden;
      raw.kept = s.kept;
      raw.browse = s.browse;
      raw.updatedAt = s.updatedAt;
      raw.syncEnabled = s.syncEnabled;
    }
    if (p.exclusions) raw.exclusions = s.exclusions;
    if (p.muted) raw.mutedAuthors = s.mutedAuthors;
    if (p.ships) raw.ships = s.ships;
    if (p.presets) raw.presets = s.presets;
    return hydrate(raw);
  }

  // A profile that has never saved a Sift choice. stats and synonym cache count: visiting AO3
  // once means this device already has a reader, and a cloud copy must not replace it.
  function isUntouched(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true;
    if (raw.settingsVersion || raw.updatedAt) return false;
    if (raw.stats && raw.stats.firstUse) return false;
    if (raw.enabled === false || raw.autoApply || raw.removeHidden || raw.syncEnabled) return false;
    if (['exclusions', 'mutedAuthors', 'ships', 'presets'].some(k => Array.isArray(raw[k]) && raw[k].length)) return false;
    if (raw.kept && keptCount(raw.kept)) return false;
    if (raw.browse && typeof raw.browse === 'object' && Object.keys(raw.browse).length) return false;
    if (raw.synonyms && typeof raw.synonyms === 'object' && Object.keys(raw.synonyms).length) return false;
    if (raw.readWorks && typeof raw.readWorks === 'object' && Object.keys(raw.readWorks).length) return false;
    if (Array.isArray(raw.later) && raw.later.length) return false;
    return true;
  }

  // Decide what this device should keep. Local lists win unless sync is on and the other
  // device saved later, or this profile is empty and a synced copy is waiting.
  // writeSync means "local is the copy that should be uploaded", not "the bytes differ".
  function reconcileStorage(localRaw, syncItems, now) {
    const local = hydrate(localRaw || {});
    const unpacked = unpackSync(syncItems);
    const untouched = isUntouched(localRaw);
    const syncAt = unpacked?.updatedAt || 0;
    const localAt = Number(localRaw?.updatedAt) || 0;

    if (unpacked && unpacked.settings.syncEnabled === false && syncAt > localAt && !untouched) {
      return {
        settings: hydrate({ ...local, syncEnabled: false, updatedAt: syncAt }),
        writeLocal: true, writeSync: false,
      };
    }

    const remoteOn = Boolean(unpacked?.settings.syncEnabled);
    if (!local.syncEnabled && !(untouched && remoteOn)) {
      return {
        settings: hydrate(local),
        writeLocal: !localRaw || localRaw.settingsVersion !== 2,
        writeSync: false,
      };
    }

    if (untouched && remoteOn) {
      return { settings: mergePresent(hydrate({ syncEnabled: true }), unpacked), writeLocal: true, writeSync: false };
    }

    if (remoteOn && localAt && syncAt > localAt) {
      return { settings: mergePresent(local, unpacked), writeLocal: true, writeSync: false };
    }

    const settings = hydrate({ ...local, syncEnabled: true, settingsVersion: 2, updatedAt: localAt || now });
    return {
      settings,
      writeLocal: !localRaw?.updatedAt || localRaw.settingsVersion !== 2 || localRaw.syncEnabled !== true,
      writeSync: true,
    };
  }

  // Validates a backup (or an AO3 Savior config's tagBlacklist/authorBlacklist) without touching
  // current settings: returns { error } or { data, skipped }.
  function parseImport(text) {
    let raw;
    try { raw = JSON.parse(text); } catch { return { error: 'That file is not valid JSON.' }; }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Expected a Sift backup (a JSON object).' };
    raw = { exclusions: raw.tagBlacklist, mutedAuthors: raw.authorBlacklist, ...raw };
    const data = {};
    let skipped = 0;
    for (const k of LISTS) {
      const v = raw[k];
      if (v === undefined) continue;
      if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) return { error: `"${k}" must be a list of names.` };
      const c = cleanNames(v);
      data[k] = c.names;
      skipped += c.skipped;
    }
    if (raw.ships !== undefined) {
      const ok = Array.isArray(raw.ships) && raw.ships.every(s => s && typeof s.name === 'string' &&
        (s.firstTwo === undefined || typeof s.firstTwo === 'boolean'));
      if (!ok) return { error: '"ships" must be a list of {"name", "firstTwo"} entries.' };
      data.ships = raw.ships.map(s => ({ name: s.name.trim(), firstTwo: Boolean(s.firstTwo) })).filter(s => s.name);
    }
    for (const k of FLAGS) {
      if (raw[k] === undefined) continue;
      if (typeof raw[k] !== 'boolean') return { error: `"${k}" must be true or false.` };
      data[k] = raw[k];
    }
    if (raw.kept !== undefined) {
      if (!raw.kept || typeof raw.kept !== 'object' || Array.isArray(raw.kept)) return { error: '"kept" must be an object of AO3 filters.' };
      const kept = cleanKept(raw.kept);
      if (keptCount(kept)) data.kept = kept;
    }
    if (raw.browse !== undefined) {
      if (!raw.browse || typeof raw.browse !== 'object' || Array.isArray(raw.browse)) return { error: '"browse" must be an object.' };
      const browse = browsePatch(raw.browse);
      if (Object.keys(browse).length) data.browse = browse;
    }
    if (raw.presets !== undefined) {
      if (!Array.isArray(raw.presets)) return { error: '"presets" must be a list.' };
      data.presets = cleanPresets(raw.presets);
    }
    if (raw.later !== undefined) {
      if (!Array.isArray(raw.later)) return { error: '"later" must be a list.' };
      data.later = cleanLater(raw.later);
    }
    if (raw.readWorks !== undefined) {
      if (!raw.readWorks || typeof raw.readWorks !== 'object' || Array.isArray(raw.readWorks)) {
        return { error: '"readWorks" must be an object of work ids.' };
      }
      data.readWorks = cleanReadWorks(raw.readWorks);
    }
    if (!Object.keys(data).length) return { error: 'Nothing Sift can use in that file.' };
    return { data, skipped };
  }

  // Imports add to what is saved; they never remove anything.
  function mergeSettings(current, data) {
    const out = hydrate(current);
    for (const k of LISTS) if (data[k]) out[k] = cleanNames([...(out[k] || []), ...data[k]]).names;
    if (data.ships) {
      const byName = new Map((out.ships || []).map(s => [norm(s.name), s]));
      for (const s of data.ships) byName.set(norm(s.name), { name: s.name, firstTwo: Boolean(s.firstTwo) });
      out.ships = [...byName.values()];
    }
    for (const k of FLAGS) if (k in data) out[k] = data[k];
    if (data.kept) out.kept = { ...cleanKept(out.kept), ...data.kept };
    if (data.browse) out.browse = cleanBrowse({ ...out.browse, ...data.browse });
    if (data.presets) {
      const byName = new Map(out.presets.map(p => [norm(p.name), p]));
      for (const p of data.presets) byName.set(norm(p.name), p);
      out.presets = cleanPresets([...byName.values()]);
    }
    if (data.later) out.later = cleanLater([...data.later, ...(current.later || [])]);
    if (data.readWorks) out.readWorks = cleanReadWorks({ ...(current.readWorks || {}), ...data.readWorks });
    return out;
  }

  // version 2 adds on-the-page rules, presets, and (when present) the local later list and
  // opened-work ids. syncEnabled stays off the file: a backup should not turn cloud sync on.
  function exportSettings(s) {
    const h = hydrate(s);
    const out = {
      app: 'sift-ao3', version: 2,
      exclusions: h.exclusions, mutedAuthors: h.mutedAuthors, ships: h.ships,
      autoApply: h.autoApply, removeHidden: h.removeHidden, kept: h.kept,
      browse: h.browse, presets: h.presets,
    };
    if (Array.isArray(s.later) && s.later.length) out.later = cleanLater(s.later);
    if (s.readWorks && typeof s.readWorks === 'object' && Object.keys(s.readWorks).length) out.readWorks = cleanReadWorks(s.readWorks);
    return JSON.stringify(out, null, 2);
  }

  // One card at a time: milestones at 500 and 5,000 filtered listings, then one rating ask
  // after 7 days. Each shows once; "don't show again" (noAsks) silences all of them.
  function nextCard(stats, now, storeUrl = STORE_URL) {
    const seen = stats.seen || [];
    if (stats.noAsks) return null;
    for (const n of [500, 5000]) if ((stats.listings || 0) >= n && !seen.includes('m' + n)) return 'm' + n;
    if (/^https:\/\//.test(storeUrl) && stats.firstUse && now - stats.firstUse >= 7 * DAY && !seen.includes('rating')) return 'rating';
    return null;
  }

  const api = {
    AO3, DAY, STORE_URL, KOFI_URL, DEFAULTS, DEFAULT_BROWSE, SETTING_KEYS, SYNC_KEYS, SYNC_ITEM_MAX,
    READ_CAP, LATER_CAP, norm, listingKind, withExclusions, exclusionsApplied,
    cleanKept, keptFromUrl, keptCount, sameKept, withKept, withFilters, filtersApplied, describeKept,
    userFiltered, userFromHref, isPrimaryShip, parseTagPage, parseList, parseImport, mergeSettings,
    exportSettings, nextCard,
    parseCount, parseAo3Date, workIdFromHref, workIdFromPath, workIsWip, kudosPerHit, formatRatio,
    formatReadingTime, cleanBrowse, browsePatch, hydrate, settingsRecord, hideReasons, isFresh,
    browseIsDefault, absorbSync,
    describeBrowse, orderByRatio, makePreset, deletePreset, applyPreset, cleanLater, toggleLater,
    laterHas, cleanReadWorks, rememberRead, packSync, unpackSync, reconcileStorage, jsonBytes,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiftLib = api;
})(globalThis);
