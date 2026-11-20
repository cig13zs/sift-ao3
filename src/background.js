// Service worker: migrate storage once, and toggle Sift from the keyboard shortcut.
'use strict';
importScripts('lib/sift.js', 'lib/storage.js');

globalThis.SiftStore.load().catch(() => {});

chrome.commands.onCommand.addListener(async command => {
  if (command !== 'toggle-enabled') return;
  const { settings } = await globalThis.SiftStore.load();
  await globalThis.SiftStore.saveSettings({ enabled: !settings.enabled });
});
