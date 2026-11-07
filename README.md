# extract-text-links

> Split text into plain text and the links it contains.

```js
import extractContent from "extract-text-links";

const { text, links } = extractContent(
  "Docs at https://example.com/docs, source at www.github.com/foo/bar."
);

text;  // "Docs at, source at."
links; // ["https://example.com/docs", "www.github.com/foo/bar"]
```

It handles plain links, `[markdown](https://example.com)` links and `<https://example.com>`, ignores trailing punctuation, and leaves the rest of your text untouched. Zero dependencies, ESM, TypeScript types included.

## Install

```sh
npm install extract-text-links
```

Requires Node.js 18.3 or newer.

## Command line

```sh
npx extract-text-links notes.txt --links    # list the links in a file
pbpaste | npx extract-text-links            # print text without links
```

## Documentation

- [Options](#options)
- [Examples](#examples)
- [The `Link` object](#the-link-object)
- [Command line flags](#command-line-flags)
- [TypeScript and CommonJS](#typescript-and-commonjs)
- [How bare domain detection works](#how-bare-domain-detection-works)
- [Things to know](#things-to-know)
- [Development](#development)

### `extractContent(str, options?)`

Returns `{ text, links }`. Throws a `TypeError` if `str` is not a string or an option is invalid. Errors thrown by your `filter` or `replaceWith` propagate to the caller. A named export is also available: `import { extractContent } from "extract-text-links"`.

It is not a URL validator (use `new URL()` for one string), a crawler, or an email detector.

### Options

| Option                | Type                 | Default            | Description |
| --------------------- | -------------------- | ------------------ | ----------- |
| `detailed`            | `boolean`            | `false`            | Return `Link` objects in `links` instead of strings. |
| `unique`              | `boolean`            | `false`            | Remove duplicate links, keeping first occurrences. |
| `lowercase`           | `boolean`            | `false`            | Lowercase the **scheme and host** of each link. Userinfo, path, query and fragment can be case-sensitive and are left as written. |
| `replaceWith`         | `string \| function` | none               | Put this where each link was. A function gets `(link, index)`. |
| `bareDomains`         | `boolean`            | `false`            | Also detect domains with no protocol or `www.`. |
| `tlds`                | `string[]`           | `DEFAULT_TLDS`     | TLDs recognised when `bareDomains` is on. Replaces the default list. |
| `protocols`           | `string[]`           | `["http","https"]` | Schemes to detect. `mailto`, `tel`, `sms`, `magnet`, `xmpp`, `sip`, `sips`, `geo` and `urn` work without `//`. |
| `allowHosts`          | `string[]`           | none               | Only keep links on these hosts and their subdomains. |
| `denyHosts`           | `string[]`           | none               | Drop links on these hosts and their subdomains. |
| `filter`              | `(link) => boolean`  | none               | Return `false` to keep a link in the text and out of `links`. |

A rejected link (by a host list or `filter`) stays in `text` exactly as written. A rejected markdown or angle-bracket link is scanned again as plain text, so `filter` can run more than once for the same link, with a different `syntax`.

`DEFAULT_TLDS` and `DEFAULT_PROTOCOLS` are exported too. Extend them with `{ bareDomains: true, tlds: [...DEFAULT_TLDS, "dog"] }`.

### Examples

**Markdown and angle brackets**

```js
extractContent("Read [the docs](https://example.com/docs) or <https://example.org>.");
// { text: "Read the docs or.", links: ["https://example.com/docs", "https://example.org"] }
```

Labels are kept. A label that repeats the link, like `[example.com](https://example.com)`, or that is a link itself, is dropped with it. With `detailed`, it is still available as `label`.

**Bare domains and other schemes**

```js
extractContent("Visit example.com or example.org:8080.", { bareDomains: true });
// { text: "Visit or.", links: ["example.com", "example.org:8080"] }

extractContent("Mail me@example.com: mailto:me@example.com", { protocols: ["https", "mailto"] });
// links: ["mailto:me@example.com"]
```

**Detailed matches**

```js
const { links } = extractContent("Go to www.example.com/a now", { detailed: true });
// [{
//   url: "www.example.com/a", href: "https://www.example.com/a",
//   type: "www", syntax: "plain", host: "www.example.com", start: 6, end: 23
// }]
```

`start` and `end` index into your original string, so you can highlight or linkify it. `href` is a form you can open in a browser.

**Replace instead of delete**

```js
extractContent("See https://a.com and https://b.com", {
  replaceWith: (link, i) => `[${i + 1}]`,
});
// { text: "See [1] and [2]", links: ["https://a.com", "https://b.com"] }
```

**Filter by host**

```js
extractContent("https://docs.example.com https://tracker.evil.com", {
  denyHosts: ["evil.com"],
});
// links: ["https://docs.example.com"]; the denied link stays in the text
```

`allowHosts` and `denyHosts` match the host and all its subdomains. Entries must be hostnames: `https://evil.com` or `evil.com/path` throws a `TypeError`. Use `filter(link)` for anything else.

### The `Link` object

| Field    | Description |
| -------- | ----------- |
| `url`    | The link as written (lowercased if `lowercase` is on). |
| `href`   | `url` with a protocol added where it had none. |
| `type`   | `"url"`, `"www"` or `"bare"`. |
| `syntax` | `"plain"`, `"markdown"` or `"angle"`. |
| `host`   | Lowercase host without port or userinfo. Empty for links like `tel:`. |
| `start`, `end` | Position of `url` in the input. |
| `label`  | The `[label]` text, for markdown links only. |

### Command line flags

With no file, the CLI reads standard input. Run `extract-text-links --help` for every flag.

```sh
npx extract-text-links chat.md -r "[link]" --deny-hosts tracker.example.com
```

| Flag | Meaning |
| ---- | ------- |
| `-l`, `--links` / `--hrefs` | Print links (or openable links), one per line |
| `-j`, `--json` / `-d`, `--detailed` | Print JSON (`-d` adds type, host, positions, label) |
| `-b`, `--bare-domains`, `--extra-tlds a,b` | Detect bare domains, optionally more TLDs |
| `--protocols a,b` | Choose schemes |
| `--allow-hosts a,b`, `--deny-hosts a,b` | Filter by host |
| `-r`, `--replace-with <text>` | Replace links instead of removing them |
| `-u`, `--unique`, `--lowercase` | Dedupe, lowercase scheme and host |

Exit codes: `0` on success, `2` for bad flags or unreadable files, `1` for anything unexpected. With several files, they are joined with newlines, so `-d` positions refer to the joined text.

### TypeScript and CommonJS

Types ship with the package. `links` is `string[]` unless `detailed: true` is set, when it is `Link[]`:

```ts
import extractContent, { type ExtractOptions, type Link } from "extract-text-links";

const plain: string[] = extractContent("https://example.com").links;
const detailed: Link[] = extractContent("https://example.com", { detailed: true }).links;

// When `detailed` is not known at compile time, `links` is (string | Link)[].
const options: ExtractOptions = { unique: true };
const either = extractContent("https://example.com", options).links;
```

Tested with strict `tsc` under `moduleResolution` `nodenext`, `node16` and `bundler`.

The package is ESM only. From CommonJS, use dynamic import, which works on every supported Node.js version:

```js
import("extract-text-links").then(({ default: extractContent }) => {
  console.log(extractContent("See https://example.com").links);
});
```

Node.js 20.19+, 22.12+ and 24 can also `require()` it: `const { extractContent } = require("extract-text-links")`. Older versions throw `ERR_REQUIRE_ESM`.

### How bare domain detection works

Bare domains are only matched when they end in a known TLD, which keeps false positives down:

| Input                                  | Result |
| -------------------------------------- | ------ |
| `example.com`, `a.b.example.co.uk`     | matched |
| `example.com:8080/x?y=1`               | matched, with port, path and query |
| `bücher.de`, `münchen.de/path`         | matched whole (internationalised names work) |
| `user@example.com`                     | not matched (emails are skipped) |
| `index.html`, `v1.2`, `e.g.`           | not matched (not a TLD) |
| `README.md`, `main.py`, `script.sh`    | not matched (these TLDs are excluded on purpose) |

TLDs that double as common file extensions (`py`, `md`, `sh`, `rs`, `zip`, `mov`, `pl`, `cc`) are left out of the default list. The list is a curated set of common TLDs, not every TLD that exists, so pass your own `tlds` if you need others. Text with a missing space after a full stop, like `done.It`, can still be read as a domain when the TLD is in the list.

### Things to know

- `lowercase` only changes the scheme and host. Paths like `/Report/ID=aB` keep their case.
- Markdown links with a relative URL (`[a](/page)`) are left in the text. A full link inside such a label is still found.
- IP addresses and `localhost` are only found with a protocol: `http://10.0.0.1/`, `http://localhost:3000`, `http://[::1]/`.
- Hosts in `allowHosts` and `denyHosts` are compared the way the URL standard parses them: in ASCII (punycode), without a trailing dot, with encodings resolved. So `münchen.de` matches `xn--mnchen-3ya.de`, and `https://evil.com.` and `https://evil.com\@good.com` both count as `evil.com`.
- Host lists decide which links are reported. They are not a security boundary on their own: `url` and `href` are returned as written, so escape them before putting them in HTML.
- Full-width punctuation (`。，、！？；：`) ends a link, since it is sentence punctuation in almost all real text. A literal one inside a URL must be percent-encoded to be kept.

**Known limitations**

- `https://a.com,https://b.com` is one link, because a comma is legal in a URL. Separate links with whitespace.
- A linked image, `[![alt](img)](target)`, gives both links but leaves `[alt]()` in the text.
- Text directly after a link with no separator stays attached: `https://a.com😀`, or `https://example.com然后`.
- `_https://a.com_` is not detected, because `_` counts as part of a word. `|https://a.com|https://b.com|` is not either, because `|` is legal in a URL but not in a host.
- HTML is not decoded, so `&amp;` stays in a link as written.
- TLDs in `tlds` must be ASCII or punycode: use `xn--p1ai`, not `рф`.

### Development

```sh
npm install   # only TypeScript, used by the tests
npm test      # unit, CLI and packaging tests
```

`npm test` also packs the package, installs the tarball into a temporary project, and compiles the fixtures in `consumer/` against it with strict `tsc`. `index.d.ts` is written by hand and these fixtures keep it honest. No build step is needed.

## License

MIT
