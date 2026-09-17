// Pins the safety envelope of post-impl's YOLO mode — the unattended path that ends by merging a PR with
// nobody watching. Everything else in the trio stops at "pushed a branch"; this is the only place a skill lands
// on the default branch by itself, so the constraints that make that acceptable are asserted rather than
// written down: the mode is feature-branch-only and its prompt is skipped on the default branch; a harness that
// cannot prompt defaults to STANDARD; every fenced `gh pr merge` is `--squash` and never `--admin`/`--force`;
// the T-N entry-quality rule survives auto-accept. Phrase checks are by subject, not exact wording.
//
// Paths: the post-impl skill from config skills.source.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fencedLines, normalize, openRepo } from "./lib/docs-fixture.mjs";

const repo = openRepo(import.meta.url);
const where = repo.skillRel("post-impl");
const raw = () => repo.skill("post-impl");
const text = () => normalize(raw());

test("YOLO is documented with its three behaviors", () => {
  const t = text();
  assert.ok(/\byolo\b/i.test(t), `${where} does not mention YOLO — the mode must be documented where it runs.`);
  assert.ok(/--yolo/i.test(t), `${where} must accept \`yolo\`/\`--yolo\` as an invocation argument (the scripted/cron path).`);
  assert.ok(/auto-accept/i.test(t), `${where} must document the auto-accept-friction behavior.`);
  assert.ok(/flakiness|flaky/i.test(t), `${where} must document the tolerate-flakiness behavior.`);
  assert.ok(/auto-merge/i.test(t), `${where} must document the watch-CI-and-auto-merge behavior.`);
});

test("YOLO is feature-branch-only and its prompt is skipped on the default branch", () => {
  const t = text();
  assert.ok(/YOLO[^.]{0,200}feature[- ]branch[- ]only/i.test(t) || /feature[- ]branch[- ]only[^.]{0,200}YOLO/i.test(t),
    `${where} must state that YOLO specifically is feature-branch-only — an unattended run on the default branch would land with no PR, no review and no CI gate.`);
  assert.ok(/YOLO[^.]{0,240}(main|trunk|default branch)[^.]{0,120}(skip|never|not offered|does not appear|ignored)/i.test(t)
    || /(main|trunk|default branch)[^.]{0,120}(skip|never|not offered|does not appear|ignored)[^.]{0,240}YOLO/i.test(t),
    `${where} must state that the YOLO prompt is skipped entirely on the default branch.`);
});

test("a harness that cannot prompt defaults to STANDARD, never to YOLO", () => {
  const t = text();
  assert.ok(/(cannot prompt|could not prompt|non-?interactive|headless)/i.test(t), `${where} must say what happens when the harness cannot prompt.`);
  assert.ok(/(cannot prompt|could not prompt|non-?interactive|headless)[^.]{0,200}standard/i.test(t),
    `${where} must default a non-promptable run to STANDARD — defaulting to YOLO would make auto-merge the behavior in exactly the context where nobody chose it.`);
});

test("every fenced gh pr merge is a squash and none bypasses the gate", () => {
  // Only fenced blocks count — those are the invocations the skill tells the reader to run. Prose may
  // legitimately mention `gh pr merge --auto` while explaining why native auto-merge was rejected.
  const mergeLines = fencedLines(raw()).filter((l) => l.includes("gh pr merge"));
  assert.ok(mergeLines.length > 0, `${where} documents no \`gh pr merge\` invocation in a fenced block — the YOLO merge step is missing.`);
  for (const line of mergeLines) {
    assert.ok(line.includes("--squash"), `${where}: \`gh pr merge\` without --squash: ${line.trim()} — an unattended merge commit is not intended.`);
    assert.ok(!line.includes("--admin"), `${where}: \`gh pr merge --admin\` bypasses the check gate: ${line.trim()}`);
    assert.ok(!line.includes("--force"), `${where}: \`gh pr merge --force\`: ${line.trim()}`);
  }
});

test("the T-N entry-quality rule survives auto-accept", () => {
  assert.ok(/specific test file[^.]{0,80}specific test name/i.test(text()),
    `${where} lost the T-N entry-quality rule (an entry MUST name a specific test file and a specific test name). Auto-accept writes these entries unreviewed, so an entry that cannot name its target could never be closed.`);
});
