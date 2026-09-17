// Pins the trio run-accounting convention: the run log (config repo.ledgers.runLog) is the append-only
// record of when pre-impl / impl / post-impl actually ran, who ran them, and on what plan. Every data row
// matches `| <UTC minute timestamp Z> | <pre-impl|impl|post-impl> | <user> | <plan path> | <branch> | <outcome> |`
// with no pipe inside a cell, and the outcome carries a friction token (`F-N logged` / `F-N resolved` /
// `no friction — <reason>`). An empty ledger (header only) passes: a fresh target has no rows yet. Each trio
// skill appends its own row, and post-impl checks the log before archiving a plan.
//
// Paths: the run log from config repo.ledgers.runLog; skills from config skills.source.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TRIO, openRepo, warn } from "./lib/docs-fixture.mjs";

const repo = openRepo(import.meta.url);

const ROW = /^\| \d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z \| (pre-impl|impl|post-impl) \| [^|]+ \| [^|]+ \| [^|]+ \| ([^|]+) \|$/;
const POSITIVE_TOKEN = /\bF-\d+\b/;
const NEGATIVE_TOKEN = /no friction\s*—\s*\S+/i;

/** Every table row after the header and separator: the data rows the grammar binds. */
function dataRows(text) {
  const rows = [];
  let afterHeader = false;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.startsWith("|")) continue;
    if (/^\|\s*Time\b/i.test(line)) { afterHeader = true; continue; }
    if (/^\|[-| :]+\|$/.test(line)) continue;
    if (afterHeader) rows.push(line);
  }
  return rows;
}

test("every run-log row matches the documented grammar and carries a friction token", (t) => {
  const log = repo.ledger("runLog");
  const rows = dataRows(log.text);
  if (rows.length === 0) { warn(t, `${log.rel} (config ${log.key}) has no rows yet — the trio seeds it with its own runs`); return; }

  const offenders = [];
  for (const row of rows) {
    const m = ROW.exec(row);
    if (!m) { offenders.push(`  grammar: ${row}`); continue; }
    const outcome = m[2];
    if (!POSITIVE_TOKEN.test(outcome) && !NEGATIVE_TOKEN.test(outcome)) offenders.push(`  no friction token: ${row}`);
  }
  assert.equal(offenders.length, 0,
    `${log.rel} (config ${log.key}) rows violate the grammar '| UTC | skill | user | plan | branch | outcome |' (no pipe inside a cell; the outcome ends with ` +
    `'F-N logged' / 'F-N resolved' / 'no friction — <reason>' — a bare 'none' is the reflex the token exists to convert into a claim):\n${offenders.join("\n")}`);
});

test("the run log's header documents the row grammar and the friction token", () => {
  const log = repo.ledger("runLog");
  assert.ok(/Row grammar/i.test(log.text), `${log.rel} must document its row grammar in its header.`);
  assert.ok(/friction token/i.test(log.text), `${log.rel}'s header must document the friction token the outcome cell carries.`);
  assert.ok(/no friction\s+—/i.test(log.text), `${log.rel} must show the negative form ('no friction — <reason>') so the reason requirement is legible from the ledger itself.`);
});

test("every trio skill appends to the run log", () => {
  for (const skill of TRIO) {
    assert.ok(repo.citesLedger(repo.skill(skill), "runLog"),
      `${repo.skillRel(skill)} never names the run log (config repo.ledgers.runLog) — every trio skill appends its own row as its final act, or absence-of-a-row stops meaning anything.`);
  }
});

test("post-impl checks the run log before archiving a plan", () => {
  const text = repo.skill("post-impl");
  assert.ok(/run[- ]log[^.\n]{0,200}archiv|archiv[^.\n]{0,200}run[- ]log/i.test(text),
    `${repo.skillRel("post-impl")} must check the run log (config repo.ledgers.runLog) when archiving a plan and WARN on missing pre-impl/impl rows — that check is the accounting value of the log.`);
});
