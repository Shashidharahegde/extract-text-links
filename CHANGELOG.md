# Changelog

## Unreleased

### Security

- `allowHosts` and `denyHosts` now agree with the URL standard, closing three bypasses:
  - `https://evil.com\@good.com` was treated as `good.com`, but browsers open `evil.com`.
  - `https:///evil.com` had an empty host, so it passed `denyHosts`.
  - `https://evil.com./` did not match `denyHosts: ["evil.com"]`.
- Fixed quadratic running time, each over 20 seconds on inputs of 1 MB or less:
  - Markdown links whose URL has a long run of slashes.
  - Long runs of links separated by closing brackets, like `https://a.com)https://a.com)`.
- Fixed a `RangeError` (regex stack overflow) with `bareDomains` on dotted text of about 16 MB or more. Bare domains now match at most the 127 labels DNS allows.

### Removed

- The boolean shorthand: use `{ lowercase: true }` instead of `extractContent(str, true)`, which now throws a `TypeError`.
- `defaultProtocol` and `--default-protocol`. `href` always adds `https://` to `www.` and bare links.
- `normalizeWhitespace` and `-n`. Use `text.replace(/\s+/g, " ").trim()`.
- `ips` and `--ips`, with the `"ip"` and `"localhost"` link types. IPs and `localhost` are still found with a protocol, as in `http://10.0.0.1`.

### Changed

These can change results for existing callers:

- Host list entries that are not hostnames (`https://evil.com`, `evil.com/x`, `""`) now throw a `TypeError`. They used to match nothing, silently.
- Options that are not an object, `null` or `undefined` now throw a `TypeError`. Strings, numbers and functions used to be ignored.
- `www.` inside a scheme that is not enabled is no longer split off: `ftp://www.a.com` used to give `www.a.com` and leave `ftp://` in the text.
- Full-width punctuation (`。，、！？；：`) ends a link, and full-width brackets balance like ASCII ones. A trailing `…` or `|` is trimmed.
- `host` is now correct for backslashes and extra slashes (`https://a.com\b` gives `a.com`, `https:///a.com` gives `a.com`), and drops the port for slashless schemes (`sip:me@a.com:5060` gives `a.com`).
- `lowercase` no longer lowercases a backslash path or `www.` userinfo.
- Node.js 18.3 is now the declared minimum, because the CLI crashes on 18.0 to 18.2. The library is unchanged on those versions.

### Fixed

- A rejected or invalid plain link no longer hides a valid link right after it: `https://bad.com)https://good.com` with `denyHosts: ["bad.com"]` now finds `https://good.com`.
- The CLI exits quietly when its reader closes, as in `extract-text-links big.txt | head -1`, instead of printing a stack trace.

## 1.0.0

Initial version.
