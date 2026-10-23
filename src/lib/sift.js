// Pure logic for Sift for AO3: no DOM and no chrome.* calls. Loaded as a content script,
// by the options page, and by the Node unit tests.
(function (root) {
  'use strict';

  const AO3 = 'https://archiveofourown.org';
  const DAY = 864e5;
  // The lead fills this in before release; the rating card stays off until it is a real URL.
  const STORE_URL = 'STORE_URL';
  const KOFI_URL = 'https://ko-fi.com/jju1s';
  const DEFAULTS = Object.freeze({
    enabled: true, exclusions: [], mutedAuthors: [], ships: [], autoApply: false, removeHidden: false,
    kept: {},
  });
  const LISTS = ['exclusions', 'mutedAuthors'];
  const FLAGS = ['autoApply', 'removeHidden'];

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

  // Reads a public /tags/<tag> page: "Tags with the same meaning" plus subtags (more specific
  // versions of a ship still count as that ship). Returns null if it isn't a tag page.
  function parseTagPage(html) {
    if (!/class="tag home profile"/.test(html)) return null;
    const names = [];
    for (const box of ['synonym', 'sub']) {
      const m = new RegExp('<div class="' + box + ' listbox group">([\\s\\S]*?)</div>').exec(html);
      if (m) for (const a of m[1].matchAll(/<a class="tag"[^>]*>([^<]*)<\/a>/g)) names.push(decode(a[1]).trim());
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
    if (!Object.keys(data).length) return { error: 'Nothing Sift can use in that file.' };
    return { data, skipped };
  }

  // Imports add to what is saved; they never remove anything.
  function mergeSettings(current, data) {
    const out = { ...current };
    for (const k of LISTS) if (data[k]) out[k] = cleanNames([...(current[k] || []), ...data[k]]).names;
    if (data.ships) {
      const byName = new Map((current.ships || []).map(s => [norm(s.name), s]));
      for (const s of data.ships) byName.set(norm(s.name), s);
      out.ships = [...byName.values()];
    }
    for (const k of FLAGS) if (k in data) out[k] = data[k];
    if (data.kept) out.kept = { ...cleanKept(current.kept), ...data.kept };
    return out;
  }

  const exportSettings = s => JSON.stringify({
    app: 'sift-ao3', version: 1, exclusions: s.exclusions, mutedAuthors: s.mutedAuthors,
    ships: s.ships, autoApply: s.autoApply, removeHidden: s.removeHidden, kept: cleanKept(s.kept),
  }, null, 2);

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
    AO3, DAY, STORE_URL, KOFI_URL, DEFAULTS, norm, listingKind, withExclusions, exclusionsApplied,
    cleanKept, keptFromUrl, keptCount, sameKept, withKept, withFilters, filtersApplied, describeKept,
    userFiltered, userFromHref, isPrimaryShip, parseTagPage, parseList, parseImport, mergeSettings,
    exportSettings, nextCard,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiftLib = api;
})(globalThis);
