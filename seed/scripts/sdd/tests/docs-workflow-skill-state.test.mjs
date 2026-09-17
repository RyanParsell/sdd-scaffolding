// Pins explicit outcomes for workflow states that previously required improvisation, each scoped to the phase
// that owns it so a historical example elsewhere cannot satisfy it: pre-impl's no-topic invocation, deferred
// grill and rolling-plan continuation; test-improve's product-defect and deferred hand-offs; impl's
// file-and-leave-red discovery outcome through cleanup, commit and report; sdd-skill-improve's directed-only
// versus mixed scope; post-impl's kept-blocked plan, interrupted-run resume and mid-run authority change.
// Sections are located by the descriptive part of their headings; clauses are matched by subject.
//
// Paths: skills from config skills.source.

import { test } from "node:test";
import assert from "node:assert/strict";
import { assertClauses, openRepo, section } from "./lib/docs-fixture.mjs";

const repo = openRepo(import.meta.url);
const rel = (name) => repo.skillRel(name);
const PINNED_CLAUSE = "may commit this narrow expected-red exception";

function assertPreImplNoTopicOutcome(text) {
  const invocation = section(text, /^Arguments$/i, /hotbug/i);
  assertClauses(`${rel("pre-impl")}'s invocation contract`, invocation, ["no-topic", "resolve the topic explicitly", "no plan produced"]);
}

function assertPreImplDeferredGrill(text) {
  const grill = section(text, /Understand the feature/i, /Pick the build strategy/i);
  assertClauses(`${rel("pre-impl")}'s deferred-grill state`, grill, ["deferred-grill", "grounded evidence", "open questions", "not locked decisions", "resume"]);
}

function assertPreImplRollingPlan(text) {
  const plan = section(text, /write the plan/i, /Actions taken/i);
  assertClauses(`${rel("pre-impl")}'s rolling-plan state`, plan, ["rolling initiative", "standing parent", "current round", "does not archive"]);
}

function assertTestImproveDefectHandoff(text) {
  const decisions = section(text, /^Phase F2\b/i, /^Phase F3\b/i);
  assertClauses(`${rel("test-improve")}'s defect outcomes (Phase F2)`, decisions, [
    "deterministic production defect", "not a T-N flake", "product-defect finding", "deliberately deferred real defect",
    "evidence and exact target", "never Declined", "never expires", "chosen rung",
  ]);
  const handoff = section(text, /^Phase F3\b/i, /^Track B\b/i);
  assertClauses(`${rel("test-improve")}'s defect handoff (Phase F3)`, handoff, [
    "fix deliverables from product-defect", "product-defect finding/bug-plan", "leave every affected T-N Open",
    "no clean-run requirement", "consecutive-clean", "deferred rung d",
  ]);
}

function assertImplExpectedRedOutcome(text) {
  const implementation = section(text, /Implement \(test-first\)/i, /Merge Worktrees/i);
  assertClauses(`${rel("impl")}'s discovery-found-defect outcome`, implementation, [
    "file-and-leave-red", "discovery/investigation boundary", "separately filed real product defect", "blocks the exact proving journey",
    "build must be green", "outside the exact named blocking set", "reproduce the exact named expected failures", "no unrelated red", "no weakened assertion",
  ]);
  const cleanup = section(text, /Clean Up Worktrees/i, /Local .*commit/i);
  assertClauses(`${rel("impl")}'s expected-red cleanup gate`, cleanup, [
    "expected-red exception", "integration completeness", "green non-blocking suite", "exact expected-red reproduction", "otherwise preserve the worktrees",
  ]);
  const commit = section(text, /Local .*commit/i, /Actions taken/i);
  assertClauses(`${rel("impl")}'s expected-red commit exception`, commit, [PINNED_CLAUSE, "product-defect plan/issue", "exact owed tests", "0 failures"]);
  const summary = section(text, /Actions taken \(summary/i, /Friction/i);
  assertClauses(`${rel("impl")}'s expected-red report`, summary, ["expected red", "N/M", "K exact expected failures", "defect reference", "post-impl"]);
}

function assertSddSkillImproveScope(text) {
  const scan = section(text, /^Phase 1 — Scan/i, /^Phase 2 — Decide/i);
  assertClauses(`${rel("sdd-skill-improve")}'s invocation scope (scan)`, scan, [
    "directed-only", "mixed directed-plus-ranked", "pre-decided", "bypass ranking slots", "scope only", "full flip and deliverable bookkeeping",
  ]);
}

function assertPostImplBlockedPlan(text) {
  const handling = section(text, /Plan handling/i, /Agent Instructions/i);
  assertClauses(`${rel("post-impl")}'s blocked-plan state (plan handling)`, handling, ["kept, blocked", "blocking plan", "actionable"]);
}

function assertPostImplInterruptedRun(text) {
  const opening = section(text, /commit-state check/i, /Update SDD Documents/i);
  assertClauses(`${rel("post-impl")}'s interrupted-run state (opening phase)`, opening, ["interrupted prior run", "durable", "take stock", "first incomplete phase"]);
}

function assertPostImplAuthorityChange(text) {
  const mode = section(text, /Mode selection/i, /commit-state check/i);
  assertClauses(`${rel("post-impl")}'s authority-change state (mode selection)`, mode, ["authority narrows", "immediately re-announce", "cannot widen", "auto-merge mid-run"]);
}

test("pre-impl has an explicit no-topic outcome", () => assertPreImplNoTopicOutcome(repo.skill("pre-impl")));
test("pre-impl can defer the grill without locking open questions", () => assertPreImplDeferredGrill(repo.skill("pre-impl")));
test("pre-impl represents a rolling plan as a continuation", () => assertPreImplRollingPlan(repo.skill("pre-impl")));
test("test-improve preserves product-defect and deferred hand-offs", () => assertTestImproveDefectHandoff(repo.skill("test-improve")));
test("impl discovery can file a real defect and leave the journey honestly red", () => assertImplExpectedRedOutcome(repo.skill("impl")));
test("sdd-skill-improve distinguishes directed-only from mixed scope", () => assertSddSkillImproveScope(repo.skill("sdd-skill-improve")));
test("post-impl names the kept-blocked plan state and its exit", () => assertPostImplBlockedPlan(repo.skill("post-impl")));
test("post-impl resumes an interrupted run from durable state", () => assertPostImplInterruptedRun(repo.skill("post-impl")));
test("post-impl allows immediate narrowing but never mid-run widening", () => assertPostImplAuthorityChange(repo.skill("post-impl")));

test("the state assertions reject a damaged skill (guards the guard)", () => {
  const real = repo.skill("impl");
  const damaged = real.replace(new RegExp(PINNED_CLAUSE, "i"), "");
  assert.notEqual(damaged, real, `${rel("impl")} no longer contains '${PINNED_CLAUSE}' — update the pinned clause`);
  assert.throws(() => assertImplExpectedRedOutcome(damaged), (error) => error.message.toLowerCase().includes(PINNED_CLAUSE));
});
