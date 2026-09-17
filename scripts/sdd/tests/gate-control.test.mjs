import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { script } from "./fixture.mjs";

const gateControl = script("gate-control.mjs");

function run(root, args) {
  const r = spawnSync(process.execPath, [gateControl, ...args, "--root", root, "--json"], { encoding: "utf8" });
  return { status: r.status, out: r.stdout ? safeJson(r.stdout) : null, err: r.stderr ? safeJson(r.stderr) : null, stdout: r.stdout };
}
function safeJson(s) { try { return JSON.parse(s); } catch { return { raw: s }; } }

function git(repo, ...args) { return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim(); }
function write(repo, path, text) { const p = join(repo, path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); }
function worktreeCount(repo) { return git(repo, "worktree", "list", "--porcelain").split("\n").filter((l) => l.startsWith("worktree ")).length; }

// The check under test goes RED only when the base-side content of src/value.txt is what it reads.
const CHECK = `node -e "process.exit(require('fs').readFileSync('src/value.txt','utf8').includes('fixed')?0:1)"`;
const PASS = `node -e "process.exit(0)"`;
const FAIL = `node -e "process.exit(1)"`;
const THROW = `node -e "throw new Error('boom')"`;

// base commit: src/value.txt says "buggy"; HEAD: "fixed". deps/ is ignored, so a link target there keeps the tree clean.
function fixture(name) {
  const repo = mkdtempSync(join(tmpdir(), `gate control ${name} `));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "fixture@example.com");
  git(repo, "config", "user.name", "Fixture");
  write(repo, ".gitignore", "deps/\n");
  write(repo, "src/value.txt", "buggy\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "base");
  const base = git(repo, "rev-parse", "HEAD");
  write(repo, "src/value.txt", "fixed\n");
  git(repo, "commit", "-q", "-am", "fix");
  return { repo, base };
}

test("a dirty primary tree is refused with DIRTY_TREE and no worktree is created", () => {
  const { repo, base } = fixture("dirty");
  write(repo, "scratch.txt", "uncommitted work\n");
  const r = run(repo, ["--base", base, "--revert", "src/value.txt", "--build", PASS, "--test", CHECK]);
  assert.equal(r.status, 1);
  assert.equal(r.err.error, "DIRTY_TREE", JSON.stringify(r.err));
  assert.ok(r.err.paths.includes("scratch.txt"));
  assert.equal(worktreeCount(repo), 1);
});

test("missing required options exit 1 with a JSON error; --help exits 0", () => {
  const { repo } = fixture("usage");
  const r = run(repo, ["--revert", "src/value.txt"]);
  assert.equal(r.status, 1);
  assert.ok(r.err.message, JSON.stringify(r.err));
  const help = spawnSync(process.execPath, [gateControl, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usage: gate-control\.mjs/);
});

test("the revert reaches the worktree while the primary tree's bytes never change", () => {
  const { repo, base } = fixture("revert");
  const before = readFileSync(join(repo, "src/value.txt"));
  const head = git(repo, "rev-parse", "HEAD");
  const r = run(repo, ["--base", base, "--revert", "src/value.txt", "--build", PASS, "--test", CHECK]);
  assert.equal(r.status, 0, JSON.stringify(r.err));
  assert.equal(r.out.verdict, "RED");
  assert.equal(r.out.test.exit, 1);
  assert.deepEqual(r.out.reverted, ["src/value.txt"]);
  assert.equal(r.out.base, base);
  assert.ok(head.startsWith(r.out.head));
  assert.ok(existsSync(r.out.test.output), "the test output file is reported and kept");
  assert.ok(Buffer.from(readFileSync(join(repo, "src/value.txt"))).equals(before));
  assert.equal(git(repo, "status", "--porcelain"), "");
  assert.equal(git(repo, "rev-parse", "HEAD"), head);
  // positive control: the same check is green against the primary tree, so RED came from the revert
  const primary = spawnSync(CHECK, { cwd: repo, shell: true });
  assert.equal(primary.status, 0);
});

test("BUILD_FAILED, RED and GREEN are distinguished by build and test exit", () => {
  const { repo, base } = fixture("verdicts");
  const args = ["--base", base, "--revert", "src/value.txt"];
  const built = run(repo, [...args, "--build", FAIL, "--test", PASS]);
  assert.equal(built.status, 0, JSON.stringify(built.err));
  assert.equal(built.out.verdict, "BUILD_FAILED");
  assert.equal(built.out.build.exit, 1);
  assert.equal(built.out.test.exit, null, "the test is skipped after a failed build");
  const red = run(repo, [...args, "--build", PASS, "--test", FAIL]);
  assert.equal(red.out.verdict, "RED");
  assert.equal(red.out.build.exit, 0);
  const green = run(repo, [...args, "--build", PASS, "--test", PASS]);
  assert.equal(green.out.verdict, "GREEN");
  assert.equal(green.out.test.exit, 0);
});

test("a linked dir is visible in the worktree and removed without deleting its target", () => {
  const { repo, base } = fixture("link");
  write(repo, "deps/pkg/marker.txt", "keep me\n");
  const sees = `node -e "process.exit(require('fs').existsSync('deps/pkg/marker.txt')?0:1)"`;
  const r = run(repo, ["--base", base, "--revert", "src/value.txt", "--build", PASS, "--test", sees, "--link", "deps"]);
  assert.equal(r.status, 0, JSON.stringify(r.err));
  assert.equal(r.out.verdict, "GREEN", "the test saw the target through the link");
  assert.equal(r.out.links.length, 1);
  assert.equal(r.out.links[0].removed, true);
  assert.equal(r.out.links[0].targetExists, true);
  assert.equal(r.out.cleaned, true, r.out.cleanupReason);
  assert.equal(readFileSync(join(repo, "deps/pkg/marker.txt"), "utf8"), "keep me\n");
  assert.equal(existsSync(r.out.worktree), false);
});

test("the worktree is removed even when the test command throws", () => {
  const { repo, base } = fixture("cleanup");
  const r = run(repo, ["--base", base, "--revert", "src/value.txt", "--build", PASS, "--test", THROW]);
  assert.equal(r.status, 0, JSON.stringify(r.err));
  assert.equal(r.out.verdict, "RED");
  assert.match(readFileSync(r.out.test.output, "utf8"), /boom/);
  assert.equal(r.out.cleaned, true, r.out.cleanupReason);
  assert.equal(existsSync(r.out.worktree), false);
  assert.equal(worktreeCount(repo), 1);
});

test("the control runs from inside a linked worktree and leaves both trees as they were", () => {
  const { repo, base } = fixture("nested");
  const linked = join(mkdtempSync(join(tmpdir(), "gate control linked ")), "wt");
  git(repo, "worktree", "add", "-q", "--detach", linked, "HEAD");
  const r = run(linked, ["--base", base, "--revert", "src/value.txt", "--build", PASS, "--test", CHECK]);
  assert.equal(r.status, 0, JSON.stringify(r.err));
  assert.equal(r.out.verdict, "RED");
  assert.equal(r.out.cleaned, true, r.out.cleanupReason);
  assert.equal(readFileSync(join(linked, "src/value.txt"), "utf8").trim(), "fixed", "autocrlf may rewrite the ending on checkout");
  assert.equal(git(linked, "status", "--porcelain"), "");
  assert.equal(worktreeCount(repo), 2, "only the fixture's own linked worktree remains");
});

test("parseArgs and listOf split comma lists", async () => {
  const { parseArgs, listOf } = await import(pathToFileURL(gateControl).href);
  const opts = parseArgs(["--revert", "a.txt,b/c.txt", "--json"]);
  assert.deepEqual(listOf(opts.revert), ["a.txt", "b/c.txt"]);
  assert.equal(opts.json, true);
  assert.deepEqual(listOf(undefined), []);
});
