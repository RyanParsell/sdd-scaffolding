// Shared fixture helpers for the script tests. Not a test file itself (node --test only picks *.test.mjs).
// Fixtures are located relative to import.meta.url so the tests do not depend on the working directory.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const scriptsDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const script = (name) => join(scriptsDir, name);

/** A complete, valid config; `overrides` are merged one level deep per top-level block. */
export function makeConfig(overrides = {}) {
  const base = {
    sddVersion: "0.1.0",
    repo: {
      name: "fixture",
      product: "Fixture",
      defaultBranch: "main",
      publish: "trunk-ff",
      branches: { feature: "feature/{slug}", bug: "bug/{slug}" },
      commits: { feature: "feat", bug: "fix", docs: "docs", plan: "docs(plan)", attribution: false },
      commands: {
        build: 'node -e "process.exit(0)"',
        test: 'node -e "console.log(\'3 passed\')"',
        testFilter: null,
        docTests: 'node -e "console.log(\'# tests 2\'); console.log(\'# pass 2\'); console.log(\'# fail 0\')"',
        lint: null,
        deployTool: null,
        e2e: null,
      },
      testRunner: "generic",
      sourceGlobs: ["src/**"],
      testGlobs: ["tests/**"],
      docs: {
        sdd: "docs/sdd",
        prd: "docs/sdd/fixture-prd.md",
        architecture: "docs/sdd/fixture-architecture.md",
        stories: "docs/sdd/fixture-stories.md",
        projectStructure: "docs/sdd/fixture-project-structure.md",
        profile: "docs/sdd/fixture-sdd-profile.md",
        agentGuide: null,
        changeChecklist: null,
        vocabulary: null,
        plans: "docs/plans",
        artifacts: "docs/artifacts",
        epics: "docs/epics",
        research: "docs/research",
        logs: "docs/logs",
      },
      ledgers: {
        friction: "docs/logs/friction-log.md",
        testHealth: "docs/logs/test-health-log.md",
        runLog: "docs/logs/sdd-run-log.md",
        testRoi: "docs/logs/test-roi-log.md",
      },
      agentSurfaces: ["CLAUDE.md"],
      ui: null,
    },
    skills: { source: "skills", project: ["alpha"], harnesses: ["claude"] },
    harvest: { expiryDays: 30, topN: 3, patternWeeks: 3, digestWhatChars: 700, slugPrefixes: ["sdd-skill-improve", "test-improve"], seamPaths: ["skills/"] },
    sweep: { listing: "docs/sdd/fixture-project-structure.md", scope: ["src/**/*.cs"], extensions: ["cs", "md"] },
    sizeBudgetBytes: { alpha: 1000 },
  };
  const out = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    out[key] = value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object"
      ? deepMerge(out[key], value)
      : value;
  }
  return out;
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const [key, value] of Object.entries(source)) {
    out[key] = value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object"
      ? deepMerge(out[key], value)
      : value;
  }
  return out;
}

export function git(repo, ...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

export function write(repo, path, text) {
  const p = join(repo, path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

/** A git repo in a temp dir (with a space in its name) carrying skills/sdd.config.json and an initial commit. */
export function fixtureRepo(name, { config = makeConfig(), files = {}, commit = true } = {}) {
  const repo = mkdtempSync(join(tmpdir(), `sdd ${name} `));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "fixture@example.com");
  git(repo, "config", "user.name", "Fixture");
  git(repo, "config", "core.autocrlf", "false");
  write(repo, "skills/sdd.config.json", JSON.stringify(config, null, 2) + "\n");
  for (const [path, text] of Object.entries(files)) write(repo, path, text);
  if (commit) {
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "fixture");
  }
  return repo;
}

/** A user-scope home dir for skills status, so tests never read the real one. */
export function fixtureHome(name) {
  return mkdtempSync(join(tmpdir(), `sdd home ${name} `));
}

export function safeJson(s) {
  try { return JSON.parse(s); } catch { return { raw: s }; }
}

/** Runs a script; `out`/`err` are the parsed JSON of stdout/stderr (or `{ raw }`). */
export function run(name, args, { cwd, env, input } = {}) {
  const r = spawnSync(process.execPath, [script(name), ...args], {
    cwd,
    encoding: "utf8",
    input,
    env: { ...process.env, SDD_SKILLS_HOME: env?.SDD_SKILLS_HOME ?? fixtureHome("default"), ...env },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, out: r.stdout ? safeJson(r.stdout) : null, err: r.stderr ? safeJson(r.stderr) : null };
}
