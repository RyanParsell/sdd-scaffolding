// Pins the canonical workflow blocks that are stated once and cited everywhere else:
//   EDIT-MECHANISM   — stated once in impl; cited by post-impl and sdd-skill-improve.
//   SUITE-DENOMINATOR — stated once in impl; cited by post-impl and test-improve.
//   MIRROR-ADVISORY  — stated once in pre-impl; cited by impl, post-impl, sdd-skill-improve, test-improve.
// Each copy sits between `<!-- NAME:START -->` / `<!-- NAME:END -->`, is byte-equal (CR stripped) to the
// canonical block file `<skills.source>/blocks/NAME.md` when the target carries one, and keeps every claim it
// cannot lose. A skill that restates a block instead of citing it fails here.
//
// Paths: skills from config skills.source; block files from `<skills.source>/blocks/`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { block, count, has, openRepo, requireBlock, startMarker } from "./lib/docs-fixture.mjs";

const repo = openRepo(import.meta.url);

/** name → owner skill, the claims the block cannot lose, and the skills that cite it by name. */
const BLOCKS = [
  {
    name: "EDIT-MECHANISM",
    owner: "impl",
    claims: ["literal-text", "--numstat", "byte-check", "BOM", "escaping depth", "replacement count"],
    citedBy: ["post-impl", "sdd-skill-improve"],
  },
  {
    name: "SUITE-DENOMINATOR",
    owner: "impl",
    claims: [
      "exited", "denominator", "suite-run.mjs", "repo.commands.build", "repo.commands.test", "repo.testRunner",
      "BUILD_FAILED", "RUNNER_TERMINATED", "TESTHOST_FAILED", "ZERO_MATCH", "DENOMINATOR_MISMATCH",
    ],
    citedBy: ["post-impl", "test-improve"],
  },
  {
    name: "MIRROR-ADVISORY",
    owner: "pre-impl",
    claims: ["lifecycle.mjs", "skills.mjs status", "stale", "misplaced", "orphaned", "unconditional", "next invocation", "user scope"],
    citedBy: ["impl", "post-impl", "sdd-skill-improve", "test-improve"],
  },
];

for (const { name, owner, claims, citedBy } of BLOCKS) {
  test(`${name} is stated once in ${owner} with every claim`, () => {
    const body = requireBlock(repo.skill(owner), name, repo.skillRel(owner));
    assert.ok(body.trim().length > 0, `${repo.skillRel(owner)} has an empty ${name} block`);
    for (const claim of claims) {
      assert.ok(has(body, claim),
        `${repo.skillRel(owner)}'s ${name} block must state '${claim}' — each claim closes a friction pattern the block was written for; dropping one reopens it.`);
    }
  });

  test(`${name} in ${owner} matches the canonical block file`, (t) => {
    const body = requireBlock(repo.skill(owner), name, repo.skillRel(owner));
    const canonical = repo.blockFile(name);
    if (canonical === null) {
      t.diagnostic(`WARN: ${repo.skillsSource}/blocks/${name}.md is not present — the copy in ${owner} is the only statement`);
      return;
    }
    const canonicalBody = block(canonical, name);
    assert.ok(canonicalBody !== null, `${repo.skillsSource}/blocks/${name}.md must wrap its text in ${startMarker(name)} / END markers`);
    assert.equal(body, canonicalBody,
      `the ${name} block in ${repo.skillRel(owner)} differs from ${repo.skillsSource}/blocks/${name}.md — the block file is canonical; paste it byte for byte.`);
  });

  test(`${name} is cited by name, not copied, in ${citedBy.join(", ")}`, () => {
    for (const skill of citedBy) {
      const text = repo.skill(skill);
      assert.equal(count(text, startMarker(name)), 0,
        `${repo.skillRel(skill)} copies the ${name} block — cite it by name; a second copy drifts.`);
      assert.ok(text.includes(name),
        `${repo.skillRel(skill)} must cite ${name} by name where it applies the rule the block states.`);
    }
  });
}
