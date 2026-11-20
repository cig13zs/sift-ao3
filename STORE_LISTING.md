# Store listing: Sift for AO3 2.0.0

Both packages come from `node build.mjs` (`dist/sift-ao3-2.0.0-chrome.zip` and `-firefox.zip`). The title and summary come from each package's manifest.

## Name

The brand stays **Sift**. It is already the published name, and it is the verb: sift a tag's works until the ones you want are what's left. A new brand would split the listing from the people who already installed it. The title uses the remaining characters to say the job.

- Chrome title (from the package, 75-character cap): `Sift for AO3: block tags, mute authors, filter ships`
- Firefox name (50-character cap): `Sift for AO3: tag, author & ship filter`
- Summary, both stores (132-character cap): `Block tags, mute authors, and keep your ship first on every AO3 search. See kudos rates and hide fics you already opened.`

## Description (both stores)

> Sift blocks the tags you exclude, mutes authors, and keeps your ship first, on every AO3 search you open. It also shows a few things AO3's sidebar does not.
>
> Your ship first. On a relationship tag's works page, tick "Only works where this ship is listed first". Works where the ship is only a side pairing fold down to one line you can still open. Sift checks AO3's own list of other names for the ship, so a reversed or alternate spelling still counts.
>
> Excluded tags that stay excluded. Exclude a tag once, from a work's Sift panel or the options page, and the listings you open leave it out. Sift adds the tag to AO3's own filter, so synonym tags are excluded too and every page stays full. On a fic page you can exclude every additional tag at once, or only the ones you tick.
>
> Sidebar filters that stay put. Choose complete works only, a language, no crossovers, or a word-count range once, press "Keep on every listing", and every work listing you open uses them too.
>
> On the page you are looking at, including bookmarks: hide unfinished works, hide a word-count range, hide works that have gone quiet, and highlight ones updated recently. Each work can show kudos per hit and an estimated reading time. You can sort that page by kudos per hit. The figure is a browsing hint, not a score.
>
> Opened works and a private "later" list stay on this device. Remembering what you opened is off until you turn it on. Presets save a whole filter setup under a name.
>
> Your lists are not sent to the developer. Sync across your own browsers is off until you turn it on, and then it uses the browser's own account sync, not a Sift server. Sift has no account and no analytics. It is free and open source.
>
> Sift is an unofficial project and is not affiliated with the Organization for Transformative Works or Archive of Our Own.

## Chrome Web Store

- Package: `sift-ao3-2.0.0-chrome.zip`
- Title from the package: `Sift for AO3: block tags, mute authors, filter ships`
- Summary from the package: `Block tags, mute authors, and keep your ship first on every AO3 search. See kudos rates and hide fics you already opened.`
- Category: Lifestyle > Entertainment. Language: English.
- Screenshots, 1280x800, in this order: `1-primary-ship.png`, `2-exclude-from-panel.png`,
  `3-hidden-listing.png`, `4-options.png`, `7-on-the-page.png`.
- Small promo tile, 440x280: `promo-440x280.png`.
- Homepage: `https://cig13zs.github.io/sift-ao3/`. Support: `https://github.com/cig13zs/sift-ao3/issues`.

Privacy tab:

- Single purpose: filter and label AO3 work listings for the reader — kept exclusions, muted authors, a primary ship, on-the-page length and recency rules, and a kudos-per-hit hint.
- `storage`: saves the reader's lists, presets, on-the-page rules, and (only if they turn them on) opened-work ids and browser sync.
- Host permission `https://archiveofourown.org/*`: shows the Sift bar and panel on AO3 pages, folds hidden works, adds saved exclusions and kept filters to AO3 listing links, and loads a ship's public AO3 tag page to read its other names.
- Remote code: No.
- Data usage: tick "Website content", because Sift reads AO3 listings on the device to decide what to fold. Certify all three Limited Use statements. Nothing is sold or transferred to the developer. Browser sync, when the reader turns it on, is the browser vendor's account sync, not a transfer by the developer.
- Privacy policy: `https://cig13zs.github.io/sift-ao3/privacy.html`

## Firefox Add-ons

- Package: `sift-ao3-2.0.0-firefox.zip`. Tick Firefox for Android as well; the manifest supports it.
- Name from the package: `Sift for AO3: tag, author & ship filter` (AMO allows 50 characters).
- Summary: the same sentence as Chrome.
- Category: Games & Entertainment. License: MIT.
- Source code: not needed. Nothing is minified or bundled, so the package is the source.
- Data collection: none collected by the extension author. Optional browser sync is the browser's own feature and stays off unless the reader enables it. Declared in the manifest as `none`.
- Homepage, support site and privacy policy: the same URLs as above.

## After approval

Do not upload this package until the owner asks. `STORE_URL` in `src/lib/sift.js` already points at the Chrome Web Store reviews page for the one-time rating card.
