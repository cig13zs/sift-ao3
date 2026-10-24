const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../src/lib/sift.js');

const AO3 = 'https://archiveofourown.org';
const WX = 'work_search[excluded_tag_names]';
const BX = 'bookmark_search[excluded_tag_names]';
const params = href => new URL(href).searchParams;

test('listingKind accepts only listings AO3 can filter', () => {
  const works = ['/tags/Fluff/works', '/tags/Fluff/works/', '/works?tag_id=Fluff', '/users/a/works',
    '/users/a/pseuds/b/works', '/collections/c/works', '/collections/c/tags/Fluff/works',
    '/works/search?work_search%5Bquery%5D=tea', `${AO3}/tags/A%20Name*s*B/works?page=3`];
  const bookmarks = ['/tags/Fluff/bookmarks', '/users/a/bookmarks', '/users/a/pseuds/b/bookmarks',
    '/bookmarks?user_id=a', '/bookmarks/search?bookmark_search%5Bquery%5D=tea'];
  const neither = ['/works', '/works/123', '/works/search', '/bookmarks/search', '/works/123/bookmarks',
    '/series/9', '/tags/Fluff', '/users/a', '/users/a/pseuds/b', 'https://example.com/tags/Fluff/works',
    'not a url at all %%%'];
  for (const p of works) assert.equal(L.listingKind(p), 'works', p);
  for (const p of bookmarks) assert.equal(L.listingKind(p), 'bookmarks', p);
  for (const p of neither) assert.equal(L.listingKind(p), null, p);
});

test('withExclusions appends to an existing excluded list, dedupes, and keeps other params', () => {
  const href = `${AO3}/tags/Fluff/works?page=2&${encodeURIComponent(WX)}=Angst&view_adult=true`;
  const out = L.withExclusions(href, ['angst', 'Crack', 'crack', ' Hurt/Comfort ']);
  assert.equal(params(out).get(WX), 'Angst,Crack,Hurt/Comfort');
  assert.equal(params(out).get('page'), '2');
  assert.equal(params(out).get('view_adult'), 'true');
  assert.equal(new URL(out).pathname, '/tags/Fluff/works');
  // Already carrying everything: the exact same string comes back, so links are left alone.
  assert.equal(L.withExclusions(out, ['CRACK', 'angst']), out);
  assert.ok(L.exclusionsApplied(out, ['Crack']));
  assert.ok(!L.exclusionsApplied(href, ['Crack']));
});

test('withExclusions handles the tag_id form, bookmarks, search, page reset and non-listings', () => {
  const tagId = L.withExclusions(`${AO3}/works?tag_id=A+Ship&work_search%5Bsort_column%5D=kudos_count`, ['Fluff']);
  assert.equal(params(tagId).get('tag_id'), 'A Ship');
  assert.equal(params(tagId).get('work_search[sort_column]'), 'kudos_count');
  assert.equal(params(tagId).get(WX), 'Fluff');

  const bm = L.withExclusions('/tags/Fluff/bookmarks', ['Angst']);
  assert.equal(params(bm).get(BX), 'Angst');
  assert.equal(params(bm).get(WX), null);

  const search = L.withExclusions(`${AO3}/works/search?work_search%5Bquery%5D=tea`, ['Angst']);
  assert.equal(params(search).get('work_search[query]'), 'tea');
  assert.equal(params(search).get(WX), 'Angst');

  const reset = L.withExclusions(`${AO3}/tags/Fluff/works?page=4`, ['Angst'], true);
  assert.equal(params(reset).get('page'), null);

  for (const href of ['/works/123', `${AO3}/works/search`, 'https://example.com/tags/a/works']) {
    assert.equal(L.withExclusions(href, ['Angst']), href);
  }
  assert.equal(L.withExclusions('/tags/Fluff/works', []), '/tags/Fluff/works');
});

test('userFiltered spots AO3 filter form submissions', () => {
  assert.ok(L.userFiltered(`${AO3}/works?commit=Sort+and+Filter&tag_id=Fluff`));
  assert.ok(!L.userFiltered(`${AO3}/tags/Fluff/works`));
});

test('userFromHref takes the user part of the author link, so all pseuds match', () => {
  assert.equal(L.userFromHref('/users/quill_moth/pseuds/Moth%20Writes'), 'quill_moth');
  assert.equal(L.userFromHref(`${AO3}/users/quill_moth/pseuds/quill_moth`), 'quill_moth');
  assert.equal(L.userFromHref('/users/Caf%C3%A9_Au/pseuds/x'), 'Café_Au');
  assert.equal(L.userFromHref('/works/123'), null);
  assert.equal(L.userFromHref(''), null);
  assert.equal(L.userFromHref(null), null);
});

test('isPrimaryShip checks the first, or first two, relationship tags against the ship and its synonyms', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'tag-page.html'), 'utf8');
  const names = ['Ash Marlow/Juniper Vale', ...L.parseTagPage(html)];
  const other = 'Pell Orrin/Maud Kestrel';
  // first
  assert.ok(L.isPrimaryShip(['Ash Marlow/Juniper Vale', other], names, false));
  assert.ok(L.isPrimaryShip(['juniper vale/ash marlow', other], names, false), 'synonym, any case');
  assert.ok(L.isPrimaryShip(['Ash Marlow/Juniper Vale (Canal Town AU)'], names, false), 'subtag');
  assert.ok(!L.isPrimaryShip([other, 'Ash Marlow/Juniper Vale'], names, false), 'second is not first');
  assert.ok(!L.isPrimaryShip([], names, false));
  // first two
  assert.ok(L.isPrimaryShip([other, 'Ash/Juniper (Lanterns o\' Keldra)'], names, true));
  assert.ok(!L.isPrimaryShip([other, 'Maud Kestrel & Tobin Reyes', 'Ash Marlow/Juniper Vale'], names, true), 'third');
  // without synonyms the synonym-tagged work fails: the fetch matters
  assert.ok(!L.isPrimaryShip(['Juniper Vale/Ash Marlow'], ['Ash Marlow/Juniper Vale'], true));
});

test('parseTagPage reads synonyms and subtags only, decodes entities, rejects other pages', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'tag-page.html'), 'utf8');
  assert.deepEqual(L.parseTagPage(html), [
    'Juniper Vale/Ash Marlow',
    'Ash/Juniper (Lanterns o\' Keldra)',
    'Ash Marlow/Juniper "June" Vale',
    'Ash Marlow/Juniper Vale (Canal Town AU)',
  ]);
  assert.deepEqual(L.parseTagPage('<div class="tag home profile"><h2 class="heading">Solo</h2></div>'), []);
  assert.equal(L.parseTagPage('<html><title>Retry later</title></html>'), null);
});

test('parseImport rejects malformed JSON and wrong types; a failed import leaves settings alone', () => {
  const current = { ...L.DEFAULTS, exclusions: ['Angst'], mutedAuthors: ['quill_moth'] };
  const snapshot = JSON.stringify(current);
  const bad = ['{not json', '', '[]', '"text"', 'null', '{}', '{"exclusions":"Angst"}', '{"exclusions":[1]}',
    '{"mutedAuthors":[null]}', '{"autoApply":"yes"}', '{"ships":[{"name":3}]}', '{"ships":{"name":"A/B"}}',
    '{"exclusions":["Fine"],"removeHidden":1}'];
  for (const text of bad) {
    const r = L.parseImport(text);
    assert.equal(typeof r.error, 'string', text);
    assert.equal(r.data, undefined, text);
  }
  assert.equal(JSON.stringify(current), snapshot);

  const ok = L.parseImport(JSON.stringify({
    app: 'sift-ao3', exclusions: ['Crack', 'angst', '  '], mutedAuthors: ['new_user'],
    ships: [{ name: 'A/B', firstTwo: true }], autoApply: true,
  }));
  assert.equal(ok.error, undefined);
  const merged = L.mergeSettings(current, ok.data);
  assert.deepEqual(merged.exclusions, ['Angst', 'Crack']);
  assert.deepEqual(merged.mutedAuthors, ['quill_moth', 'new_user']);
  assert.deepEqual(merged.ships, [{ name: 'A/B', firstTwo: true }]);
  assert.equal(merged.autoApply, true);
  assert.equal(merged.removeHidden, false);
  assert.equal(JSON.stringify(current), snapshot, 'merge does not mutate current');

  // Export -> import round trip keeps everything.
  const again = L.mergeSettings(L.DEFAULTS, L.parseImport(L.exportSettings(merged)).data);
  for (const k of ['exclusions', 'mutedAuthors', 'ships', 'autoApply', 'removeHidden']) assert.deepEqual(again[k], merged[k], k);
});

test('AO3 Savior lists import; wildcards and quotes from pasted script settings are handled', () => {
  const sav = L.parseImport('{"tagBlacklist":["Dobby","*mimic"],"authorBlacklist":["Hoge"],"showReasons":true}');
  assert.deepEqual(sav.data, { exclusions: ['Dobby'], mutedAuthors: ['Hoge'] });
  assert.equal(sav.skipped, 1);

  const pasted = L.parseList(`['dobby', 'jar jar binks', '*mimic']\nHurt/Comfort,  Dobby`);
  assert.deepEqual(pasted.names, ['dobby', 'jar jar binks', 'Hurt/Comfort']);
  assert.equal(pasted.skipped, 1);
});

test('nextCard: milestones once each, one rating ask after 7 days, silenced by noAsks', () => {
  const now = Date.UTC(2026, 8, 25);
  const store = 'https://example.com/store';
  assert.equal(L.nextCard({ listings: 499, firstUse: now }, now, store), null);
  assert.equal(L.nextCard({ listings: 500, firstUse: now }, now, store), 'm500');
  assert.equal(L.nextCard({ listings: 900, firstUse: now, seen: ['m500'] }, now, store), null);
  assert.equal(L.nextCard({ listings: 5000, firstUse: now, seen: ['m500'] }, now, store), 'm5000');
  const week = now - 7 * L.DAY;
  assert.equal(L.nextCard({ listings: 3, firstUse: week }, now, store), 'rating');
  assert.equal(L.nextCard({ listings: 3, firstUse: week, seen: ['rating'] }, now, store), null);
  assert.equal(L.nextCard({ listings: 3, firstUse: week }, now, 'STORE_URL'), null, 'no ask without a real store URL');
  assert.equal(L.nextCard({ listings: 3, firstUse: week }, now), 'rating', 'the default STORE_URL is the live listing');
  assert.match(L.STORE_URL, /^https:\/\/chromewebstore\.google\.com\/detail\/nonieoiidaeaeheddaifgdmecgcbfgpl/);
  assert.equal(L.nextCard({ listings: 600, firstUse: week, noAsks: true }, now, store), null);
});

const KP = k => `work_search[${k}]`;
const sidebar = (fields, extra = '') => `${AO3}/tags/Fluff/works?commit=Sort+and+Filter${extra}&` +
  Object.entries(fields).map(([k, v]) => `${encodeURIComponent(KP(k))}=${encodeURIComponent(v)}`).join('&');

test('keptFromUrl reads the filters AO3 sidebar results carry, and only valid ones', () => {
  const href = sidebar({ complete: 'T', crossover: 'F', language_id: 'en', words_from: '1,000', words_to: '', query: 'tea' });
  assert.deepEqual(L.keptFromUrl(href), { complete: 'T', crossover: 'F', language_id: 'en', words_from: '1000' });
  assert.deepEqual(L.keptFromUrl(sidebar({ complete: 'yes', words_to: '-5', language_id: '<b>' })), {});
  assert.deepEqual(L.keptFromUrl(`${AO3}/tags/Fluff/bookmarks?${encodeURIComponent(KP('complete'))}=T`), {});
  assert.deepEqual(L.keptFromUrl(`${AO3}/works/123?${encodeURIComponent(KP('complete'))}=T`), {});
  assert.equal(L.keptCount({ language_id: 'en', languageName: 'English' }), 1);
  assert.equal(L.keptCount(null), 0);
});

test('withKept fills missing filters on work listings and never overrides the URL', () => {
  const kept = { complete: 'T', crossover: 'F', language_id: 'en', words_from: '1000', languageName: 'English' };
  const out = L.withKept(`${AO3}/tags/Fluff/works?page=3`, kept, true);
  assert.equal(params(out).get(KP('complete')), 'T');
  assert.equal(params(out).get(KP('crossover')), 'F');
  assert.equal(params(out).get(KP('language_id')), 'en');
  assert.equal(params(out).get(KP('words_from')), '1000');
  assert.equal(params(out).get(KP('languageName')), null);
  assert.equal(params(out).get('page'), null);
  assert.equal(L.withKept(out, kept), out, 'already there: unchanged');

  // A value already in the URL wins.
  const ru = L.withKept(`${AO3}/works/search?${encodeURIComponent(KP('language_id'))}=ru&${encodeURIComponent(KP('query'))}=tea`, kept);
  assert.equal(params(ru).get(KP('language_id')), 'ru');
  assert.equal(params(ru).get(KP('complete')), 'T');

  // AO3's sidebar sends every field; an empty one there is the reader's "any" and stays empty.
  const byHand = L.withKept(sidebar({ complete: '', crossover: 'T' }, '&page=2'), kept);
  assert.equal(params(byHand).get(KP('complete')), '');
  assert.equal(params(byHand).get(KP('crossover')), 'T');
  assert.equal(params(byHand).get(KP('language_id')), 'en');

  // Bookmark listings, work pages and non-listings are left alone; nothing kept means no change.
  for (const href of [`${AO3}/tags/Fluff/bookmarks`, `${AO3}/works/123`, '/series/9']) assert.equal(L.withKept(href, kept), href);
  assert.equal(L.withKept('/tags/Fluff/works', {}), '/tags/Fluff/works');
});

test('withFilters adds exclusions and kept filters together; filtersApplied checks both', () => {
  const cfg = { exclusions: ['Angst'], kept: { complete: 'T' } };
  const out = L.withFilters(`${AO3}/tags/Fluff/works?page=2`, cfg, true);
  assert.equal(params(out).get(WX), 'Angst');
  assert.equal(params(out).get(KP('complete')), 'T');
  assert.equal(params(out).get('page'), null);
  assert.ok(L.filtersApplied(out, cfg));
  assert.ok(!L.filtersApplied(L.withExclusions(`${AO3}/tags/Fluff/works`, ['Angst']), cfg));
  // Bookmarks only take exclusions.
  assert.ok(L.filtersApplied(L.withExclusions(`${AO3}/tags/Fluff/bookmarks`, ['Angst']), cfg));
  assert.equal(L.withFilters('/tags/Fluff/works', { exclusions: [], kept: {} }), '/tags/Fluff/works');
});

test('describeKept and sameKept', () => {
  assert.equal(L.describeKept({ complete: 'T', crossover: 'F', language_id: 'en', languageName: 'English', words_from: '1000', words_to: '50000' }),
    'complete works only, no crossovers, English, 1,000 to 50,000 words');
  assert.equal(L.describeKept({ complete: 'F', crossover: 'T', language_id: 'ja', words_to: '5000' }),
    'works in progress only, crossovers only, language ja, at most 5,000 words');
  assert.equal(L.describeKept({ words_from: '20000' }), 'at least 20,000 words');
  assert.equal(L.describeKept({}), '');
  assert.ok(L.sameKept({ language_id: 'en', languageName: 'English' }, { language_id: 'en' }));
  assert.ok(!L.sameKept({ complete: 'T' }, { complete: 'T', crossover: 'F' }));
});

test('kept filters import, merge and export', () => {
  assert.equal(typeof L.parseImport('{"kept":[1]}').error, 'string');
  assert.equal(typeof L.parseImport('{"kept":"T"}').error, 'string');
  const r = L.parseImport('{"kept":{"complete":"T","crossover":"maybe","words_from":"2000","extra":"x"}}');
  assert.deepEqual(r.data, { kept: { complete: 'T', words_from: '2000' } });
  const merged = L.mergeSettings({ ...L.DEFAULTS, kept: { language_id: 'en', complete: 'F' } }, r.data);
  assert.deepEqual(merged.kept, { language_id: 'en', complete: 'T', words_from: '2000' });
  const back = L.parseImport(L.exportSettings(merged)).data;
  assert.deepEqual(back.kept, merged.kept);
});
