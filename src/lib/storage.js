// chrome.storage access for the content script, options, popup, and service worker.
// Decisions live in sift.js. This file only reads and writes.
(function (root) {
  'use strict';

  function lib() { return root.SiftLib; }

  async function readSync() {
    try {
      if (!chrome.storage.sync) return null;
      return await chrome.storage.sync.get(lib().SYNC_KEYS);
    } catch { return null; }
  }

  async function pushSync(settings, turnedOff) {
    const L = lib();
    if (!chrome.storage.sync) {
      if (settings.syncEnabled) {
        await chrome.storage.local.set({ syncWarning: 'This browser has no extension sync. Lists stay on this device.' });
      }
      return;
    }
    if (!settings.syncEnabled) {
      if (!turnedOff) return;
      try {
        await chrome.storage.sync.set({
          'sift-meta': { app: 'sift-ao3', version: 2, syncEnabled: false, updatedAt: settings.updatedAt || Date.now() },
        });
        await chrome.storage.sync.remove(L.SYNC_KEYS.filter(k => k !== 'sift-meta'));
      } catch { /* local off switch still stands */ }
      return;
    }
    const packed = L.packSync(settings);
    if (!packed.items) {
      await chrome.storage.local.set({ syncWarning: packed.error || 'Could not sync settings.' });
      return;
    }
    try {
      const current = await readSync();
      const same = current && L.SYNC_KEYS.every(k => JSON.stringify(current[k] ?? null) === JSON.stringify(packed.items[k] ?? null));
      if (!same) {
        await chrome.storage.sync.set(packed.items);
        if (packed.skipped.length) await chrome.storage.sync.remove(packed.skipped);
      }
      if (packed.error) await chrome.storage.local.set({ syncWarning: packed.error });
      else await chrome.storage.local.remove('syncWarning');
    } catch {
      await chrome.storage.local.set({ syncWarning: 'Browser sync rejected the save. Lists stay on this device.' });
    }
  }

  async function load() {
    const L = lib();
    const local = await chrome.storage.local.get(null);
    let syncItems = null;
    if (local.syncEnabled || local.settingsVersion !== 2) syncItems = await readSync();
    const rec = L.reconcileStorage(local, syncItems, Date.now());
    if (rec.writeLocal) await chrome.storage.local.set(L.settingsRecord(rec.settings));
    if (rec.writeSync) await pushSync(rec.settings, false);
    return {
      settings: rec.settings,
      readWorks: L.cleanReadWorks(local.readWorks),
      later: L.cleanLater(local.later),
      stats: local.stats && typeof local.stats === 'object' ? local.stats : {},
      syncWarning: typeof local.syncWarning === 'string' ? local.syncWarning : '',
    };
  }

  async function saveSettings(patch) {
    const L = lib();
    const local = await chrome.storage.local.get(null);
    let base = L.hydrate(local);
    if (patch.syncEnabled === true && !base.syncEnabled) base = L.absorbSync(local, await readSync());
    let browse = base.browse;
    if (patch.browse) {
      browse = { ...base.browse, ...patch.browse };
      if (patch.browse.trackReads === false) browse.hideRead = false;
      else if (patch.browse.hideRead === true) browse.trackReads = true;
    }
    const next = L.hydrate({ ...base, ...patch, browse, updatedAt: Date.now(), settingsVersion: 2 });
    await chrome.storage.local.set(L.settingsRecord(next));
    await pushSync(next, patch.syncEnabled === false);
    return next;
  }

  async function saveLocal(obj) {
    await chrome.storage.local.set(obj);
  }

  function watch(fn) {
    chrome.storage.onChanged.addListener((changes, area) => fn(changes, area));
  }

  const api = { load, saveSettings, saveLocal, watch };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiftStore = api;
})(globalThis);
