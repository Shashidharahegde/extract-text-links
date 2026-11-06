import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/extract-text-links.js", import.meta.url));
const run = (args, input) =>
  spawnSync(process.execPath, [bin, ...args], { input, encoding: "utf8" });

test("removes links from piped text", () => {
  const r = run([], "Docs: https://example.com/a, ok\n");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "Docs:, ok\n");
});

test("--links and --hrefs list links, one per line", () => {
  const input = "a https://x.com b example.com/y www.z.org\n";
  assert.equal(run(["-l"], input).stdout, "https://x.com\nwww.z.org\n");
  assert.equal(run(["-b", "-l"], input).stdout, "https://x.com\nexample.com/y\nwww.z.org\n");
  assert.equal(
    run(["-b", "--hrefs"], input).stdout,
    "https://x.com\nhttps://example.com/y\nhttps://www.z.org\n"
  );
});

test("--json and --detailed print JSON", () => {
  const plain = JSON.parse(run(["--json"], "a https://x.com").stdout);
  assert.deepEqual(plain, { text: "a", links: ["https://x.com"] });
  const detailed = JSON.parse(run(["-d"], "a https://x.com").stdout);
  assert.equal(detailed.links[0].host, "x.com");
});

test("reads files, joins them, and accepts options", () => {
  const dir = mkdtempSync(join(tmpdir(), "extract-text-links-"));
  writeFileSync(join(dir, "a.txt"), "one https://a.com");
  writeFileSync(join(dir, "b.txt"), "two https://a.com");
  const r = run([join(dir, "a.txt"), join(dir, "b.txt"), "-u", "-l"]);
  assert.equal(r.stdout, "https://a.com\n");
  assert.equal(run(["-r", "[link]", join(dir, "a.txt")]).stdout, "one [link]\n");
});

test("errors exit with code 2 and a message", () => {
  for (const [args, pattern] of [
    [["--bogus"], /Unknown option/],
    [["/definitely/not/here.txt"], /cannot read/],
    [["--protocols", "a b"], /Invalid entry/],
    [["-l", "-j"], /choose either/],
  ]) {
    const r = run(args, "x");
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, pattern);
  }
});

test("--help and --version work", () => {
  assert.match(run(["--help"]).stdout, /Usage: extract-text-links/);
  assert.match(run(["-v"]).stdout, /^\d+\.\d+\.\d+\n$/);
});

test("regression: a closed pipe ends quietly instead of crashing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "extract-text-links-"));
  const file = join(dir, "big.txt");
  writeFileSync(file, "https://a.com\n".repeat(500000));

  const child = spawn(process.execPath, [bin, file, "-l"]);
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));
  child.stdout.once("data", () => child.stdout.destroy());

  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(stderr, "");
  assert.equal(code, 0);
});

test("large output is written in full", () => {
  const input = "https://a.com\n".repeat(200000);
  const r = spawnSync(process.execPath, [bin, "-l"], { input, encoding: "utf8", maxBuffer: 1e8 });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, input);
});

test("- reads standard input alongside files", () => {
  const dir = mkdtempSync(join(tmpdir(), "extract-text-links-"));
  const file = join(dir, "a.txt");
  writeFileSync(file, "one https://x.com");
  assert.equal(run(["-", file, "-l"], "a https://y.com").stdout, "https://y.com\nhttps://x.com\n");
  assert.equal(run(["-", "-", "-l"], "a https://y.com").stdout, "https://y.com\n");
});

test("multi-byte text survives and empty results print nothing", () => {
  assert.equal(run([], "日本語 https://a.com テキスト").stdout, "日本語 テキスト\n");
  assert.equal(run(["-l"], "no links").stdout, "");
  assert.equal(run([], "https://a.com").stdout, "");
});

test("every flag in --help takes effect", () => {
  const input = "A example.com C my.dog D ftp://f.com E https://x.com F https://x.com G HTTPS://Y.com/Z";
  const links = (...args) => run([...args, "-l"], input).stdout.trim().split("\n");
  assert.deepEqual(links("-b").slice(0, 1), ["example.com"]);
  assert.ok(links("--extra-tlds", "dog").includes("my.dog"));
  assert.ok(links("--protocols", "ftp").includes("ftp://f.com"));
  assert.deepEqual(links("--allow-hosts", "x.com"), ["https://x.com", "https://x.com"]);
  assert.ok(!links("--deny-hosts", "x.com").includes("https://x.com"));
  assert.equal(links("-u").length, 2);
  assert.ok(links("--lowercase").includes("https://y.com/Z"));
  assert.equal(
    run(["-b", "--hrefs"], "example.com").stdout,
    "https://example.com\n"
  );
  assert.equal(run(["--replace-with", "X"], "a https://a.com").stdout, "a X\n");
});
