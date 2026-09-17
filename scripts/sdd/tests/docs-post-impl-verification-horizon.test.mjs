// Pins post-impl's verification horizon: base comparisons use the remote-tracking base (never a stale local
// base branch) and merge changes are inspected only once the merge is represented (ORIG_HEAD, the staged merge
// diff); the friction / run-accounting / final-Markdown-gate phase sits between build verification and the
// commit, runs the doc meta-tests as the last Markdown action before staging, and the publish phases never
// mutate tracked or PR-facing Markdown — a post-gate edit returns to the gate. Sections are located by the
// descriptive part of their headings (not the phase number) so a renumbering does not move the pin; clauses
// are matched by subject after whitespace/blockquote normalization.
//
// Paths: the post-impl skill from config skills.source.

import { test } from "node:test";
import assert from "node:assert/strict";
import { assertClauses, indexOfRe, openRepo, section } from "./lib/docs-fixture.mjs";

const repo = openRepo(import.meta.url);
const where = repo.skillRel("post-impl");

const OPENING = /commit-state check/i;
const SDD_DOCS = /Update SDD Documents/i;
const BUILD = /Build Verification/i;
const GATE = /final Markdown gate/i;
const COMMIT = /^Phase\s+\S+\s+—\s+Commit\b/i;
const PR = /Open or refresh the PR/i;
const ACTIONS = /Actions taken/i;

/** The rule the publish phases must state; removing it is the mutation the self-test injects. */
const RETURN_TO_GATE = "edit the Markdown, rerun the doc";

function assertOpeningVerificationHorizon(text) {
  const opening = section(text, OPENING, SDD_DOCS);
  assertClauses(`${where}'s base comparison (opening phase)`, opening, ["origin/", "never a stale local"]);
  assertClauses(`${where}'s merge inspection (opening phase)`, opening, ["ORIG_HEAD", "staged merge diff", "pre-merge tree"]);
}

function assertFinalMarkdownHorizon(text) {
  const build = indexOfRe(text, new RegExp(`^#{1,6}\\s+.*${BUILD.source}`, "im"));
  const gate = indexOfRe(text, new RegExp(`^#{1,6}\\s+.*${GATE.source}`, "im"));
  const commit = indexOfRe(text, new RegExp(`^#{1,6}\\s+${COMMIT.source.replace(/^\^/, "")}`, "im"));
  assert.ok(build >= 0, `${where}: missing the build-verification heading (${BUILD})`);
  assert.ok(gate > build, `${where}: the final Markdown gate phase must physically follow build verification.`);
  assert.ok(commit > gate, `${where}: the final Markdown gate phase must physically precede the commit phase.`);

  const verification = section(text, BUILD, GATE);
  assertClauses(`${where}'s count horizon (build verification)`, verification, ["authoritative counts", "count-bearing"]);
  assertClauses(`${where}'s compatibility decision (build verification)`, verification, ["compatib", "do not infer"]);

  const finalMarkdown = section(text, GATE, COMMIT);
  assertClauses(`${where}'s final Markdown gate`, finalMarkdown, [
    "confirm friction", "central ledgers", "run-log row", "(this commit)", "docs committed; publish follows", "PR-facing Markdown",
  ]);
  const markdownStep = indexOfRe(finalMarkdown, /Finish every Markdown edit/i);
  const testsStep = indexOfRe(finalMarkdown, /Run the docs? meta-tests/i, Math.max(0, markdownStep));
  const stagingStep = indexOfRe(finalMarkdown, /Stage the explicit paths/i, Math.max(0, testsStep));
  assert.ok(markdownStep >= 0, `${where}'s final Markdown gate must contain 'Finish every Markdown edit' as its first step.`);
  assert.ok(testsStep > markdownStep, `${where}'s final Markdown gate must run the doc meta-tests after every Markdown edit.`);
  assert.ok(stagingStep > testsStep, `${where}'s final Markdown gate must make the doc meta-tests the final Markdown action before staging.`);

  const publish = section(text, COMMIT, ACTIONS);
  assertClauses(`${where}'s publish phases' Markdown freeze`, publish, ["must not mutate"]);
  assertClauses(`${where}'s publish phases' return-to-gate rule`, publish, [RETURN_TO_GATE]);
}

function assertInlineFixCommitPath(text) {
  const gate = section(text, GATE, COMMIT);
  assertClauses(`${where}'s separable inline-fix rule (final Markdown gate)`, gate, ["disjoint", "next commit only"]);
  const commit = section(text, COMMIT, PR);
  assertClauses(`${where}'s inline-fix commit path (commit phase)`, commit, ["before either shape above", "sole carve-out", "post-gate Markdown mutation"]);
}

test("base comparisons use the remote-tracking base and merges are inspected once represented", () => {
  assertOpeningVerificationHorizon(repo.skill("post-impl"));
});

test("the final Markdown gate sits between build verification and the commit, and the publish phases freeze Markdown", () => {
  assertFinalMarkdownHorizon(repo.skill("post-impl"));
});

test("inline friction fixes have a separable post-gate commit path", () => {
  assertInlineFixCommitPath(repo.skill("post-impl"));
});

test("the horizon assertions reject a damaged skill (guards the guard)", () => {
  const real = repo.skill("post-impl");
  const damaged = real.replace(RETURN_TO_GATE, "");
  assert.notEqual(damaged, real, `${where} no longer contains '${RETURN_TO_GATE}' verbatim — update the pinned clause`);
  assert.throws(() => assertFinalMarkdownHorizon(damaged), (error) => error.message.includes(RETURN_TO_GATE));
});
