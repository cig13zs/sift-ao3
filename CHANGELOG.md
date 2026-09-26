# Changelog

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
