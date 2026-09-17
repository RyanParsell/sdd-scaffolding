// Pins the plan-time and run-time contract for multi-agent execution: pre-impl names one explicit execution
// mode per work unit (sequential primary tree / serialized in-tree implementer / isolated worktree), records
// the intended base, owned files and seam ownership in the plan, and coordinates seams with concurrent plans;
// impl's worktree mode verifies the intended base before any edit (a worktree does not simply inherit the
// checked-out branch), enforces ownership with before/after diff checks and stop rules, and its serialized mode
// pins the base per unit, takes stock on resume and stops on source changes. Sections are located by the
// descriptive part of their headings; clauses are matched by subject after normalization.
//
// Paths: the pre-impl and impl skills from config skills.source.

import { test } from "node:test";
import assert from "node:assert/strict";
import { assertAbsent, assertClauses, openRepo, section } from "./lib/docs-fixture.mjs";

const repo = openRepo(import.meta.url);
const preImpl = repo.skillRel("pre-impl");
const impl = repo.skillRel("impl");

const IMPLEMENT = /Implement \(test-first\)/i;
const MERGE_WORKTREES = /Merge Worktrees/i;
const PINNED_CLAUSE = "pin the base per unit";

function assertPreImplExecutionMode(text) {
  const strategy = section(text, /Pick the build strategy/i);
  assertClauses(`${preImpl}'s execution-mode schema (build strategy)`, strategy,
    ["execution mode", "sequential primary tree", "serialized in-tree implementer", "isolated worktree"]);
}

function assertPreImplPlanOwnership(text) {
  const plan = section(text, /write the plan/i, /Actions taken/i);
  assertClauses(`${preImpl}'s per-work-unit schema (plan writing)`, plan,
    ["intended base commit", "owned files", "coordinator-owned shared files", "seam implementer/owner", "before/after diff", "stop conditions"]);
}

function assertPreImplConcurrentPlanCoordination(text) {
  const grounding = section(text, /Ground in the current system/i, /Understand the feature/i);
  assertClauses(`${preImpl}'s concurrent-plan coordination (grounding)`, grounding,
    ["sibling plans", "shared files or seams", "exchange and record", "locked seam decision"]);
}

function assertImplWorktreeContract(text) {
  const implementation = section(text, IMPLEMENT, MERGE_WORKTREES);
  assertClauses(`${impl}'s verified-base worktree mode`, implementation,
    ["verified-base worktree", "provisioning may start", "git log -1", "merge-base --is-ancestor", "--ff-only", "benign lag", "stop on divergence"]);
  assertClauses(`${impl}'s worktree ownership contract`, implementation,
    ["disjoint owned files", "coordinator-owned shared files", "seam implementer/owner", "before diff", "after diff", "stop on out-of-scope changes"]);
  assertAbsent(`${impl}'s worktree mode`, implementation,
    ["worktree branches off the currently checked-out branch", "agents inherit the committed plan"]);
}

function assertImplSerializedContract(text) {
  const implementation = section(text, IMPLEMENT, MERGE_WORKTREES);
  assertClauses(`${impl}'s serialized in-tree mode`, implementation,
    ["serialized in-tree implementer", "exactly one implementer edits at a time", PINNED_CLAUSE, "docs-only coordinator commits", "stop on source changes", "before diff", "after diff"]);
  assertClauses(`${impl}'s serialized resume/interlock contract`, implementation,
    ["take-stock on resume", "regenerated output", "running host holds"]);
}

test("pre-impl requires one explicit execution mode per work unit", () => assertPreImplExecutionMode(repo.skill("pre-impl")));
test("pre-impl records base, file and seam ownership in the plan", () => assertPreImplPlanOwnership(repo.skill("pre-impl")));
test("pre-impl records seam decisions shared with concurrent plans", () => assertPreImplConcurrentPlanCoordination(repo.skill("pre-impl")));
test("impl worktrees verify the intended base, enforce ownership and stop rules, and do not claim to inherit the checked-out branch", () => assertImplWorktreeContract(repo.skill("impl")));
test("impl serialized mode pins each unit, takes stock on resume and stops on source changes", () => assertImplSerializedContract(repo.skill("impl")));

test("the contract assertions reject a damaged skill (guards the guard)", () => {
  const real = repo.skill("impl");
  const damaged = real.replace(new RegExp(PINNED_CLAUSE, "i"), "");
  assert.notEqual(damaged, real, `${impl} no longer contains '${PINNED_CLAUSE}' — update the pinned clause`);
  assert.throws(() => assertImplSerializedContract(damaged), (error) => error.message.toLowerCase().includes(PINNED_CLAUSE));
});
