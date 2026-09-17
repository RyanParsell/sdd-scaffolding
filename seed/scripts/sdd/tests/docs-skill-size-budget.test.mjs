// Pins the SIZE-RULE's deterministic half: skills/sdd.config.json `sizeBudgetBytes` carries a byte budget
// per project skill (`<skills.source>/<name>/SKILL.md`, config skills.project). Budgets only ratchet down —
// a change that shrinks a skill lowers its budget in the same commit — so a skill that grows past its
// budget fails here, naming both numbers. Sizes are CR-stripped so a line-ending flip cannot move them.
// A budget of 0 means "not set yet" (deploy measures it) and is skipped with a warning.
//
// Paths: skills from config skills.source + skills.project; budgets from config sizeBudgetBytes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sizeOf } from "../lib/config.mjs";
import { openRepo, warn } from "./lib/docs-fixture.mjs";

const repo = openRepo(import.meta.url);
const budgets = repo.config.sizeBudgetBytes ?? {};

test("every project skill has a sizeBudgetBytes entry and every budgeted skill exists", () => {
  assert.ok(budgets && typeof budgets === "object", "config sizeBudgetBytes is missing — every project skill is budgeted");
  for (const name of repo.projectSkills) {
    assert.ok(Object.hasOwn(budgets, name),
      `${repo.skillRel(name)} has no sizeBudgetBytes entry in skills/sdd.config.json — every skill in skills.project is budgeted.`);
  }
  for (const name of Object.keys(budgets)) {
    assert.ok(repo.hasSkill(name),
      `skills/sdd.config.json budgets '${name}' but ${repo.skillRel(name)} does not exist — remove the entry when a skill is retired.`);
  }
});

test("no skill exceeds its byte budget (CR-stripped)", (t) => {
  const over = [];
  for (const [name, budget] of Object.entries(budgets)) {
    assert.ok(Number.isInteger(budget) && budget >= 0, `sizeBudgetBytes.${name} must be a non-negative integer (found ${JSON.stringify(budget)})`);
    if (!repo.hasSkill(name)) continue; // reported by the test above
    const bytes = sizeOf(repo.skill(name));
    if (budget === 0) {
      warn(t, `sizeBudgetBytes.${name} is 0 (unset) — ${repo.skillRel(name)} measures ${bytes} bytes; deploy writes the measured size`);
      continue;
    }
    if (bytes > budget) over.push(`${repo.skillRel(name)} is ${bytes} bytes, over its ${budget} budget by ${bytes - budget}`);
  }
  assert.equal(over.length, 0,
    "A skill grew past its budget. Budgets only ratchet down (skills/sdd.config.json, sizeBudgetBytes): a rule that adds " +
    "text removes at least as much — narrative evidence belongs in the ledger, and anything a script performs is deleted " +
    "from the prose (SIZE-RULE, sdd-skill-improve).\n" + over.join("\n"));
});
