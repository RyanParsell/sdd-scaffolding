import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { fixtureHome, fixtureRepo, makeConfig, run, script, write } from "./fixture.mjs";

const { parseFrontmatterLines, frontmatterLines, validateSkill, dirsMatch } = await import(pathToFileURL(script("skills.mjs")).href);

const SKILL = (name, extra = "") => `---\nname: ${name}\ndescription: "The ${name} skill for the fixture."\nuser_invocable: true\nversion: 1.0.0\n---\n# ${name}\n${extra}`;

function skillsFixture(name, { config, files = {} } = {}) {
  const cfg = config ?? makeConfig({ skills: { project: ["alpha", "beta"], harnesses: ["claude", "copilot"], retired: ["old-alpha"] } });
  return fixtureRepo(`skills ${name}`, {
    config: cfg,
    files: { "skills/alpha/SKILL.md": SKILL("alpha"), "skills/alpha/notes/extra.md": "extra\n", "skills/beta/SKILL.md": SKILL("beta"), ...files },
  });
}

// ---------------------------------------------------------------- frontmatter parser

test("parseFrontmatterLines reads plain, quoted and block values and rejects bad YAML", () => {
  const map = parseFrontmatterLines([
    "name: alpha",
    "description: 'it''s quoted'",
    "title: \"tab\\tand quote \\\"x\\\"\"",
    "folded: >",
    "  first line",
    "  second line",
    "literal: |",
    "  a",
    "  b",
    "# a comment",
    "",
    "user_invocable: true",
    "version: 1.0.0",
    "count: 3",
  ]);
  assert.equal(map.name, "alpha");
  assert.equal(map.description, "it's quoted");
  assert.equal(map.title, 'tab\tand quote "x"');
  assert.equal(map.folded, "first line second line");
  assert.equal(map.literal, "a\nb");
  assert.equal(map.user_invocable, true);
  assert.equal(map.version, "1.0.0");
  assert.equal(map.count, 3);
  assert.throws(() => parseFrontmatterLines(["name: a", "name: b"]), /duplicate key 'name'/);
  assert.throws(() => parseFrontmatterLines(["- not a mapping"]), /must be a YAML mapping/);
  assert.throws(() => parseFrontmatterLines(["description: 'unterminated"]), /unterminated quoted value/);
  assert.throws(() => parseFrontmatterLines(["description: 'bad' trailing"]), /invalid YAML single-quote escaping/);
  assert.throws(() => parseFrontmatterLines(["description: plain text # with a comment"]), /comment marker; quote the value/);
});

test("frontmatterLines names which --- is missing", () => {
  assert.throws(() => frontmatterLines("# no frontmatter\n"), /must start on the first line with '---'/);
  assert.throws(() => frontmatterLines("---\nname: a\n# never closed\n"), /missing its closing '---'/);
  assert.deepEqual(frontmatterLines("﻿---\r\nname: a\r\n---\r\nbody\r\n"), ["name: a"]);
});

test("validateSkill enforces name shape, directory match and description length", () => {
  const repo = skillsFixture("validate");
  assert.equal(validateSkill(join(repo, "skills", "alpha"), "alpha"), null);
  write(repo, "skills/gamma/SKILL.md", SKILL("delta"));
  assert.match(validateSkill(join(repo, "skills", "gamma"), "gamma"), /name 'delta' must match its directory name 'gamma'/);
  write(repo, "skills/gamma/SKILL.md", "---\nname: Gamma\ndescription: x\n---\n");
  assert.match(validateSkill(join(repo, "skills", "gamma"), "gamma"), /lowercase letters/);
  write(repo, "skills/gamma/SKILL.md", `---\nname: gamma\ndescription: ${"x".repeat(1025)}\n---\n`);
  assert.match(validateSkill(join(repo, "skills", "gamma"), "gamma"), /1-1024 characters \(found 1025\)/);
  write(repo, "skills/gamma/SKILL.md", "---\nname: gamma\n---\n");
  assert.match(validateSkill(join(repo, "skills", "gamma"), "gamma"), /'description' must be a nonblank string/);
  assert.match(validateSkill(join(repo, "skills", "nope"), "nope"), /missing/);
});

// ---------------------------------------------------------------- install

test("install --yes writes every project skill into each configured harness dir and is idempotent", () => {
  const repo = skillsFixture("install");
  const r = run("skills.mjs", ["install", "--yes", "--json", "--root", repo]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.out.harnesses.map((h) => h.harness), ["claude", "copilot"]);
  assert.deepEqual(r.out.skills, ["alpha", "beta"]);
  for (const dir of [".claude/skills", ".github/skills"]) {
    assert.equal(readFileSync(join(repo, dir, "alpha", "SKILL.md"), "utf8"), SKILL("alpha"));
    assert.equal(readFileSync(join(repo, dir, "alpha", "notes", "extra.md"), "utf8"), "extra\n");
    assert.ok(existsSync(join(repo, dir, "beta", "SKILL.md")));
  }
  assert.equal(existsSync(join(repo, ".agents/skills")), false, "codex is not configured");
  // a stray file and a read-only file in the mirror are replaced by the delete-and-recopy
  write(repo, ".claude/skills/alpha/stray.md", "stray\n");
  chmodSync(join(repo, ".claude/skills/alpha/SKILL.md"), 0o444);
  writeFileSync(join(repo, "skills/alpha/SKILL.md"), SKILL("alpha", "changed\n"));
  const again = run("skills.mjs", ["install", "--yes", "--json", "--root", repo]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(existsSync(join(repo, ".claude/skills/alpha/stray.md")), false);
  assert.equal(readFileSync(join(repo, ".claude/skills/alpha/SKILL.md"), "utf8"), SKILL("alpha", "changed\n"));
});

test("install --harness narrows the targets, accepts all, and rejects an unknown harness", () => {
  const repo = skillsFixture("harness");
  const codex = run("skills.mjs", ["install", "--yes", "--json", "--root", repo, "--harness", "codex"]);
  assert.equal(codex.status, 0, codex.stderr);
  assert.ok(existsSync(join(repo, ".agents/skills/alpha/SKILL.md")));
  assert.equal(existsSync(join(repo, ".claude/skills")), false);
  const all = run("skills.mjs", ["install", "--yes", "--json", "--root", repo, "--harness", "all"]);
  assert.deepEqual(all.out.harnesses.map((h) => h.harness), ["claude", "copilot", "codex"]);
  const bad = run("skills.mjs", ["install", "--yes", "--json", "--root", repo, "--harness", "cursor"]);
  assert.equal(bad.status, 1);
  assert.match(bad.err.message, /unknown harness 'cursor'/);
});

test("install validates every skill before writing anything", () => {
  const repo = skillsFixture("invalid", { files: { "skills/beta/SKILL.md": "---\nname: beta\ndescription: has a # comment\n---\n" } });
  const r = run("skills.mjs", ["install", "--yes", "--json", "--root", repo]);
  assert.equal(r.status, 1);
  assert.equal(r.err.error, "SKILLS_ERROR");
  assert.match(r.err.message, /invalid skill manifest .*beta.*comment marker/);
  assert.equal(existsSync(join(repo, ".claude/skills")), false, "alpha was valid but nothing was written");
  const missing = skillsFixture("missing", { config: makeConfig({ skills: { project: ["alpha", "zeta"], harnesses: ["claude"] } }) });
  const m = run("skills.mjs", ["install", "--yes", "--json", "--root", missing]);
  assert.equal(m.status, 1);
  assert.match(m.err.message, /'zeta' skill was not found/);
});

test("install without --yes refuses to write when stdin is not a terminal", () => {
  const repo = skillsFixture("confirm");
  const r = run("skills.mjs", ["install", "--json", "--root", repo], { input: "" });
  assert.equal(r.status, 1);
  assert.equal(r.err.error, "SKILLS_CONFIRM_REQUIRED");
  assert.equal(existsSync(join(repo, ".claude/skills")), false);
});

test("install sweeps a retired name out of the project dir but leaves a non-skill dir of that name", () => {
  const repo = skillsFixture("retired", { files: { ".claude/skills/old-alpha/SKILL.md": SKILL("old-alpha"), ".github/skills/old-alpha/readme.txt": "not a skill\n" } });
  const r = run("skills.mjs", ["install", "--yes", "--json", "--root", repo]);
  assert.equal(r.status, 0, r.stderr);
  const claude = r.out.harnesses.find((h) => h.harness === "claude");
  assert.deepEqual(claude.removed.map((x) => x.name), ["old-alpha"]);
  assert.equal(existsSync(join(repo, ".claude/skills/old-alpha")), false);
  assert.ok(existsSync(join(repo, ".github/skills/old-alpha/readme.txt")), "a same-named dir without SKILL.md is not a deployed skill");
});

// ---------------------------------------------------------------- status

test("status classifies ok, stale, misplaced, orphaned and foreign across project and user scope", () => {
  const repo = skillsFixture("status");
  const home = fixtureHome("status");
  run("skills.mjs", ["install", "--yes", "--root", repo]);
  // stale: the copilot mirror of beta drifted; a CRLF-only difference in claude/alpha is still ok
  writeFileSync(join(repo, ".github/skills/beta/SKILL.md"), SKILL("beta", "drift\n"));
  writeFileSync(join(repo, ".claude/skills/alpha/SKILL.md"), SKILL("alpha").replace(/\n/g, "\r\n"));
  // misplaced: a project skill at user scope; foreign: someone else's skill; orphaned: a retired name
  write(home, ".claude/skills/alpha/SKILL.md", SKILL("alpha"));
  write(home, ".copilot/skills/someone-elses/SKILL.md", "---\nname: someone-elses\ndescription: theirs\n---\n");
  write(repo, ".agents/skills/old-alpha/SKILL.md", SKILL("old-alpha"));
  write(repo, ".agents/skills/not-a-skill/readme.md", "ignored\n");
  const r = run("skills.mjs", ["status", "--json", "--root", repo, "--home", home]);
  assert.equal(r.status, 0, r.stderr);
  const state = (harness, scope, name) => r.out.entries.find((e) => e.harness === harness && e.scope === scope && e.name === name)?.state;
  assert.equal(state("claude", "project", "alpha"), "ok");
  assert.equal(state("claude", "project", "beta"), "ok");
  assert.equal(state("copilot", "project", "beta"), "stale");
  assert.equal(state("claude", "user", "alpha"), "misplaced");
  assert.equal(state("copilot", "user", "someone-elses"), "foreign");
  assert.equal(state("codex", "project", "old-alpha"), "orphaned");
  assert.equal(state("codex", "project", "not-a-skill"), undefined);
  assert.deepEqual(r.out.entries.filter((e) => e.needsAttention).map((e) => `${e.state}:${e.name}`).sort(), ["misplaced:alpha", "orphaned:old-alpha", "stale:beta"]);
  assert.equal(r.out.needsAttention, 3);
  for (const e of r.out.entries) assert.equal(e.needsAttention, ["stale", "misplaced", "orphaned"].includes(e.state));
  const text = run("skills.mjs", ["status", "--root", repo, "--home", home]);
  assert.match(text.stdout, /3 need attention/);
  assert.match(text.stdout, /misplaced: reinstalling will NOT fix/);
  assert.match(text.stdout, /skills\.mjs install --yes/);
});

test("status reads SDD_SKILLS_HOME when --home is absent and reports an empty install", () => {
  const repo = skillsFixture("empty");
  const home = fixtureHome("empty");
  write(home, ".agents/skills/beta/SKILL.md", SKILL("beta"));
  const r = run("skills.mjs", ["status", "--json", "--root", repo], { env: { SDD_SKILLS_HOME: home } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.out.entries.map((e) => [e.harness, e.scope, e.name, e.state]), [["codex", "user", "beta", "misplaced"]]);
  const none = run("skills.mjs", ["status", "--root", repo], { env: { SDD_SKILLS_HOME: fixtureHome("none") } });
  assert.match(none.stdout, /No skills installed/);
});

test("dirsMatch compares file sets and CR-stripped bytes, ignoring .git and node_modules in the source", () => {
  const repo = skillsFixture("dirsmatch");
  const src = join(repo, "skills", "alpha");
  const dest = join(repo, "copy");
  mkdirSync(join(src, "node_modules"), { recursive: true });
  writeFileSync(join(src, "node_modules", "x.js"), "ignored");
  write(repo, "copy/SKILL.md", SKILL("alpha").replace(/\n/g, "\r\n"));
  write(repo, "copy/notes/extra.md", "extra\n");
  assert.equal(dirsMatch(src, dest), true);
  write(repo, "copy/notes/extra.md", "extra!\n");
  assert.equal(dirsMatch(src, dest), false);
});

test("--help and unknown commands", () => {
  const help = run("skills.mjs", ["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usage: skills\.mjs/);
  const bad = run("skills.mjs", ["frobnicate"]);
  assert.equal(bad.status, 1);
  assert.match(bad.err.message, /unknown command/);
  const noRoot = run("skills.mjs", ["status", "--json", "--root", fixtureHome("no root")]);
  assert.equal(noRoot.status, 1);
  assert.match(noRoot.err.message, /missing .*sdd\.config\.json/);
});
