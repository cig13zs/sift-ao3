# Changelog

## 2.0.0 - 2026-11-20

Readers keep asking AO3 for things the site still does not do: mark fics as read and filter them out, sort by kudos divided by hits, and see length and freshness while browsing. AO3 Savior and AO3 Enhancer hide tags and authors, and a few userscripts add a kudos rate, but none of them keep exclusions inside AO3's own filter, and most of them need a userscript manager. This release stays on Sift's job — filtering and browsing — and adds the gaps that fit that job.

The name stays **Sift**. The extension is already published under it, and the word is the action: sift a tag until the works you want are what's left. The store title now says the job in the remaining characters.

### Filters and browsing

- Kudos per hit on each work, as a percentage of hits that left a kudos, plus an estimated reading time from your words-per-minute setting. Optional sort of the works already on the page. It is a browsing hint, not a score, and nothing about it leaves the device.
- Hide unfinished works, works outside a word-count range, or works not updated in a chosen number of days. Highlight works updated recently. These run on the page, including bookmark listings.
- Remember works you open, only after you turn it on. Listings can mark them Opened or hide them. The newest 2,000 ids are kept, on this device only.
- Saved for later: a private list with a Later button on listings and fic pages, separate from AO3 bookmarks.
- Named presets for exclusions, muted authors, ships, kept filters, and the on-the-page rules.
- From a listing or a fic page, exclude the tags you tick, or every additional tag on that work, in one step.

### Sync, backups, and existing settings

- Optional sync through the browser account you already use (`chrome.storage.sync` under the existing `storage` permission). Off by default. Opened works, saved-for-later, stats, and the ship-name cache stay on the device. Turning it on unites lists with the other device instead of replacing either side. Turning it off deletes the synced copy. A list over the browser's per-item limit (about 8 KB) stays local and the options page says so.
- Existing saved exclusions, muted authors, ships, kept filters, and toggles are kept. New rules default to off, except the two displays (kudos rate and reading time), which can be turned off in options. Version 1 backups still import. Exports are version 2 and do not turn sync on.

### Listing

- Store title: `Sift for AO3: block tags, mute authors, filter ships`. Firefox name, within the 50-character cap: `Sift for AO3: tag, author & ship filter`.
- Popup uses the width it is given, including a 320px-wide window, and lists up to three saved-for-later works.

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