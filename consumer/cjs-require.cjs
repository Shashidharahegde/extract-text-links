const assert = require("node:assert/strict");

const { default: extractContent, extractContent: named, DEFAULT_TLDS } = require("extract-text-links");

assert.equal(extractContent, named);
assert.ok(DEFAULT_TLDS.includes("com"));
assert.deepEqual(extractContent("a https://b.com").links, ["https://b.com"]);
console.log("cjs require ok");
