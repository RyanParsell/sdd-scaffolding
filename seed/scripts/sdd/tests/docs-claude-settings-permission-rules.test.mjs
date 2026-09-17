// Guards the harness settings deploy writes: `.claude/settings.json` (when `claude` is a configured harness,
// config skills.harnesses) carries the lifecycle hooks that run `scripts/sdd/lifecycle.mjs`, and any README
// permission rule it carries is the anchored form `Edit(/README.md)` under `ask`. A bare `Edit(README.md)`
// follows gitignore semantics and matches at any depth, so it also gates every `docs/*/README.md` index that
// post-impl writes; `Write(path)` rules are not matched by file permission checks and warn in every session.
// This checks the rules' format only. The Copilot hook file `.github/hooks/sdd-lifecycle.json` is checked the
// same way when `copilot` is a configured harness.
//
// Paths: `.claude/settings.json` and `.github/hooks/sdd-lifecycle.json` are fixed harness locations under the
// root; which harnesses apply comes from config skills.harnesses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openRepo, readLf, warn } from "./lib/docs-fixture.mjs";

const repo = openRepo(import.meta.url);
const ANCHORED_README_RULE = "Edit(/README.md)";
const RULE_LISTS = ["allow", "ask", "deny"];
const LIFECYCLE = "scripts/sdd/lifecycle.mjs";

/** Every problem with the README permission rules in a settings document; empty when correct. */
export function permissionProblems(settingsJson) {
  const problems = [];
  const doc = JSON.parse(settingsJson);
  const permissions = doc.permissions;
  if (!permissions || typeof permissions !== "object") return problems;
  for (const list of RULE_LISTS) {
    const rules = permissions[list];
    if (!Array.isArray(rules)) continue;
    for (const rule of rules) {
      if (typeof rule !== "string") continue;
      if (rule.startsWith("Write(")) {
        problems.push(`permissions.${list}: \`${rule}\` — Write(path) rules are not matched by file permission checks, and Claude Code warns about it in every session. Edit(path) rules already cover all file-editing tools.`);
        continue;
      }
      if (!/README\.md/i.test(rule)) continue;
      if (list === "ask" && rule === ANCHORED_README_RULE) continue;
      problems.push(`permissions.${list}: \`${rule}\` — a README rule must be exactly \`${ANCHORED_README_RULE}\` under \`ask\`. An unanchored filename follows gitignore semantics and matches at any depth, so it also gates every docs/*/README.md index that post-impl writes.`);
    }
  }
  return problems;
}

/** Every hook command string in a Claude settings document or a Copilot hooks document. */
function hookCommands(doc) {
  const commands = [];
  const visit = (node) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === "object") {
      for (const key of ["command", "bash", "powershell"]) if (typeof node[key] === "string") commands.push(node[key]);   // Claude hooks use command; Copilot hooks use bash/powershell
      for (const value of Object.values(node)) visit(value);
    }
  };
  visit(doc.hooks ?? doc);
  return commands;
}

test(".claude/settings.json hooks run scripts/sdd/lifecycle.mjs", (t) => {
  if (!repo.harnesses.includes("claude")) { warn(t, "claude is not in config skills.harnesses — .claude/settings.json not checked"); return; }
  const file = join(repo.root, ".claude", "settings.json");
  assert.ok(existsSync(file), ".claude/settings.json does not exist — deploy merges the lifecycle hooks into it (creating it when absent)");
  const doc = JSON.parse(readLf(file));
  const hooks = doc.hooks ?? {};
  assert.ok(hooks.SessionStart, ".claude/settings.json has no hooks.SessionStart — the lifecycle observer reports mirror and stage state at session start");
  const sessionStart = hookCommands({ hooks: { SessionStart: hooks.SessionStart } });
  assert.ok(sessionStart.some((c) => c.includes(LIFECYCLE)), `.claude/settings.json's SessionStart hook must run ${LIFECYCLE} (found: ${sessionStart.join(" | ") || "none"})`);
  if (!hooks.PreToolUse) warn(t, ".claude/settings.json has no hooks.PreToolUse — the first-mutation advisory will not fire");
  else assert.ok(hookCommands({ hooks: { PreToolUse: hooks.PreToolUse } }).some((c) => c.includes(LIFECYCLE)), `.claude/settings.json's PreToolUse hook must run ${LIFECYCLE}`);
});

test(".claude/settings.json README permission rules are the anchored form only", (t) => {
  if (!repo.harnesses.includes("claude")) { warn(t, "claude is not in config skills.harnesses — .claude/settings.json not checked"); return; }
  const file = join(repo.root, ".claude", "settings.json");
  assert.ok(existsSync(file), ".claude/settings.json does not exist — deploy creates it");
  const problems = permissionProblems(readLf(file));
  assert.equal(problems.length, 0, `.claude/settings.json has ${problems.length} permission-rule problem(s):\n  ${problems.join("\n  ")}`);
});

test(".github/hooks/sdd-lifecycle.json runs scripts/sdd/lifecycle.mjs for Copilot", (t) => {
  if (!repo.harnesses.includes("copilot")) { warn(t, "copilot is not in config skills.harnesses — .github/hooks/sdd-lifecycle.json not checked"); return; }
  const file = join(repo.root, ".github", "hooks", "sdd-lifecycle.json");
  if (!existsSync(file)) { warn(t, ".github/hooks/sdd-lifecycle.json does not exist yet — deploy writes it"); return; }
  const commands = hookCommands(JSON.parse(readLf(file)));
  assert.ok(commands.some((c) => c.includes(LIFECYCLE)), `.github/hooks/sdd-lifecycle.json must run ${LIFECYCLE} (found: ${commands.join(" | ") || "none"})`);
});

test("an unanchored or Write() README rule is reported (guards the guard)", () => {
  const problems = permissionProblems(JSON.stringify({
    permissions: { ask: ["Edit(README.md)", "Write(README.md)", "Edit(/README.md)"], allow: ["Edit(./README.md)"] },
  }));
  assert.equal(problems.length, 3, `expected three problems, got:\n  ${problems.join("\n  ")}`);
  assert.ok(problems.some((p) => p.includes("Write(README.md)")));
  assert.ok(problems.some((p) => p.includes("`Edit(README.md)`")));
  assert.ok(problems.some((p) => p.includes("permissions.allow: `Edit(./README.md)`")));
  assert.deepEqual(permissionProblems(JSON.stringify({ permissions: {} })), []);
  assert.deepEqual(permissionProblems(JSON.stringify({ permissions: { ask: ["Edit(/README.md)"] } })), []);
});
