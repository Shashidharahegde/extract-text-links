import { createRequire } from "node:module";
import assert from "node:assert/strict";
import extractContent, {
  extractContent as named,
  DEFAULT_PROTOCOLS,
  DEFAULT_TLDS,
} from "extract-text-links";

assert.equal(extractContent, named);
assert.deepEqual(DEFAULT_PROTOCOLS, ["http", "https"]);
assert.ok(DEFAULT_TLDS.includes("com"));

const { text, links } = extractContent("See https://example.com/a, thanks.");
assert.equal(text, "See, thanks.");
assert.deepEqual(links, ["https://example.com/a"]);

const pkg = createRequire(import.meta.url)("extract-text-links/package.json");
assert.equal(pkg.name, "extract-text-links");

await assert.rejects(import("extract-text-links/index.js"), {
  code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
});

console.log("esm ok");
