const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const root = path.join(__dirname, '..');

test('extension icons are square PNGs at the manifest sizes', () => {
  for (const size of [16, 32, 48, 128]) {
    const dim = pngSize(path.join(root, 'src', 'icons', `icon${size}.png`));
    assert.deepEqual(dim, { w: size, h: size });
  }
});

test('Chrome Web Store small tile is 440×280', () => {
  assert.deepEqual(pngSize(path.join(root, 'store', 'promo-440x280.png')), { w: 440, h: 280 });
});

test('store screenshots are 1280×800', () => {
  for (const name of ['1-primary-ship.png', '2-exclude-from-panel.png', '3-hidden-listing.png', '4-options.png', '5-popup.png', '6-options-dark.png', '7-on-the-page.png']) {
    assert.deepEqual(pngSize(path.join(root, 'store', name)), { w: 1280, h: 800 }, name);
    assert.deepEqual(pngSize(path.join(root, 'tests', 'visual', name)), { w: 1280, h: 800 }, name);
  }
});
