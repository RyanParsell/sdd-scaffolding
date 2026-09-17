#!/usr/bin/env node
// The skill installer: copies the project skills (config `skills.project`) from the source dir (config
// `skills.source`) into each harness's project-scope skill dir, and reports what every harness dir holds.
//   node scripts/sdd/skills.mjs install [--harness claude,copilot,codex|all] [--yes] [--json] [--root <dir>]
//   node scripts/sdd/skills.mjs status [--json] [--root <dir>] [--home <dir>]
// install validates every SKILL.md before writing anything (all-or-nothing), then deletes and re-copies each
// skill dir. status classifies each deployed skill dir: ok | stale | misplaced | orphaned | foreign.
// One JSON object on stdout with --json; errors are JSON on stderr with exit 1.

import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, rmdirSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { HARNESSES, HARNESS_PROJECT_DIRS, HARNESS_USER_DIRS, fail, findRoot, loadConfig, parseArgs, stripCr } from "./lib/config.mjs";

export const STATES = ["ok", "stale", "misplaced", "orphaned", "foreign"];
const SKILL_MARKER = "SKILL.md";
const SKIP_DIRS = [".git", "node_modules"];
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;

const HELP = `usage: skills.mjs <install|status> [options]
  install   validate skills/<name>/SKILL.md for every skill in config skills.project, then delete-and-recopy
            each into the project skill dir of each harness (.claude/skills, .github/skills, .agents/skills)
            --harness <a,b|all>  harnesses to write (default: config skills.harnesses)
            --yes                write without confirmation (required when stdin is not a terminal)
  status    list every skill dir found in each harness's project and user-scope dir with its state:
            ok | stale (ours, differs from source) | misplaced (ours at user scope) | orphaned (retired name) | foreign
  --root <dir>   repo root (default: walk up to skills/sdd.config.json)
  --home <dir>   home directory for user-scope dirs (default: $SDD_SKILLS_HOME, else the OS home)
  --json         print one JSON object on stdout
  --help         this text`;

// ---------------------------------------------------------------- frontmatter

class FrontmatterError extends Error {}

function unquoteSingle(raw, field) {
  // 'it''s' → it's; the closing quote may be followed only by whitespace or a comment
  let out = "";
  for (let i = 1; i < raw.length; i++) {
    const c = raw[i];
    if (c !== "'") { out += c; continue; }
    if (raw[i + 1] === "'") { out += "'"; i++; continue; }
    const suffix = raw.slice(i + 1).trimStart();
    if (suffix.length === 0 || suffix.startsWith("#")) return out;
    throw new FrontmatterError(`field '${field}' contains invalid YAML single-quote escaping.`);
  }
  throw new FrontmatterError(`field '${field}' contains an unterminated quoted value.`);
}

function unquoteDouble(raw, field) {
  let out = "";
  for (let i = 1; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\") {
      const n = raw[i + 1];
      const map = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\", "/": "/", " ": " " };
      if (n === undefined) throw new FrontmatterError(`field '${field}' contains a dangling escape.`);
      out += map[n] ?? n;
      i++;
      continue;
    }
    if (c === '"') {
      const suffix = raw.slice(i + 1).trimStart();
      if (suffix.length === 0 || suffix.startsWith("#")) return out;
      throw new FrontmatterError(`field '${field}' has text after its closing quote.`);
    }
    out += c;
  }
  throw new FrontmatterError(`field '${field}' contains an unterminated quoted value.`);
}

function plainScalar(raw, field) {
  if (raw.includes(" #")) throw new FrontmatterError(`plain field '${field}' contains a YAML comment marker; quote the value.`);
  if (raw === "~" || raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

/**
 * A minimal YAML mapping parser for SKILL.md frontmatter: `key: value` lines with plain, single- or
 * double-quoted scalars, `>`/`|` block scalars and indented plain continuations. Comments and blank
 * lines are skipped; duplicate keys, non-mapping lines and bad quoting throw a FrontmatterError.
 */
export function parseFrontmatterLines(lines) {
  const map = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) { i++; continue; }
    if (/^\s/.test(line)) throw new FrontmatterError(`frontmatter must be a YAML mapping of field names to values (unexpected indented line ${i + 1}).`);
    const m = /^([A-Za-z0-9_.-]+)\s*:(?:\s+(.*))?$/.exec(line);
    if (!m) throw new FrontmatterError(`frontmatter must be a YAML mapping of field names to values (line ${i + 1}: ${JSON.stringify(line)}).`);
    const [, key, rawValue = ""] = m;
    if (Object.prototype.hasOwnProperty.call(map, key)) throw new FrontmatterError(`frontmatter contains invalid YAML (duplicate key '${key}').`);
    const raw = rawValue.trim();
    i++;
    const continuation = [];
    while (i < lines.length && /^\s+\S/.test(lines[i])) { continuation.push(lines[i].trim()); i++; }
    if (raw === ">" || raw === "|" || raw === ">-" || raw === "|-") {
      map[key] = raw.startsWith(">") ? continuation.join(" ") : continuation.join("\n");
    } else if (raw.startsWith("'")) {
      if (continuation.length) throw new FrontmatterError(`field '${key}' contains an unterminated quoted value.`);
      map[key] = unquoteSingle(raw, key);
    } else if (raw.startsWith('"')) {
      if (continuation.length) throw new FrontmatterError(`field '${key}' contains an unterminated quoted value.`);
      map[key] = unquoteDouble(raw, key);
    } else if (raw.startsWith("[") || raw.startsWith("{")) {
      map[key] = raw; // flow collections are carried verbatim; the validator only needs name/description
    } else {
      const text = [raw, ...continuation].filter(Boolean).join(" ");
      map[key] = raw.startsWith("#") ? "" : plainScalar(text, key);
    }
  }
  return map;
}

/** Splits a SKILL.md into its frontmatter lines, or throws naming which `---` is missing. */
export function frontmatterLines(text) {
  const lines = stripCr(text).replace(/^﻿/, "").split("\n");
  if (lines.length < 3 || lines[0] !== "---") throw new FrontmatterError("YAML frontmatter must start on the first line with '---'.");
  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end < 0) throw new FrontmatterError("YAML frontmatter is missing its closing '---'.");
  return lines.slice(1, end);
}

/** Returns null when the SKILL.md at `skillDir` is valid for `expectedName`, else the problem. */
export function validateSkill(skillDir, expectedName) {
  const marker = join(skillDir, SKILL_MARKER);
  if (!existsSync(marker)) return `${marker} is missing.`;
  let manifest;
  try {
    manifest = parseFrontmatterLines(frontmatterLines(readFileSync(marker, "utf8")));
  } catch (error) {
    if (error instanceof FrontmatterError) return error.message;
    throw error;
  }
  const name = manifest.name;
  if (typeof name !== "string" || !name.trim()) return "required field 'name' must be a nonblank string.";
  if (name.length > MAX_NAME || !NAME_RE.test(name)) return "name must be 1-64 lowercase letters, numbers, or single hyphens.";
  if (name !== expectedName) return `name '${name}' must match its directory name '${expectedName}'.`;
  const description = manifest.description;
  if (typeof description !== "string" || !description.trim()) return "required field 'description' must be a nonblank string.";
  if (description.length < 1 || description.length > MAX_DESCRIPTION) return `description must be 1-1024 characters (found ${description.length}).`;
  return null;
}

/** The description of a deployed skill dir, or null when it has none that parses (foreign skills included). */
export function readDescription(skillDir) {
  try {
    const value = parseFrontmatterLines(frontmatterLines(readFileSync(join(skillDir, SKILL_MARKER), "utf8"))).description;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- file primitives

function isSkipped(rel) {
  return SKIP_DIRS.some((d) => rel === d || rel.startsWith(d + sep) || rel.startsWith(d + "/"));
}

function listFiles(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(base, full);
    if (isSkipped(rel)) continue;
    if (entry.isDirectory()) listFiles(full, base, out);
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function clearReadOnly(path) {
  try { chmodSync(path, 0o666); } catch { /* best effort */ }
}

/**
 * Deletes a deployed skill dir that may be read-only (cloud-synced profiles) or a link (junction, symlink,
 * cloud placeholder): a link is removed as a link and never followed, so its target survives.
 */
export function forceDelete(dir) {
  let info;
  try { info = lstatSync(dir); } catch { return; }
  if (info.isSymbolicLink()) {
    try { unlinkSync(dir); } catch { rmdirSync(dir); }
    return;
  }
  const clear = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      clearReadOnly(full);
      if (entry.isDirectory() && !lstatSync(full).isSymbolicLink()) clear(full);
    }
  };
  clearReadOnly(dir);
  clear(dir);
  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
}

function copyDir(src, dest) {
  for (const rel of listFiles(src)) {
    const target = join(dest, rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(src, rel), target);
    clearReadOnly(target);
  }
}

/** True when the deployed dir has the same (skip-filtered) file set as the source with identical CR-stripped content. */
export function dirsMatch(src, dest) {
  const srcFiles = listFiles(src).map((r) => r.replace(/\\/g, "/")).sort();
  const destFiles = listFiles(dest).map((r) => r.replace(/\\/g, "/")).sort();
  if (srcFiles.length !== destFiles.length || srcFiles.some((f, i) => f !== destFiles[i])) return false;
  for (const rel of srcFiles) {
    // latin1 keeps every byte as one code unit, so this is a byte comparison with only CR removed
    const a = stripCr(readFileSync(join(src, rel)).toString("latin1"));
    const b = stripCr(readFileSync(join(dest, rel)).toString("latin1"));
    if (a !== b) return false;
  }
  return true;
}

// ---------------------------------------------------------------- paths

export function projectSkillsDir(root, harness) {
  return join(root, HARNESS_PROJECT_DIRS[harness]);
}

export function userSkillsDir(home, harness) {
  return join(home, HARNESS_USER_DIRS[harness]);
}

function parseHarnesses(value, fallback) {
  if (value === undefined) return [...fallback];
  if (value === true) throw new Error("--harness requires a value (claude,copilot,codex or all)");
  const tokens = String(value).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out = [];
  for (const token of tokens) {
    if (token === "all") { out.push(...HARNESSES); continue; }
    if (!HARNESSES.includes(token)) throw new Error(`unknown harness '${token}' — use ${HARNESSES.join(", ")} or all`);
    out.push(token);
  }
  return [...new Set(out)];
}

function skillsSource(cfg) {
  return resolve(cfg.root, cfg.config.skills?.source ?? "skills");
}

// ---------------------------------------------------------------- install

/**
 * Validates every project skill, then writes each into the project dir of every selected harness.
 * Retired names (config `skills.retired`) still deployed with a SKILL.md are swept out. Returns
 * `{ harnesses: [{ harness, dir, installed: [...], removed: [...] }] }`; throws before writing when a
 * source is invalid, so a failure writes nothing.
 */
export function install(cfg, { harnesses } = {}) {
  const config = cfg.config;
  const names = config.skills?.project ?? [];
  if (!Array.isArray(names) || names.length === 0) throw new Error("config skills.project lists no skills — nothing installed.");
  const source = skillsSource(cfg);
  if (!existsSync(source)) throw new Error(`skills source directory not found at '${source}' — nothing installed.`);
  const seen = new Set();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error(`duplicate skill name '${name}' in skills.project — nothing installed.`);
    seen.add(key);
    const dir = join(source, name);
    if (!existsSync(join(dir, SKILL_MARKER))) throw new Error(`the '${name}' skill was not found under '${source}' — nothing installed.`);
    const error = validateSkill(dir, name);
    if (error) throw new Error(`invalid skill manifest '${join(dir, SKILL_MARKER)}': ${error} Nothing installed.`);
  }
  const retired = config.skills?.retired ?? [];
  const selected = harnesses ?? config.skills?.harnesses ?? [];
  const results = [];
  for (const harness of selected) {
    const dir = projectSkillsDir(cfg.root, harness);
    const installed = [];
    const removed = [];
    for (const name of names) {
      const dest = join(dir, name);
      if (existsSync(dest) || isLink(dest)) forceDelete(dest);
      copyDir(join(source, name), dest);
      installed.push({ name, scope: "project", destination: dest });
    }
    for (const name of retired) {
      const dest = join(dir, name);
      if (!existsSync(join(dest, SKILL_MARKER))) continue;
      forceDelete(dest);
      removed.push({ name, scope: "project", destination: dest });
    }
    results.push({ harness, dir, installed, removed });
  }
  return { source, skills: names, harnesses: results };
}

function isLink(path) {
  try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
}

// ---------------------------------------------------------------- status

function classify(name, deployedDir, scope, owned, retired) {
  if (retired.has(name.toLowerCase())) return "orphaned";
  const src = owned.get(name.toLowerCase());
  if (src === undefined) return "foreign";
  if (scope !== "project") return "misplaced";
  return dirsMatch(src, deployedDir) ? "ok" : "stale";
}

function addScope(entries, harness, scope, dir, owned, retired) {
  if (!existsSync(dir)) return;
  let subs;
  try { subs = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of subs) {
    const sub = join(dir, entry.name);
    let isDir = entry.isDirectory();
    if (entry.isSymbolicLink()) { try { isDir = statSync(sub).isDirectory(); } catch { isDir = false; } }
    if (!isDir || !existsSync(join(sub, SKILL_MARKER))) continue;
    const state = classify(entry.name, sub, scope, owned, retired);
    entries.push({ harness, scope, destination: sub, name: entry.name, present: true, state, needsAttention: ["stale", "misplaced", "orphaned"].includes(state) });
  }
}

/** Every skill dir in each harness's project and user-scope dir, classified against the tracked source. */
export function status(cfg, { home = homedir() } = {}) {
  const config = cfg.config;
  const source = skillsSource(cfg);
  const owned = new Map();
  for (const name of config.skills?.project ?? []) {
    const dir = join(source, name);
    if (existsSync(join(dir, SKILL_MARKER))) owned.set(name.toLowerCase(), dir);
  }
  const retired = new Set((config.skills?.retired ?? []).map((n) => n.toLowerCase()));
  const entries = [];
  for (const harness of HARNESSES) {
    addScope(entries, harness, "user", userSkillsDir(home, harness), owned, retired);
    addScope(entries, harness, "project", projectSkillsDir(cfg.root, harness), owned, retired);
  }
  return { root: cfg.root, entries, needsAttention: entries.filter((e) => e.needsAttention).length };
}

// ---------------------------------------------------------------- CLI

function renderInstall(result) {
  const lines = [`installed ${result.skills.length} skill(s) into ${result.harnesses.length} harness(es): ${result.harnesses.map((h) => h.harness).join(", ")}`];
  for (const h of result.harnesses) {
    lines.push(`  ${h.harness}:`);
    for (const item of h.installed) lines.push(`    - ${item.name} (${item.scope}) -> ${item.destination}`);
    for (const item of h.removed) lines.push(`    - removed ${item.name} (retired, ${item.scope}) <- ${item.destination}`);
  }
  return lines.join("\n");
}

const LABELS = { ok: "up to date", stale: "modified", misplaced: "misplaced", orphaned: "retired", foreign: "not ours" };

function renderStatus(result) {
  if (result.entries.length === 0) return "No skills installed in any harness dir. Install with `node scripts/sdd/skills.mjs install --yes`.";
  const lines = result.entries.map((e) => `${e.harness.padEnd(8)} ${e.scope.padEnd(8)} ${e.name.padEnd(24)} ${LABELS[e.state] ?? e.state}`);
  const attention = result.entries.filter((e) => e.needsAttention);
  if (attention.length) {
    lines.push(`${attention.length} need attention; ${result.entries.length - attention.length} up to date or not ours.`);
    if (attention.some((e) => e.state === "misplaced")) lines.push("misplaced: reinstalling will NOT fix these — the installer never writes that path. Delete the stray dir so resolution falls through to the project copy.");
    if (attention.some((e) => e.state === "stale" || e.state === "orphaned")) lines.push("stale/orphaned: run `node scripts/sdd/skills.mjs install --yes` to refresh and prune.");
  }
  return lines.join("\n");
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await new Promise((done) => rl.question(`${question} [y/N] `, done));
    return /^y(es)?$/i.test(answer.trim());
  } finally { rl.close(); }
}

export async function runCli(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const [command] = opts._;
  if (opts.help || !command) { process.stdout.write(HELP + "\n"); return opts.help ? 0 : 1; }
  if (!["install", "status"].includes(command)) fail("SKILLS_ERROR", `unknown command '${command}'`, { usage: HELP.split("\n")[0] });
  let cfg;
  try {
    cfg = loadConfig(opts.root ? resolve(opts.root) : findRoot(process.cwd()));
  } catch (error) { fail("SKILLS_ERROR", error.message); }
  if (command === "status") {
    const home = typeof opts.home === "string" ? opts.home : process.env.SDD_SKILLS_HOME;
    const result = status(cfg, { home: home ? resolve(home) : homedir() });
    process.stdout.write(opts.json ? JSON.stringify(result, null, 2) + "\n" : renderStatus(result) + "\n");
    return 0;
  }
  let harnesses;
  try { harnesses = parseHarnesses(opts.harness, cfg.config.skills?.harnesses ?? []); } catch (error) { fail("SKILLS_ERROR", error.message); }
  if (harnesses.length === 0) fail("SKILLS_ERROR", "no harness selected — pass --harness or set skills.harnesses in the config");
  if (!opts.yes) {
    if (!process.stdin.isTTY) fail("SKILLS_CONFIRM_REQUIRED", "Refusing to write skills without --yes in non-interactive mode.");
    if (!(await confirm(`Install ${(cfg.config.skills?.project ?? []).length} skill(s) into the ${harnesses.join(", ")} harness dir(s) under ${cfg.root}?`))) {
      process.stdout.write(opts.json ? JSON.stringify({ cancelled: true }) + "\n" : "Install cancelled.\n");
      return 0;
    }
  }
  let result;
  try { result = install(cfg, { harnesses }); } catch (error) { fail("SKILLS_ERROR", error.message); }
  process.stdout.write(opts.json ? JSON.stringify(result, null, 2) + "\n" : renderInstall(result) + "\n");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().then((code) => { process.exitCode = code; }, (error) => fail("SKILLS_ERROR", String(error?.stack ?? error)));
}
