# Changelog

## 1.2.0 - 2026-11-17

### Design

- Warm paper-and-wine design system (spacing, type, radius, light and dark themes) for the popup and options.
- Crafted switches, chips, and empty states. Motion follows `prefers-reduced-motion`.
- In-page bar and panels use rounded chips and a wine accent that stays readable on AO3 skins.
- New extension icon and Chrome Web Store tile (440×280). Store screenshots refreshed at 1280×800.

## 1.1.1 - 2026-11-17

### Security

- Strict Content Security Policy on extension pages (`script-src 'self'` only; no remote code).
- Content script answers popup state requests only from this extension, not other senders.
- Build and CI lint checks keep permissions limited to `storage` and AO3 host access.

### Bugs and robustness

- Ship synonym parsing tolerates alternate AO3 listbox class order and nested markup.
- Tag profile detection accepts `class` strings where words are not in a fixed order.
- E2e harness uses faster asset timeouts and `domcontentloaded` so CI navigation does not hang.

### UI, ease of use, accessibility

- Popup: first-run hint, live refresh when settings change, clearer non-AO3 tab messaging, shortcut note.
- Popup switch exposes `aria-checked`; counts region is labelled for screen readers.
- Options: keyboard shortcut documented; auto-apply label mentions kept filters.
- **Alt+Shift+S** toggles Sift on or off (change at `chrome://extensions/shortcuts`).

### Repository

- README, CONTRIBUTING, issue/PR templates, and CI (`lint`, unit tests, `build`).

## 1.1.0 - 2026-10-23

- Keep AO3's sidebar filters on every listing. After filtering a works page with AO3's own
  sidebar (complete works only, works in progress only, a language, no crossovers or only
  crossovers, a word count range), press "Keep on every listing" in the Sift bar. Links to
  work listings and searches then carry those filters, the same way as saved exclusions, and
  "Apply my filters" and the automatic reload add them too. A value you set in the sidebar for
  one search still wins. The options page lists kept filters and removes them one by one, and
  backups include them.

## 1.0.0 - 2026-09-26

First release.

- Primary ship filter: on a relationship tag's works page, show only works that list that ship
  first, or in the first two relationship tags. Tags AO3 treats as the same ship, and its
  subtags, count as the ship. Saved ships turn the filter on by themselves.
- Saved tag exclusions go through AO3's own filter: links to works and bookmark listings, search
  results, and user and collection works carry them, so tags with the same meaning are left out
  too and pages stay full. Listings opened without them offer "Apply my filters", with an
  optional one-time automatic reload.
- Author muting covers every pseud of a user and works they co-wrote.
- Hidden works collapse to a one-line bar with a Show button, or can be removed entirely.
- A Sift button on each work opens a panel to exclude any of its tags or mute its authors. It
  works by touch and at phone width.
- Popup with hidden counts for the page and in total, and an on/off switch.
- Options page for all lists and settings, with JSON import and export.
- Lists and settings are saved in the browser's local storage only. No account, no server, no tracking.