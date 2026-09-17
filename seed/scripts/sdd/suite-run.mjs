#!/usr/bin/env node
// The suite runner with a parsed verdict. Runs config repo.commands.build, then repo.commands.test, and parses
// the output with the adapter named by repo.testRunner (dotnet | vitest | generic).
// Prints ONE JSON object to stdout; errors are JSON on stderr with exit 1.
//   node scripts/sdd/suite-run.mjs [--baseline] [--filter "<expr>"] [--expect-total <N>] [--base <ref>]
//        [--stop-processes] [--root <dir>] --json
// Order: (optionally) stop this clone's processes by executable path → build → choose the command → test → parse.
// Verdict precedence: BUILD_FAILED > RUNNER_TERMINATED > TESTHOST_FAILED > ZERO_MATCH > DENOMINATOR_MISMATCH > RED > GREEN

import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_RUNNERS, fail as failWith, findRoot, loadConfig, parseArgs } from "./lib/config.mjs";

const RUN_RE = /^\s*Test run for (.+?\.dll)\b/;
const SUMMARY_RE = /^\s*(Passed|Failed)!\s+-\s+Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+),\s*Total:\s*(\d+),.*\s-\s+(\S+\.dll)\b/;
const ZERO_RE = /^\s*No test matches the given testcase filter .* in (.+?\.dll)\s*$/;
const TESTHOST_RE = /Testhost process for source/;

const HELP = `usage: suite-run.mjs [--baseline] [--filter "<expr>"] [--expect-total <N>] [--base <ref>] [--stop-processes] [--root <dir>] --json
  Runs config repo.commands.build, then repo.commands.test (or repo.commands.docTests when --baseline finds no
  source/test change), and parses the result with the repo.testRunner adapter.
  --baseline          narrow by the paths changed against --base (default origin/<repo.defaultBranch>):
                      no repo.sourceGlobs/testGlobs match → run repo.commands.docTests only
  --filter <expr>     run the test command with this filter (repo.commands.testFilter with {filter} substituted,
                      or --filter "<expr>" appended)
  --expect-total <N>  DENOMINATOR_MISMATCH unless the parsed total equals N
  --stop-processes    first stop processes whose executable lies under the repo root (never global tool dirs)
  --root <dir>        repo root (default: walk up to skills/sdd.config.json)
  --json              print one JSON object on stdout (the default output)
  --help              this text`;

// ---------------------------------------------------------------- helpers

function fail(message, extra = {}) {
  failWith("SUITE_RUN_ERROR", message, extra);
}

function gitOut(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
}

function dllName(path) { return path.split(/[\\/]/).pop(); }

function normalizePath(p, platform) {
  const n = String(p).replace(/\\/g, "/").replace(/\/+$/, "");
  return platform === "win32" ? n.toLowerCase() : n;
}

function isUnder(p, root) { return p === root || p.startsWith(root + "/"); }

/** Directories under the home dir where globally installed tools live; never this clone's processes. */
export function globalToolDirs(home = homedir()) {
  return [
    join(home, ".dotnet", "tools"),
    join(home, ".npm"),
    join(home, ".npm-global"),
    join(home, "AppData", "Roaming", "npm"),
    join(home, ".cargo", "bin"),
    join(home, ".local", "bin"),
    join(home, "go", "bin"),
  ];
}

// ---------------------------------------------------------------- pure functions (tested)

/** A minimal glob → RegExp: `**` spans directories, `*` and `?` stay within one segment. */
export function globToRegExp(glob) {
  let re = "";
  const g = String(glob).replace(/\\/g, "/");
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        i++;
        if (g[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(path, globs) {
  const p = String(path).replace(/\\/g, "/");
  return (globs ?? []).some((g) => globToRegExp(g).test(p));
}

// A process is this clone's when its executable lies under repoRoot and under no exclude root.
// Accepts Win32_Process rows ({ProcessId, ExecutablePath}) or {pid, path}; a null path is never selected.
export function selectCloneProcesses(list, repoRoot, { excludeRoots, platform = process.platform, selfPid = process.pid, parentPid = process.ppid, homeDir = homedir() } = {}) {
  const root = normalizePath(repoRoot, platform);
  const excludes = (excludeRoots ?? globalToolDirs(homeDir)).map((e) => normalizePath(e, platform));
  const picked = [];
  for (const p of list ?? []) {
    const pid = p.pid ?? p.ProcessId;
    const path = p.path ?? p.ExecutablePath;
    if (!path || pid === selfPid || pid === parentPid) continue;
    const n = normalizePath(path, platform);
    if (!isUnder(n, root) || excludes.some((e) => isUnder(n, e))) continue;
    picked.push({ pid, path });
  }
  return picked;
}

// Paths changed on this branch against <base> plus the working tree's own changes; null when unreadable.
export function changedPaths(root, base) {
  if (gitOut(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]) === null) return null;
  const diff = gitOut(root, ["diff", "--name-only", "-z", `${base}...HEAD`]);
  const status = gitOut(root, ["status", "--porcelain", "-z", "--untracked-files=all"]);
  if (diff === null || status === null) return null;
  const paths = new Set(diff.split("\0").filter(Boolean));
  const fields = status.split("\0");
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.length < 4) continue;
    paths.add(f.slice(3));
    if (/[RC]/.test(f.slice(0, 2)) && fields[i + 1]) paths.add(fields[++i]);
  }
  return [...paths];
}

/**
 * Decides whether a baseline run may narrow to the doc tests: only when no changed path matches a
 * source or test glob. `narrow: false` runs the full suite.
 */
export function chooseFilter(changed, { sourceGlobs = [], testGlobs = [] } = {}) {
  if (!Array.isArray(changed)) return { narrow: false, reason: "changed paths could not be read (base unresolved) — full suite" };
  const globs = [...sourceGlobs, ...testGlobs];
  const code = changed.filter((p) => matchesAny(p, globs));
  if (!code.length) return { narrow: true, reason: `no source/test path among ${changed.length} changed path(s) — doc tests only` };
  const shown = code.slice(0, 5).join(", ") + (code.length > 5 ? ", …" : "");
  return { narrow: false, reason: `${code.length} source/test path(s) changed (${shown}) — full suite` };
}

/** Builds the test command line for a filter: the configured testFilter form, or `--filter "<expr>"` appended. */
export function filteredCommand(commands, expr) {
  if (typeof commands.testFilter === "string" && commands.testFilter.includes("{filter}")) {
    return commands.testFilter.replaceAll("{filter}", expr);
  }
  return `${commands.test} --filter "${expr.replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------- adapters

// dotnet: every `Test run for <dll>` must be answered, later in the output, by that dll's Passed!/Failed! summary
// or by its "No test matches" line (a filtered solution run prints only that for an assembly it misses).
export function parseDotnetOutput(text, { expectTotal } = {}) {
  const assemblies = [];
  let testhostFailed = false;
  const answer = (dll, result) => {
    const a = assemblies.find((x) => x.dll === dll && x.state === null);
    if (a) Object.assign(a, result);
  };
  for (const line of String(text).split(/\r?\n/)) {
    let m;
    if ((m = RUN_RE.exec(line))) {
      assemblies.push({ dll: dllName(m[1]), passed: null, failed: null, skipped: null, total: null, state: null });
    } else if ((m = SUMMARY_RE.exec(line))) {
      answer(dllName(m[6]), { failed: +m[2], passed: +m[3], skipped: +m[4], total: +m[5], state: m[1] === "Failed" || +m[2] > 0 ? "FAILED" : "PASSED" });
    } else if ((m = ZERO_RE.exec(line))) {
      answer(dllName(m[1]), { passed: 0, failed: 0, skipped: 0, total: 0, state: "ZERO_MATCH" });
    } else if (TESTHOST_RE.test(line)) {
      testhostFailed = true;
    }
  }
  for (const a of assemblies) if (a.state === null) a.state = "RUNNER_TERMINATED";
  const sum = (k) => assemblies.reduce((s, a) => s + (a[k] ?? 0), 0);
  const total = sum("total");
  const failed = sum("failed");
  let verdict;
  if (!assemblies.length || assemblies.some((a) => a.state === "RUNNER_TERMINATED")) verdict = "RUNNER_TERMINATED";
  else if (testhostFailed) verdict = "TESTHOST_FAILED";
  else if (assemblies.every((a) => a.state === "ZERO_MATCH")) verdict = "ZERO_MATCH";
  else if (expectTotal !== undefined && expectTotal !== null && total !== expectTotal) verdict = "DENOMINATOR_MISMATCH";
  else verdict = failed > 0 ? "RED" : "GREEN";
  return { assemblies, total, passed: sum("passed"), failed, skipped: sum("skipped"), testhostFailed, verdict };
}

function countsIn(segment) {
  const pick = (word) => { const m = new RegExp(`(\\d+)\\s+${word}\\b`).exec(segment); return m ? +m[1] : 0; };
  return { passed: pick("passed"), failed: pick("failed"), skipped: pick("skipped") + pick("todo") };
}

// vitest: `Test Files  N passed (M)` and `Tests  N failed | K passed (M)` summary lines.
export function parseVitestOutput(text, { expectTotal } = {}) {
  let files = null;
  let tests = null;
  let noFiles = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, "");
    let m;
    if ((m = /^\s*Test Files\s+(.*?)\((\d+)\)/.exec(line))) files = { ...countsIn(m[1]), total: +m[2] };
    else if ((m = /^\s*Tests\s+(.*?)\((\d+)\)/.exec(line))) tests = { ...countsIn(m[1]), total: +m[2] };
    else if (/No test files found/i.test(line)) noFiles = true;
  }
  let verdict;
  if (noFiles && !tests) verdict = "ZERO_MATCH";
  else if (!tests) verdict = "RUNNER_TERMINATED";
  else if (tests.total === 0) verdict = "ZERO_MATCH";
  else if (expectTotal !== undefined && expectTotal !== null && tests.total !== expectTotal) verdict = "DENOMINATOR_MISMATCH";
  else verdict = tests.failed > 0 || (files?.failed ?? 0) > 0 ? "RED" : "GREEN";
  return { assemblies: [], files, total: tests?.total ?? 0, passed: tests?.passed ?? 0, failed: tests?.failed ?? 0, skipped: tests?.skipped ?? 0, testhostFailed: false, verdict };
}

// generic: the exit code decides, with a best-effort count from `N passed` / `# pass N` / `ℹ pass N` / `N passing`.
export function parseGenericOutput(text, { expectTotal, exit } = {}) {
  const clean = String(text).replace(/\x1b\[[0-9;]*m/g, "");
  const grab = (patterns) => {
    for (const re of patterns) { const m = re.exec(clean); if (m) return +m[1]; }
    return null;
  };
  const passed = grab([/(\d+)\s+passed\b/, /^\s*#\s*pass\s+(\d+)/m, /ℹ\s*pass\s+(\d+)/, /(\d+)\s+passing\b/]);
  const failed = grab([/(\d+)\s+failed\b/, /^\s*#\s*fail\s+(\d+)/m, /ℹ\s*fail\s+(\d+)/, /(\d+)\s+failing\b/]);
  const skipped = grab([/(\d+)\s+skipped\b/, /^\s*#\s*skipped\s+(\d+)/m, /ℹ\s*skipped\s+(\d+)/, /(\d+)\s+pending\b/]);
  const totalLine = grab([/^\s*#\s*tests\s+(\d+)/m, /ℹ\s*tests\s+(\d+)/, /Total:\s*(\d+)/]);
  const known = passed !== null || failed !== null;
  const total = totalLine ?? (known ? (passed ?? 0) + (failed ?? 0) + (skipped ?? 0) : null);
  let verdict;
  if (exit === null || exit === undefined) verdict = "RUNNER_TERMINATED";
  else if (expectTotal !== undefined && expectTotal !== null && total !== expectTotal) verdict = "DENOMINATOR_MISMATCH";
  else verdict = exit !== 0 || (failed ?? 0) > 0 ? "RED" : "GREEN";
  return { assemblies: [], total, passed, failed, skipped, testhostFailed: false, verdict };
}

export const ADAPTERS = { dotnet: parseDotnetOutput, vitest: parseVitestOutput, generic: parseGenericOutput };

/** Kept under its original name for callers that import the dotnet parser directly. */
export const parseTestOutput = parseDotnetOutput;

// ---------------------------------------------------------------- side effects

function listProcesses() {
  if (process.platform === "win32") {
    const r = spawnSync("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) fail("process enumeration failed", { stderr: r.stderr });
    const rows = JSON.parse(r.stdout || "[]");
    return Array.isArray(rows) ? rows : [rows];
  }
  if (existsSync("/proc")) {
    return readdirSync("/proc").filter((d) => /^\d+$/.test(d)).map((d) => {
      try { return { pid: +d, path: readlinkSync(`/proc/${d}/exe`) }; } catch { return { pid: +d, path: null }; }
    });
  }
  const r = spawnSync("ps", ["-axo", "pid=,comm="], { encoding: "utf8" });
  if (r.status !== 0) fail("process enumeration failed", { stderr: r.stderr });
  return r.stdout.split("\n").map((l) => /^\s*(\d+)\s+(.*)$/.exec(l)).filter(Boolean)
    .map((m) => ({ pid: +m[1], path: m[2].startsWith("/") ? m[2] : null }));
}

// Other git worktrees nested under the root (e.g. .claude/worktrees/*) are other clones' processes.
function nestedWorktrees(root) {
  const out = gitOut(root, ["worktree", "list", "--porcelain"]) ?? "";
  const r = normalizePath(root, process.platform);
  return out.split(/\r?\n/).filter((l) => l.startsWith("worktree ")).map((l) => l.slice(9))
    .filter((w) => { const n = normalizePath(w, process.platform); return n !== r && isUnder(n, r); });
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function stopProcesses(selected) {
  const stopped = [];
  const stopErrors = [];
  for (const p of selected) {
    try { process.kill(p.pid); stopped.push(p); } catch (e) { stopErrors.push({ ...p, error: e.code ?? e.message }); }
  }
  const wait = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 50 && stopped.some((p) => isAlive(p.pid)); i++) Atomics.wait(wait, 0, 0, 100);
  return { stopped, stopErrors };
}

// Runs a shell command with stdout and stderr interleaved into one file; returns the exit code (null if it never ran).
function runToFile(cmd, cwd, outFile) {
  const fd = openSync(outFile, "w");
  try {
    const r = spawnSync(cmd, { cwd, shell: true, stdio: ["ignore", fd, fd] });
    return r.error ? null : r.status;
  } finally { closeSync(fd); }
}

// ---------------------------------------------------------------- main

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(HELP + "\n"); return; }
  let cfg;
  try {
    cfg = loadConfig(opts.root ? resolve(opts.root) : findRoot(process.cwd()));
  } catch (error) { fail(error.message); }
  const root = cfg.root;
  const repo = cfg.config.repo ?? {};
  const commands = repo.commands ?? {};
  const runner = repo.testRunner ?? "generic";
  if (!TEST_RUNNERS.includes(runner)) fail(`config repo.testRunner must be one of ${TEST_RUNNERS.join(", ")} (found ${JSON.stringify(runner)})`);
  if (typeof commands.test !== "string" || !commands.test.trim()) fail("config repo.commands.test is not set");
  if (opts.filter === true) fail("--filter requires an expression");
  if (opts.base === true) fail("--base requires a ref");
  let expectTotal;
  if (opts["expect-total"] !== undefined) {
    expectTotal = Number(opts["expect-total"]);
    if (!Number.isInteger(expectTotal) || expectTotal < 0) fail("--expect-total requires a non-negative integer");
  }
  const head = (gitOut(root, ["rev-parse", "--short", "HEAD"]) ?? "").trim() || null;

  let stopped = [];
  let stopErrors = [];
  if (opts["stop-processes"]) {
    const selected = selectCloneProcesses(listProcesses(), root, { excludeRoots: [...globalToolDirs(), ...nestedWorktrees(root)] });
    ({ stopped, stopErrors } = stopProcesses(selected));
  }

  // choose the command: an explicit filter, a baseline narrowing, or the full suite
  let filter;
  let testCommand = commands.test;
  let adapter = runner;
  if (typeof opts.filter === "string") {
    testCommand = filteredCommand(commands, opts.filter);
    filter = { expr: opts.filter, command: "test", reason: "explicit --filter" };
  } else if (opts.baseline) {
    const base = opts.base ?? `origin/${repo.defaultBranch ?? "main"}`;
    const choice = chooseFilter(changedPaths(root, base), { sourceGlobs: repo.sourceGlobs, testGlobs: repo.testGlobs });
    if (choice.narrow && typeof commands.docTests === "string" && commands.docTests.trim()) {
      testCommand = commands.docTests;
      adapter = "generic"; // doc tests are node --test by contract, whatever the product's runner is
      filter = { expr: null, command: "docTests", reason: `against ${base}: ${choice.reason}` };
    } else {
      filter = { expr: null, command: "test", reason: `against ${base}: ${choice.reason}${choice.narrow ? " (repo.commands.docTests not set — full suite)" : ""}` };
    }
  } else filter = { expr: null, command: "test", reason: "no --filter and no --baseline — full suite" };

  const stamp = `${Date.now()}-${process.pid}`;
  const buildOut = join(tmpdir(), `suite-run-${stamp}-build.txt`);
  const buildCmd = typeof commands.build === "string" && commands.build.trim() ? commands.build : null;
  const buildExit = buildCmd ? runToFile(buildCmd, root, buildOut) : 0;
  const result = {
    head, runner: adapter, ...(opts["stop-processes"] ? { stopped, ...(stopErrors.length ? { stopErrors } : {}) } : {}),
    build: buildCmd ? { cmd: buildCmd, exit: buildExit, output: buildOut } : { cmd: null, exit: 0, output: null, skipped: true },
    filter: { ...filter, cmd: testCommand },
  };
  if (buildExit !== 0) {
    Object.assign(result, { output: null, assemblies: [], total: 0, exit: null, verdict: "BUILD_FAILED" });
  } else {
    const testOut = join(tmpdir(), `suite-run-${stamp}-test.txt`);
    const exit = runToFile(testCommand, root, testOut);
    const parsed = ADAPTERS[adapter](readFileSync(testOut, "utf8"), { expectTotal, exit });
    // a non-zero exit with nothing failed is not green: the parse missed what the runner saw
    const verdict = parsed.verdict === "GREEN" && exit !== 0 ? "RED" : parsed.verdict;
    Object.assign(result, { output: testOut, ...parsed, exit, verdict });
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
