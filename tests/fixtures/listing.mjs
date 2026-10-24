// Synthetic AO3-style pages for the e2e test. Invented fandom, people and works; the markup mirrors
// a public AO3 relationship tag listing as seen on 2026-09-25, including the filter form's place
// after the work list. Stylesheet links point at AO3's public skin so screenshots look like the
// real site; tests pass without them.
export const SHIP = 'Ash Marlow/Juniper Vale';
export const FANDOM = 'Lanterns of Keldra (Web Series)';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// AO3's tag URL encoding: / & . ? # become *s* *a* *d* *q* *h*, then normal percent-encoding.
export const tagPath = name => '/tags/' + encodeURIComponent(
  name.replace(/\//g, '*s*').replace(/&/g, '*a*').replace(/\./g, '*d*').replace(/\?/g, '*q*').replace(/#/g, '*h*'));
const tag = name => `<a class="tag" href="${tagPath(name)}/works">${esc(name)}</a>`;

const W = (id, title, authors, rels, chars, free, summary, extra = {}) =>
  ({ id, title, authors, rels, chars, free, summary, rating: 'General Audiences', category: 'F/M', ...extra });

// Ship first: 101 104 108 110; via synonym 102 107; via subtag 106; second: 103 109; third: 105.
// quill_moth posts as two pseuds (101, 104) and co-writes 108.
export const WORKS = [
  W(101, 'The Lamplighter’s Almanac', [['quill_moth', 'quill_moth']], [SHIP, 'Pell Orrin/Maud Kestrel'],
    ['Ash Marlow', 'Juniper Vale', 'Pell Orrin'], ['Slow Burn', 'Found Family', 'Lighthouses'],
    'Ash keeps the lamps lit along the harbour. Juniper keeps a list of every lamp he forgets.'),
  W(102, 'Tea at the Canal House', [['tidewrack', 'tidewrack']], ['Juniper Vale/Ash Marlow'],
    ['Ash Marlow', 'Juniper Vale'], ['Tea', 'Rainy Days', 'Fluff'],
    'Three weeks of rain, one leaking roof, and far too many opinions about tea.'),
  W(103, 'Seven Bridges North', [['lamplit_owl', 'lamplit_owl']], ['Pell Orrin/Maud Kestrel', SHIP],
    ['Pell Orrin', 'Maud Kestrel', 'Ash Marlow'], ['Road Trips', 'Maps'],
    'Pell and Maud set out to map the northern canals. Ash and Juniper come along to argue about directions.',
    { rating: 'Teen And Up Audiences' }),
  W(104, 'A Map Folded Twice', [['quill_moth', 'Moth Writes']], [SHIP],
    ['Ash Marlow', 'Juniper Vale'], ['Letters', 'Pining'],
    'Letters passed between two lighthouses, one map, and a very patient ferryman.'),
  W(105, 'Weather Report for Keldra', [['fernhollow', 'fernhollow']], ['Maud Kestrel & Tobin Reyes', 'Pell Orrin/Tobin Reyes', SHIP],
    ['Maud Kestrel', 'Tobin Reyes', 'Pell Orrin'], ['Ensemble Cast', 'Storms'],
    'The whole town waits out the storm season in the old library.', { category: 'Multi' }),
  W(106, 'Small Hours at the Lighthouse', [['brassbell', 'brassbell']], ['Ash Marlow/Juniper Vale (Canal Town AU)'],
    ['Ash Marlow', 'Juniper Vale'], ['Canal Town AU', 'Night Shifts'],
    'Night shifts, a stubborn foghorn, and a thermos of soup shared at 3 a.m.'),
  W(107, 'Notes Left in Library Books', [], ["Ash/Juniper (Lanterns o' Keldra)"],
    ['Ash Marlow', 'Juniper Vale'], ['Libraries', 'Secret Admirer'],
    'Someone keeps leaving notes in the margins of the tide tables.'),
  W(108, 'Harvest Festival Committee Minutes', [['saltmarsh', 'saltmarsh'], ['quill_moth', 'quill_moth']], [SHIP],
    ['Ash Marlow', 'Juniper Vale', 'Tobin Reyes'], ['Festivals', 'Humor'],
    'Item one: the lantern budget. Item two: who let Ash near the lantern budget.'),
  W(109, 'Paper Boats', [['tidewrack', 'tidewrack']], ['Tobin Reyes/Pell Orrin', SHIP],
    ['Tobin Reyes', 'Pell Orrin'], ['Paper Boats', 'Childhood Friends'],
    'Tobin and Pell race paper boats down the canal every spring, and keep score for twenty years.',
    { category: 'M/M' }),
  W(110, 'Every Lantern in Keldra', [['brassbell', 'Bell Rings Twice']], [SHIP, 'Maud Kestrel/Tobin Reyes'],
    ['Ash Marlow', 'Juniper Vale'], ['Festivals', 'Found Family', 'Happy Ending'],
    'The night the whole town lights its lanterns at once.'),
];

const symbol = (cls, title) =>
  `<li><a class="help symbol question modal" title="Symbols key" href="/help/symbols_key"><span class="${cls}" title="${esc(title)}"><span class="text">${esc(title)}</span></span></a></li>`;
const RATING_CLASS = { 'General Audiences': 'rating-general-audience', 'Teen And Up Audiences': 'rating-teen' };
const CATEGORY_CLASS = { 'F/M': 'category-het', 'M/M': 'category-slash', Multi: 'category-multi' };

const author = ([user, pseud]) =>
  `<a rel="author" href="/users/${encodeURIComponent(user)}/pseuds/${encodeURIComponent(pseud)}">${esc(pseud === user ? user : `${pseud} (${user})`)}</a>`;

const blurb = (w, i) => `
  <li id="work_${w.id}" class="work blurb group work-${w.id} user-${5000 + i}" role="article">
  <div class="header module">
    <h4 class="heading">
      <a href="/works/${w.id}">${esc(w.title)}</a>
      by
      ${w.authors.length ? w.authors.map(author).join(', ') : 'Anonymous'}
    </h4>
    <h5 class="fandoms heading">
      <span class="landmark">Fandoms:</span>
      ${tag(FANDOM)}
      &nbsp;
    </h5>
    <ul class="required-tags">
${symbol(`${RATING_CLASS[w.rating]} rating`, w.rating)}
${symbol('warning-no warnings', 'No Archive Warnings Apply')}
${symbol(`${CATEGORY_CLASS[w.category]} category`, w.category)}
${symbol('complete-yes iswip', 'Complete Work')}
    </ul>
    <p class="datetime">${20 - (i % 9)} Sep 2026</p>
  </div>
  <h6 class="landmark heading">Tags</h6>
  <ul class="tags commas">
    <li class='warnings'><strong>${tag('No Archive Warnings Apply')}</strong></li>${
  w.rels.map(r => `<li class='relationships'>${tag(r)}</li>`).join('')}${
  w.chars.map(c => `<li class='characters'>${tag(c)}</li>`).join('')}${
  w.free.map(f => `<li class='freeforms'>${tag(f)}</li>`).join('')}
  </ul>
  <h6 class="landmark heading">Summary</h6>
  <blockquote class="userstuff summary">
    <p>${esc(w.summary)}</p>
  </blockquote>
  <dl class="stats">
    <dt class="language">Language:</dt>
    <dd class="language" lang="en">English</dd>
    <dt class="words">Words:</dt>
    <dd class="words">${(1200 + w.id * 37 % 900 * 11).toLocaleString('en-US')}</dd>
    <dt class="chapters">Chapters:</dt>
    <dd class="chapters">1/1</dd>
    <dt class="kudos">Kudos:</dt>
    <dd class="kudos"><a href="/works/${w.id}?view_full_work=true#kudos">${40 + (w.id * 13) % 90}</a></dd>
    <dt class="hits">Hits:</dt>
    <dd class="hits">${(600 + (w.id * 97) % 1400).toLocaleString('en-US')}</dd>
  </dl>
</li>`;

const head = title => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | Archive of Our Own</title>
<link rel="stylesheet" type="text/css" media="screen" href="/stylesheets/skins/skin_1_default/1_site_screen_.css" />
<link rel="stylesheet" type="text/css" media="only screen and (max-width: 62em), handheld" href="/stylesheets/skins/skin_1_default/4_site_midsize.handheld_.css" />
<link rel="stylesheet" type="text/css" media="only screen and (max-width: 42em), handheld" href="/stylesheets/skins/skin_1_default/5_site_narrow.handheld_.css" />
<link rel="stylesheet" href="/stylesheets/sandbox.css" />
</head>
<body class="logged-out">
<div id="outer" class="wrapper">
<header id="header" class="region">
  <h1 class="heading"><a href="/"><span>Archive of Our Own</span></a></h1>
  <nav aria-label="Site">
    <ul class="primary navigation actions">
      <li class="dropdown"><a href="/menu/fandoms">Fandoms</a></li>
      <li class="dropdown"><a href="/menu/browse">Browse</a></li>
      <li class="dropdown"><a href="/menu/search">Search</a></li>
      <li class="dropdown"><a href="/menu/about">About</a></li>
      <li class="search"><form class="search" id="search" role="search" aria-label="Work" action="/works/search" method="get">
        <fieldset><p><label class="landmark" for="site_search">Work Search</label>
        <input class="text" id="site_search" type="text" name="work_search[query]" />
        <span class="submit actions"><input type="submit" value="Search" class="button" /></span></p></fieldset>
      </form></li>
    </ul>
  </nav>
  <div class="clear"></div>
</header>
<div id="inner" class="wrapper">`;

const foot = `
</div>
<div id="footer" role="contentinfo" class="region"><h3 class="landmark heading">Footer</h3></div>
</div>
</body>
</html>`;

// exclude: tag names from work_search[excluded_tag_names]; like AO3, matching works are left out.
export function listingPage(exclude = []) {
  const ship = tagPath(SHIP);
  const out = new Set(exclude.map(t => t.trim().toLowerCase()).filter(Boolean));
  const works = WORKS.filter(w => ![...w.rels, ...w.chars, ...w.free].some(t => out.has(t.toLowerCase())));
  return `${head(`${SHIP} - Works`)}
<div id="main" class="works-index filtered region" role="main">
<h2 class="heading">
   1 - ${works.length} of ${works.length} Works in <a class="tag" href="${ship}">${esc(SHIP)}</a>
</h2>
<h3 class="landmark heading">Filters</h3>
<ul class="navigation actions" role="navigation"><li class="narrow-shown hidden"><a href="#work-filters" id="go_to_filters">Filters</a></li></ul>
<h4 class="landmark heading">Navigation</h4><ol class="pagination actions pagy" role="navigation" aria-label="Pagination"><li class="previous"><span class="disabled">← Previous</span></li><li><a role="link" aria-disabled="true" aria-current="page" class="current">1</a></li><li><a href="${ship}/works?page=2">2</a></li><li class="next"><a rel="next" href="${ship}/works?page=2">Next →</a></li></ol>
<h3 class="landmark heading">Listing Works</h3>
<ol class="work index group">${works.map(blurb).join('')}
</ol>
<form class="narrow-hidden filters" id="work-filters" action="/works" method="get">
  <h3 class="landmark heading">Filters</h3>
  <fieldset><legend>Filter results:</legend>
    <dl>
      <dt class="landmark">Submit</dt>
      <dd class="submit actions"><input type="submit" name="commit" value="Sort and Filter" /></dd>
      <dt class="include heading"><h4 class="heading">Include</h4></dt>
      <dd class="include tags group">
        <dl>
          <dt id="toggle_include_relationship_tags" class="filter-toggle relationship tags"><span class="landmark">Include </span>Relationships</dt>
          <dd id="include_relationship_tags" class="expandable relationship tags">
            <ul>
              <li><label for="include_work_search_relationship_ids_9001"><input type="checkbox" name="include_work_search[relationship_ids][]" id="include_work_search_relationship_ids_9001" value="9001" /><span class="indicator" aria-hidden="true"></span><span>${esc(SHIP)} (10)</span></label></li>
              <li><label for="include_work_search_relationship_ids_9002"><input type="checkbox" name="include_work_search[relationship_ids][]" id="include_work_search_relationship_ids_9002" value="9002" /><span class="indicator" aria-hidden="true"></span><span>Pell Orrin/Maud Kestrel (2)</span></label></li>
            </ul>
          </dd>
        </dl>
      </dd>
      <dt class="exclude heading"><h4 class="heading">Exclude</h4></dt>
      <dd class="exclude tags group">
        <dl>
          <dt><label for="work_search_excluded_tag_names">Other tags to exclude</label></dt>
          <dd class="autocomplete search"><input class="autocomplete" type="text" name="work_search[excluded_tag_names]" id="work_search_excluded_tag_names" /></dd>
        </dl>
      </dd>
      <dt class="language"><label for="work_search_language_id">Language</label></dt>
      <dd class="language"><select name="work_search[language_id]" id="work_search_language_id"><option value=""></option><option value="de">Deutsch</option><option value="en">English</option><option value="es">Español</option></select></dd>
    </dl>
  </fieldset>
  <input type="hidden" name="tag_id" id="tag_id" value="${esc(SHIP)}" class="text" autocomplete="off" />
  <p class="footnote"><a href="${ship}/works">Clear Filters</a></p>
</form>
</div>${foot}`;
}

// A work page: no blurbs, but its tag links lead to listings and should carry saved exclusions.
export function workPage(id) {
  const w = WORKS.find(x => x.id === id) || WORKS[0];
  return `${head(w.title)}
<div id="main" class="works-show region" role="main">
<div class="wrapper"><dl class="work meta group">
  <dt class="fandom tags">Fandom:</dt><dd class="fandom tags"><ul class="commas"><li>${tag(FANDOM)}</li></ul></dd>
  <dt class="relationship tags">Relationships:</dt><dd class="relationship tags"><ul class="commas">${w.rels.map(r => `<li>${tag(r)}</li>`).join('')}</ul></dd>
  <dt class="freeform tags">Additional Tags:</dt><dd class="freeform tags"><ul class="commas">${w.free.map(f => `<li>${tag(f)}</li>`).join('')}</ul></dd>
</dl></div>
<div id="workskin"><div class="preface group"><h2 class="title heading">${esc(w.title)}</h2></div>
<div class="userstuff"><p>${esc(w.summary)}</p></div></div>
</div>${foot}`;
}
