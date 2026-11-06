# Changelog

## 1.0.0

Initial release.

- `extractContent(str, options?)` splits text into its plain text and links: plain URLs, `www.`, markdown, `<url>` and, optionally, bare domains and other schemes.
- Options to dedupe, lowercase, replace links, filter by host, and return positions.
- TypeScript types, and a CLI with JSON output for scripts and agents.
