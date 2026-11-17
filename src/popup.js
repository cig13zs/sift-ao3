const $ = id => document.getElementById(id);

async function tabState() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url?.startsWith('https://archiveofourown.org/')) return null;
      return await chrome.tabs.sendMessage(tab.id, 'sift-state');
    } catch {
      if (attempt === 0) await new Promise(r => setTimeout(r, 120));
    }
  }
  return null;
}

function syncSwitch(enabled) {
  const box = $('enabled');
  box.checked = enabled;
  box.setAttribute('aria-checked', String(enabled));
  const state = $('switch-state');
  if (state) state.textContent = enabled ? 'On' : 'Off';
}

function showCounts(state) {
  const note = $('note');
  const hint = $('hint');
  note.hidden = true;
  hint.hidden = true;
  if (state?.unreadable) {
    note.textContent = "Sift couldn't read this page. An update may be pending.";
    note.classList.add('warn');
    note.hidden = false;
    return;
  }
  if (state?.total) {
    $('page').textContent = `${state.hidden} of ${state.total}`;
    return;
  }
  note.textContent = 'Open an AO3 works listing to see what Sift hides there.';
  note.hidden = false;
}

(async () => {
  const stored = await chrome.storage.local.get(['enabled', 'stats']);
  const enabled = stored.enabled !== false;
  syncSwitch(enabled);
  $('total').textContent = (stored.stats?.hiddenTotal || 0).toLocaleString();

  if (!stored.stats?.firstUse) {
    $('hint').textContent = 'First visit: open a works listing, press Sift on any fic, or use Options to add exclusions.';
    $('hint').hidden = false;
  }

  $('enabled').addEventListener('change', e => {
    const on = e.target.checked;
    syncSwitch(on);
    chrome.storage.local.set({ enabled: on });
  });
  $('options').addEventListener('click', () => chrome.runtime.openOptionsPage());

  showCounts(await tabState());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ('enabled' in changes) syncSwitch(changes.enabled.newValue !== false);
    if (changes.stats?.newValue?.hiddenTotal != null) {
      $('total').textContent = changes.stats.newValue.hiddenTotal.toLocaleString();
    }
  });
})();