// Renders the toolbar icons and the 440x280 promo tile from inline SVG/HTML with Playwright.
// Re-run only when the mark changes: node store/make-art.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLUM = '#6d2c5b';

// A funnel with grains above it: the "sift" mark.
const mark = (size, rounded = true) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  ${rounded ? `<rect width="128" height="128" rx="28" fill="${PLUM}"/>` : ''}
  <circle cx="42" cy="24" r="8" fill="#fff"/><circle cx="64" cy="18" r="8" fill="#fff" opacity=".75"/><circle cx="86" cy="24" r="8" fill="#fff"/>
  <path d="M18 42h92L75 80v26l-22 12V80z" fill="#fff"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${mark(size)}</body>`);
  await page.screenshot({ path: path.join(root, 'src', 'icons', `icon${size}.png`), omitBackground: true });
}

await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(`<body style="margin:0;width:440px;height:280px;background:${PLUM};color:#fff;
  font-family:'Lucida Grande','Lucida Sans Unicode',Verdana,sans-serif;display:flex;align-items:center;gap:26px;padding:0 34px;box-sizing:border-box">
  <div style="flex:none;width:112px;height:112px;border-radius:26px;background:rgba(255,255,255,.12);display:grid;place-items:center">${mark(96, false)}</div>
  <div>
    <div style="font-size:34px;line-height:1.1">Sift for AO3</div>
    <div style="font-size:16px;line-height:1.5;margin-top:12px">Your ship listed first.<br>Excluded tags that stick.<br>Muted authors.</div>
  </div>
</body>`);
await page.screenshot({ path: path.join(root, 'store', 'promo-440x280.png') });
await browser.close();
console.log('wrote src/icons/icon{16,32,48,128}.png and store/promo-440x280.png');
