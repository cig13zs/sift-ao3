// Syntax-check extension scripts and enforce manifest security rules shared with build.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src');

function walkJs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJs(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

let failed = false;
for (const file of walkJs(src)) {
  try {
    execSync(`node --check ${JSON.stringify(file)}`, { stdio: 'pipe' });
  } catch (e) {
    console.error(`syntax: ${path.relative(root, file)}`);
    failed = true;
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
const rules = [
  () => manifest.permissions?.length === 1 && manifest.permissions[0] === 'storage',
  () => manifest.host_permissions?.join() === 'https://archiveofourown.org/*',
  () => manifest.content_security_policy?.extension_pages?.includes("script-src 'self'"),
  () => !manifest.content_security_policy?.extension_pages?.includes('unsafe-eval'),
  () => manifest.background?.service_worker === 'background.js',
];
for (const ok of rules) {
  if (!ok()) {
    console.error('manifest security check failed');
    failed = true;
    break;
  }
}

if (failed) process.exit(1);
console.log('lint ok');