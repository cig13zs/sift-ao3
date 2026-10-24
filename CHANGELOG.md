# Changelog

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
