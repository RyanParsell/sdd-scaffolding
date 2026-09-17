# Test ROI Log

**Status:** Living · **Started:** 2026-09-16 · append-only

Ledger of tests judged by the `test-improve` skill's return-on-investment sweeps of the suites named
in the profile document's *Suite layers* table (config `repo.docs.profile`). **Append-only** — a prior
row is never edited or deleted; a test whose situation changes later gets a new, dated row. A test
already listed here is excluded from future scans (that is what keeps repeat runs cheap).

Verdict vocabulary: `Necessary` / `Fixed <date> — <what changed, before→after time>` /
`Redundant-removed <date> — <what was kept and why>` / `Noted <date> — <where the real fix belongs>`
(resolve-with-note) / `Declined <date> — <reason>` (not `Noted` — the two are distinct).

Rows written under the flake track (a `T-N` fix that moved a runtime) say so in the note, so a later
ROI sweep can tell a measured verdict from a side effect. Report timings with the machine state that
produced them and prefer counts (tests, renders, host starts) over wall-clock where a count exists —
see `A-7` in the test-health ledger.

| Test | File | Bucket | Verdict | Date | Note |
|------|------|--------|---------|------|------|
