# Privacy policy

Sift for AO3, version 2.0.0. Last updated 2026-11-20.

Sift is a browser extension that runs on archiveofourown.org. It has no account, no
server of its own, no analytics and no ads.

## What Sift saves

Sift keeps these in your browser's extension storage:

- the tags you exclude, the authors you mute, the ships you filter, and named presets of those lists
- AO3 sidebar filters you choose to keep (complete works only, language, crossovers, word count)
- on-the-page rules: word-count limits, unfinished works, update recency, kudos-rate display, reading speed, and page sort
- your settings, including whether Sift is on
- other names for your filtered ships, copied from AO3's public tag pages and kept for up to 7 days
- counts of works hidden and listings filtered, which the popup shows and which decide when a thank-you card appears

If you turn on **Remember works you open**, Sift also stores the id of each work you open and the time, up to the newest 2,000, so listings can mark or hide them. If you press **Later**, Sift stores that work's id, title, authors, and word count. Both lists stay on this device. Sift does not record a work until you turn remembering on, and it does not record works while Sift is off.

Uninstalling Sift deletes all of it. You can export a copy from the options page first, and you can clear opened works or saved-for-later there without uninstalling.

## Sync

Sync is off until you turn it on. When it is on, the lists in the first two bullets above, plus your on-the-page rules and presets, are stored with `chrome.storage.sync`. Chrome and Edge sync that through the Google account signed into the browser. Firefox syncs it through the Mozilla account signed into Firefox. Sift does not run that account and does not receive a copy.

Opened works, saved-for-later, the hidden-work counts, and the ship-name cache are not synced. Turning sync off deletes the synced copy. A list that is too big for the browser's sync limit stays on the device only.

## What Sift reads

The AO3 pages you open, so it can see each work's title, authors, tags, word count, chapters, dates, kudos, and hits, and decide what to fold or label. It does not send that page to anyone.

## What Sift sends, and where

Nothing goes to the developer or to any third party Sift operates. Sift only talks to AO3, plus the browser's own sync when you have turned that on:

- Links on AO3 pages that lead to AO3 listings get your excluded tags and kept filters added to the address, so AO3 leaves those works out. AO3's own filter sidebar sends the same information when you use it.
- When you turn on the ship filter for a ship, Sift loads that ship's public tag page on archiveofourown.org to read its other names. It does this at most once a week per ship, or again after an hour if AO3 didn't answer.

The Ko-fi and store rating links open only when you click them. Kudos-per-hit figures are calculated on the device and are not uploaded.

## Contact

Questions go to [GitHub issues](https://github.com/cig13zs/sift-ao3/issues).
