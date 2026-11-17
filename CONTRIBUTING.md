# Contributing to Sift for AO3

Thanks for helping make AO3 easier to browse. Sift is a small, privacy-first extension: keep it
offline, avoid new permissions unless they are clearly necessary, and explain them in the PR.

## Before you open a PR

1. Run `npm ci`
2. Run `npm run lint` (syntax check plus manifest security rules)
3. Run `npm test` (unit tests for `src/lib/sift.js`)
4. Run `npm run build` (Chrome and Firefox packages under `dist/`)
5. If you changed user-visible behaviour, run `npm run e2e` (loads the unpacked build in
   Chromium against synthetic AO3 pages)

## Code layout

| Path | Role |
|------|------|
| `src/lib/sift.js` | Pure filter logic (shared by content script, options, and tests) |
| `src/content.js` | In-page UI on AO3 |
| `src/popup.*` / `src/options.*` | Extension pages |
| `src/background.js` | Keyboard shortcut to toggle Sift |
| `tests/sift.test.js` | Unit tests |
| `tests/e2e.mjs` | End-to-end smoke test with Playwright |

## Guidelines

- Match existing style: plain DOM APIs, no bundler, minimal dependencies.
- Do not add analytics, remote code, or network hosts beyond `https://archiveofourown.org/*`.
- Bump `src/manifest.json` and `package.json` versions together; note changes in `CHANGELOG.md`.
- Add or extend unit tests for logic changes; extend e2e when UI flows change.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities privately.

## License

By contributing, you agree that your contributions are licensed under the MIT License.