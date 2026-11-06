import extractContent, {
  extractContent as named,
  DEFAULT_PROTOCOLS,
  DEFAULT_TLDS,
} from "extract-text-links";
import type {
  ExtractOptions,
  ExtractResult,
  Link,
  LinkSyntax,
  LinkType,
} from "extract-text-links";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertType = <T extends true>(): T | void => {};

assertType<Equal<typeof extractContent, typeof named>>();
assertType<Equal<typeof DEFAULT_TLDS, readonly string[]>>();
assertType<Equal<typeof DEFAULT_PROTOCOLS, readonly string[]>>();

const noOptions = extractContent("x");
assertType<Equal<typeof noOptions, ExtractResult<string>>>();
assertType<Equal<typeof noOptions.links, string[]>>();
assertType<Equal<typeof noOptions.text, string>>();

const notDetailed = extractContent("x", { detailed: false, unique: true });
assertType<Equal<typeof notDetailed, ExtractResult<string>>>();

const detailed = extractContent("x", { detailed: true });
assertType<Equal<typeof detailed, ExtractResult<Link>>>();
for (const link of detailed.links) {
  assertType<Equal<typeof link.url, string>>();
  assertType<Equal<typeof link.href, string>>();
  assertType<Equal<typeof link.type, LinkType>>();
  assertType<Equal<typeof link.syntax, LinkSyntax>>();
  assertType<Equal<typeof link.host, string>>();
  assertType<Equal<typeof link.start, number>>();
  assertType<Equal<typeof link.end, number>>();
  assertType<Equal<typeof link.label, string | undefined>>();
}

const unknownShape: ExtractOptions = {};
const widened = extractContent("x", unknownShape);
assertType<Equal<typeof widened, ExtractResult<string | Link>>>();

const everyOption: Required<ExtractOptions> = {
  lowercase: true,
  unique: true,
  bareDomains: true,
  tlds: [...DEFAULT_TLDS, "dog"],
  protocols: ["https", "mailto"] as const,
  allowHosts: ["example.com"],
  denyHosts: ["evil.example"],
  filter: (link) => link.type !== "bare",
  replaceWith: (link, index) => `[${index}:${link.host}]`,
  detailed: true,
};
extractContent("x", everyOption);
extractContent("x", { replaceWith: "[link]" });

const allTypes: LinkType[] = ["url", "www", "bare"];
const allSyntaxes: LinkSyntax[] = ["plain", "markdown", "angle"];
export { allSyntaxes, allTypes };

// @ts-expect-error str is required
extractContent();
// @ts-expect-error str must be a string
extractContent(42);
// @ts-expect-error options cannot be a string
extractContent("x", "lowercase");
// @ts-expect-error options cannot be a boolean
extractContent("x", true);
// @ts-expect-error removed option
extractContent("x", { ips: true });
// @ts-expect-error unknown option
extractContent("x", { lowerCase: true });
// @ts-expect-error tlds must be an array
extractContent("x", { tlds: "com" });
// @ts-expect-error protocols must hold strings
extractContent("x", { protocols: [1] });
// @ts-expect-error filter must be a function
extractContent("x", { filter: true });
// @ts-expect-error replaceWith must be a string or a function
extractContent("x", { replaceWith: 1 });
// @ts-expect-error replaceWith must return a string
extractContent("x", { replaceWith: () => 1 });
// @ts-expect-error the links are strings unless detailed is set
noOptions.links[0]?.href;
// @ts-expect-error default lists are read-only
DEFAULT_TLDS.push("dog");
// @ts-expect-error LinkType is a closed set
const badType: LinkType = "ftp";
export { badType };
