# docs/logs — the operational ledgers

**These are not specs, and they are not grounding material.** Everything in this folder records how
the *process* has behaved — friction hit while running the SDD skills, tests observed misbehaving,
which skills ran when. Nothing here describes what sdd-scaffolding *is*; that is `docs/sdd/`.

The distinction is why this is its own top-level category. These files are living (never archived,
appended forever), which is also what `docs/sdd/` holds, but a grounding pass told to "read the
relevant files in `docs/sdd/`" would sooner or later pull thousands of lines of friction log into a
window that needed the PRD. Separating them keeps the grounding surface small without pretending
the logs are finished work.

The paths below are the defaults; the skills and scripts read them from `skills/sdd.config.json`
(`repo.ledgers.*`), never from this table.

| File | Config key | What it records | Written by | Read by |
|---|---|---|---|---|
| `friction-log.md` | `repo.ledgers.friction` | `F-N` — friction with a **skill itself** | the trio + both harvesters, on every run | **sdd-skill-improve** (weekly harvest); the trio's per-run *errata read* |
| `test-health-log.md` | `repo.ledgers.testHealth` | `T-N` — a flaky or slow **test** | whoever observed it | **test-improve** (flake track) |
| `test-roi-log.md` | `repo.ledgers.testRoi` | verdicts from the test-time ROI sweep | test-improve | test-improve (ROI track) |
| `sdd-run-log.md` | `repo.ledgers.runLog` | one row per completed `pre-impl` / `impl` / `post-impl` run | each skill, as its final act | post-impl's archive-time check; anyone auditing whether the guidelines were followed |

## How they are reached

- **Targeted, never wholesale.** The trio greps for the `Open` entries naming the one skill about to
  run (`grep -n '^### F-.* — <skill>' docs/logs/friction-log.md`). A full read is a harvester's job.
- **By id.** `F-N` and `T-N` are global and monotonic per ledger; the bare id is the whole address.
- **Never deleted.** Entries are *marked* — `Open` / `Resolved <date>` / `Declined <date>` — and carry
  a `**Decision history:**` so a proposed fix must confront prior attempts. That is the A→B→A thrash
  guard, and it only works because nothing is ever removed.

The entry grammar, and the canonical **inline small-fix rule** that both cadences apply, live in
`friction-log.md`'s own header — stated once there and cited by name from the skills. The ledgers own
five canonical blocks, each bracketed by HTML-comment `NAME:START` … `NAME:END` sentinels:
`SMALL-FIX-RULE`, `READ-PROTOCOL`, `EXPIRY-GATE` and `SCAN-WATERMARK` in the friction log,
`ANTIPATTERN-GATE` in the test-health log. The skills cite them by name and never restate them; the
doc meta-tests check the sentinels are present. Write prose mentions of a sentinel without the
comment wrapper, as this paragraph does — the scripts locate a block with a non-greedy START…END
match, so a stray literal sentinel anywhere brackets the wrong span.

## Adding a log

A new ledger belongs here when it accumulates observations about the process across runs. If it
describes the product or how it is built, it is a spec and belongs in `docs/sdd/`; if it is a dated
record of one completed piece of work, it belongs in `docs/artifacts/`.
