#!/usr/bin/env node
// The falsifiability gate's narrowed-check control.
// Re-runs a check against the pre-change artifact in a detached worktree; the primary tree is never modified.
//   node scripts/sdd/gate-control.mjs --base <sha> --revert <path>[,<path>…] --build "<cmd>" --test "<cmd>"
//        [--link <dir>[,<dir>…]] [--root <dir>] --json
// Prints ONE JSON object to stdout: { base, head, worktree, reverted[], links[], build, test, verdict, cleaned }.
// verdict: BUILD_FAILED (build exit non-zero, test skipped) | RED (test exit non-zero) | GREEN (test exit 0).
// Errors are JSON on stderr with exit 1 (DIRTY_TREE refuses uncommitted work; commit it first).

import { spawnSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const IS_WINDOWS = process.platform === "win32";

const HELP = `usage: gate-control.mjs --base <sha> --revert <path>[,<path>…] --build "<cmd>" --test "<cmd>" [--link <dir>[,<dir>…]] [--root <dir>] --json
  Runs the build and then the test command in a detached worktree at HEAD with the --revert paths checked out
  from --base, so a narrowed check can be shown to go RED against the pre-change artifact.
  --base <sha>      the commit whose version of the reverted paths is the control
  --revert <paths>  comma-separated paths to take from --base
  --build <cmd>     shell command run first; a non-zero exit is BUILD_FAILED and the test is skipped
  --test <cmd>      shell command whose exit decides RED (non-zero) or GREEN (0)
  --link <dirs>     comma-separated dirs linked from the primary tree into the worktree (e.g. node_modules)
  --root <dir>      repo root (default: git rev-parse --show-toplevel)
  --json            print one JSON object on stdout (the default output)
  --help            this text`;

// ---------------------------------------------------------------- helpers

class GateControlError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; this.extra = extra; }
}

function fail(message, extra = {}) {
  process.stderr.write(JSON.stringify({ error: "GATE_CONTROL_ERROR", message, ...extra }) + "\n");
  process.exit(1);
}

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

export function listOf(value) {
  if (typeof value !== "string") return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function porcelainPaths(text) {
  return text.split("\n").map((l) => l.replace(/\r$/, "")).filter(Boolean).map((l) => l.slice(3));
}

function git(cwd, args, code = "GIT_FAILED") {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new GateControlError(code, `git ${args.join(" ")} failed`, { stderr: (r.stderr ?? "").trim() });
  return (r.stdout ?? "").trim();
}

function exists(path) {
  try { lstatSync(path); return true; } catch { return false; }
}

// Runs a shell command with stdout and stderr interleaved into one log file; returns the exit code (null if it never ran).
function runLogged(cmd, cwd, logPath) {
  const fd = openSync(logPath, "w");
  try {
    const r = spawnSync(cmd, { cwd, shell: true, stdio: ["ignore", fd, fd] });
    return r.error ? null : r.status;
  } finally { closeSync(fd); }
}

function createLink(link, target) {
  mkdirSync(dirname(link), { recursive: true });
  if (IS_WINDOWS) {
    const r = spawnSync("cmd", ["/c", "mklink", "/J", link, target], { encoding: "utf8" });
    if (r.status !== 0) throw new GateControlError("LINK_FAILED", `mklink /J ${link} failed`, { stderr: (r.stderr || r.stdout || "").trim() });
  } else {
    try { symlinkSync(target, link, "dir"); } catch (e) { throw new GateControlError("LINK_FAILED", `symlink ${link} failed`, { stderr: String(e.message) }); }
  }
}

// Removal never follows the link: `rmdir` without /s deletes a junction itself, `unlink` deletes a symlink itself.
function removeLink(link) {
  if (IS_WINDOWS) {
    const r = spawnSync("cmd", ["/c", "rmdir", link], { encoding: "utf8" });
    if (r.status !== 0) return (r.stderr || r.stdout || "rmdir failed").trim();
  } else {
    try { unlinkSync(link); } catch (e) { return String(e.message); }
  }
  return exists(link) ? "link still present after removal" : null;
}

// ---------------------------------------------------------------- the control

export function runControl(opts) {
  const root = resolve(opts.root ?? git(process.cwd(), ["rev-parse", "--show-toplevel"], "NOT_A_REPO"));
  const base = opts.base;
  const reverts = listOf(opts.revert);
  const linkDirs = listOf(opts.link);
  if (typeof base !== "string" || !reverts.length || typeof opts.build !== "string" || typeof opts.test !== "string") {
    throw new GateControlError("USAGE", HELP.split("\n")[0]);
  }

  // 1. the control runs against committed work only — the primary tree is never touched, so uncommitted work is refused
  const dirty = porcelainPaths(spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).stdout ?? "");
  if (dirty.length) throw new GateControlError("DIRTY_TREE", "the primary tree has uncommitted changes; commit them first (a local commit is cheap and amendable)", { paths: dirty });
  git(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`], "BAD_BASE");
  for (const d of linkDirs) {
    if (!existsSync(join(root, d))) throw new GateControlError("LINK_TARGET_MISSING", `--link target ${d} does not exist in the primary tree`, { path: join(root, d) });
  }
  const head = git(root, ["rev-parse", "--short", "HEAD"]);

  // 2. detached worktree at HEAD under the OS temp dir
  const parent = mkdtempSync(join(tmpdir(), "gate-control-"));
  const worktree = join(parent, "wt");
  const stamp = parent.slice(parent.lastIndexOf("gate-control-") + "gate-control-".length);
  const result = {
    base, head, worktree, reverted: [], links: [],
    build: { cmd: opts.build, exit: null, output: join(tmpdir(), `gate-control-${stamp}-build.log`) },
    test: { cmd: opts.test, exit: null, output: null },
    verdict: null, cleaned: false,
  };
  let added = false;
  let thrown = null;
  const created = [];
  try {
    git(root, ["worktree", "add", "--detach", worktree, "HEAD"], "WORKTREE_FAILED");
    added = true;
    git(worktree, ["checkout", base, "--", ...reverts], "REVERT_FAILED");
    result.reverted = reverts;

    // 3. links into the worktree (e.g. node_modules)
    for (const d of linkDirs) {
      const link = join(worktree, d);
      const target = join(root, d);
      if (exists(link)) throw new GateControlError("LINK_EXISTS", `${d} already exists in the worktree`, { path: link });
      createLink(link, target);
      const entry = { dir: d, link, target, removed: false, targetExists: null };
      created.push(entry);
      result.links.push(entry);
    }

    // 4. build — a failed build is never a RED
    result.build.exit = runLogged(opts.build, worktree, result.build.output);
    if (result.build.exit !== 0) {
      result.verdict = "BUILD_FAILED";
    } else {
      // 5. the narrowed check against the pre-change artifact
      result.test.output = join(tmpdir(), `gate-control-${stamp}-test.log`);
      result.test.exit = runLogged(opts.test, worktree, result.test.output);
      result.verdict = result.test.exit === 0 ? "GREEN" : "RED";
    }
  } catch (e) {
    thrown = e;
    throw e;
  } finally {
    // 6. cleanup: links first (never followed), assert their targets survived, then the worktree
    const reasons = [];
    for (const entry of created) {
      const why = removeLink(entry.link);
      entry.removed = why === null;
      entry.targetExists = existsSync(entry.target);
      if (why) reasons.push(`${entry.dir}: ${why}`);
      if (!entry.targetExists) reasons.push(`${entry.dir}: link target ${entry.target} no longer exists`);
    }
    if (added) {
      if (created.some((e) => !e.removed)) {
        reasons.push(`worktree ${worktree} left in place because a link could not be removed (a forced removal could follow it)`);
      } else {
        const r = spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: root, encoding: "utf8" });
        if (r.status !== 0) reasons.push(`git worktree remove failed: ${(r.stderr ?? "").trim()}`);
      }
    }
    if (!exists(worktree)) { try { rmdirSync(parent); } catch { /* not empty or already gone */ } }
    result.cleaned = reasons.length === 0;
    if (reasons.length) result.cleanupReason = reasons.join("; ");
    // an error mid-control still reports whether the worktree and links were cleaned up
    if (thrown instanceof GateControlError) thrown.extra = { ...thrown.extra, worktree, cleaned: result.cleaned, cleanupReason: result.cleanupReason };
  }
  return result;
}

// ---------------------------------------------------------------- main

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(HELP + "\n"); return; }
  let result;
  try {
    result = runControl(opts);
  } catch (e) {
    if (e instanceof GateControlError) fail(e.message, { error: e.code, ...e.extra });
    fail(String(e?.stack ?? e));
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
