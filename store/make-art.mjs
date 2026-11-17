// Renders toolbar icons and the 440×280 Chrome Web Store tile from inline SVG.
// Re-run when the mark changes: node store/make-art.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WINE = '#7a2e49';
const CREAM = '#fff8f1';
const GOLD = '#e7c98a';

const mark = (size, plate = true) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9a4562"/>
      <stop offset="1" stop-color="${WINE}"/>
    </linearGradient>
  </defs>
  ${plate ? '<rect width="128" height="128" rx="28" fill="url(#g)"/>' : ''}
  <circle cx="40" cy="28" r="6.5" fill="${GOLD}"/>
  <circle cx="64" cy="20" r="6.5" fill="${CREAM}"/>
  <circle cx="88" cy="28" r="6.5" fill="${GOLD}" opacity="0.85"/>
  <path d="M26 46h76L78 84v22c0 2-6 6-14 8-8-2-14-6-14-8V84z" fill="${plate ? CREAM : WINE}"/>
  <path d="M58 84h12v18c-2 1-6 2-6 2s-4-1-6-2z" fill="${plate ? '#f0d7c4' : '#5c2236'}"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${mark(size)}</body>`);
  await page.screenshot({ path: path.join(root, 'src', 'icons', `icon${size}.png`), omitBackground: true });
}

await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(`<!DOCTYPE html><body style="margin:0;width:440px;height:280px;overflow:hidden;
  background:linear-gradient(145deg,#5c2236 0%,${WINE} 48%,#3d1c28 100%);color:${CREAM};
  font-family:Georgia,'Iowan Old Style',serif;display:flex;align-items:center;gap:22px;padding:0 28px;box-sizing:border-box">
  <div style="flex:none;width:120px;height:120px;border-radius:28px;background:rgba(255,248,241,.1);
    box-shadow:inset 0 0 0 1px rgba(255,248,241,.2);display:grid;place-items:center">${mark(92, false).replace(WINE, CREAM)}</div>
  <div style="font-family:'Segoe UI',system-ui,sans-serif">
    <div style="font-family:Georgia,serif;font-size:30px;line-height:1.05;letter-spacing:-.02em">Sift for AO3</div>
    <div style="margin-top:10px;font-size:14px;line-height:1.45;color:${GOLD}">Your ship first.<br>Tags that stay excluded.<br>Authors, quietly muted.</div>
  </div>
</body>`);
await page.screenshot({ path: path.join(root, 'store', 'promo-440x280.png') });
await browser.close();
console.log('wrote icons and store/promo-440x280.png');
