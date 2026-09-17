// Pins the FALSIFIABILITY-GATE convention: the gate is stated in full in exactly two skills — pre-impl
// (where a plan's verification is authored) and impl (where it is run) — as byte-identical copies between
// `<!-- FALSIFIABILITY-GATE:START -->` / `<!-- FALSIFIABILITY-GATE:END -->`, equal to the canonical block
// file `<skills.source>/blocks/FALSIFIABILITY-GATE.md` when the target carries one. Every other workflow
// skill cites the gate by name and never copies it. The two-copy exception is safe only because this test
// turns "two copies will drift" into a failure.
//
// Paths: skills from config skills.source; the block file from `<skills.source>/blocks/`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { block, count, has, openRepo, requireBlock, startMarker } from "./lib/docs-fixture.mjs";

const NAME = "FALSIFIABILITY-GATE";
const AUTHORING_POINTS = ["pre-impl", "impl"];
const CITING_SKILLS = ["post-impl", "sdd-skill-improve", "test-improve"];

/** The substantive claims the gate cannot lose — each maps to a shape of check that could not have failed. */
const REQUIRED_CLAIMS = [
  "permanent record", "if the claim were false", "observed", "inferred",
  "assumption it tests", "asserts absence", "positive control", "denominator", "provenance",
  "instrument's reach", "same region", "what unit each instrument counts", "input pipeline",
  "pre-change artifact", "supplies its own context", "gate-control.mjs", "threshold assertion",
  "stated in full in exactly two places",
];

const repo = openRepo(import.meta.url);

test("the gate is stated in full, once, at both authoring points", () => {
  for (const skill of AUTHORING_POINTS) {
    const gate = requireBlock(repo.skill(skill), NAME, repo.skillRel(skill));
    assert.ok(gate.trim().length > 0, `${repo.skillRel(skill)} has an empty ${NAME} block`);
    for (const claim of REQUIRED_CLAIMS) {
      assert.ok(has(gate, claim),
        `${repo.skillRel(skill)}'s ${NAME} block must state '${claim}' — dropping it silently restores the shape of check the gate exists to catch.`);
    }
  }
});

test("the two copies are byte-identical (CR stripped) and match the canonical block file", (t) => {
  const copies = AUTHORING_POINTS.map((skill) => ({ skill, text: requireBlock(repo.skill(skill), NAME, repo.skillRel(skill)) }));
  const [reference, ...others] = copies;
  for (const copy of others) {
    assert.equal(copy.text, reference.text,
      `the ${NAME} block in ${repo.skillRel(copy.skill)} differs from ${repo.skillRel(reference.skill)}. The two copies are deliberate ` +
      "(an inert check is authored into the plan as often as into the run) and this assertion is what keeps that safe — edit both.");
  }
  const canonical = repo.blockFile(NAME);
  if (canonical === null) {
    t.diagnostic(`WARN: ${repo.skillsSource}/blocks/${NAME}.md is not present — copies compared to each other only`);
    return;
  }
  const canonicalBody = block(canonical, NAME);
  assert.ok(canonicalBody !== null, `${repo.skillsSource}/blocks/${NAME}.md must wrap its text in ${startMarker(NAME)} / END markers`);
  for (const copy of copies) {
    assert.equal(copy.text, canonicalBody,
      `the ${NAME} block in ${repo.skillRel(copy.skill)} differs from ${repo.skillsSource}/blocks/${NAME}.md — the block file is canonical; paste it byte for byte.`);
  }
});

test("every other workflow skill cites the gate by name and does not copy it", () => {
  for (const skill of CITING_SKILLS) {
    const text = repo.skill(skill);
    assert.equal(count(text, startMarker(NAME)), 0,
      `${repo.skillRel(skill)} copies the canonical ${NAME} block — cite it by name instead; a third copy is a third thing that drifts.`);
    assert.ok(text.includes(NAME),
      `${repo.skillRel(skill)} must cite ${NAME} by name where it makes a permanent-record claim (suite counts, a harvest's per-cluster diagnosis).`);
  }
});
