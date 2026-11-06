export type LinkType =
  /** Starts with a protocol, e.g. `https://example.com` or `mailto:me@example.com`. */
  | "url"
  /** Starts with `www.`. */
  | "www"
  /** A domain with no protocol, e.g. `example.com/docs` (needs `bareDomains`). */
  | "bare";

/** Where the link was written in the input. */
export type LinkSyntax =
  /** Written directly in the text. */
  | "plain"
  /** Inside a markdown link or image: `[label](url)` or `![alt](url)`. */
  | "markdown"
  /** Wrapped in angle brackets: `<https://example.com>`. */
  | "angle";

export interface Link {
  /** The link as written (with `lowercase` applied, if set). */
  url: string;
  /** An openable form: `url`, or `url` with `https://` added for `www.` and bare links. */
  href: string;
  type: LinkType;
  syntax: LinkSyntax;
  /** Lowercase host without port or userinfo. Empty for links without a host, such as `tel:`. */
  host: string;
  /** Index in the input where `url` starts. */
  start: number;
  /** Index in the input just after `url`. */
  end: number;
  /** The `[label]` or `![alt]` text. Only set when `syntax` is `"markdown"`. */
  label?: string;
}

export interface ExtractOptions {
  /**
   * Lowercase the scheme and host of each extracted link. Userinfo, path, query
   * and fragment are left as written because they can be case-sensitive.
   * Default: false.
   */
  lowercase?: boolean;
  /** Remove duplicate links from `links`, keeping first occurrences. Default: false. */
  unique?: boolean;
  /**
   * Also detect domains without a protocol or `www.`, e.g. `example.com/path`.
   * Only domains ending in a known TLD are matched. Default: false.
   */
  bareDomains?: boolean;
  /**
   * ASCII or punycode TLDs recognised when `bareDomains` is on. Replaces the
   * default list; use `[...DEFAULT_TLDS, "dog"]` to extend it.
   */
  tlds?: readonly string[];
  /**
   * Schemes to detect, without `:` or `//`. Default: `["http", "https"]`.
   * `mailto`, `tel`, `sms`, `magnet`, `xmpp`, `sip`, `sips`, `geo` and `urn`
   * are treated as schemes that are not followed by `//`.
   */
  protocols?: readonly string[];
  /**
   * Only keep links whose host is, or is a subdomain of, one of these.
   * Entries are hostnames: a scheme, path or `@` throws a `TypeError`.
   */
  allowHosts?: readonly string[];
  /**
   * Drop links whose host is, or is a subdomain of, one of these.
   * Entries are hostnames: a scheme, path or `@` throws a `TypeError`.
   */
  denyHosts?: readonly string[];
  /**
   * Return `false` to leave a link in the text and out of `links`. A rejected
   * markdown or angle-bracket link is scanned again as plain text, so this can
   * run more than once for the same link. Errors thrown here propagate.
   */
  filter?: (link: Link) => boolean;
  /**
   * Put this where each removed link was. A function receives the link and
   * its index among all matches (before `unique` is applied). Errors thrown
   * here propagate.
   */
  replaceWith?: string | ((link: Link, index: number) => string);
  /** Return `Link` objects in `links` instead of plain strings. Default: false. */
  detailed?: boolean;
}

export interface ExtractResult<L = string> {
  /** The input with links removed (or replaced). */
  text: string;
  /** Links in the order they appeared. */
  links: L[];
}

/** TLDs used for bare-domain detection by default. */
export const DEFAULT_TLDS: readonly string[];

/** Schemes detected by default: `["http", "https"]`. */
export const DEFAULT_PROTOCOLS: readonly string[];

/**
 * Split a string into its plain text and the links found in it.
 *
 * @param str The text to scan.
 * @throws {TypeError} If `str` is not a string or an option is invalid.
 */
export function extractContent(
  str: string,
  options: ExtractOptions & { detailed: true }
): ExtractResult<Link>;
export function extractContent(
  str: string,
  options?: ExtractOptions & { detailed?: false }
): ExtractResult<string>;
export function extractContent(
  str: string,
  options?: ExtractOptions
): ExtractResult<string | Link>;

export default extractContent;
