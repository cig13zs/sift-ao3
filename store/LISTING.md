# Store listing: Sift for AO3 1.1.0

Both packages come from `node build.mjs` (`dist/sift-ao3-1.1.0-chrome.zip` and `-firefox.zip`). The title and summary come from each
package's manifest, so there's nothing to type for them.

## Description (both stores)

> Sift makes AO3's filters stick, and it adds two that AO3 doesn't have for readers who
> aren't logged in.
>
> Your ship first. On a relationship tag's works page, tick "Only works where this ship
> is listed first", and works where the ship is only a side pairing fold down to one
> line you can still open. Sift checks AO3's own list of other names for the ship, so a
> reversed or alternate spelling of the pairing still counts. A looser "first two
> relationship tags" option is there too.
>
> Excluded tags that stay excluded. Exclude a tag once, from any work's Sift panel or
> the options page, and the AO3 listings and searches you open leave it out. Sift adds
> the tag to AO3's own filter, so synonym tags are excluded too and every page stays
> full.
>
> Sidebar filters that stay put. Choose complete works only, a language, no crossovers
> or a word count range in AO3's sidebar once, press "Keep on every listing", and every
> work listing and search you open uses them too.
>
> Muted authors. Mute an author and their works fold away on every listing, under every
> pseud, even when you're logged out.
>
> Your lists are saved only in your browser and are never sent to the developer. Sift
> has no account, no server and no analytics. It's free and open source.
>
> Sift is an unofficial project and isn't affiliated with the Organization for
> Transformative Works or Archive of Our Own.

## Chrome Web Store

- Package: `sift-ao3-1.1.0-chrome.zip`
- Title from the package: `Sift for AO3: tag blocker, author mute & primary ship filter`
- Summary from the package: `Make your AO3 filters stick: excluded tags on every search, muted authors, and only fics where your ship comes first.`
- Category: Lifestyle > Entertainment. Language: English.
- Screenshots, 1280x800, in this order: `1-primary-ship.png`, `2-exclude-from-panel.png`,
  `3-hidden-listing.png`, `4-options.png`.
- Small promo tile, 440x280: `promo-440x280.png`.
- Homepage: `https://cig13zs.github.io/sift-ao3/`. Support: `https://github.com/cig13zs/sift-ao3/issues`.

Privacy tab:

- Single purpose: filter AO3 work listings by keeping the reader's excluded tags applied,
  folding works by muted authors, and showing only works where a chosen ship is the main
  pairing.
- `storage`: saves the reader's excluded tags, kept AO3 filters, muted authors, ship
  settings and counters on the device.
- Host permission `https://archiveofourown.org/*`: shows the Sift bar and panel on AO3
  pages, folds hidden works, adds saved exclusions and kept filters to AO3 listing
  links, and loads a ship's public AO3 tag page to read its other names.
- Remote code: No.
- Data usage: tick "Website content", because Sift reads AO3 listings on the device to
  decide what to fold. Certify all three Limited Use statements. Nothing is sold or
  transferred, and nothing is sent to the developer.
- Privacy policy: `https://cig13zs.github.io/sift-ao3/privacy.html`

## Firefox Add-ons

- Package: `sift-ao3-1.1.0-firefox.zip`. Tick Firefox for Android as well; the manifest
  supports it.
- Name from the package: `Sift for AO3: tag blocker & primary ship filter` (AMO allows 50
  characters).
- Summary: the same sentence as Chrome.
- Category: Games & Entertainment. License: MIT.
- Source code: not needed. Nothing is minified or bundled, so the package is the source.
- Data collection: none, declared in the manifest.
- Homepage, support site and privacy policy: the same URLs as above.

## After approval

Done for Chrome: `STORE_URL` in `src/lib/sift.js` points at the Chrome Web Store reviews
page, which switches on the one-time rating card.
