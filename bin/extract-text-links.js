#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import extractContent, { DEFAULT_TLDS } from "../index.js";

const HELP = `Usage: extract-text-links [options] [file ...]

Remove links from text, or list them. Reads the given files (joined with
newlines) or standard input. Use "-" for standard input among files.

Output (default: the text with links removed)
  -l, --links                 Print the links, one per line
      --hrefs                 Print openable links (adds https:// to www. and bare domains)
  -j, --json                  Print { text, links } as JSON
  -d, --detailed              Like --json, with type, host, position and label per link

Detection
  -b, --bare-domains          Also detect domains without a protocol, e.g. example.com
      --extra-tlds <list>     More TLDs for bare domains, comma-separated (implies -b)
      --protocols <list>      Schemes to detect, comma-separated (default: http,https)
      --allow-hosts <list>    Only count links on these hosts and their subdomains
      --deny-hosts <list>     Never count links on these hosts and their subdomains

Formatting
  -r, --replace-with <text>   Put <text> where each link was instead of removing it
  -u, --unique                Remove duplicate links
      --lowercase             Lowercase the scheme and host of each link

  -h, --help                  Show this help
  -v, --version               Show the version

Examples
  extract-text-links notes.txt --links
  pbpaste | extract-text-links -b
  extract-text-links chat.md -r "[link]" --deny-hosts tracker.example.com`;

const OPTIONS = {
  links: { type: "boolean", short: "l" },
  hrefs: { type: "boolean" },
  json: { type: "boolean", short: "j" },
  detailed: { type: "boolean", short: "d" },
  "bare-domains": { type: "boolean", short: "b" },
  "extra-tlds": { type: "string" },
  protocols: { type: "string" },
  "allow-hosts": { type: "string" },
  "deny-hosts": { type: "string" },
  "replace-with": { type: "string", short: "r" },
  unique: { type: "boolean", short: "u" },
  lowercase: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
};

const list = (value) =>
  value === undefined ? undefined : value.split(",").map((s) => s.trim()).filter(Boolean);

const print = (stream, str) => {
  if (str) stream.write(str.endsWith("\n") ? str : `${str}\n`);
};

class UsageError extends Error {}

async function readStdin() {
  let data = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function readInput(files) {
  if (files.length === 0) {
    if (process.stdin.isTTY) throw new UsageError("no input: pass a file or pipe text in");
    return readStdin();
  }
  const parts = [];
  for (const file of files) {
    try {
      parts.push(file === "-" ? await readStdin() : await readFile(file, "utf8"));
    } catch (error) {
      throw new UsageError(`cannot read ${file}: ${error.code ?? error.message}`);
    }
  }
  return parts.join("\n");
}

async function main(argv) {
  const { values: v, positionals } = parseArgs({
    args: argv,
    options: OPTIONS,
    allowPositionals: true,
  });

  if (v.help) {
    print(process.stdout, HELP);
    return;
  }
  if (v.version) {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    print(process.stdout, pkg.version);
    return;
  }

  const json = v.json || v.detailed;
  const linksOnly = v.links || v.hrefs;
  if (json && linksOnly) throw new UsageError("choose either --links/--hrefs or --json/--detailed");

  const extraTlds = list(v["extra-tlds"]);
  const options = {
    lowercase: v.lowercase,
    unique: v.unique,
    bareDomains: v["bare-domains"] || Boolean(extraTlds),
    tlds: extraTlds ? [...DEFAULT_TLDS, ...extraTlds] : undefined,
    protocols: list(v.protocols),
    allowHosts: list(v["allow-hosts"]),
    denyHosts: list(v["deny-hosts"]),
    replaceWith: v["replace-with"],
    detailed: Boolean(v.detailed || v.hrefs),
  };
  for (const key of Object.keys(options)) {
    if (options[key] === undefined) delete options[key];
  }

  const input = await readInput(positionals);

  let result;
  try {
    result = extractContent(input, options);
  } catch (error) {
    throw new UsageError(error.message);
  }

  if (json) print(process.stdout, JSON.stringify(result, null, 2));
  else if (v.hrefs) print(process.stdout, result.links.map((l) => l.href).join("\n"));
  else if (v.links) print(process.stdout, result.links.join("\n"));
  else print(process.stdout, result.text);
}

// The reader went away, as in "extract-text-links big.txt | head -1".
process.stdout.on("error", (error) => {
  if (error.code !== "EPIPE") throw error;
  process.exit(0);
});

main(process.argv.slice(2)).catch((error) => {
  const usage = error instanceof UsageError || error.code?.startsWith?.("ERR_PARSE_ARGS");
  process.stderr.write(`extract-text-links: ${error.message}\n`);
  if (usage) process.stderr.write(`Run "extract-text-links --help" for usage.\n`);
  process.exitCode = usage ? 2 : 1;
});
