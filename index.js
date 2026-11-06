const BRACKET_PAIRS = {
  ")": "(", "]": "[", "}": "{",
  "）": "（", "】": "【", "」": "「", "』": "『", "》": "《",
};
const OPENING_BRACKETS = new Set(Object.values(BRACKET_PAIRS));
const TRAILING_PUNCTUATION = new Set(".,!?;:*|…");

// \x60 is the backtick.
const URL_STOP = String.raw`\s<>"'\x60。，、！？；：`;
const URL_STOP_CHAR = new RegExp(`[${URL_STOP}]`);
const URL_CHAR = `[^${URL_STOP}]`;
const SCAN_CHAR = String.raw`[^${URL_STOP})\]}）】」』》]`;

const LABEL_CHAR = String.raw`[\p{L}\p{N}\p{M}]`;
const NOT_AFTER = String.raw`(?<![\p{L}\p{N}\p{M}_@./:+-])`;
const HOST_END = String.raw`(?![\p{L}\p{N}\p{M}_@-]|\.[\p{L}\p{N}])`;
const PORT = String.raw`(?::\d{1,5}(?!\d))`;

const SLASHLESS_SCHEMES = new Set([
  "mailto", "tel", "sms", "magnet", "xmpp", "sip", "sips", "geo", "urn",
]);
// The URL standard treats "\" as "/" in these schemes only.
const BACKSLASH_SCHEMES = new Set(["http", "https", "ftp", "ws", "wss", "file"]);
// "iu" like the classifiers, which case-fold "ſ" to "s" and "K" to "k".
const SCHEME_PREFIX = /^([a-z][a-z\d+.-]*):(\/\/)?/iu;
const SCHEME_NAME = /^[a-z][a-z\d+.-]*$/i;
const HOST_ENTRY = /^\s*[^\s/\\?#@]+\s*$/;

export const DEFAULT_PROTOCOLS = Object.freeze(["http", "https"]);

// Leaves out TLDs that double as file extensions (.py, .md, .sh, .rs, .zip,
// .mov, .pl, .cc) so that main.py or README.md are not read as websites.
export const DEFAULT_TLDS = Object.freeze([
  "com", "org", "net", "edu", "gov", "mil", "int", "info", "biz", "name",
  "pro", "io", "co", "dev", "app", "ai", "xyz", "online", "site", "tech",
  "store", "shop", "blog", "news", "cloud", "page", "link", "live", "studio",
  "design", "agency", "tools", "world", "today", "email", "space", "website",
  "digital", "media", "network", "systems", "services", "solutions",
  "academy", "school", "global", "life", "one", "top", "club", "fun", "vip",
  "wiki", "tv", "me",
  "uk", "us", "ca", "au", "nz", "in", "de", "fr", "es", "it", "nl", "be",
  "ch", "at", "se", "no", "dk", "fi", "ie", "pt", "gr", "ru", "ua", "tr",
  "jp", "kr", "cn", "hk", "tw", "sg", "my", "id", "th", "vn", "ph", "br",
  "ar", "mx", "cl", "za", "ng", "ke", "eg", "il", "ae", "sa", "eu",
]);

function plainPatterns(protocols, tlds, bodyChar) {
  const parts = {};
  const path = String.raw`(?:[/?#]${bodyChar}*)`;

  if (protocols.length > 0) {
    const schemes = protocols
      .map((p) => {
        const name = p.replace(/[.+]/g, "\\$&");
        return SLASHLESS_SCHEMES.has(p) ? `${name}:(?:\\/\\/)?` : `${name}:\\/\\/`;
      })
      .join("|");
    parts.url = String.raw`\b(?:${schemes})${bodyChar}+`;
  }

  parts.www = String.raw`(?<![@.]|[a-z\d+.-]:\/\/)\bwww\.${bodyChar}+`;

  if (tlds && tlds.length > 0) {
    const alternation = [...tlds].sort((a, b) => b.length - a.length).join("|");
    // DNS allows 127 labels. An unbounded repeat overflows the regex stack on huge inputs.
    parts.bare = String.raw`${NOT_AFTER}(?:[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]*${LABEL_CHAR})?\.){1,126}(?:${alternation})${HOST_END}${PORT}?${path}?`;
  }

  return parts;
}

function buildConfig(protocols, tlds) {
  // Scanning stops each plain link at its first closing bracket, and
  // plainLinkEnd continues from there. Letting the regex run to the next
  // whitespace would make "https://a.com)" repeated quadratic.
  const scan = plainPatterns(protocols, tlds, SCAN_CHAR);
  const exact = plainPatterns(protocols, tlds, URL_CHAR);

  const markdown = String.raw`(?<md>!?\[(?<label>[^\[\]\n]{0,500})\]\(\s*<?(?<mdurl>(?:[^\s()<>]|\([^\s()<>]*\))+)>?(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\))`;
  const angle = String.raw`(?<angle><(?<angleurl>[^\s<>]{1,2048})>)`;

  return {
    source: `${markdown}|${angle}|${Object.values(scan).join("|")}`,
    flags: "giud",
    classifiers: Object.entries(exact).map(([type, pattern]) => [
      type,
      new RegExp(`^(?:${pattern})$`, "iu"),
    ]),
  };
}

const configCache = new Map();

function getConfig(protocols, tlds) {
  const key = `${protocols.join(",")}|${tlds ? tlds.join(",") : ""}`;
  let config = configCache.get(key);
  if (!config) {
    if (configCache.size >= 100) configCache.clear();
    config = buildConfig(protocols, tlds);
    configCache.set(key, config);
  }
  return config;
}

function classify(candidate, config) {
  for (const [type, regex] of config.classifiers) {
    if (regex.test(candidate)) return type;
  }
  return null;
}

function plainLinkEnd(str, start, scanEnd) {
  if (!(str[scanEnd] in BRACKET_PAIRS)) return scanEnd;

  const depth = {};
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (URL_STOP_CHAR.test(ch)) return i;
    if (OPENING_BRACKETS.has(ch)) {
      depth[ch] = (depth[ch] ?? 0) + 1;
    } else if (ch in BRACKET_PAIRS) {
      const opening = BRACKET_PAIRS[ch];
      if (!depth[opening]) return i;
      depth[opening]--;
    }
  }
  return str.length;
}

function trimTrailingPunctuation(url) {
  let end = url.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(url[end - 1])) end--;
  return url.slice(0, end);
}

const splitAt = (str, pattern) => {
  const index = str.search(pattern);
  return index === -1 ? [str, ""] : [str.slice(0, index), str.slice(index)];
};

function splitLink(url, type) {
  if (type !== "url") {
    const [authority, rest] = splitAt(url, /[/\\?#]/);
    return { prefix: "", authority, rest, hierarchical: true };
  }

  const [schemePrefix, scheme, slashes] = SCHEME_PREFIX.exec(url);
  const name = scheme.toLowerCase();
  const hierarchical = Boolean(slashes);
  const usesBackslash = hierarchical && BACKSLASH_SCHEMES.has(name);

  // The URL parser skips extra slashes here: https:///a.com opens a.com.
  const extraSlashes =
    usesBackslash && name !== "file" ? /^[/\\]*/.exec(url.slice(schemePrefix.length))[0] : "";
  const prefix = schemePrefix + extraSlashes;

  const end = !hierarchical ? /[?#]/ : usesBackslash ? /[/\\?#]/ : /[/?#]/;
  const [authority, rest] = splitAt(url.slice(prefix.length), end);
  return { prefix, authority, rest, hierarchical };
}

function isValidUrl(url, type, hierarchical) {
  try {
    if (type !== "url") return Boolean(new URL(`http://${url}`).hostname);

    const parsed = new URL(url);
    if (hierarchical) return Boolean(parsed.hostname) || parsed.protocol === "file:";
    return parsed.pathname.length > 0;
  } catch {
    return false;
  }
}

// Userinfo, path, query and fragment can be case-sensitive.
function lowercaseUrl({ prefix, authority, rest, hierarchical }) {
  const at = authority.lastIndexOf("@");
  if (!hierarchical && at === -1) return prefix.toLowerCase() + authority + rest;
  return (
    prefix.toLowerCase() +
    authority.slice(0, at + 1) +
    authority.slice(at + 1).toLowerCase() +
    rest
  );
}

function getHost({ authority, hierarchical }) {
  const at = authority.lastIndexOf("@");
  if (!hierarchical && at === -1) return "";

  const host = authority.slice(at + 1);
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1).toLowerCase();
  const colon = host.lastIndexOf(":");
  return (colon === -1 ? host : host.slice(0, colon)).toLowerCase();
}

function canonicalHost(host) {
  let canonical;
  try {
    canonical = new URL(`http://${host}`).hostname;
  } catch {
    canonical = host.toLowerCase();
  }
  return canonical.endsWith(".") ? canonical.slice(0, -1) : canonical;
}

function hostMatches(host, list) {
  if (!host) return false;
  const canonical = canonicalHost(host);
  return list.some((domain) => canonical === domain || canonical.endsWith(`.${domain}`));
}

function trimEndSlashes(str) {
  let end = str.length;
  while (end > 0 && str[end - 1] === "/") end--;
  return str.slice(0, end);
}

const comparable = (s) =>
  trimEndSlashes(
    s
      .trim()
      .toLowerCase()
      .replace(/^(?:[a-z][a-z\d+.-]*:\/\/|mailto:)/, "")
      .replace(/^www\./, "")
  );

function labelIsLink(label, url, config) {
  return comparable(label) === comparable(url) || classify(label.trim(), config) !== null;
}

const isHorizontalSpace = (ch) => ch === " " || ch === "\t";
const isLineBreak = (ch) => ch === "\n" || ch === "\r";

function applyRanges(str, ranges) {
  let out = "";
  let cursor = 0;
  let i = 0;

  while (i < ranges.length) {
    const range = ranges[i++];

    if (range.replacement) {
      out += str.slice(cursor, range.start) + range.replacement;
      cursor = range.end;
      continue;
    }

    let { start, end } = range;
    let hadSpace = false;

    while (start > cursor && isHorizontalSpace(str[start - 1])) {
      start--;
      hadSpace = true;
    }

    // Merge removals separated only by spaces: "a URL1 URL2 b" becomes "a b".
    for (;;) {
      while (end < str.length && isHorizontalSpace(str[end])) {
        end++;
        hadSpace = true;
      }
      if (i < ranges.length && !ranges[i].replacement && ranges[i].start <= end) {
        end = Math.max(end, ranges[i].end);
        i++;
      } else {
        break;
      }
    }

    out += str.slice(cursor, start);

    const prev = str[start - 1];
    const next = str[end];
    const atEdge =
      prev === undefined || isLineBreak(prev) || next === undefined || isLineBreak(next);
    const hugsPunctuation =
      (next !== undefined && /[.,!?;:)\]}。，、！？；：）】」』》…]/.test(next)) ||
      (prev !== undefined && /[([{（【「『《]/.test(prev));

    out += hadSpace && !atEdge && !hugsPunctuation ? " " : "";
    cursor = end;
  }

  return out + str.slice(cursor);
}

function stringList(value, name, pattern) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array of strings`);
  for (const item of value) {
    if (typeof item !== "string" || (pattern && !pattern.test(item))) {
      throw new TypeError(`Invalid entry in ${name}: ${String(item)}`);
    }
  }
  return value;
}

const hostList = (value, name) =>
  stringList(value, name, HOST_ENTRY).map((h) => canonicalHost(h.trim().replace(/^\*?\./, "")));

export function extractContent(str, options = {}) {
  if (typeof str !== "string") {
    throw new TypeError(`Expected a string, got ${typeof str}`);
  }

  if (options !== null && (typeof options !== "object" || Array.isArray(options))) {
    throw new TypeError("options must be an object");
  }

  const {
    lowercase = false,
    unique = false,
    bareDomains = false,
    tlds = DEFAULT_TLDS,
    protocols = DEFAULT_PROTOCOLS,
    allowHosts,
    denyHosts,
    filter,
    replaceWith,
    detailed = false,
  } = options ?? {};

  const schemes = stringList(protocols, "protocols", SCHEME_NAME).map((p) => p.toLowerCase());
  if (bareDomains) stringList(tlds, "tlds", /^[a-z\d-]+$/i);
  if (replaceWith !== undefined && typeof replaceWith !== "string" && typeof replaceWith !== "function") {
    throw new TypeError("replaceWith must be a string or a function");
  }
  if (filter !== undefined && typeof filter !== "function") {
    throw new TypeError("filter must be a function");
  }
  const allow = allowHosts === undefined ? null : hostList(allowHosts, "allowHosts");
  const deny = denyHosts === undefined ? null : hostList(denyHosts, "denyHosts");

  const config = getConfig(schemes, bareDomains ? tlds : null);
  // A fresh RegExp per call keeps lastIndex safe if a callback recurses.
  const regex = new RegExp(config.source, config.flags);

  const matches = [];
  const ranges = [];
  let m;

  while ((m = regex.exec(str)) !== null) {
    const { md, angle } = m.groups;
    let raw, start, syntax;
    let label;

    if (md !== undefined) {
      syntax = "markdown";
      raw = m.groups.mdurl;
      start = m.indices.groups.mdurl[0];
      label = m.groups.label;
    } else if (angle !== undefined) {
      syntax = "angle";
      raw = m.groups.angleurl;
      start = m.indices.groups.angleurl[0];
    } else {
      syntax = "plain";
      start = m.index;
      raw = trimTrailingPunctuation(str.slice(start, plainLinkEnd(str, start, start + m[0].length)));
      regex.lastIndex = start + raw.length;
    }

    const type = classify(raw, config);
    const parts = type && splitLink(raw, type);
    let match = null;

    if (type && isValidUrl(raw, type, parts.hierarchical)) {
      const url = lowercase ? lowercaseUrl(parts) : raw;
      match = {
        url,
        href: type === "url" ? url : `https://${url}`,
        type,
        syntax,
        host: getHost(parts),
        start,
        end: start + raw.length,
      };
      if (syntax === "markdown") match.label = label;

      if (
        (allow && !hostMatches(match.host, allow)) ||
        (deny && hostMatches(match.host, deny)) ||
        (filter && !filter(match))
      ) {
        match = null;
      }
    }

    if (!match) {
      // A rejected [..](..) or <..> may still contain a link: rescan it.
      if (syntax !== "plain") regex.lastIndex = m.index + 1;
      continue;
    }

    let replacement = "";
    if (typeof replaceWith === "string") replacement = replaceWith;
    else if (typeof replaceWith === "function") {
      replacement = String(replaceWith(match, matches.length) ?? "");
    }

    if (syntax === "markdown" && label.trim() && !labelIsLink(label, raw, config)) {
      replacement = replacement ? `${label} ${replacement}` : label;
    }

    matches.push(match);
    ranges.push({
      start: m.index,
      end: syntax === "plain" ? m.index + raw.length : m.index + m[0].length,
      replacement,
    });
  }

  let kept = matches;
  if (unique) {
    const seen = new Set();
    kept = matches.filter((x) => !seen.has(x.url) && seen.add(x.url));
  }

  return { text: applyRanges(str, ranges), links: detailed ? kept : kept.map((x) => x.url) };
}

export default extractContent;
