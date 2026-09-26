// End-to-end test: builds, loads the unpacked Chrome build in Chromium, and serves the synthetic
// fixtures at real archiveofourown.org URLs so the content script injects as it does on the site.
// Every page, work and name is invented; AO3's public stylesheets are fetched when reachable so
// the screenshots look like the real site. Writes store/*.png and tests/screenshots/.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { SHIP, tagPath, listingPage, workPage } from './fixtures/listing.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('../build.mjs'); // always test what src/ says now
const EXT = path.join(root, 'dist', 'chrome');
const AO3 = 'https://archiveofourown.org';
const SHIP_PATH = tagPath(SHIP);
const LISTING = AO3 + SHIP_PATH + '/works';
const EXCL = 'work_search[excluded_tag_names]';
const TAG_PAGE = fs.readFileSync(path.join(root, 'tests', 'fixtures', 'tag-page.html'), 'utf8');
fs.mkdirSync(path.join(root, 'tests', 'screenshots'), { recursive: true });

const errors = [];      // anything thrown or console.error'd by the extension
const hits = [];        // document requests, for the redirect checks
const assets = new Map();
let tagFetches = 0;
let dropQuery = false;  // simulates AO3 redirecting a filtered listing to its bare URL

async function serve(route) {
  const req = route.request();
  const u = new URL(req.url());
  if (/^\/(?:stylesheets|images|javascripts)\//.test(u.pathname)) return asset(route, u.href);
  if (req.resourceType() === 'document') hits.push(u.href);
  const html = body => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  if (u.pathname === SHIP_PATH) {
    tagFetches++;
    return html(TAG_PAGE);
  }
  const work = /^\/works\/(\d+)$/.exec(u.pathname);
  if (work) return html(workPage(Number(work[1])));
  if (u.pathname.endsWith('/works')) {
    // AO3 answers some filtered URLs with a 302 that drops the query. A routed 302's follow-up request
    // bypasses page.route and would reach the live site, so the page drops the query itself instead.
    if (dropQuery && u.search) {
      return html(listingPage().replace('<head>', '<head><script>history.replaceState(null, "", location.pathname)</script>'));
    }
    return html(listingPage((u.searchParams.get(EXCL) || '').split(',')));
  }
  return route.fulfill({ status: 404, contentType: 'text/html', body: '<!DOCTYPE html><title>Not found</title>' });
}

// One live fetch per stylesheet or image per run; tests pass without them.
async function asset(route, url) {
  if (!assets.has(url)) {
    assets.set(url, route.fetch({ timeout: 15000 })
      .then(async r => (r.ok() ? { contentType: r.headers()['content-type'], body: await r.body() } : null))
      .catch(() => null));
  }
  const a = await assets.get(url);
  return route.fulfill(a ? { status: 200, ...a } : { status: 404, body: '' });
}

// Playwright's own Chromium; installed Edge when it can't start (on this Windows machine it fails with
// "spawn UNKNOWN", a side-by-side manifest error). SIFT_E2E_CHANNEL=chrome|msedge|chromium forces one.
let channel = process.env.SIFT_E2E_CHANNEL;
async function start(opts) {
  if (channel) return chromium.launchPersistentContext('', { channel, ...opts });
  try {
    channel = 'chromium';
    return await chromium.launchPersistentContext('', { channel, ...opts });
  } catch (e) {
    channel = 'msedge';
    console.log(`note: Playwright's Chromium did not start (${e.message.split('\n')[0]}); using installed Edge`);
    return chromium.launchPersistentContext('', { channel, ...opts });
  }
}

async function launch(options = {}) {
  const context = await start({
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 1280, height: 800 },
    ...options,
  });
  context.setDefaultTimeout(8000);
  context.setDefaultNavigationTimeout(20000);
  await context.route(AO3 + '/**', serve);
  const page = context.pages()[0] || await context.newPage();
  // Playwright only reports the page's main world; content scripts run in an isolated world.
  const cdp = await context.newCDPSession(page);
  let extId = null;
  cdp.on('Runtime.executionContextCreated', ({ context: c }) => {
    if (c.origin.startsWith('chrome-extension://')) extId = new URL(c.origin).host;
  });
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) =>
    errors.push(`exception on ${page.url()}: ${d.exception?.description || d.text}`));
  cdp.on('Runtime.consoleAPICalled', e => {
    if (e.type === 'error' || e.type === 'assert') {
      errors.push(`console.${e.type} on ${page.url()}: ${e.args.map(a => a.value ?? a.description).join(' ')}`);
    }
  });
  await cdp.send('Runtime.enable');
  await page.goto(LISTING);
  await page.locator('.sift-bar').waitFor();
  assert.ok(extId, 'content script context not found');
  return { context, page, extId };
}

function watchExtensionPage(p) {
  p.on('pageerror', e => errors.push(`pageerror on ${p.url()}: ${e.message}`));
  p.on('console', m => m.type() === 'error' && errors.push(`console.error on ${p.url()}: ${m.text()}`));
  return p;
}

let passed = 0;
let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${String(e.message).split('\n').slice(0, 4).join('\n     ')}`);
  }
}

const q = params => '?' + new URLSearchParams(params);
const excluded = url => new URL(url, AO3).searchParams.get(EXCL);
const countText = (n, total = 10) => new RegExp(`^${n} of ${total} works hidden on this page$`);
const waitCount = (p, n, total) => p.locator('.sift-count', { hasText: countText(n, total) }).waitFor();
const collapsed = p => p.$$eval('li.blurb.sift-collapsed, li.blurb.sift-removed', els => els.map(e => Number(e.id.slice(5))));

// Scrolls `selector` to the top of the viewport (or the page to the top) and saves the viewport.
async function shot(p, file, selector) {
  if (selector) await p.locator(selector).first().evaluate(e => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 12));
  else await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: path.join(root, file) });
}

// ---- Desktop, 1280x800 ----
const desk = await launch();
const { page } = desk;
const OPTIONS = `chrome-extension://${desk.extId}/options.html`;
const POPUP = `chrome-extension://${desk.extId}/popup.html`;
const ext = watchExtensionPage(await desk.context.newPage());
await ext.goto(OPTIONS);
await page.bringToFront();
const getStore = keys => ext.evaluate(k => chrome.storage.local.get(k), keys);
async function reset(settings) {
  tagFetches = 0;
  dropQuery = false;
  await ext.evaluate(async s => { await chrome.storage.local.clear(); await chrome.storage.local.set(s); }, settings);
}

await step('first run: Sift bar with tip, a Sift button on every work, nothing hidden', async () => {
  await reset({});
  await page.goto(LISTING);
  await waitCount(page, 0);
  assert.equal(await page.locator('li.blurb .sift-open').count(), 10);
  assert.ok(await page.locator('.sift-bar').getByText('Tip: press the Sift button').isVisible());
  assert.ok(await page.getByLabel('Only works where this ship is listed first').isVisible());
});

await step('primary ship, listed first: 3 of 10 hidden; synonyms and subtags count as the ship', async () => {
  await page.getByLabel('Only works where this ship is listed first').check();
  await waitCount(page, 3);
  assert.deepEqual(await collapsed(page), [103, 105, 109]);
  assert.equal(await page.locator('#work_103 .sift-hidebar span').textContent(), 'Hidden by Sift: not primary ship');
  await page.locator('.sift-bar').getByText('On for this ship on every page').waitFor();
  const { ships, synonyms } = await getStore(['ships', 'synonyms']);
  assert.deepEqual(ships, [{ name: SHIP, firstTwo: false }]);
  assert.equal(tagFetches, 1);
  assert.equal(synonyms[SHIP.toLowerCase()].ok, true);
  await shot(page, 'store/1-primary-ship.png', '#main h2.heading');
});

await step('primary ship, first two: 1 of 10 hidden; stays on after reload, synonyms from cache', async () => {
  await page.getByLabel('Ship in the first two relationship tags').check();
  await waitCount(page, 1);
  assert.deepEqual(await collapsed(page), [105]);
  await page.reload();
  await waitCount(page, 1);
  assert.equal(tagFetches, 1);
  assert.ok(await page.getByLabel('Only works where this ship is listed first').isChecked());
  await page.getByLabel('Only works where this ship is listed first').uncheck();
  await waitCount(page, 0);
  assert.deepEqual((await getStore('ships')).ships, []);
});

await step('mute from the inline panel: every pseud and co-written work of that user hides', async () => {
  await reset({});
  await page.goto(LISTING);
  await waitCount(page, 0);
  const open = page.locator('#work_101 .sift-open');
  await open.click();
  assert.equal(await open.getAttribute('aria-expanded'), 'true');
  await page.locator('#work_101 .sift-panel').getByRole('button', { name: 'Mute quill_moth' }).click();
  await waitCount(page, 3);
  assert.deepEqual(await collapsed(page), [101, 104, 108]);
  assert.equal(await page.locator('#work_104 .sift-hidebar span').textContent(), 'Hidden by Sift: muted author quill_moth');
  assert.deepEqual((await getStore('mutedAuthors')).mutedAuthors, ['quill_moth']);
  assert.equal(await page.evaluate(() => document.activeElement.closest('li.blurb')?.id), 'work_101');
  await page.locator('#work_104 .sift-hidebar button').click();
  assert.deepEqual(await collapsed(page), [101, 108]);
  await page.locator('.sift-bar').getByRole('button', { name: 'Show all' }).click();
  assert.deepEqual(await collapsed(page), []);
  await page.locator('.sift-bar').getByRole('button', { name: 'Hide again' }).click();
  assert.deepEqual(await collapsed(page), [101, 104, 108]);
  await waitCount(page, 3);
});

await step('exclude a tag from the inline panel: listing links carry it, AO3 form links do not', async () => {
  await reset({});
  await page.goto(LISTING);
  await waitCount(page, 0);
  await page.locator('#work_102 .sift-open').click();
  const panel = page.locator('#work_102 .sift-panel');
  await panel.getByRole('button', { name: 'Exclude Fluff' }).click();
  await panel.getByText('Excluded "Fluff". Reload this listing to leave it out.').waitFor();
  assert.equal(await panel.getByRole('button', { name: 'Excluded Fluff' }).getAttribute('aria-pressed'), 'true');
  assert.deepEqual((await getStore('exclusions')).exclusions, ['Fluff']);
  const href = sel => page.locator(sel).first().getAttribute('href');
  assert.equal(excluded(await href('#work_101 li.freeforms a.tag')), 'Fluff');
  const next = new URL(await href('ol.pagination li.next a'), AO3);
  assert.equal(next.searchParams.get(EXCL), 'Fluff');
  assert.equal(next.searchParams.get('page'), '2');
  assert.equal(await href('#work-filters p.footnote a'), SHIP_PATH + '/works');
  assert.equal(await href('#work_101 h4.heading a'), '/works/101');
  await page.locator('.sift-bar').getByText('Your saved exclusions are not applied to this listing.').waitFor();
  await shot(page, 'store/2-exclude-from-panel.png', '#work_102');
  await panel.getByRole('button', { name: 'Reload filtered' }).click();
  await page.waitForURL(u => excluded(u) === 'Fluff');
  await page.locator('.sift-bar').getByText('Your 1 saved exclusion is applied to this listing.').waitFor();
  assert.equal(await page.locator('#work_102').count(), 0);
  await page.goto(AO3 + '/works/101');
  await page.waitForFunction(() => document.querySelector('dd.relationship a.tag').href.includes('excluded_tag_names'));
  assert.equal(excluded(await href('dd.relationship a.tag')), 'Fluff');
});

await step('"Apply my filters" merges saved exclusions into the URL and drops the page number', async () => {
  await reset({ exclusions: ['Fluff', 'Rainy Days'] });
  await page.goto(LISTING + q({ [EXCL]: 'Angst', page: '3' }));
  const bar = page.locator('.sift-bar');
  await bar.getByText('Your saved exclusions are not applied to this listing.').waitFor();
  await bar.getByRole('button', { name: 'Apply my filters' }).click();
  await page.waitForURL(u => excluded(u) !== 'Angst');
  assert.equal(excluded(page.url()), 'Angst,Fluff,Rainy Days');
  assert.equal(new URL(page.url()).searchParams.has('page'), false);
  await bar.getByText('Your 2 saved exclusions are applied to this listing.').waitFor();
  assert.equal(await bar.getByRole('button', { name: 'Apply my filters' }).isVisible(), false);
});

await step('auto-apply redirects once; never twice when AO3 drops the filter, never after AO3\'s form', async () => {
  await reset({ exclusions: ['Fluff'], autoApply: true });
  hits.length = 0;
  await page.goto(LISTING);
  await page.waitForURL(u => excluded(u) === 'Fluff');
  await page.locator('.sift-bar').getByText('Your 1 saved exclusion is applied').waitFor();
  assert.equal(hits.length, 2);

  dropQuery = true;
  hits.length = 0;
  await page.goto(LISTING);
  await page.waitForTimeout(2500);
  assert.equal(hits.map(h => (new URL(h).search ? 'filtered' : 'bare')).join(' > '), 'bare > filtered');
  await page.locator('.sift-bar').getByText('Your saved exclusions are not applied').waitFor();
  assert.equal(page.url(), LISTING);
  dropQuery = false;

  hits.length = 0;
  await page.goto(AO3 + '/works' + q({ commit: 'Sort and Filter', tag_id: SHIP }));
  await page.locator('.sift-bar').getByText('Your saved exclusions are not applied').waitFor();
  await page.waitForTimeout(1000);
  assert.equal(hits.length, 1);
});

await step('listing with a muted author and the saved exclusion applied (store screenshot)', async () => {
  await reset({ mutedAuthors: ['quill_moth'], exclusions: ['Fluff'] });
  await page.goto(LISTING + q({ [EXCL]: 'Fluff' }));
  await waitCount(page, 3, 9);
  await page.locator('.sift-bar').getByText('Your 1 saved exclusion is applied').waitFor();
  await shot(page, 'store/3-hidden-listing.png', '#main h2.heading');
});

await step('popup shows this page\'s counts; its switch turns Sift off and on', async () => {
  await reset({ mutedAuthors: ['quill_moth'] });
  await page.goto(LISTING);
  await waitCount(page, 3);
  await page.bringToFront();
  await ext.goto(POPUP); // loads in the background tab, so the listing is the active tab
  await ext.locator('#page', { hasText: '3 of 10' }).waitFor();
  assert.equal(await ext.locator('#total').textContent(), '3');
  await ext.locator('#enabled').uncheck();
  await page.waitForFunction(() => document.documentElement.classList.contains('sift-off'));
  assert.deepEqual(await collapsed(page), []);
  await ext.locator('#enabled').check();
  await page.waitForFunction(() => document.querySelectorAll('li.sift-collapsed').length === 3);
});

await step('options page shows saved exclusions, muted authors and ships (store screenshot)', async () => {
  await reset({
    exclusions: ['Fluff', 'Rainy Days', 'Songfic', 'Alternate Universe - Coffee Shops & Cafés'],
    mutedAuthors: ['quill_moth', 'lamplit_owl'],
    ships: [{ name: SHIP, firstTwo: true }],
    autoApply: true,
  });
  await ext.goto(OPTIONS);
  await ext.bringToFront();
  await ext.locator('#exclusions li', { hasText: 'Songfic' }).waitFor();
  assert.equal(await ext.locator('#ships select').inputValue(), 'two');
  assert.ok(await ext.locator('#autoApply').isChecked());
  await ext.screenshot({ path: path.join(root, 'store', '4-options.png') });
});
await desk.context.close();

// ---- Phone, 390x844 with touch ----
const phone = await launch({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await step('390x844 touch: ship toggle, inline panel and mute by tap; nothing from Sift overflows', async () => {
  const p = phone.page;
  await waitCount(p, 0);
  await p.getByLabel('Only works where this ship is listed first').tap();
  await waitCount(p, 3);
  await p.locator('#work_101 .sift-open').tap();
  const panel = p.locator('#work_101 .sift-panel');
  await panel.waitFor();
  const overflow = () => p.evaluate(() => [...document.querySelectorAll('.sift-ui')]
    .filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className));
  assert.deepEqual(await overflow(), []);
  await shot(p, 'tests/screenshots/phone-390x844.png', '.sift-bar');
  await panel.getByRole('button', { name: 'Mute quill_moth' }).tap();
  await waitCount(p, 6);
  assert.deepEqual(await collapsed(p), [101, 103, 104, 105, 108, 109]);
  await p.locator('#work_104 .sift-hidebar button').tap();
  assert.deepEqual(await collapsed(p), [101, 103, 105, 108, 109]);
  assert.deepEqual(await overflow(), []);
});
await phone.context.close();

await step('no exceptions or console errors from the extension', async () => {
  assert.deepEqual(errors, []);
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
