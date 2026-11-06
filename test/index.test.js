import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import * as api from "../index.js";
import extractContent, { extractContent as named, DEFAULT_TLDS, DEFAULT_PROTOCOLS } from "../index.js";

const bare = { bareDomains: true };

test("default and named exports are the same function", () => {
  assert.equal(extractContent, named);
});

test("extracts a basic URL and removes it from the text", () => {
  assert.deepEqual(extractContent("Visit https://example.com today"), {
    text: "Visit today",
    links: ["https://example.com"],
  });
});

test("handles www. links", () => {
  assert.deepEqual(extractContent("Go to www.example.com now"), {
    text: "Go to now",
    links: ["www.example.com"],
  });
});

test("keeps punctuation that follows a URL", () => {
  const { text, links } = extractContent("See https://example.com/a, then stop.");
  assert.deepEqual(links, ["https://example.com/a"]);
  assert.equal(text, "See, then stop.");
});

test("strips an unbalanced closing parenthesis", () => {
  const { text, links } = extractContent("(see https://example.com/page)");
  assert.deepEqual(links, ["https://example.com/page"]);
  assert.equal(text, "(see)");
});

test("keeps a balanced parenthesis inside a URL", () => {
  const { links } = extractContent("https://en.wikipedia.org/wiki/Foo_(bar).");
  assert.deepEqual(links, ["https://en.wikipedia.org/wiki/Foo_(bar)"]);
});

test("extracts multiple links in order", () => {
  const { text, links } = extractContent("a https://a.com b http://b.org c");
  assert.deepEqual(links, ["https://a.com", "http://b.org"]);
  assert.equal(text, "a b c");
});

test("adjacent links leave a single space", () => {
  assert.equal(extractContent("a https://x.com https://y.com b").text, "a b");
});

test("leaves invalid URLs in the text", () => {
  const result = extractContent("broken https://. link");
  assert.deepEqual(result.links, []);
  assert.equal(result.text, "broken https://. link");
});

test("returns empty results for text without links", () => {
  assert.deepEqual(extractContent("just words"), { text: "just words", links: [] });
});

test("throws TypeError for non-strings", () => {
  assert.throws(() => extractContent(42), TypeError);
  assert.throws(() => extractContent(undefined), TypeError);
});

test("preserves newlines and unrelated spacing by default", () => {
  assert.equal(
    extractContent("line one\nhttps://a.com\nline two").text,
    "line one\n\nline two"
  );
  assert.equal(extractContent("a  b https://x.com c").text, "a  b c");
  assert.equal(extractContent("Hello , world https://x.com").text, "Hello , world");
});

test("a URL at the start or end of the text leaves no stray space", () => {
  assert.equal(extractContent("https://a.com is great").text, "is great");
  assert.equal(extractContent("great: https://a.com").text, "great:");
});

test("lowercase leaves path, query and userinfo alone", () => {
  assert.deepEqual(
    extractContent("x HTTPS://Example.COM/Path?Q=aB#Frag", { lowercase: true }).links,
    ["https://example.com/Path?Q=aB#Frag"]
  );
  assert.deepEqual(
    extractContent("https://User:Pass@Example.com/X", { lowercase: true }).links,
    ["https://User:Pass@example.com/X"]
  );
  assert.deepEqual(
    extractContent("WWW.Example.com/Foo", { lowercase: true }).links,
    ["www.example.com/Foo"]
  );
});

test("unique option removes duplicates", () => {
  const { links } = extractContent("https://a.com and https://a.com", { unique: true });
  assert.deepEqual(links, ["https://a.com"]);
});

test("bare domains are ignored unless enabled", () => {
  assert.deepEqual(extractContent("Visit example.com"), {
    text: "Visit example.com",
    links: [],
  });
});

test("detects bare domains, with and without paths", () => {
  assert.deepEqual(
    extractContent("Visit example.com and docs.python.org/3/ for more.", bare),
    {
      text: "Visit and for more.",
      links: ["example.com", "docs.python.org/3/"],
    }
  );
});

test("bare domain followed by a sentence-ending period", () => {
  assert.deepEqual(extractContent("Go to example.com.", bare), {
    text: "Go to.",
    links: ["example.com"],
  });
});

test("bare domains: subdomains, multi-part TLDs, ports and queries", () => {
  assert.deepEqual(
    extractContent("a.b.example.co.uk and example.com:8080/x?y=1", bare).links,
    ["a.b.example.co.uk", "example.com:8080/x?y=1"]
  );
});

test("bare domains: non-ASCII (IDN) domains are matched whole, never split", () => {
  assert.deepEqual(extractContent("visit bücher.de or münchen.de/path", bare), {
    text: "visit or",
    links: ["bücher.de", "münchen.de/path"],
  });
  assert.deepEqual(extractContent("über.com", bare), { text: "", links: ["über.com"] });
  assert.deepEqual(extractContent("café.com", bare).links, ["café.com"]);
});

test("bare domains: emails are not links", () => {
  assert.deepEqual(extractContent("mail user.name@mail.example.com now", bare).links, []);
});

test("bare domains: file names and abbreviations are not links", () => {
  const text = "open README.md, main.py, index.html and script.sh (e.g. v1.2, i.e. 3.5)";
  assert.deepEqual(extractContent(text, bare).links, []);
});

test("bare domains: unknown TLDs are skipped", () => {
  assert.deepEqual(extractContent("see example.notatld and foo.com.zzz", bare).links, []);
});

test("bare domains: a protocol URL is extracted once, not twice", () => {
  assert.deepEqual(extractContent("https://example.com/a.com", bare).links, [
    "https://example.com/a.com",
  ]);
});

test("bare domains work with lowercase and unique", () => {
  assert.deepEqual(
    extractContent("EXAMPLE.COM/Path and example.com/Path", {
      ...bare,
      lowercase: true,
      unique: true,
    }).links,
    ["example.com/Path"]
  );
});

test("custom tlds replace the default list", () => {
  assert.deepEqual(
    extractContent("my.dog and example.com", { ...bare, tlds: ["dog"] }).links,
    ["my.dog"]
  );
  assert.deepEqual(
    extractContent("my.dog and example.com", { ...bare, tlds: [...DEFAULT_TLDS, "dog"] }).links,
    ["my.dog", "example.com"]
  );
});

test("empty tlds disables bare domains; invalid tlds throw", () => {
  assert.deepEqual(extractContent("example.com", { ...bare, tlds: [] }).links, []);
  assert.throws(() => extractContent("x", { ...bare, tlds: ["a|b"] }), TypeError);
});

test("DEFAULT_TLDS excludes common file extensions", () => {
  for (const ext of ["py", "md", "sh", "rs", "zip", "mov", "pl", "cc", "js", "json"]) {
    assert.ok(!DEFAULT_TLDS.includes(ext), ext);
  }
});

test("markdown links keep their label and drop the url", () => {
  assert.deepEqual(extractContent("Read [the docs](https://example.com/docs) first"), {
    text: "Read the docs first",
    links: ["https://example.com/docs"],
  });
});

test("markdown: images, titles, balanced parens and self-labelled links", () => {
  assert.equal(extractContent("![logo](https://x.com/a.png) hi").text, "logo hi");
  assert.equal(extractContent('[t](https://x.com "Title") end').text, "t end");
  assert.deepEqual(extractContent("[Foo](https://en.wikipedia.org/wiki/Foo_(bar))"), {
    text: "Foo",
    links: ["https://en.wikipedia.org/wiki/Foo_(bar)"],
  });
  assert.equal(extractContent("see [example.com](https://example.com/).").text, "see.");
});

test("markdown with a relative url is left alone, but a link in its label is found", () => {
  assert.deepEqual(extractContent("[a](/rel) https://b.com"), {
    text: "[a](/rel)",
    links: ["https://b.com"],
  });
  assert.deepEqual(extractContent("[see https://a.com](/rel)").links, ["https://a.com"]);
});

test("angle-bracket links are removed cleanly; other tags are untouched", () => {
  assert.deepEqual(extractContent("Mail <https://example.com> now"), {
    text: "Mail now",
    links: ["https://example.com"],
  });
  assert.deepEqual(extractContent("a <div> b"), { text: "a <div> b", links: [] });
});

test("detailed returns link objects with positions and hrefs", () => {
  const input = "Go to www.example.com/a now";
  const { links } = extractContent(input, { detailed: true });
  assert.deepEqual(links, [
    {
      url: "www.example.com/a",
      href: "https://www.example.com/a",
      type: "www",
      syntax: "plain",
      host: "www.example.com",
      start: 6,
      end: 23,
    },
  ]);
  assert.equal(input.slice(links[0].start, links[0].end), links[0].url);
});

test("detailed: markdown links carry their label and syntax", () => {
  const [link] = extractContent("[the docs](https://a.com/x)", { detailed: true }).links;
  assert.equal(link.syntax, "markdown");
  assert.equal(link.label, "the docs");
  assert.equal(link.host, "a.com");
});

test("detailed: href adds https; hosts have no port or userinfo", () => {
  const opts = { detailed: true, bareDomains: true };
  const links = extractContent("example.com https://u:p@Host.COM:99/x", opts).links;
  assert.deepEqual(
    links.map((l) => [l.type, l.href, l.host]),
    [
      ["bare", "https://example.com", "example.com"],
      ["url", "https://u:p@Host.COM:99/x", "host.com"],
    ]
  );
});

test("replaceWith puts a marker where links were", () => {
  assert.equal(
    extractContent("Read [docs](https://a.com) now, then https://b.com", { replaceWith: "[link]" }).text,
    "Read docs [link] now, then [link]"
  );
  assert.equal(extractContent("a https://x.com b", { replaceWith: "" }).text, "a b");
});

test("replaceWith function receives the link and its index", () => {
  const { text } = extractContent("a https://x.com b www.y.com", {
    replaceWith: (link, i) => `[${i + 1}:${link.host}]`,
  });
  assert.equal(text, "a [1:x.com] b [2:www.y.com]");
});

test("protocols: custom schemes and slashless schemes like mailto", () => {
  const opts = { protocols: ["https", "ftp", "mailto"], lowercase: true };
  assert.deepEqual(
    extractContent("ftp://files.example.com/A mailto:Me@Example.COM.", opts).links,
    ["ftp://files.example.com/A", "mailto:Me@example.com"]
  );
  assert.deepEqual(extractContent("ftp://a.com mailto:x@y.com").links, []);
  assert.throws(() => extractContent("x", { protocols: ["a b"] }), TypeError);
});

test("IPs and localhost need a protocol", () => {
  const text = "hit 192.168.1.1:8080/x or localhost:3000 or 10.0.0.1.";
  assert.deepEqual(extractContent(text, { bareDomains: true }).links, []);
  assert.deepEqual(extractContent("http://10.0.0.1:80/x http://localhost:3000").links, [
    "http://10.0.0.1:80/x",
    "http://localhost:3000",
  ]);
});

test("allowHosts and denyHosts match hosts and subdomains", () => {
  const input = "https://a.example.com https://evil.com https://notexample.com";
  assert.deepEqual(extractContent(input, { allowHosts: ["example.com"] }).links, [
    "https://a.example.com",
  ]);
  const denied = extractContent(input, { denyHosts: ["evil.com"] });
  assert.deepEqual(denied.links, ["https://a.example.com", "https://notexample.com"]);
  assert.equal(denied.text, "https://evil.com");
});

test("host lists compare internationalised names in punycode", () => {
  assert.deepEqual(
    extractContent("https://münchen.de/x", { allowHosts: ["xn--mnchen-3ya.de"] }).links,
    ["https://münchen.de/x"]
  );
});

test("filter can reject links", () => {
  const { text, links } = extractContent("http://a.com https://b.com", {
    filter: (link) => link.url.startsWith("https"),
  });
  assert.deepEqual(links, ["https://b.com"]);
  assert.equal(text, "http://a.com");
});

test("invalid option types throw", () => {
  assert.throws(() => extractContent("x", { filter: 1 }), TypeError);
  assert.throws(() => extractContent("x", { replaceWith: 1 }), TypeError);
  assert.throws(() => extractContent("x", { allowHosts: "a.com" }), TypeError);
});

test("a link cut off by an unbalanced bracket does not swallow the next one", () => {
  assert.deepEqual(extractContent("a https://x.com](/y) https://z.com").links, [
    "https://x.com",
    "https://z.com",
  ]);
});

test("many links stay fast", () => {
  const input = "see [a](https://example.com/x) and example.com/y. ".repeat(20000);
  const start = performance.now();
  const { links } = extractContent(input, { bareDomains: true });
  assert.equal(links.length, 40000);
  assert.ok(performance.now() - start < 2000);
});

test("the public export list is exactly what index.d.ts declares", () => {
  assert.deepEqual(Object.keys(api).sort(), [
    "DEFAULT_PROTOCOLS",
    "DEFAULT_TLDS",
    "default",
    "extractContent",
  ]);
});

test("default lists are frozen and DEFAULT_PROTOCOLS is http and https", () => {
  assert.ok(Object.isFrozen(DEFAULT_TLDS));
  assert.ok(Object.isFrozen(DEFAULT_PROTOCOLS));
  assert.deepEqual(DEFAULT_PROTOCOLS, ["http", "https"]);
});

test("empty and whitespace-only input", () => {
  assert.deepEqual(extractContent(""), { text: "", links: [] });
  assert.deepEqual(extractContent("   "), { text: "   ", links: [] });
});

test("null and undefined options mean defaults", () => {
  assert.deepEqual(extractContent("https://a.com", null).links, ["https://a.com"]);
  assert.deepEqual(extractContent("https://a.com", undefined).links, ["https://a.com"]);
});

test("non-object options throw a clear TypeError", () => {
  for (const options of ["x", 1, true, false, [], () => {}]) {
    assert.throws(() => extractContent("x", options), {
      name: "TypeError",
      message: "options must be an object",
    });
  }
});

test("filter and replaceWith errors propagate", () => {
  const boom = () => {
    throw new RangeError("boom");
  };
  assert.throws(() => extractContent("https://a.com", { filter: boom }), RangeError);
  assert.throws(() => extractContent("https://a.com", { replaceWith: boom }), RangeError);
});

test("replaceWith inserts strings literally and treats null as removal", () => {
  assert.equal(extractContent("a https://b.com c", { replaceWith: "$&" }).text, "a $& c");
  assert.equal(extractContent("a https://b.com c", { replaceWith: () => null }).text, "a c");
});

test("a callback can call extractContent recursively", () => {
  const { links } = extractContent("https://a.com https://b.com", {
    filter: (link) => extractContent(link.url).links.length === 1,
  });
  assert.deepEqual(links, ["https://a.com", "https://b.com"]);
});

test("CRLF line endings, emoji and lone surrogates survive", () => {
  assert.equal(extractContent("a\r\nhttps://a.com\r\nb").text, "a\r\n\r\nb");
  assert.equal(extractContent("\ud83d https://a.com \ude00").text, "\ud83d \ude00");
});

test("schemes with + and - and IPv6 hosts", () => {
  assert.deepEqual(
    extractContent("svn+ssh://a.com/x ms-word://b.com", { protocols: ["svn+ssh", "ms-word"] }).links,
    ["svn+ssh://a.com/x", "ms-word://b.com"]
  );
  const [link] = extractContent("http://[::1]:8080/x.", { detailed: true }).links;
  assert.equal(link.url, "http://[::1]:8080/x");
  assert.equal(link.host, "[::1]");
});

test("hostless links: file, tel and geo have an empty host", () => {
  const { links } = extractContent("file:///etc/passwd tel:+1-555 geo:1,2", {
    protocols: ["file", "tel", "geo"],
    detailed: true,
  });
  assert.deepEqual(links.map((l) => l.host), ["", "", ""]);
});

test("slashless hosts drop the port, like every other host", () => {
  const [link] = extractContent("sip:Me@Example.com:5060", { protocols: ["sip"], detailed: true }).links;
  assert.equal(link.host, "example.com");
});

test("an empty allowHosts rejects everything; an empty denyHosts rejects nothing", () => {
  assert.deepEqual(extractContent("https://a.com", { allowHosts: [] }).links, []);
  assert.deepEqual(extractContent("https://a.com", { denyHosts: [] }).links, ["https://a.com"]);
});

test("regression: a backslash ends the authority, as it does in browsers", () => {
  const url = "https://evil.com\\@good.com/";
  assert.equal(new URL(url).hostname, "evil.com");
  assert.deepEqual(extractContent(url, { allowHosts: ["good.com"] }).links, []);
  assert.deepEqual(extractContent(url, { denyHosts: ["evil.com"] }).links, []);
  assert.deepEqual(extractContent("www.evil.com\\@good.com", { allowHosts: ["good.com"] }).links, []);
  assert.equal(extractContent("https://evil.com\\foo", { detailed: true }).links[0].host, "evil.com");
});

test("regression: a backslash stays literal for schemes that do not treat it as a slash", () => {
  const url = "ssh://a\\@b.com/";
  assert.equal(new URL(url).hostname, "b.com");
  const opts = { protocols: ["ssh"], detailed: true };
  assert.equal(extractContent(url, opts).links[0].host, "b.com");
});

test("regression: extra slashes cannot hide a denied host", () => {
  for (const url of ["https:///evil.com/x", "https://///evil.com", "https://\\evil.com/x"]) {
    assert.equal(new URL(url).hostname, "evil.com");
    assert.deepEqual(extractContent(url, { denyHosts: ["evil.com"] }).links, [], url);
    assert.equal(extractContent(url, { detailed: true }).links[0].host, "evil.com", url);
  }
  assert.equal(
    extractContent("file:///evil.com/x", { protocols: ["file"], detailed: true }).links[0].host,
    ""
  );
});

test("regression: a trailing dot cannot hide a denied host", () => {
  for (const url of ["https://evil.com./x", "https://a.evil.com./x", "https://evil.com%2e/x"]) {
    assert.deepEqual(extractContent(url, { denyHosts: ["evil.com"] }).links, [], url);
  }
  assert.deepEqual(extractContent("https://a.com/", { allowHosts: ["a.com."] }).links, ["https://a.com/"]);
});

test("host lists see through encodings the URL parser normalises", () => {
  for (const url of ["https://evil%2ecom/x", "https://\uff45vil.com/x", "https://good.com@evil.com/"]) {
    assert.deepEqual(extractContent(url, { denyHosts: ["evil.com"] }).links, [], url);
  }
  assert.deepEqual(extractContent("http://2130706433/x", { denyHosts: ["127.0.0.1"] }).links, []);
});

test("regression: host lists reject entries that are not hostnames", () => {
  for (const entry of ["https://evil.com", "evil.com/x", "a@evil.com", "evil.com?x", "", "  "]) {
    assert.throws(() => extractContent("x", { denyHosts: [entry] }), TypeError, entry);
    assert.throws(() => extractContent("x", { allowHosts: [entry] }), TypeError, entry);
  }
  assert.deepEqual(
    extractContent("https://A.evil.com", { denyHosts: [" *.EVIL.com "] }).links,
    []
  );
});

test("regression: lowercase leaves a backslash path and www userinfo alone", () => {
  assert.deepEqual(extractContent("HTTPS://EVIL.com\\Path", { lowercase: true }).links, ["https://evil.com\\Path"]);
  assert.deepEqual(extractContent("www.U:P@Host.COM/X", { lowercase: true }).links, ["www.U:P@host.com/X"]);
});

test("regression: www. inside a scheme that is not enabled is not split off", () => {
  assert.deepEqual(extractContent("see ftp://www.a.com/x end"), {
    text: "see ftp://www.a.com/x end",
    links: [],
  });
  assert.deepEqual(extractContent("http://www.a.com", { protocols: ["https"] }).links, []);
  assert.deepEqual(extractContent("//www.a.com/x").links, ["www.a.com/x"]);
});

test("regression: case-folded scheme look-alikes do not throw", () => {
  assert.deepEqual(extractContent("http\u017f://example.com").links, []);
  assert.deepEqual(extractContent("\u212a://example.com", { protocols: ["k"] }).links, []);
});

test("regression: a rejected plain link does not swallow the next one", () => {
  assert.deepEqual(extractContent("https://bad.com)https://good.com", { denyHosts: ["bad.com"] }), {
    text: "https://bad.com)",
    links: ["https://good.com"],
  });
  assert.deepEqual(extractContent("www.)https://good.com").links, ["https://good.com"]);
});

test("regression: full-width punctuation ends a link", () => {
  assert.deepEqual(extractContent("see https://example.com/a。"), {
    text: "see。",
    links: ["https://example.com/a"],
  });
  assert.deepEqual(extractContent("请看https://example.com。然后继续"), {
    text: "请看。然后继续",
    links: ["https://example.com"],
  });
  assert.deepEqual(extractContent("https://example.com/a，然后").links, ["https://example.com/a"]);
  assert.deepEqual(extractContent("（https://example.com/a）"), {
    text: "（）",
    links: ["https://example.com/a"],
  });
  assert.deepEqual(extractContent("https://example.com/a（b）").links, ["https://example.com/a（b）"]);
});

test("regression: a trailing ellipsis or table pipe is not part of the link", () => {
  assert.deepEqual(extractContent("https://example.com/a… more").links, ["https://example.com/a"]);
  assert.deepEqual(extractContent("| https://a.com| x").links, ["https://a.com"]);
});

test("regression: pathological input stays linear", () => {
  const size = 1_000_000;
  const cases = [
    ["[a](https://a.com/" + "/".repeat(size) + "x)", {}],
    ["https://a.com)".repeat(size / 14), {}],
    ["https://a.com/x]".repeat(size / 16), {}],
    ["https://a.com/" + ".".repeat(size), {}],
    ["a.".repeat(size / 2), { bareDomains: true }],
    ["<".repeat(size), {}],
  ];
  for (const [input, options] of cases) {
    const start = performance.now();
    extractContent(input, options);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 5000, input.slice(0, 20) + " took " + elapsed + "ms");
  }
});

test("regression: a huge dotted run does not overflow the regex stack", () => {
  const input = "a.com.".repeat(4_000_000) + "x";
  assert.deepEqual(extractContent(input, { bareDomains: true }).links, []);
});

test("bare domains match up to the DNS limit of 127 labels", () => {
  const host = (labels) => "a.".repeat(labels - 1) + "com";
  assert.deepEqual(extractContent(host(127), { bareDomains: true }).links, [host(127)]);
  assert.deepEqual(extractContent(host(128), { bareDomains: true }).links, []);
});

test("every link's position and host agree with the input and the URL parser", () => {
  const input = [
    "https://Example.com:8080/a?b#c", "www.example.org/x", "[l](https://g.com/y)", "<https://h.com>",
    "https://u:p@i.com", "https:///j.com/k", "https://l.com\\m", "http://[::1]/n",
    "o.io/p", "http://10.0.0.1:80/q", "http://localhost:3000/r", "https://bücher.de/s",
  ].join(" ");
  const { links } = extractContent(input, { detailed: true, bareDomains: true });
  assert.equal(links.length, 12);
  for (const link of links) {
    assert.equal(input.slice(link.start, link.end), link.url);
    assert.equal(new URL("http://" + link.host).hostname, new URL(link.href).hostname, link.url);
  }
});

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("README examples produce what the README says", () => {
  const examples = [
    ['"Docs at https://example.com/docs, source at www.github.com/foo/bar."', undefined,
      { text: "Docs at, source at.", links: ["https://example.com/docs", "www.github.com/foo/bar"] }],
    ['"Read [the docs](https://example.com/docs) or <https://example.org>."', undefined,
      { text: "Read the docs or.", links: ["https://example.com/docs", "https://example.org"] }],
    ['"Visit example.com or example.org:8080."', { bareDomains: true },
      { text: "Visit or.", links: ["example.com", "example.org:8080"] }],
    ['"Mail me@example.com: mailto:me@example.com"', { protocols: ["https", "mailto"] },
      { text: "Mail me@example.com:", links: ["mailto:me@example.com"] }],
    ['"See https://a.com and https://b.com"', { replaceWith: (link, i) => "[" + (i + 1) + "]" },
      { text: "See [1] and [2]", links: ["https://a.com", "https://b.com"] }],
    ['"https://docs.example.com https://tracker.evil.com"', { denyHosts: ["evil.com"] },
      { text: "https://tracker.evil.com", links: ["https://docs.example.com"] }],
  ];
  for (const [literal, options, expected] of examples) {
    assert.ok(readme.includes(literal), "README no longer shows " + literal);
    assert.deepEqual(extractContent(JSON.parse(literal), options), expected);
  }

  const literal = '"Go to www.example.com/a now"';
  assert.ok(readme.includes(literal));
  assert.deepEqual(extractContent(JSON.parse(literal), { detailed: true }).links, [
    {
      url: "www.example.com/a",
      href: "https://www.example.com/a",
      type: "www",
      syntax: "plain",
      host: "www.example.com",
      start: 6,
      end: 23,
    },
  ]);
});

test("README documents every option", () => {
  const options = [
    "detailed", "unique", "lowercase", "replaceWith", "bareDomains", "tlds",
    "protocols", "allowHosts", "denyHosts", "filter",
  ];
  for (const option of options) assert.ok(readme.includes("| `" + option), option);
});
