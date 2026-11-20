const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/lib/sift.js');

const now = Date.UTC(2026, 10, 20);

test('v1 settings migrate without dropping lists or turning on new hides', () => {
  const old = {
    enabled: true,
    exclusions: ['Angst'],
    mutedAuthors: ['quill_moth'],
    ships: [{ name: 'A/B', firstTwo: false }],
    autoApply: true,
    removeHidden: false,
    kept: { complete: 'T', language_id: 'en', languageName: 'English' },
    stats: { firstUse: now - L.DAY, hiddenTotal: 4 },
  };
  const rec = L.reconcileStorage(old, null, now);
  assert.deepEqual(rec.settings.exclusions, ['Angst']);
  assert.deepEqual(rec.settings.mutedAuthors, ['quill_moth']);
  assert.deepEqual(rec.settings.ships, [{ name: 'A/B', firstTwo: false }]);
  assert.equal(rec.settings.autoApply, true);
  assert.equal(rec.settings.removeHidden, false);
  assert.deepEqual(rec.settings.kept, old.kept);
  assert.equal(rec.settings.browse.hideRead, false);
  assert.equal(rec.settings.browse.hideWip, false);
  assert.equal(rec.settings.browse.showRatio, true);
  assert.equal(rec.settings.syncEnabled, false);
  assert.equal(rec.writeSync, false);
  assert.equal(rec.writeLocal, true);
  assert.deepEqual(L.settingsRecord(rec.settings).exclusions, ['Angst']);
});

test('a synced copy does not replace an existing device that has not opted in', () => {
  const old = { exclusions: ['Angst'], stats: { firstUse: now } };
  const remote = L.packSync(L.hydrate({ exclusions: ['Remote'], syncEnabled: true, updatedAt: now }));
  const rec = L.reconcileStorage(old, remote.items, now + 10);
  assert.deepEqual(rec.settings.exclusions, ['Angst']);
  assert.equal(rec.settings.syncEnabled, false);
  assert.equal(rec.writeSync, false);
});

test('a fresh profile picks up sync, and the newer stamp wins once sync is on', () => {
  const remote = L.packSync(L.hydrate({
    exclusions: ['Remote'], mutedAuthors: ['ada'], syncEnabled: true, updatedAt: 40,
    browse: { hideWip: true },
  }));
  const fresh = L.reconcileStorage({}, remote.items, 50);
  assert.deepEqual(fresh.settings.exclusions, ['Remote']);
  assert.deepEqual(fresh.settings.mutedAuthors, ['ada']);
  assert.equal(fresh.settings.browse.hideWip, true);
  assert.equal(fresh.settings.syncEnabled, true);
  assert.equal(fresh.writeLocal, true);
  assert.equal(fresh.writeSync, false);

  const older = L.reconcileStorage({
    exclusions: ['Local'], syncEnabled: true, updatedAt: 10, settingsVersion: 2,
  }, remote.items, 50);
  assert.deepEqual(older.settings.exclusions, ['Remote']);

  const newer = L.reconcileStorage({
    exclusions: ['Local'], syncEnabled: true, updatedAt: 80, settingsVersion: 2,
  }, remote.items, 90);
  assert.deepEqual(newer.settings.exclusions, ['Local']);
  assert.equal(newer.writeSync, true);
});

test('a newer opt-out turns sync off and leaves local lists in place', () => {
  const local = { exclusions: ['Angst'], syncEnabled: true, updatedAt: 10, settingsVersion: 2 };
  const items = { 'sift-meta': { app: 'sift-ao3', version: 2, syncEnabled: false, updatedAt: 20 } };
  const rec = L.reconcileStorage(local, items, 30);
  assert.equal(rec.settings.syncEnabled, false);
  assert.deepEqual(rec.settings.exclusions, ['Angst']);
});

test('turning sync on unites lists instead of letting an empty device wipe the other', () => {
  const local = { exclusions: ['Local'], mutedAuthors: ['ada'], browse: { showRatio: false } };
  const remote = L.packSync(L.hydrate({
    exclusions: ['Remote'], mutedAuthors: ['bea'], syncEnabled: true, updatedAt: 5,
    browse: { hideWip: true }, kept: { complete: 'T' },
  }));
  const merged = L.absorbSync(local, remote.items);
  assert.deepEqual(merged.exclusions, ['Local', 'Remote']);
  assert.deepEqual(merged.mutedAuthors, ['ada', 'bea']);
  assert.equal(merged.browse.showRatio, false);
  assert.equal(merged.browse.hideWip, false);
  assert.deepEqual(merged.kept, { complete: 'T' });
  assert.equal(merged.syncEnabled, true);
});

test('sync packing skips an oversize list and unpack does not invent an empty one', () => {
  const tags = Array.from({ length: 80 }, (_, i) => ('Very long tag name '.repeat(8) + i));
  const packed = L.packSync(L.hydrate({ exclusions: tags, mutedAuthors: ['ada'], syncEnabled: true, updatedAt: 1 }));
  assert.ok(packed.skipped.includes('sift-exclusions'));
  assert.equal(packed.items['sift-exclusions'], undefined);
  assert.ok(packed.error);
  assert.ok(L.jsonBytes(tags) > L.SYNC_ITEM_MAX);
  const unpacked = L.unpackSync(packed.items);
  assert.equal(unpacked.present.exclusions, false);
  assert.deepEqual(unpacked.settings.mutedAuthors, ['ada']);
  const kept = L.reconcileStorage({
    exclusions: tags, mutedAuthors: ['ada'], syncEnabled: true, updatedAt: 1, settingsVersion: 2,
  }, packed.items, 2);
  assert.deepEqual(kept.settings.exclusions, L.hydrate({ exclusions: tags }).exclusions);
});

test('work stats: dates, completion, kudos per hit, reading time', () => {
  assert.equal(L.parseAo3Date('20 Sep 2026'), Date.UTC(2026, 8, 20));
  assert.equal(L.parseAo3Date('2026-09-20'), Date.UTC(2026, 8, 20));
  assert.equal(L.parseAo3Date('31 February 2026'), null);
  assert.equal(L.parseCount('1,234'), 1234);
  assert.equal(L.parseCount('?'), null);
  // AO3 puts class "iswip" on complete works too; the title is the signal.
  assert.equal(L.workIsWip('Complete Work', '1/1'), false);
  assert.equal(L.workIsWip('Work in Progress', '4/?'), true);
  assert.equal(L.workIsWip('', '3/10'), true);
  assert.equal(L.workIsWip('', '10/10'), false);
  assert.equal(L.workIsWip('', ''), null);
  assert.equal(L.formatRatio(67, 1000), '6.7%');
  assert.equal(L.formatRatio(1, 10000), '<0.1%');
  assert.equal(L.formatRatio(0, 10), '0.0%');
  assert.equal(L.formatRatio(5, 0), '');
  assert.equal(L.kudosPerHit(2, 8), 0.25);
  assert.equal(L.formatReadingTime(500, 250), '2 min');
  assert.equal(L.formatReadingTime(250 * 90, 250), '1 h 30 min');
  assert.equal(L.formatReadingTime(0, 250), '');
  assert.equal(L.workIdFromHref('/works/101/chapters/4'), '101');
  assert.equal(L.workIdFromPath('/works/101'), '101');
  assert.equal(L.workIdFromHref('/tags/Fluff/works'), null);
});

test('on-the-page rules hide by length, completion, recency, and opened works', () => {
  const work = {
    users: [], relationships: [], isWork: true, words: 800, wip: true,
    updated: Date.UTC(2026, 0, 1), opened: true,
  };
  const cfg = L.hydrate({
    browse: { hideRead: true, hideWip: true, wordsFrom: '1000', wordsTo: '50000', staleDays: '30' },
  });
  assert.deepEqual(L.hideReasons(work, cfg, { now }), [
    'already opened', 'unfinished', 'under 1,000 words', 'not updated in 30 days',
  ]);
  assert.deepEqual(L.hideReasons({ ...work, words: 90000, wip: false, opened: false, updated: now }, L.hydrate({
    browse: { wordsTo: '50000', freshDays: '7' },
  }), { now }), ['over 50,000 words']);
  assert.equal(L.isFresh({ updated: now - 2 * L.DAY }, { freshDays: '7' }, now), true);
  assert.equal(L.isFresh({ updated: now - 8 * L.DAY }, { freshDays: '7' }, now), false);
  assert.equal(L.hideReasons(work, { enabled: false, browse: { hideWip: true } }, { now }).length, 0);
  const described = L.describeBrowse({ hideWip: true, wordsFrom: '1000', sortByRatio: true });
  assert.match(described, /hiding unfinished works/);
  assert.match(described, /at least 1,000 words on this page/);
  assert.match(described, /sorted by kudos per hit/);
  assert.equal(L.describeBrowse({}), '');
});

test('kudos-per-hit order keeps unknowns at the end and does not reshuffle ties', () => {
  assert.deepEqual(L.orderByRatio([
    { index: 0, ratio: 0.1 },
    { index: 1, ratio: null },
    { index: 2, ratio: 0.4 },
    { index: 3, ratio: 0.4 },
  ]), [2, 3, 0, 1]);
});

test('presets replace filter lists and leave the rest of the backup merge additive', () => {
  const current = L.hydrate({ exclusions: ['Angst'], mutedAuthors: ['ada'], browse: { hideWip: true } });
  const presets = L.makePreset(current, '  Keldra  ', now, 'p1');
  assert.equal(presets[0].name, 'Keldra');
  assert.deepEqual(presets[0].exclusions, ['Angst']);
  const withPreset = L.hydrate({ ...current, presets, exclusions: ['Fluff'] });
  const applied = L.applyPreset(withPreset, 'p1');
  assert.deepEqual(applied.exclusions, ['Angst']);
  assert.equal(applied.browse.hideWip, true);
  assert.deepEqual(L.deletePreset(withPreset, 'p1'), []);
  assert.equal(L.makePreset(current, '   ', now, 'p2').length, 0);
});

test('opened works cap at the newest 2000, and later toggles by work id', () => {
  const map = {};
  for (let i = 1; i <= L.READ_CAP; i++) map[String(i)] = i;
  const next = L.rememberRead(map, '99999', 5000);
  assert.equal(Object.keys(next).length, L.READ_CAP);
  assert.equal(next['1'], undefined);
  assert.equal(next['99999'], 5000);
  assert.equal(L.rememberRead({ '12': 1 }, 'nope', 2)['nope'], undefined);

  let later = L.toggleLater([], { id: '101', title: ' The Lamp ', authors: ['ada'], words: '1,200' }, now);
  assert.equal(later[0].title, 'The Lamp');
  assert.equal(later[0].words, 1200);
  assert.equal(L.laterHas(later, '101'), true);
  later = L.toggleLater(later, { id: '101' }, now + 1);
  assert.deepEqual(later, []);
});

test('v1 backups still import, and v2 backups round-trip rules, presets, and later', () => {
  const v1 = L.parseImport(JSON.stringify({
    app: 'sift-ao3', version: 1, exclusions: ['Angst'], autoApply: true,
  }));
  assert.equal(v1.data.browse, undefined);
  assert.deepEqual(v1.data.exclusions, ['Angst']);
  const merged = L.mergeSettings({ ...L.DEFAULTS, exclusions: ['Fluff'] }, v1.data);
  assert.deepEqual(merged.exclusions, ['Fluff', 'Angst']);
  assert.equal(merged.autoApply, true);
  assert.equal(merged.browse.hideRead, false);

  const saved = L.hydrate({
    exclusions: ['Angst'], browse: { hideWip: true, wpm: 300 },
    presets: L.makePreset(L.hydrate({ exclusions: ['Angst'] }), 'Keldra', now, 'p1'),
  });
  const file = L.exportSettings({
    ...saved,
    later: [{ id: '101', title: 'Lamp', authors: [], at: 1 }],
    readWorks: { '101': 1 },
    syncEnabled: true,
  });
  assert.equal(JSON.parse(file).version, 2);
  assert.equal(JSON.parse(file).syncEnabled, undefined);
  const back = L.parseImport(file);
  const again = L.mergeSettings(L.DEFAULTS, back.data);
  assert.equal(again.browse.hideWip, true);
  assert.equal(again.browse.wpm, 300);
  assert.equal(again.presets[0].name, 'Keldra');
  assert.equal(again.later[0].id, '101');
  assert.equal(again.readWorks['101'], 1);
});

test('store title and summary fit the Chrome and Firefox limits', () => {
  const manifest = require('../src/manifest.json');
  const firefox = 'Sift for AO3: tag, author & ship filter';
  assert.ok(manifest.name.length <= 75, manifest.name.length);
  assert.ok(firefox.length <= 50, firefox.length);
  assert.ok(manifest.description.length <= 132, manifest.description.length);
  assert.equal(manifest.version, '2.0.0');
  assert.equal(manifest.permissions.join(), 'storage');
});
