// Minimal service worker: keyboard shortcut toggles Sift on or off. No network access.
'use strict';
chrome.commands.onCommand.addListener(async command => {
  if (command !== 'toggle-enabled') return;
  const { enabled = true } = await chrome.storage.local.get('enabled');
  await chrome.storage.local.set({ enabled: !enabled });
});