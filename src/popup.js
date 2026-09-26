const $ = id => document.getElementById(id);

(async () => {
  const { enabled = true, stats = {} } = await chrome.storage.local.get(['enabled', 'stats']);
  $('enabled').checked = enabled;
  $('enabled').addEventListener('change', e => chrome.storage.local.set({ enabled: e.target.checked }));
  $('total').textContent = (stats.hiddenTotal || 0).toLocaleString();
  $('options').addEventListener('click', () => chrome.runtime.openOptionsPage());

  let state = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state = await chrome.tabs.sendMessage(tab.id, 'sift-state');
  } catch { /* the active tab is not an AO3 page */ }

  const note = $('note');
  if (state?.unreadable) {
    note.textContent = "Sift couldn't read this page. An update is pending.";
    note.classList.add('warn');
  } else if (state?.total) {
    $('page').textContent = `${state.hidden} of ${state.total}`;
    return;
  } else {
    note.textContent = 'Open an AO3 works listing to see what Sift hides there.';
  }
  note.hidden = false;
})();
