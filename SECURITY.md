# Security policy

Found a security problem in Sift for AO3? Please don't open a public issue. Report it privately here:
https://github.com/cig13zs/sift-ao3/security/advisories/new

Say what you found and how to reproduce it. I'll reply within a week, and I'm happy to credit you
in the fix unless you'd rather stay anonymous.

Only the latest release gets security fixes.

## Design notes

- Extension pages use a strict Content Security Policy (`script-src 'self'`).
- Permissions are limited to `storage` and `https://archiveofourown.org/*`.
- The content script responds to popup state queries only when the sender is this extension.
- Settings stay in `chrome.storage.local`; they are not uploaded by Sift.
