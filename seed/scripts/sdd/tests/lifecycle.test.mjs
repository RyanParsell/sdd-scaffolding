import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { fixtureHome, fixtureRepo, git, makeConfig, run, script, write } from "./fixture.mjs";

const { formatMirrorAdvisory, evaluateLifecycle, renderText } = await import(pathToFileURL(script("lifecycle.mjs")).href);
const branch = "feature/example";

const RUN_LOG = [
  "# SDD run log",
  "",
  "| Time (UTC) | Skill | User | Plan | Branch | Outcome |",
  "|---|---|---|---|---|---|",
  "",
].join("\n");

function fixture(name, config = makeConfig()) {
  return fixtureRepo(`lifecycle ${name}`, {
    config,
    files: { "README.md": "# fixture\n", [config.repo.ledgers.runLog]: RUN_LOG },
  });
}

function plan(repo, path = "docs/plans/2026-08-21-example.md", extra = "") {
  write(repo, path, `# Example\n\n**Branch:** \`${branch}\`\n**Status:** Ready for implementation\n${extra}\n`);
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "plan");
  return path;
}

function row(repo, skill, path = "docs/plans/2026-08-21-example.md", targetBranch = branch, logPath = "docs/logs/sdd-run-log.md") {
  const log = join(repo, logPath);
  const outcome = skill === "pre-impl" ? "plan committed 1234567" : skill === "impl" ? "feat committed 2345678" : "PR #1 opened";
  const existing = readFileSync(log, "utf8");
  writeFileSync(log, `${existing}| 2026-08-21T${String(10 + existing.split("\n").length).padStart(2, "0")}:00Z | ${skill} | Fixture | ${path} | ${targetBranch} | ${outcome} |\n`);
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", `record ${skill}`);
}

function evaluate(repo, targetBranch = branch, extraArgs = []) {
  const result = run("lifecycle.mjs", ["--repo", repo, "--branch", targetBranch, "--json", "--no-session-cache", ...extraArgs]);
  assert.equal(result.status, 0, result.stderr);
  return result.out;
}

test("main is ready to plan", () => {
  const repo = fixture("main");
  const result = evaluate(repo, "main");
  assert.equal(result.state, "READY_TO_PLAN");
  assert.equal(result.planPath, null);
  assert.equal(result.mirrors, null, "a clean fixture raises no mirror advisory");
});

test("dirty non-work branch is unaccounted work rather than ready to plan", () => {
  const repo = fixture("dirty main");
  write(repo, "notes.md", "uncommitted\n");
  assert.equal(evaluate(repo, "main").state, "UNACCOUNTED_WORK");
});

test("feature branch without a plan is unplanned", () => {
  assert.equal(evaluate(fixture("unplanned")).state, "UNPLANNED");
});

test("work-branch prefixes come from config repo.branches", () => {
  const config = makeConfig({ repo: { branches: { feature: "work/{slug}", bug: "hotfix/{slug}" } } });
  const repo = fixture("branches", config);
  assert.equal(evaluate(repo, "work/thing").state, "UNPLANNED");
  assert.equal(evaluate(repo, "hotfix/thing").state, "UNPLANNED");
  assert.equal(evaluate(repo, "feature/thing").state, "READY_TO_PLAN", "feature/ is not a work prefix in this config");
});

test("plan without pre-impl accounting is plan-unaccounted", () => {
  const repo = fixture("unaccounted plan");
  plan(repo);
  assert.equal(evaluate(repo).state, "PLAN_UNACCOUNTED");
});

test("latest pre-impl row is planned", () => {
  const repo = fixture("planned");
  plan(repo);
  row(repo, "pre-impl");
  const result = evaluate(repo);
  assert.equal(result.state, "PLANNED");
  assert.equal(result.rows.latestSkill, "pre-impl");
});

test("dirty implementation paths identify implementation in progress", () => {
  const repo = fixture("implementing");
  plan(repo);
  row(repo, "pre-impl");
  write(repo, "src/change.cs", "change\n");
  const result = evaluate(repo);
  assert.equal(result.state, "IMPLEMENTING");
  assert.equal(result.workingTree.implementationChanges, 1);
});

test("latest impl row is implemented but not published", () => {
  const repo = fixture("implemented");
  plan(repo);
  row(repo, "pre-impl");
  row(repo, "impl");
  assert.equal(evaluate(repo).state, "IMPLEMENTED_NOT_PUBLISHED");
});

test("archived plan with post-impl accounting is complete even when redated", () => {
  const repo = fixture("complete redated");
  const livePath = plan(repo);
  row(repo, "pre-impl", livePath);
  row(repo, "impl", livePath);
  const archivedPath = "docs/artifacts/2026-08-22-example.md";
  mkdirSync(dirname(join(repo, archivedPath)), { recursive: true });
  git(repo, "mv", livePath, archivedPath);
  git(repo, "commit", "-q", "-m", "archive");
  row(repo, "post-impl", archivedPath);
  const result = evaluate(repo);
  assert.equal(result.state, "COMPLETE");
  assert.equal(result.planPath, archivedPath);
  assert.equal(result.planLocation, "artifacts");
});

test("committed implementation changes after archival are unaccounted work", () => {
  const repo = fixture("source after archive");
  const livePath = plan(repo);
  row(repo, "pre-impl", livePath);
  row(repo, "impl", livePath);
  const archivedPath = "docs/artifacts/2026-08-22-example.md";
  mkdirSync(dirname(join(repo, archivedPath)), { recursive: true });
  git(repo, "mv", livePath, archivedPath);
  git(repo, "commit", "-q", "-m", "archive");
  row(repo, "post-impl", archivedPath);
  write(repo, "src/new-change.cs", "newer source\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "unaccounted source");
  const result = evaluate(repo);
  assert.equal(result.state, "UNACCOUNTED_WORK");
  assert.match(result.evidence.join(" "), /newer committed implementation/);
});

test("post-impl with a live plan is a legitimate mid-plan cycle", () => {
  const repo = fixture("mid plan");
  const path = plan(repo, undefined, "\n- [ ] Remaining phase\n");
  row(repo, "pre-impl", path);
  row(repo, "impl", path);
  row(repo, "post-impl", path);
  assert.equal(evaluate(repo).state, "MID_PLAN_PUBLISHED");
});

test("post-impl with a completed plan left live is unaccounted work", () => {
  const repo = fixture("completed plan left live");
  const path = plan(repo);
  row(repo, "pre-impl", path);
  row(repo, "impl", path);
  row(repo, "post-impl", path);
  const result = evaluate(repo);
  assert.equal(result.state, "UNACCOUNTED_WORK");
  assert.match(result.evidence.join(" "), /remains in docs\/plans/);
});

test("repeated impl and post-impl cycles follow the latest row", () => {
  const repo = fixture("repeated cycle");
  const path = plan(repo, undefined, "\n- [ ] Remaining phase\n");
  row(repo, "pre-impl", path);
  row(repo, "impl", path);
  row(repo, "post-impl", path);
  row(repo, "impl", path);
  const result = evaluate(repo);
  assert.equal(result.state, "IMPLEMENTED_NOT_PUBLISHED");
  assert.deepEqual({ preImpl: result.rows.preImpl, impl: result.rows.impl, postImpl: result.rows.postImpl }, { preImpl: 1, impl: 2, postImpl: 1 });
});

test("impl accounting without pre-impl is unaccounted work", () => {
  const repo = fixture("impl without plan run");
  plan(repo);
  row(repo, "impl");
  assert.equal(evaluate(repo).state, "UNACCOUNTED_WORK");
});

test("multiple plans claiming the branch are unaccounted work", () => {
  const repo = fixture("duplicate plans");
  plan(repo);
  write(repo, "docs/plans/2026-08-21-other.md", `# Other\n\n**Branch:** \`${branch}\`\n`);
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "duplicate");
  const result = evaluate(repo);
  assert.equal(result.state, "UNACCOUNTED_WORK");
  assert.match(result.evidence.join(" "), /2 plans claim/);
});

test("malformed lifecycle rows and branch headers produce unknown", async (t) => {
  await t.test("row", () => {
    const repo = fixture("malformed row");
    const log = join(repo, "docs/logs/sdd-run-log.md");
    writeFileSync(log, `${readFileSync(log, "utf8")}| 2026-08-21 | impl | broken |\n`);
    assert.equal(evaluate(repo).state, "UNKNOWN");
  });
  await t.test("header", () => {
    const repo = fixture("malformed header");
    write(repo, "docs/plans/bad.md", "# Bad\n\n**Branch** feature/example\n");
    assert.equal(evaluate(repo).state, "UNKNOWN");
  });
  await t.test("missing run log names the configured path", () => {
    const config = makeConfig({ repo: { ledgers: { runLog: "notes/runs.md" } } });
    const repo = fixtureRepo("lifecycle no log", { config, files: { "README.md": "x\n" } });
    const result = evaluate(repo, "main");
    assert.equal(result.state, "UNKNOWN");
    assert.match(result.evidence.join(" "), /notes\/runs\.md is missing/);
  });
});

test("plan dirs and the run log come from the config", () => {
  const config = makeConfig({ repo: { docs: { plans: "planning/live", artifacts: "planning/done" }, ledgers: { runLog: "planning/run-log.md" } } });
  const repo = fixtureRepo("lifecycle custom dirs", { config, files: { "README.md": "x\n", "planning/run-log.md": RUN_LOG } });
  const path = plan(repo, "planning/live/2026-08-21-example.md");
  row(repo, "pre-impl", path, branch, "planning/run-log.md");
  const result = evaluate(repo);
  assert.equal(result.state, "PLANNED");
  assert.equal(result.planPath, path);
  assert.equal(result.planLocation, "plans");
  // a doc under the configured docs root does not count as implementation
  write(repo, "planning/live/notes.txt", "x\n");
  assert.equal(evaluate(repo).state, "PLANNED");
});

test("a directory without a config is an error in plain mode and a static notice in hook mode", () => {
  const bare = mkdtempSync(join(tmpdir(), "sdd lifecycle bare "));
  const plain = run("lifecycle.mjs", ["--repo", bare, "--json"]);
  assert.equal(plain.status, 1);
  assert.equal(plain.err.error, "SDD_LIFECYCLE_ERROR");
  assert.match(plain.err.message, /sdd\.config\.json/);
  const hook = run("lifecycle.mjs", ["--harness", "claude", "--event", "session-start"], { input: JSON.stringify({ session_id: "s", cwd: bare }) });
  assert.equal(hook.status, 0, hook.stderr);
  assert.match(hook.out.systemMessage, /pre-impl -> impl -> post-impl/);
});

test("script executes correctly when its own path and repo path contain spaces", () => {
  const repo = fixture("path with spaces");
  const scriptDir = mkdtempSync(join(tmpdir(), "sdd script with spaces "));
  mkdirSync(join(scriptDir, "lib"));
  writeFileSync(join(scriptDir, "sdd lifecycle.mjs"), readFileSync(script("lifecycle.mjs")));
  writeFileSync(join(scriptDir, "skills.mjs"), readFileSync(script("skills.mjs")));
  writeFileSync(join(scriptDir, "lib", "config.mjs"), readFileSync(script("lib/config.mjs")));
  const result = spawnSync(process.execPath, [join(scriptDir, "sdd lifecycle.mjs"), "--repo", repo, "--branch", "main", "--json", "--no-session-cache"], { encoding: "utf8", env: { ...process.env, SDD_SKILLS_HOME: fixtureHome("spaces") } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).state, "READY_TO_PLAN");
});

test("evaluateLifecycle and renderText work in-process from a subdirectory of the repo", () => {
  const repo = fixture("in process");
  mkdirSync(join(repo, "src", "deep"), { recursive: true });
  process.env.SDD_SKILLS_HOME = fixtureHome("in process");
  const result = evaluateLifecycle({ repo: join(repo, "src", "deep"), branch: "main" });
  assert.equal(result.repo, repo);
  assert.equal(result.state, "READY_TO_PLAN");
  assert.match(renderText(result), /^SDD lifecycle: READY_TO_PLAN\nBranch: main\nPlan: \(none\)/);
});

test("Claude and Copilot session adapters carry the canonical message without decisions", () => {
  const repo = fixture("adapter parity");
  const plain = evaluate(repo);
  const claude = run("lifecycle.mjs", ["--repo", repo, "--branch", branch, "--harness", "claude", "--event", "session-start", "--no-session-cache"], { input: JSON.stringify({ session_id: "s1", cwd: repo }) });
  const copilot = run("lifecycle.mjs", ["--repo", repo, "--branch", branch, "--harness", "copilot", "--event", "session-start", "--no-session-cache"], { input: JSON.stringify({ sessionId: "s1", cwd: repo }) });
  assert.equal(claude.status, 0, claude.stderr);
  assert.equal(copilot.status, 0, copilot.stderr);
  const claudeOutput = claude.out;
  const copilotLines = copilot.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(claudeOutput.systemMessage, plain.message);
  assert.equal(claudeOutput.hookSpecificOutput.additionalContext, plain.message);
  assert.equal(claudeOutput.hookSpecificOutput.hookEventName, "SessionStart");
  assert.equal(copilotLines[0].type, "progress");
  assert.equal(copilotLines[0].message, plain.message);
  assert.equal(copilotLines[1].additionalContext, plain.message);
  for (const output of [claudeOutput, ...copilotLines]) {
    assert.equal("permissionDecision" in output, false);
  }
});

test("pre-tool adapters are advisory, cached once per session under the git dir, and fail open", () => {
  const repo = fixture("pretool");
  const invoke = (extra = [], sessionId = "mutation-session") =>
    run("lifecycle.mjs", ["--repo", repo, "--branch", branch, "--harness", "copilot", "--event", "pre-tool-use", ...extra], {
      input: JSON.stringify({ sessionId, cwd: repo, toolName: "edit", toolArgs: { path: "src/change.cs" } }),
    });
  const first = invoke();
  const second = invoke();
  const failed = invoke(["--simulate-error"], "failed-session");
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(failed.status, 0, failed.stderr);
  assert.equal(first.stdout.trim().split("\n").length, 2);
  assert.equal(second.stdout.trim(), "{}");
  assert.ok(existsSync(join(repo, ".git", "sdd", "lifecycle", "copilot-mutation-session-pre-tool")), "the marker lives under <git-dir>/sdd/lifecycle/");
  assert.equal(git(repo, "status", "--porcelain"), "", "the marker never dirties the working tree");
  const failedLines = failed.stdout.trim().split("\n").map(JSON.parse);
  assert.match(failedLines[0].message, /pre-impl.*impl.*post-impl/);
  assert.deepEqual(failedLines[1], {});
  // a read-only tool never triggers the advisory
  const readOnly = run("lifecycle.mjs", ["--repo", repo, "--branch", branch, "--harness", "copilot", "--event", "pre-tool-use"], {
    input: JSON.stringify({ sessionId: "reader", cwd: repo, toolName: "bash", toolArgs: { command: "git status" } }),
  });
  assert.equal(readOnly.stdout.trim(), "{}");
});

test("Claude evaluator failures also remain advisory and exit zero", () => {
  const repo = fixture("claude failure");
  const result = run("lifecycle.mjs", ["--repo", repo, "--branch", branch, "--harness", "claude", "--event", "pre-tool-use", "--simulate-error"], {
    input: JSON.stringify({ session_id: "failed-session", cwd: repo, tool_name: "Edit", tool_input: { file_path: "src/change.cs" } }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.out.systemMessage, /pre-impl.*impl.*post-impl/);
  assert.equal(result.out.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal("permissionDecision" in result.out.hookSpecificOutput, false);
});

test("--help prints usage and exits zero", () => {
  const r = run("lifecycle.mjs", ["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /usage: lifecycle\.mjs/);
});

// ── Mirror advisory ───────────────────────────────────────────────────────────────────────────
//
// The trio executes from DEPLOYED mirrors, not tracked source, and every prior guard against a stale
// mirror was conditional on a trigger that was false through a long drift. This advisory is
// unconditional, and its most important property is that it never goes quiet: "could not determine"
// and "all clear" must not look identical.

test("mirror advisory is silent when nothing needs attention", () => {
  assert.equal(
    formatMirrorAdvisory([
      { name: "impl", harness: "claude", scope: "project", state: "ok", needsAttention: false },
      { name: "caveman", harness: "claude", scope: "user", state: "foreign", needsAttention: false },
    ]),
    null,
  );
});

test("a foreign skill alone never raises an advisory", () => {
  assert.equal(
    formatMirrorAdvisory([{ name: "tdd", harness: "claude", scope: "user", state: "foreign", needsAttention: false }]),
    null,
  );
});

test("mirror advisory names each actionable state and its skills", () => {
  const advisory = formatMirrorAdvisory([
    { name: "pre-impl", harness: "claude", scope: "user", state: "misplaced", needsAttention: true },
    { name: "impl", harness: "claude", scope: "project", state: "stale", needsAttention: true },
    { name: "caveman", harness: "claude", scope: "user", state: "foreign", needsAttention: false },
  ]);
  assert.match(advisory, /misplaced: pre-impl \(claude\/user\)/);
  assert.match(advisory, /stale: impl \(claude\/project\)/);
  assert.equal(advisory.includes("caveman"), false);
});

test("a misplaced mirror says reinstalling will not fix it", () => {
  const advisory = formatMirrorAdvisory([{ name: "pre-impl", harness: "claude", scope: "user", state: "misplaced", needsAttention: true }]);
  assert.match(advisory, /NOT repaired by reinstalling/);
  assert.match(advisory, /delete the stray directory/);
});

test("stale and orphaned mirrors point at the install command", () => {
  const advisory = formatMirrorAdvisory([{ name: "old-improve", harness: "codex", scope: "project", state: "orphaned", needsAttention: true }]);
  assert.match(advisory, /orphaned: old-improve \(codex\/project\)/);
  assert.match(advisory, /node scripts\/sdd\/skills\.mjs install --yes/);
});

test("an unreadable status reports rather than going quiet", () => {
  const advisory = formatMirrorAdvisory(null, "`node scripts/sdd/skills.mjs status --json` did not run");
  assert.match(advisory, /could not determine/);
  assert.match(advisory, /skills\.mjs status --json` did not run/);
  assert.match(advisory, /unchecked this session/);
});

test("an actionable advisory says tracked source wins for the current run", () => {
  const advisory = formatMirrorAdvisory([{ name: "impl", harness: "claude", scope: "project", state: "stale", needsAttention: true }]);
  assert.match(advisory, /tracked skills\/<name>\/SKILL\.md is authoritative/);
});

test("the evaluator reads the real mirror status through skills.mjs and folds it into the message", () => {
  const repo = fixture("mirror status");
  write(repo, "skills/alpha/SKILL.md", "---\nname: alpha\ndescription: alpha\n---\n# alpha\n");
  write(repo, ".claude/skills/alpha/SKILL.md", "---\nname: alpha\ndescription: alpha\n---\n# alpha drifted\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "drift");
  const result = evaluate(repo, "main");
  assert.match(result.mirrors, /stale: alpha \(claude\/project\)/);
  assert.ok(result.message.endsWith(result.mirrors));
  assert.match(renderText(result), /\nMirrors: Skill mirrors need attention/);
  // a misplaced copy at user scope is reported too, through SDD_SKILLS_HOME
  const home = fixtureHome("mirror status");
  write(home, ".copilot/skills/alpha/SKILL.md", "---\nname: alpha\ndescription: alpha\n---\n# alpha\n");
  const misplaced = run("lifecycle.mjs", ["--repo", repo, "--branch", "main", "--json", "--no-session-cache"], { env: { SDD_SKILLS_HOME: home } });
  assert.match(misplaced.out.mirrors, /misplaced: alpha \(copilot\/user\)/);
});
