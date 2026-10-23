// Pure logic for Sift for AO3: no DOM and no chrome.* calls. Loaded as a content script,
// by the options page, and by the Node unit tests.
(function (root) {
  'use strict';

  const AO3 = 'https://archiveofourown.org';
  const DAY = 864e5;
  // Chrome Web Store reviews page for the one-time rating card.
  const STORE_URL = 'https://chromewebstore.google.com/detail/nonieoiidaeaeheddaifgdmecgcbfgpl/reviews';
  const KOFI_URL = 'https://ko-fi.com/jju1s';
  const DEFAULTS = Object.freeze({
    enabled: true, exclusions: [], mutedAuthors: [], ships: [], autoApply: false, removeHidden: false,
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
    return out;
  }

  const exportSettings = s => JSON.stringify({
    app: 'sift-ao3', version: 1, exclusions: s.exclusions, mutedAuthors: s.mutedAuthors,
    ships: s.ships, autoApply: s.autoApply, removeHidden: s.removeHidden,
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
    userFiltered, userFromHref, isPrimaryShip, parseTagPage, parseList, parseImport, mergeSettings,
    exportSettings, nextCard,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiftLib = api;
})(globalThis);
