// Pins the friction convention in its central-ledger form: the friction ledger (config repo.ledgers.friction)
// holds every F-N (friction with a skill) and the test-health ledger (config repo.ledgers.testHealth) every T-N
// (a flaky or slow test), written by the trio and read by the two harvesters. The convention is prose spread
// across five skills and two ledgers with no compiler to hold it together, so this file does:
//   - the three trio skills carry byte-identical LEDGER-CONVENTION blocks (equal to the block file when present)
//     that name both ledgers, both harvesters, and every load-bearing rule;
//   - each trio skill still shows both bars and both entry templates, and no skill reintroduces the retired
//     per-plan FRICTION:START block;
//   - the ledger header blocks SMALL-FIX-RULE, READ-PROTOCOL, EXPIRY-GATE, SCAN-WATERMARK (friction ledger) and
//     ANTIPATTERN-GATE (test-health ledger) are present, stated once, and cited by name — never restated;
//   - every ledger entry obeys the documented grammar, ids are unique and monotonic, a T-N is never Declined;
//   - ownership is unambiguous (sdd-skill-improve holds F-N, test-improve holds T-N and the ROI ledger);
//   - plans never carry a friction block, and legacy sentinels in the archive stay balanced.
// An empty ledger (header only) passes: a fresh target has no entries yet.
//
// Paths: skills from config skills.source; ledgers from config repo.ledgers.*; plans/artifacts from
// config repo.docs.plans / repo.docs.artifacts; block files from `<skills.source>/blocks/`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HARVESTERS, TRIO, WORKFLOW, block, count, has, normalize, openRepo, requireBlock, startMarker, warn,
} from "./lib/docs-fixture.mjs";

const repo = openRepo(import.meta.url);
const CONVENTION = "LEDGER-CONVENTION";
const LEGACY_START = "<!-- FRICTION:START -->";
const LEGACY_END = "<!-- FRICTION:END -->";

// ---------------------------------------------------------------- the canonical block

test("the trio skills share one byte-identical LEDGER-CONVENTION block", (t) => {
  const copies = TRIO.map((skill) => ({ skill, text: requireBlock(repo.skill(skill), CONVENTION, repo.skillRel(skill)) }));
  const reference = copies.find((c) => c.skill === "impl");
  for (const copy of copies) {
    assert.ok(copy.text.trim().length > 0, `${repo.skillRel(copy.skill)} has an empty ${CONVENTION} block`);
    assert.equal(copy.text, reference.text,
      `${repo.skillRel(copy.skill)}'s ${CONVENTION} block differs from ${repo.skillRel("impl")}'s — all three trio skills carry the identical canonical block.`);
  }
  const canonical = repo.blockFile(CONVENTION);
  if (canonical === null) {
    warn(t, `${repo.skillsSource}/blocks/${CONVENTION}.md is not present — copies compared to each other only`);
    return;
  }
  const canonicalBody = block(canonical, CONVENTION);
  assert.ok(canonicalBody !== null, `${repo.skillsSource}/blocks/${CONVENTION}.md must wrap its text in ${startMarker(CONVENTION)} / END markers`);
  assert.equal(reference.text, canonicalBody,
    `the ${CONVENTION} block in the trio differs from ${repo.skillsSource}/blocks/${CONVENTION}.md — the block file is canonical; paste it byte for byte.`);
});

test("the canonical block documents the whole convention", () => {
  const required = [
    "repo.ledgers.friction", "repo.ledgers.testHealth", "F-N", "T-N", "sdd-skill-improve", "test-improve",
    "Status:", "marked, never deleted", "never expires", "never `Declined`", "Found:", "Decision history",
    "global and monotonic", "errata", "bookend", "impl reads but never fixes", "at most two per trio run",
    "never carry a friction block",
  ];
  for (const skill of TRIO) {
    const body = normalize(requireBlock(repo.skill(skill), CONVENTION, repo.skillRel(skill)));
    for (const phrase of required) {
      assert.ok(body.includes(phrase),
        `${repo.skillRel(skill)}'s ${CONVENTION} block must state '${phrase}' — the convention is only as strong as its weakest copy.`);
    }
  }
});

test("the harvesters cite LEDGER-CONVENTION by name and do not copy it", () => {
  for (const skill of HARVESTERS) {
    const text = repo.skill(skill);
    assert.equal(count(text, startMarker(CONVENTION)), 0, `${repo.skillRel(skill)} copies the ${CONVENTION} block — cite it by name.`);
    assert.ok(text.includes(CONVENTION), `${repo.skillRel(skill)} must cite ${CONVENTION} by name.`);
  }
});

test("every trio skill documents both bars and both entry templates", () => {
  for (const skill of TRIO) {
    const text = repo.skill(skill);
    const where = repo.skillRel(skill);
    assert.ok(/\*\*The bar \(F-N\)/.test(text), `${where} has no '**The bar (F-N)' heading — both bars must be labelled distinctly.`);
    assert.ok(/\*\*The bar \(T-N\)/.test(text), `${where} has no '**The bar (T-N)' heading — every skill that runs tests defines the flake bar.`);
    assert.ok(/^### F-<[^>]+> — /m.test(text), `${where} shows no '### F-<next> — <skill> · <phase> — <title>' entry template.`);
    assert.ok(/^### T-<[^>]+> — /m.test(text), `${where} shows no '### T-<next> — <test file> · <test name>' entry template.`);
    assert.ok(has(text, "test file") && has(text, "test name"),
      `${where}'s T-N template must require a specific test file and test name — an aggregate or unidentified target is a defect in the entry.`);
  }
});

test("no workflow skill reintroduces the per-plan FRICTION:START block", () => {
  for (const skill of WORKFLOW) {
    assert.equal(count(repo.skill(skill), LEGACY_START), 0,
      `${repo.skillRel(skill)} contains the retired ${LEGACY_START} template — friction goes to the ledgers (config repo.ledgers.friction / repo.ledgers.testHealth), never to the plan file.`);
  }
});

// ---------------------------------------------------------------- the inward loop

test("every trio skill reads its own open entries under the READ-PROTOCOL", () => {
  for (const skill of TRIO) {
    const text = repo.skill(skill);
    const where = repo.skillRel(skill);
    assert.ok(repo.citesLedger(text, "friction"), `${where} must name the friction ledger (config repo.ledgers.friction) — the errata read is a grep of that ledger.`);
    assert.equal(count(text, startMarker("READ-PROTOCOL")), 0, `${where} copies the READ-PROTOCOL block — cite the friction ledger's header instead.`);
    assert.ok(text.includes("READ-PROTOCOL"), `${where} must cite READ-PROTOCOL by name at its errata read — naming the ledger alone is not a citation.`);
  }
  assert.ok(repo.skill("impl").includes("impl reads but never fixes"),
    `${repo.skillRel("impl")} must state that it reads but never fixes — fixing is a bookend job; impl stays on the plan.`);
  for (const skill of HARVESTERS) {
    assert.ok(!repo.skill(skill).includes("READ-PROTOCOL"),
      `${repo.skillRel(skill)} must NOT adopt the READ-PROTOCOL — a harvest reads every open entry by design.`);
  }
});

test("every trio skill reports friction in its summary table and justifies the negative", () => {
  for (const skill of TRIO) {
    const text = repo.skill(skill);
    const where = repo.skillRel(skill);
    assert.ok(/^\| Friction \|/m.test(text),
      `${where}'s summary table has no '| Friction | … |' row — without it 'no friction' is indistinguishable from a skipped step.`);
    assert.ok(/bare\s+`?none`?/i.test(text),
      `${where} must state that a bare 'none' is not an acceptable friction result — the negative names why the run produced none.`);
  }
});

// ---------------------------------------------------------------- the ledger header blocks

test("SMALL-FIX-RULE is defined once in the friction ledger and cited everywhere else", () => {
  const ledger = repo.ledger("friction");
  const rule = normalize(requireBlock(ledger.text, "SMALL-FIX-RULE", ledger.rel)).toLowerCase();
  for (const phrase of ["one file", "reversal", "never on", "same commit", "two per trio run", "bounds the edit", "executing environment", "environment versus subject"]) {
    assert.ok(rule.includes(phrase),
      `the SMALL-FIX-RULE block in ${ledger.rel} must state '${phrase}' — dropping a condition widens the carve-out silently.`);
  }
  for (const skill of WORKFLOW) {
    const text = repo.skill(skill);
    assert.equal(count(text, startMarker("SMALL-FIX-RULE")), 0, `${repo.skillRel(skill)} copies the SMALL-FIX-RULE block — cite the friction ledger instead.`);
    if (!/small[- ]fix[- ]rule/i.test(text)) continue;
    assert.ok(repo.citesLedger(text, "friction"),
      `${repo.skillRel(skill)} mentions the small-fix rule without naming the friction ledger (config repo.ledgers.friction) as where it is defined.`);
  }
});

test("READ-PROTOCOL is defined once in the friction ledger with its breadth/depth split", () => {
  const ledger = repo.ledger("friction");
  const protocol = normalize(requireBlock(ledger.text, "READ-PROTOCOL", ledger.rel)).toLowerCase();
  for (const phrase of ["scan every title", "read in full", "silent or irreversible", "harvest is exempt"]) {
    assert.ok(protocol.includes(phrase), `the READ-PROTOCOL block in ${ledger.rel} must state '${phrase}'.`);
  }
});

test("EXPIRY-GATE is defined once in the friction ledger and cited by sdd-skill-improve", () => {
  const ledger = repo.ledger("friction");
  const gate = normalize(requireBlock(ledger.text, "EXPIRY-GATE", ledger.rel)).toLowerCase();
  for (const phrase of ["scanned", "watermark", "max(found, last-scan)", "t-n"]) {
    assert.ok(gate.includes(phrase), `the EXPIRY-GATE block in ${ledger.rel} must state '${phrase}' — dropping a condition restores timeout-based expiry.`);
  }
  const harvest = repo.skill("sdd-skill-improve");
  assert.equal(count(harvest, startMarker("EXPIRY-GATE")), 0, `${repo.skillRel("sdd-skill-improve")} copies the EXPIRY-GATE block — cite the ledger instead.`);
  assert.ok(harvest.includes("EXPIRY-GATE"), `${repo.skillRel("sdd-skill-improve")} must cite EXPIRY-GATE by name in its expiry sweep — the only path that can auto-Decline an entry.`);
});

function watermark(ledger) {
  const body = requireBlock(ledger.text, "SCAN-WATERMARK", ledger.rel);
  const m = /\*\*Scan watermark:\*\*\s*`F-(\d+)`\s*·\s*(\d{4}-\d{2}-\d{2}|\{\{DATE\}\})/.exec(body);
  assert.ok(m, `the SCAN-WATERMARK block in ${ledger.rel} must carry '**Scan watermark:** \`F-<n>\` · <YYYY-MM-DD>' — the expiry gate parses it. Found:\n${body.trim()}`);
  return Number(m[1]);
}

function entries(text, kind) {
  const re = new RegExp(`^### ${kind}-(\\d+)(.*)$`, "gm");
  const hits = [...text.matchAll(re)].map((m) => ({ id: Number(m[1]), heading: m[0], index: m.index, length: m[0].length }));
  return hits.map((h, i) => ({ ...h, body: text.slice(h.index + h.length, i + 1 < hits.length ? hits[i + 1].index : text.length) }));
}

test("the friction ledger carries a parseable scan watermark at or below its highest id", () => {
  const ledger = repo.ledger("friction");
  const mark = watermark(ledger);
  const maxId = Math.max(0, ...entries(ledger.text, "F").map((e) => e.id));
  assert.ok(mark <= maxId, `the scan watermark is F-${mark} but the highest entry is F-${maxId} — a watermark above the corpus opens the expiry gate for unscanned entries.`);
});

test("no entry above the scan watermark is declined as expired", () => {
  const ledger = repo.ledger("friction");
  const mark = watermark(ledger);
  const offenders = entries(ledger.text, "F")
    .filter((e) => e.id > mark)
    .map((e) => ({ e, status: /^\*\*Status:\*\* Declined[^\n]*/m.exec(e.body)?.[0] ?? "" }))
    .filter(({ status }) => /expired/i.test(status))
    .map(({ e, status }) => `  F-${e.id}: ${status.trim()}`);
  assert.equal(offenders.length, 0, `entries above the scan watermark (F-${mark}) carry an expiry Decline — an unscanned entry has not been judged, so it cannot expire:\n${offenders.join("\n")}`);
});

test("ANTIPATTERN-GATE is defined once in the test-health ledger and never copied into a skill", () => {
  const ledger = repo.ledger("testHealth");
  const gate = requireBlock(ledger.text, "ANTIPATTERN-GATE", ledger.rel);
  assert.ok(gate.trim().length > 0, `the ANTIPATTERN-GATE block in ${ledger.rel} is empty`);
  for (const skill of WORKFLOW) {
    assert.equal(count(repo.skill(skill), startMarker("ANTIPATTERN-GATE")), 0, `${repo.skillRel(skill)} copies the ANTIPATTERN-GATE block — cite the test-health ledger instead.`);
  }
});

// ---------------------------------------------------------------- the ledgers themselves

const STATUS = /^\*\*Status:\*\* (Open|Resolved \d{4}-\d{2}-\d{2} — \S.*|Declined \d{4}-\d{2}-\d{2} — \S.*)$/m;
const F_HEADING = /^### F-\d+ — [^·\n]+ · [^—\n]+ — \S.*$/;
const T_HEADING = /^### T-\d+ — [^·\n]+ · \S.*$/;

for (const [key, kind, headingRe, grammar] of [
  ["friction", "F", F_HEADING, "### F-<n> — <skill> · <phase> — <title>"],
  ["testHealth", "T", T_HEADING, "### T-<n> — <test file> · <test name>"],
]) {
  test(`every ${kind}-N entry in the ${key} ledger obeys the documented grammar`, (t) => {
    const ledger = repo.ledger(key);
    const wrongKind = kind === "F" ? "T" : "F";
    assert.ok(!new RegExp(`^### ${wrongKind}-\\d`, "m").test(ledger.text), `${ledger.rel} contains a ${wrongKind}- entry — each ledger holds exactly one kind.`);
    const list = entries(ledger.text, kind);
    if (list.length === 0) { warn(t, `${ledger.rel} (config ${ledger.key}) has no entries yet — grammar checked once the first is written`); return; }

    const problems = [];
    let previous = 0;
    const seen = new Set();
    for (const e of list) {
      const id = `${kind}-${e.id}`;
      if (seen.has(e.id)) problems.push(`  ${id}: duplicate id`);
      seen.add(e.id);
      if (e.id <= previous) problems.push(`  ${id}: ids are global and monotonic — it follows ${kind}-${previous}`);
      previous = Math.max(previous, e.id);
      if (!headingRe.test(e.heading)) problems.push(`  ${id}: heading does not match '${grammar}': ${e.heading}`);
      if (!e.body.includes("**Found:**")) problems.push(`  ${id}: missing **Found:** provenance line`);
      if (!e.body.includes("**What happened:**")) problems.push(`  ${id}: missing **What happened:** line`);
      const statusCount = (e.body.match(/^\*\*Status:\*\* /gm) ?? []).length;
      if (statusCount === 0) problems.push(`  ${id}: missing **Status:** line`);
      else if (statusCount > 1) problems.push(`  ${id}: ${statusCount} **Status:** lines — an entry has exactly one; a later verdict is appended to **Decision history:**`);
      else if (!STATUS.test(e.body)) problems.push(`  ${id}: **Status:** must be 'Open' / 'Resolved <YYYY-MM-DD> — <what/where>' / 'Declined <YYYY-MM-DD> — <reason>'`);
      const historyCount = (e.body.match(/^\*\*Decision history:\*\*/gm) ?? []).length;
      if (historyCount === 0) problems.push(`  ${id}: missing **Decision history:** line`);
      else if (historyCount > 1) problems.push(`  ${id}: ${historyCount} **Decision history:** lines — an entry has exactly one; further events are bullets under it`);
    }
    assert.equal(problems.length, 0, `${ledger.rel} (config ${ledger.key}) has malformed entries (grammar documented in the ledger's own header):\n${problems.join("\n")}`);
  });
}

test("the test-health ledger never declines", () => {
  const ledger = repo.ledger("testHealth");
  assert.ok(!/^\*\*Status:\*\* Declined/m.test(ledger.text),
    `${ledger.rel} carries a Declined status — a T-N is never Declined and never expires; it stays Open until the test is fixed or removed.`);
});

// ---------------------------------------------------------------- ownership

test("harvest ownership is unambiguous: sdd-skill-improve holds F-N, test-improve holds T-N and the ROI ledger", () => {
  const sdd = repo.skill("sdd-skill-improve");
  const testImprove = repo.skill("test-improve");
  assert.ok(repo.citesLedger(sdd, "friction"), `${repo.skillRel("sdd-skill-improve")} must name the friction ledger (config repo.ledgers.friction) as its harvest source.`);
  assert.ok(sdd.includes("test-improve"), `${repo.skillRel("sdd-skill-improve")} must point at test-improve as the T-N harvester.`);
  assert.ok(!/^### T-/m.test(sdd), `${repo.skillRel("sdd-skill-improve")} carries a T-N entry template — the flake track lives in test-improve only.`);
  assert.ok(repo.citesLedger(testImprove, "testHealth"), `${repo.skillRel("test-improve")} must name the test-health ledger (config repo.ledgers.testHealth) as its harvest source.`);
  assert.ok(repo.citesLedger(testImprove, "testRoi"), `${repo.skillRel("test-improve")} must name the ROI ledger (config repo.ledgers.testRoi).`);
  assert.ok(!/^### F-/m.test(testImprove), `${repo.skillRel("test-improve")} carries an F-N entry template — skill friction is sdd-skill-improve's.`);
});

// ---------------------------------------------------------------- plans and the archive

test("plans never carry a friction block or an open F-/T- entry", (t) => {
  const plans = repo.docDir("plans");
  if (!plans) { warn(t, repo.docMissing("plans")); return; }
  const offenders = [];
  for (const plan of plans.files) {
    if (plan.text.includes(LEGACY_START)) offenders.push(`  ${plan.rel}: carries a ${LEGACY_START} block`);
    const hits = [...plan.text.matchAll(/^#{3,4} ([FT]-\d+).*$/gm)];
    for (let i = 0; i < hits.length; i++) {
      const body = plan.text.slice(hits[i].index + hits[i][0].length, i + 1 < hits.length ? hits[i + 1].index : plan.text.length);
      if (/^\*\*Status:\*\*\s*Open\b/m.test(body)) offenders.push(`  ${plan.rel}: ${hits[i][1]} is Open`);
    }
  }
  assert.equal(offenders.length, 0,
    `friction entries found in ${plans.rel} (config ${plans.key}) — they belong in the ledgers (config repo.ledgers.friction / repo.ledgers.testHealth), never in a plan:\n${offenders.join("\n")}`);
});

test("legacy friction sentinels are balanced in every archived plan", (t) => {
  const artifacts = repo.docDir("artifacts");
  if (!artifacts) { warn(t, repo.docMissing("artifacts")); return; }
  const offenders = artifacts.files
    .map((f) => ({ f, starts: count(f.text, LEGACY_START), ends: count(f.text, LEGACY_END) }))
    .filter(({ starts, ends }) => starts !== ends)
    .map(({ f, starts, ends }) => `  ${f.rel}: ${starts} START vs ${ends} END`);
  assert.equal(offenders.length, 0, `unbalanced legacy FRICTION sentinels in ${artifacts.rel} (config ${artifacts.key}) — write prose mentions without the <!-- --> wrapper:\n${offenders.join("\n")}`);
});
