// Shared root discovery, config loading/validation and text helpers for every script under scripts/sdd/.
// The one path a script may know literally is skills/sdd.config.json; everything else comes from it.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CONFIG_FILE = join("skills", "sdd.config.json");
export const PUBLISH_MODES = ["trunk-ff", "pr"];
export const TEST_RUNNERS = ["dotnet", "vitest", "generic"];
export const HARNESSES = ["claude", "copilot", "codex"];
/** Where each harness reads project-scope skills, relative to the repo root. */
export const HARNESS_PROJECT_DIRS = {
  claude: join(".claude", "skills"),
  copilot: join(".github", "skills"),
  codex: join(".agents", "skills"),
};
/** Where each harness reads user-scope skills, relative to the home directory. */
export const HARNESS_USER_DIRS = {
  claude: join(".claude", "skills"),
  copilot: join(".copilot", "skills"),
  codex: join(".agents", "skills"),
};

const REQUIRED_DOCS = ["sdd", "prd", "architecture", "stories", "projectStructure", "profile", "plans", "artifacts", "epics", "research", "logs"];
const OPTIONAL_DOCS = ["agentGuide", "changeChecklist", "vocabulary"];
const REQUIRED_LEDGERS = ["friction", "testHealth", "runLog", "testRoi"];

// ---------------------------------------------------------------- root + config

/** Walks up from `start` until a directory contains skills/sdd.config.json; throws when none does. */
export function findRoot(start = process.cwd()) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`repo root not found: no ${CONFIG_FILE.replace(/\\/g, "/")} in ${resolve(start)} or any parent directory`);
    }
    dir = parent;
  }
}

function getKey(object, key) {
  return key.split(".").reduce((node, part) => (node != null && typeof node === "object" ? node[part] : undefined), object);
}

/**
 * Loads `<root>/skills/sdd.config.json`. `get('a.b')` reads a dotted key; `path('a.b')` resolves a
 * config-relative path to an absolute one (null when the key is null or absent, so optional docs
 * gate their phases without a throw).
 */
export function loadConfig(root) {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  let config;
  try {
    config = JSON.parse(stripBom(readFileSync(file, "utf8")));
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error.message}`);
  }
  const get = (key) => getKey(config, key);
  const path = (key) => {
    const value = get(key);
    if (value == null) return null;
    if (typeof value !== "string") throw new Error(`config ${key} is not a path (${JSON.stringify(value)})`);
    return isAbsolute(value) ? value : resolve(root, value);
  };
  return { root, config, file, get, path };
}

function walkStrings(node, prefix, visit) {
  if (typeof node === "string") visit(prefix, node);
  else if (Array.isArray(node)) node.forEach((item, index) => walkStrings(item, `${prefix}[${index}]`, visit));
  else if (node && typeof node === "object") for (const [key, value] of Object.entries(node)) walkStrings(value, prefix ? `${prefix}.${key}` : key, visit);
}

/** Returns a list of problems (empty when the config satisfies the contract). */
export function validateConfig(config) {
  const problems = [];
  if (!config || typeof config !== "object") return ["config is not an object"];
  const requireString = (key) => {
    const value = getKey(config, key);
    if (typeof value !== "string" || !value.trim()) problems.push(`${key}: required (non-empty string)`);
    return value;
  };
  const requireOneOf = (key, allowed) => {
    const value = requireString(key);
    if (typeof value === "string" && !allowed.includes(value)) problems.push(`${key}: must be one of ${allowed.join(", ")} (found ${JSON.stringify(value)})`);
  };
  requireString("repo.name");
  requireString("repo.defaultBranch");
  requireOneOf("repo.publish", PUBLISH_MODES);
  {
    const build = getKey(config, "repo.commands.build");   // optional: a repo may have no build step
    if (build != null && (typeof build !== "string" || !build.trim())) problems.push("repo.commands.build: must be a command or null");
  }
  requireString("repo.commands.test");
  requireString("repo.commands.docTests");
  requireOneOf("repo.testRunner", TEST_RUNNERS);
  for (const key of REQUIRED_DOCS) requireString(`repo.docs.${key}`);
  for (const key of OPTIONAL_DOCS) {
    const value = getKey(config, `repo.docs.${key}`);
    if (value != null && typeof value !== "string") problems.push(`repo.docs.${key}: must be a path or null`);
  }
  for (const key of REQUIRED_LEDGERS) requireString(`repo.ledgers.${key}`);
  const project = getKey(config, "skills.project");
  if (!Array.isArray(project) || project.length === 0 || !project.every((name) => typeof name === "string" && name)) {
    problems.push("skills.project: required (non-empty array of skill names)");
  }
  const harnesses = getKey(config, "skills.harnesses");
  if (!Array.isArray(harnesses)) problems.push("skills.harnesses: required (array)");
  else for (const harness of harnesses) if (!HARNESSES.includes(harness)) problems.push(`skills.harnesses: unknown harness ${JSON.stringify(harness)} (use ${HARNESSES.join(", ")})`);
  const retired = getKey(config, "skills.retired");
  if (retired != null && !(Array.isArray(retired) && retired.every((name) => typeof name === "string"))) problems.push("skills.retired: must be an array of names");
  walkStrings(config, "", (key, value) => {
    if (value.includes("{{")) problems.push(`${key}: TODO placeholder ${JSON.stringify(value)}`);
  });
  return problems;
}

// ---------------------------------------------------------------- text helpers

export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function stripCr(text) {
  return String(text).replace(/\r/g, "");
}

/** Byte length with CR stripped, so a line-ending flip cannot move a size budget. */
export function sizeOf(text) {
  return Buffer.byteLength(stripCr(text), "utf8");
}

/** Reads a file remembering its own line ending and BOM, and hands back LF text to edit. */
export function readText(path) {
  const raw = readFileSync(path, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const bom = raw.charCodeAt(0) === 0xfeff;
  return { text: stripBom(raw).replace(/\r\n/g, "\n"), eol, bom };
}

/** Writes LF text back in the file's own line ending, restoring its BOM. */
export function writeText(path, { text, eol = "\n", bom = false }) {
  const out = (bom ? "﻿" : "") + text.replace(/\n/g, eol);
  writeFileSync(path, out, "utf8");
}

// ---------------------------------------------------------------- CLI helpers

/** `--key value` and `--flag` into an object; positionals under `_`. */
export function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { opts[key] = next; i++; } else { opts[key] = true; }
    } else { opts._.push(a); }
  }
  return opts;
}

/** Prints one JSON error object on stderr and exits 1 (every script's error convention). */
export function fail(error, message, extra = {}) {
  process.stderr.write(JSON.stringify({ error, message, ...extra }) + "\n");
  process.exit(1);
}

/**
 * Runs the sibling `skills.mjs status --json` and returns `{ rows, reason }`. `rows === null` means
 * the status could not be determined, which callers must report rather than treat as "all clear".
 */
export function runSkillsStatus(root, { timeout = 5000 } = {}) {
  const script = join(dirname(fileURLToPath(import.meta.url)), "..", "skills.mjs");
  const r = spawnSync(process.execPath, [script, "status", "--json", "--root", root], { cwd: root, encoding: "utf8", timeout });
  if (r.error || r.status !== 0) return { rows: null, reason: "`node scripts/sdd/skills.mjs status --json` did not run" };
  try {
    const parsed = JSON.parse(r.stdout);
    const rows = Array.isArray(parsed) ? parsed : parsed?.entries ?? parsed?.result;
    return Array.isArray(rows) ? { rows, reason: null } : { rows: null, reason: "`node scripts/sdd/skills.mjs status --json` returned no entries" };
  } catch {
    return { rows: null, reason: "`node scripts/sdd/skills.mjs status --json` returned unparseable output" };
  }
}
