const assert = require("node:assert/strict");

import("extract-text-links").then(({ default: extractContent, extractContent: named }) => {
  assert.equal(extractContent, named);
  assert.deepEqual(extractContent("a https://b.com").links, ["https://b.com"]);
  console.log("cjs import ok");
});
