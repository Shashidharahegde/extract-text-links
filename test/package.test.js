import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const project = mkdtempSync(join(tmpdir(), "extract-text-links-consumer-"));
process.on("exit", () => rmSync(project, { recursive: true, force: true }));

// npm passes its flags down as npm_config_*: without this, "npm publish --dry-run"
// would make the "npm pack" below a dry run too, and no tarball would be written.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith("npm_config_"))
);

const shell = (command, cwd) => {
  const r = spawnSync(command, { cwd, env, shell: true, encoding: "utf8" });
  assert.equal(r.status, 0, `${command}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};

const [packed] = JSON.parse(shell(`npm pack --json --pack-destination "${project}"`, root));

writeFileSync(
  join(project, "package.json"),
  JSON.stringify({ name: "consumer", private: true, type: "module" })
);
shell(`npm install "./${packed.filename}" --offline --no-audit --no-fund`, project);
cpSync(join(root, "consumer"), project, { recursive: true });

const node = (file) =>
  spawnSync(process.execPath, [file], { cwd: project, encoding: "utf8" });

const tsconfig = createRequire(import.meta.url).resolve("typescript/package.json");
const tscBin = join(dirname(tsconfig), JSON.parse(readFileSync(tsconfig, "utf8")).bin.tsc);
const tsc = (module, moduleResolution, files) =>
  spawnSync(
    process.execPath,
    [
      tscBin,
      "--noEmit",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--noUncheckedIndexedAccess",
      "--skipLibCheck", "false",
      "--allowJs",
      "--checkJs",
      "--resolveJsonModule",
      "--target", "es2022",
      "--lib", "es2022",
      "--module", module,
      "--moduleResolution", moduleResolution,
      ...files,
    ],
    { cwd: project, encoding: "utf8" }
  );

test("the tarball holds exactly the intended files", () => {
  assert.deepEqual(packed.files.map((f) => f.path).sort(), [
    "LICENSE",
    "README.md",
    "bin/extract-text-links.js",
    "index.d.ts",
    "index.js",
    "llms.txt",
    "package.json",
  ]);
});

test("package metadata stays free of runtime dependencies", () => {
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.peerDependencies, undefined);
  assert.deepEqual(Object.keys(pkg.exports), [".", "./package.json"]);
  assert.deepEqual(Object.keys(pkg.exports["."]), ["types", "default"]);
});

test("the bin starts with an LF shebang", () => {
  const bin = readFileSync(join(root, pkg.bin["extract-text-links"]), "utf8");
  assert.ok(bin.startsWith("#!/usr/bin/env node\n"));
});

test("the installed bin runs", () => {
  const out = shell("npx --no-install extract-text-links --version", project);
  assert.equal(out.trim(), pkg.version);
});

test("ESM consumers can import every export; other subpaths are closed", () => {
  const r = node("esm.mjs");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "esm ok\n");
});

test("CommonJS consumers can use dynamic import on every supported Node", () => {
  const r = node("cjs-import.cjs");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "cjs import ok\n");
});

test("require() works where Node supports require(esm), and fails clearly elsewhere", () => {
  const r = node("cjs-require.cjs");
  if (process.features.require_module) {
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "cjs require ok\n");
  } else {
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ERR_REQUIRE_ESM/);
  }
});

const common = ["types.ts", "subpaths.ts", "checked.js"];

for (const [module, moduleResolution, files] of [
  ["nodenext", "nodenext", ["package-json.ts", "dynamic.cts", "required.cts"]],
  ["node20", "node16", ["package-json.ts", "dynamic.cts", "required.cts"]],
  ["node16", "node16", ["package-json.cts", "dynamic.cts"]],
  ["esnext", "bundler", ["package-json.ts"]],
  ["preserve", "bundler", ["package-json.ts"]],
]) {
  test(`strict TypeScript compiles with module ${module}, moduleResolution ${moduleResolution}`, () => {
    const r = tsc(module, moduleResolution, [...common, ...files]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
}

test("the TypeScript harness can fail", () => {
  writeFileSync(
    join(project, "control.ts"),
    'import extractContent from "extract-text-links";\nextractContent(42);\n'
  );
  const r = tsc("nodenext", "nodenext", ["control.ts"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /TS2769|TS2345/);
});
