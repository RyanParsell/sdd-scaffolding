#!/usr/bin/env node
// The deterministic half of the sdd-skill-improve harvest.
// Every subcommand prints ONE JSON object to stdout — except `digest`, which prints plain text unless --json;
// errors are JSON on stderr with exit 1.
//   read-only:  scan [--id F-N[,F-N…]] | digest | patterns | seams | slug [--skill <name>] [--date YYMMDD] | sweep | parity | size
//   writing:    flips --decisions <file> | watermark --to F-N --date YYYY-MM-DD [--note <text>]
// Options: --root <repoRoot> (default: walk up to skills/sdd.config.json) --ledger <path> --no-fetch --today YYYY-MM-DD
// Ledger paths come from config repo.ledgers, plan dirs from repo.docs.plans / repo.docs.artifacts, the rest from
// harvest.*, sweep.*, skills.* and sizeBudgetBytes. Writes preserve each file's own line endings and assert their
// replacement counts (EDIT-MECHANISM).

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HARNESS_PROJECT_DIRS, fail as failWith, findRoot, loadConfig, parseArgs, readText, runSkillsStatus, sizeOf, stripCr, writeText } from "./lib/config.mjs";

const ENTRY_RE = /^### (F|T)-(\d+) — (.*)$/;
const STATUS_RE = /^\*\*Status:\*\* (Open|Resolved|Declined)\b/;
const FOUND_RE = /^\*\*Found:\*\* (\d{4}-\d{2}-\d{2})/;
const DATE_RE = /\b(20\d{2}-\d{2}-\d{2})\b/g;
const WM_LINE_RE = /\*\*Scan watermark:\*\*\s*`F-(\d+)`\s*·\s*(\d{4}-\d{2}-\d{2})/;
const WM_START = "<!-- SCAN-WATERMARK:START -->";
const WM_END = "<!-- SCAN-WATERMARK:END -->";
const LABEL_LINE_RE = /^\*\*[^*]+:\*\*/;

const HELP = `usage: harvest.mjs <scan|digest|patterns|seams|slug|sweep|parity|size|flips|watermark> [options]
  scan [--id F-N[,F-N…]]                open friction entries with the expiry gate applied
  digest                                one plain-text block per open entry (--json wraps it)
  patterns                              open entries grouped by skill · phase across ISO weeks
  seams                                 open PRs (via gh, when available) touching harvest.seamPaths
  slug [--skill <name>] [--date YYMMDD] the next unused branch letter for a harvest branch
  sweep                                 stale references in sweep.listing and unlisted tracked files
  parity                                skill mirrors vs source, plus skills.mjs status needsAttention
  size                                  skill sizes (CR-stripped bytes) against sizeBudgetBytes
  flips --decisions <file>              flip entries' Status and append a decision bullet (writes)
  watermark --to F-N --date YYYY-MM-DD [--note <text>]   advance the SCAN-WATERMARK block (writes)
  --root <dir>  --ledger <path>  --no-fetch  --today YYYY-MM-DD  --json  --help`;

// ---------------------------------------------------------------- helpers

function fail(message, extra = {}) {
  failWith("SDD_HARVEST_ERROR", message, extra);
}

function git(root, args, allowFail = false) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0 && !allowFail) fail(`git ${args.join(" ")} failed`, { stderr: r.stderr });
  return (r.stdout ?? "").trim();
}

function ghPath() {
  if (process.env.GH) return process.env.GH;
  const win = "C:\\Program Files\\GitHub CLI\\gh.exe";
  return existsSync(win) ? win : "gh";
}

function headOf(root) {
  return git(root, ["rev-parse", "--short", "HEAD"], true) || null;
}

function todayOf(opts) {
  return opts.today ?? new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function isoWeek(dateStr) {
  const d = new Date(Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10)));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- config facts

/** The config-derived facts every subcommand reads, resolved once. */
function facts(cfg) {
  const c = cfg.config;
  const repo = c.repo ?? {};
  const harvest = c.harvest ?? {};
  const harnesses = c.skills?.harnesses ?? [];
  return {
    defaultBranch: repo.defaultBranch ?? "main",
    featurePattern: repo.branches?.feature ?? "feature/{slug}",
    friction: repo.ledgers?.friction ?? "docs/logs/friction-log.md",
    testHealth: repo.ledgers?.testHealth ?? "docs/logs/test-health-log.md",
    planPaths: [repo.docs?.plans ?? "docs/plans", repo.docs?.artifacts ?? "docs/artifacts"],
    expiryDays: harvest.expiryDays ?? 30,
    patternWeeks: harvest.patternWeeks ?? 3,
    digestWhatChars: harvest.digestWhatChars ?? 700,
    slugPrefixes: harvest.slugPrefixes ?? ["sdd-skill-improve", "test-improve"],
    seamPaths: harvest.seamPaths ?? ["skills/"],
    sweep: c.sweep ?? null,
    skillsSource: c.skills?.source ?? "skills",
    projectSkills: c.skills?.project ?? [],
    mirrorDirs: harnesses.filter((h) => HARNESS_PROJECT_DIRS[h]).map((h) => HARNESS_PROJECT_DIRS[h].replace(/\\/g, "/")),
    sizeBudgetBytes: c.sizeBudgetBytes ?? {},
  };
}

// ---------------------------------------------------------------- ledger model

export function parseLedger(text) {
  const lines = text.split("\n");
  const entries = [];
  let cur = null;
  const flush = () => { if (cur) { cur.end = cur.start + cur.lines.length; entries.push(cur); } };
  for (let i = 0; i < lines.length; i++) {
    const m = ENTRY_RE.exec(lines[i]);
    if (m) {
      flush();
      const [skillPart, ...phaseParts] = m[3].split(" · ");
      const skill = skillPart.trim();
      const phase = phaseParts.join(" · ").split(" — ")[0].trim();
      cur = { kind: m[1], id: `${m[1]}-${m[2]}`, n: +m[2], title: m[3], skill, phase, start: i, lines: [lines[i]] };
    } else if (cur) {
      cur.lines.push(lines[i]);
    }
  }
  flush();
  for (const e of entries) {
    const body = e.lines.slice(1);
    const statusLines = body.filter((l) => STATUS_RE.test(l));
    e.statusCount = statusLines.length;
    e.status = statusLines.length ? STATUS_RE.exec(statusLines[0])[1] : null;
    const found = body.find((l) => FOUND_RE.test(l));
    e.found = found ? FOUND_RE.exec(found)[1] : null;
    const hIdx = body.findIndex((l) => l.startsWith("**Decision history:**"));
    e.historyForm = hIdx < 0 ? "missing" : /_none yet_/.test(body[hIdx]) ? "inline" : "bullets";
    const dates = new Set();
    for (const l of body) {
      if (FOUND_RE.test(l)) continue;
      for (const d of l.matchAll(DATE_RE)) dates.add(d[1]);
    }
    e.sightingDates = [...dates].sort();
    e.text = e.lines.join("\n");
  }
  return { lines, entries };
}

function malformed(entries) {
  return entries.filter((e) => e.statusCount !== 1 || !e.found || e.historyForm === "missing")
    .map((e) => ({ id: e.id, statusCount: e.statusCount, found: e.found, historyForm: e.historyForm }));
}

function watermarkOf(text) {
  const s = text.indexOf(WM_START);
  const e = text.indexOf(WM_END);
  if (s < 0 || e < s) return null;
  const m = WM_LINE_RE.exec(text.slice(s, e));
  return m ? { id: +m[1], date: m[2], blockStart: s, blockEnd: e } : null;
}

// ---------------------------------------------------------------- read-only subcommands

function cmdScan(root, cfg, opts) {
  const f = facts(cfg);
  const ledgerPath = resolve(root, opts.ledger ?? f.friction);
  const testPath = resolve(root, f.testHealth);
  let behind = null;
  if (!opts["no-fetch"]) {
    git(root, ["fetch", "origin"], true);
    const lr = git(root, ["rev-list", "--left-right", "--count", `HEAD...origin/${f.defaultBranch}`], true);
    if (lr) behind = +lr.split(/\s+/)[1];
  }
  if (!existsSync(ledgerPath)) fail(`friction ledger not found at ${ledgerPath}`);
  const { text } = readText(ledgerPath);
  const { entries } = parseLedger(text);
  const bad = malformed(entries);
  if (bad.length) fail("malformed entries — exactly one **Status:**, a **Found:** date and a **Decision history:** line are required", { malformed: bad });
  const wm = watermarkOf(text);
  if (!wm) fail("no parseable SCAN-WATERMARK block");
  const today = todayOf(opts);
  const open = entries.filter((e) => e.kind === "F" && e.status === "Open").map((e) => {
    const clock = e.n <= wm.id && e.found < wm.date ? wm.date : e.found;
    const age = daysBetween(clock, today);
    return { ...e, gatedClockDate: clock, gatedAgeDays: age, scanned: e.n <= wm.id, expirable: e.n <= wm.id && age > f.expiryDays };
  });
  const tOpen = existsSync(testPath)
    ? parseLedger(readText(testPath).text).entries.filter((e) => e.kind === "T" && e.status === "Open").length
    : null;
  // --id narrows only `entries`; every other field stays computed over the full open set
  let listed = open;
  if (opts.id !== undefined) {
    const ids = (opts.id === true ? "" : String(opts.id)).split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length) fail("scan --id requires F-N[,F-N…]");
    const openIds = new Set(open.map((e) => e.id));
    const unknown = ids.filter((id) => !openIds.has(id));
    if (unknown.length) fail(`--id names entries that are not open: ${unknown.join(", ")}`, { unknown });
    const wanted = new Set(ids);
    listed = open.filter((e) => wanted.has(e.id));
  }
  const fIds = entries.filter((e) => e.kind === "F").map((e) => e.n);
  return {
    today, head: headOf(root), behindDefaultBranch: behind, defaultBranch: f.defaultBranch, watermark: { id: `F-${wm.id}`, date: wm.date },
    maxId: fIds.length ? Math.max(...fIds) : null,
    openCount: open.length, tOpenCount: tOpen,
    expired: open.filter((e) => e.expirable).map((e) => ({ id: e.id, found: e.found, gatedAgeDays: e.gatedAgeDays, title: e.title })),
    ineligibleAboveWatermark: open.filter((e) => !e.scanned).length,
    entries: listed.map(({ lines, start, end, ...rest }) => rest),
  };
}

// The text after `**<label>:**` up to the next `**Label:**` line, within one entry's own text.
function labelled(text, label) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.startsWith(`**${label}:**`));
  if (i < 0) return "";
  const out = [lines[i].slice(label.length + 5)];
  for (let j = i + 1; j < lines.length && !LABEL_LINE_RE.test(lines[j]); j++) out.push(lines[j]);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function cmdDigest(root, cfg, opts) {
  const { id, ...scanOpts } = opts; // the digest always covers the whole open set scan reports
  const scan = cmdScan(root, cfg, scanOpts);
  const max = facts(cfg).digestWhatChars;
  const digest = scan.entries.map((e) => {
    const last = e.sightingDates.length ? e.sightingDates[e.sightingDates.length - 1] : "";
    return [
      `=== ${e.id} | ${e.skill} · ${e.phase} | found ${e.found} | sightings ${e.sightingDates.length} (last ${last}) | age ${e.gatedAgeDays}`,
      `TITLE: ${e.title}`,
      `WHAT: ${[...labelled(e.text, "What happened")].slice(0, max).join("")}`,
      `REC: ${labelled(e.text, "Recommendation")}`,
    ].join("\n");
  }).join("\n\n") + "\n";
  return opts.json ? { head: scan.head, openCount: scan.openCount, digest } : digest;
}

function cmdPatterns(root, cfg, opts) {
  const scan = cmdScan(root, cfg, { ...opts, "no-fetch": true });
  const patternWeeks = facts(cfg).patternWeeks;
  const groups = new Map();
  for (const e of scan.entries) {
    const key = `${e.skill} · ${e.phase.split(" (")[0]}`;
    const g = groups.get(key) ?? { key, ids: [], weeks: new Set(), dates: new Set() };
    g.ids.push(e.id);
    for (const d of [e.found, ...e.sightingDates]) { if (d) { g.weeks.add(isoWeek(d)); g.dates.add(d); } }
    groups.set(key, g);
  }
  const all = [...groups.values()].map((g) => ({ key: g.key, ids: g.ids, weeks: [...g.weeks].sort(), dates: [...g.dates].sort() }))
    .sort((a, b) => b.weeks.length - a.weeks.length || b.ids.length - a.ids.length);
  return { head: scan.head, patternWeeks, recurring: all.filter((g) => g.weeks.length >= patternWeeks), groups: all };
}

/** Open PRs through gh; `{ prs: null, reason }` when gh is absent or fails, so seams degrades instead of exiting. */
function ghOpenPrs(root) {
  const gh = spawnSync(ghPath(), ["pr", "list", "--state", "open", "--json", "number,headRefName,title"], { cwd: root, encoding: "utf8" });
  if (gh.error) return { prs: null, reason: `gh could not start (${gh.error.code ?? gh.error.message})` };
  if (gh.status !== 0) return { prs: null, reason: `gh pr list failed: ${(gh.stderr ?? "").trim().split("\n")[0] || `exit ${gh.status}`}` };
  try { return { prs: JSON.parse(gh.stdout || "[]"), reason: null }; } catch { return { prs: null, reason: "gh pr list returned unparseable output" }; }
}

// listPrs is injectable so a test can exercise seams without a GitHub remote; it may return an array or { prs, reason }
function cmdSeams(root, cfg, opts, listPrs = ghOpenPrs) {
  const f = facts(cfg);
  if (!opts["no-fetch"]) git(root, ["fetch", "origin"], true);
  const head = headOf(root);
  const listed = listPrs(root);
  const { prs, reason } = Array.isArray(listed) ? { prs: listed, reason: null } : listed;
  const available = Array.isArray(prs);
  const seams = (prs ?? []).map((pr) => {
    const files = git(root, ["diff", "--name-only", `${f.defaultBranch}...origin/${pr.headRefName}`, "--", ...f.seamPaths], true);
    return { pr: pr.number, branch: pr.headRefName, title: pr.title, overlapping: files ? files.split("\n") : [] };
  });
  const maxIds = [f.defaultBranch, ...(prs ?? []).map((p) => p.headRefName)].map((b) => {
    const t = git(root, ["show", `origin/${b}:${f.friction}`], true);
    const ids = [...t.matchAll(/^### F-(\d+)/gm)].map((m) => +m[1]);
    return { ref: b, maxId: ids.length ? Math.max(...ids) : null };
  });
  return {
    head, ghAvailable: available, ...(available ? {} : { reason }),
    openPrs: available ? prs.length : null, seams,
    maxFrictionId: Math.max(...maxIds.map((m) => m.maxId ?? 0)), perRef: maxIds,
  };
}

function cmdSlug(root, cfg, opts) {
  const f = facts(cfg);
  const skill = opts.skill ?? f.slugPrefixes[0] ?? "sdd-skill-improve";
  const d = new Date();
  const date = opts.date ?? `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const re = new RegExp(`(?:${f.slugPrefixes.join("|")})-${date}([a-z]+)`, "g");
  const sources = [
    git(root, ["branch", "--format=%(refname:short)"], true),
    git(root, ["branch", "-r", "--format=%(refname:lstrip=3)"], true),
    f.planPaths.map((p) => existsSync(join(root, p)) ? readdirSync(join(root, p)).join("\n") : "").join("\n"),
    git(root, ["log", "--all", "--format=", "--name-only", "--diff-filter=A", "--", ...f.planPaths.map((p) => `${p}/*`)], true),
  ].join("\n");
  const used = new Set([...sources.matchAll(re)].map((m) => m[1]));
  const letter = "abcdefghijklmnopqrstuvwxyz".split("").find((l) => !used.has(l)) ?? null;
  return { date, used: [...used].sort(), letter, branch: letter ? f.featurePattern.replace("{slug}", `${skill}-${date}${letter}`) : null };
}

function cmdSweep(root, cfg) {
  const f = facts(cfg);
  if (!f.sweep?.listing) fail("config sweep.listing is not set");
  const listingPath = resolve(root, f.sweep.listing);
  if (!existsSync(listingPath)) fail(`sweep listing not found at ${listingPath}`);
  const listing = readText(listingPath).text;
  const ext = (f.sweep.extensions ?? ["md"]).join("|");
  const refs = new Set([...listing.matchAll(new RegExp("`([A-Za-z0-9_./-]+\\.(?:" + ext + "))`", "g"))].map((m) => m[1]));
  const stale = [...refs].filter((x) => !existsSync(join(root, x))).sort();
  const tracked = git(root, ["ls-files", ...(f.sweep.scope ?? [])], true).split("\n").filter(Boolean);
  const missing = tracked.filter((x) => !listing.includes(x.split("/").pop())).sort();
  return { stale, missing };
}

function cmdParity(root, cfg) {
  const f = facts(cfg);
  const rows = [];
  for (const s of f.projectSkills) {
    const srcPath = join(root, f.skillsSource, s, "SKILL.md");
    if (!existsSync(srcPath)) continue;
    const src = stripCr(readFileSync(srcPath, "utf8"));
    const version = (/^version:\s*(\S+)/m.exec(src) ?? [])[1] ?? null;
    for (const d of f.mirrorDirs) {
      const m = join(root, d, s, "SKILL.md");
      if (!existsSync(m)) { rows.push({ skill: s, mirror: `${d}/${s}/SKILL.md`, version: null, same: false, missing: true, expectedVersion: version }); continue; }
      const mir = stripCr(readFileSync(m, "utf8"));
      rows.push({ skill: s, mirror: `${d}/${s}/SKILL.md`, version: (/^version:\s*(\S+)/m.exec(mir) ?? [])[1] ?? null, same: mir === src, expectedVersion: version });
    }
  }
  const st = runSkillsStatus(root);
  const needsAttention = st.rows === null ? null : st.rows.filter((r) => r?.needsAttention).length;
  return {
    ok: rows.every((r) => r.same && r.version === r.expectedVersion) && (needsAttention === 0 || needsAttention === null),
    needsAttention, ...(st.rows === null ? { statusUnavailable: st.reason } : {}), rows,
  };
}

function cmdSize(root, cfg) {
  const f = facts(cfg);
  const skills = {};
  for (const [s, budget] of Object.entries(f.sizeBudgetBytes)) {
    const p = join(root, f.skillsSource, s, "SKILL.md");
    const bytes = existsSync(p) ? sizeOf(readFileSync(p, "utf8")) : null;
    const unset = !(budget > 0); // 0 means "set at first deploy": measured, never over
    skills[s] = { bytes, budget, unset, delta: bytes === null || unset ? null : bytes - budget, overBudget: bytes !== null && !unset && bytes > budget };
  }
  return { ok: Object.values(skills).every((s) => !s.overBudget), skills };
}

// ---------------------------------------------------------------- writing subcommands (impl runs these)

function cmdFlips(root, cfg, opts) {
  if (!opts.decisions || opts.decisions === true) fail("flips requires --decisions <file>");
  const decisions = JSON.parse(readFileSync(resolve(root, opts.decisions), "utf8"));
  const list = Array.isArray(decisions) ? decisions : decisions.flips;
  const ledgerPath = resolve(root, opts.ledger ?? facts(cfg).friction);
  const file = readText(ledgerPath);
  const { lines, entries } = parseLedger(file.text);
  const before = entries.filter((e) => e.kind === "F" && e.status === "Open").length;
  const byId = new Map(entries.map((e) => [e.id, e]));
  const edits = [];
  for (const d of list) {
    const e = byId.get(d.id);
    if (!e) fail(`unknown entry ${d.id}`);
    if (e.status !== "Open") fail(`${d.id} is not Open (${e.status})`);
    if (e.statusCount !== 1) fail(`${d.id} carries ${e.statusCount} **Status:** lines`);
    edits.push({ e, d });
  }
  // apply from the bottom up so earlier line numbers stay valid
  edits.sort((a, b) => b.e.start - a.e.start);
  for (const { e, d } of edits) {
    const span = lines.slice(e.start, e.end);
    const sIdx = span.findIndex((l) => STATUS_RE.test(l));
    span[sIdx] = `**Status:** ${d.status}`;
    const hIdx = span.findIndex((l) => l.startsWith("**Decision history:**"));
    const bullet = `- ${d.historyBullet}`;
    if (/_none yet_/.test(span[hIdx])) {
      span.splice(hIdx, 1, "**Decision history:**", bullet);
    } else {
      let last = hIdx;
      for (let i = hIdx + 1; i < span.length; i++) { if (span[i].startsWith("- ") || span[i].startsWith("  ")) last = i; else if (span[i].trim() === "") break; else last = i; }
      span.splice(last + 1, 0, bullet);
    }
    lines.splice(e.start, e.end - e.start, ...span);
  }
  const out = { ...file, text: lines.join("\n") };
  writeText(ledgerPath, out);
  // verify per entry after the write
  const after = parseLedger(readText(ledgerPath).text);
  const verified = [];
  for (const { d } of edits) {
    const e = after.entries.find((x) => x.id === d.id);
    if (!e || e.statusCount !== 1 || !e.text.includes(`**Status:** ${d.status}`) || !e.text.includes(d.historyBullet)) fail(`post-write verification failed for ${d.id}`);
    verified.push(d.id);
  }
  return { flipped: verified, openBefore: before, openAfter: after.entries.filter((e) => e.kind === "F" && e.status === "Open").length, eol: file.eol === "\r\n" ? "CRLF" : "LF" };
}

function cmdWatermark(root, cfg, opts) {
  if (!opts.to || !opts.date || opts.to === true || opts.date === true) fail("watermark requires --to F-N --date YYYY-MM-DD [--note <text>]");
  const ledgerPath = resolve(root, opts.ledger ?? facts(cfg).friction);
  const file = readText(ledgerPath);
  const wm = watermarkOf(file.text);
  if (!wm) fail("no parseable SCAN-WATERMARK block");
  const to = +String(opts.to).replace(/^F-/, "");
  const maxId = Math.max(...[...file.text.matchAll(/^### F-(\d+)/gm)].map((m) => +m[1]));
  if (to > maxId) fail(`watermark F-${to} exceeds the highest entry F-${maxId}`);
  const block = [
    "", `**Scan watermark:** \`F-${to}\` · ${opts.date}`, "",
    "Every `F-N` at or below this id has now been judged by a harvest and is eligible under the age gate",
    "above if it remains Open; everything above it has not yet been judged and cannot expire. Ids are",
    "**global and monotonic**, so this one number stands in for a per-entry field, and any new entry is",
    "necessarily above the mark.", "",
    `Advanced from the prior watermark \`F-${wm.id}\` · ${wm.date}${opts.note && opts.note !== true ? ` — ${opts.note}` : "."}`, "",
  ].join("\n");
  const text = file.text.slice(0, wm.blockStart + WM_START.length) + block + file.text.slice(wm.blockEnd);
  writeText(ledgerPath, { ...file, text });
  const check = watermarkOf(readText(ledgerPath).text);
  if (!check || check.id !== to || check.date !== opts.date) fail("post-write verification failed for the watermark block");
  return { from: `F-${wm.id} · ${wm.date}`, to: `F-${to} · ${opts.date}` };
}

// ---------------------------------------------------------------- main

export const COMMANDS = { scan: cmdScan, digest: cmdDigest, patterns: cmdPatterns, seams: cmdSeams, slug: cmdSlug, sweep: cmdSweep, parity: cmdParity, size: cmdSize, flips: cmdFlips, watermark: cmdWatermark };

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const [cmd] = opts._;
  if (opts.help) { process.stdout.write(HELP + "\n"); return; }
  if (!cmd || !COMMANDS[cmd]) fail(`usage: harvest.mjs <${Object.keys(COMMANDS).join("|")}> [--json] [--root <dir>]`, { help: HELP });
  let cfg;
  try {
    cfg = loadConfig(opts.root ? resolve(opts.root) : findRoot(process.cwd()));
  } catch (error) { fail(error.message); }
  const result = COMMANDS[cmd](cfg.root, cfg, opts);
  process.stdout.write(typeof result === "string" ? result : JSON.stringify(result, null, 2) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
