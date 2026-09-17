---
name: sdd-skill-improve
description: Weekly harvester for skill friction. Reads every open F-N entry in the friction ledger, runs the harvest script for the deterministic facts (open set, expiry list, watermark, seams, slug, listing sweep, mirror parity, skill sizes), clusters the open points by root cause, ranks them by frequency, severity and recency, surfaces week-over-week recurring patterns, grills the developer through the top N, and hands the locked decisions to pre-impl, which cuts the branch and writes the plan. Never edits tracked source itself. Every skill edit obeys the SIZE-RULE. T-N entries belong to test-improve. Developer-only.
user_invocable: true
version: 1.0.1
# ⚠️ IMPORTANT: When editing this file, increment the patch version above (e.g., 1.0.0 → 1.0.1).
---

## SDD Skill Improvement: $ARGUMENTS

*This copy is the target repository's own: improve it here, through its own harvest.*

**First step of every run:** read `skills/sdd.config.json` and the profile document
(config `repo.docs.profile`). State the resolved commands and paths in the plan's Actions-taken
table; never state a repo command from memory.

The trio (pre-impl → impl → post-impl) and the harvesters end each run by appending **friction** to the
central ledgers: the friction ledger (config `repo.ledgers.friction`) holds `F-N` (friction with a
skill) and the test-health ledger (config `repo.ledgers.testHealth`) holds `T-N` (a flaky or slow
test). One ledger per kind holds the whole open-work surface; each entry carries `**Found:**`
provenance and a `**Decision history:**` under the `LEDGER-CONVENTION` block (stated in pre-impl,
impl and post-impl; cited here, never restated).

**This skill owns `F-N` only.** A `T-N` is **test-improve**'s: never expire, decline, count or table one
here — if the scan sees open `T-N` points, say so in one line and point at **test-improve**.

One track — **Scan** (Phase 1), **Decide** (Phase 2), **Hand off** (Phase 3) — plus the standing sweep
(Phase 3b) and the report (Phase 4). `$ARGUMENTS` may scope a run to one skill or one `F-N`.

### Seven skills, two cadences

`pre-impl`, `impl`, `post-impl`, `sdd-skill-improve`, `test-improve`, `tdd` and `git-recenter` are one
system (config `skills.project`); any of them — this file included — is a legitimate `F-N` target. The
cadence decides where a new step goes: **per-build** (the trio, many times a week — a step costs its
time × every build), **refinement** (the two harvesters, weekly — × ~1); the technique skills (`tdd`,
`git-recenter`) inherit the cadence of whichever skill invokes them. A check on a run's own work
belongs in the trio; a sweep of a standing surface belongs here.

> **This skill PLANS; structural fixes go through the trio.** It never modifies tracked source: pre-impl
> cuts the branch and writes the plan, impl applies the `SKILL.md` edits and the `**Status:**` flips,
> post-impl publishes. The one carve-out is the **`SMALL-FIX-RULE` stated in the friction ledger's
> header** — read it there; its per-run cap applies to whatever a harvest resolves directly. Anything
> wider — several skills, a convention, a meta-test — is structural. When unsure, plan. (This skill
> once edited skills on whatever branch was checked out, including the default branch; delegating
> also means impl's verify/commit rules are not duplicated here.)

### The `**Status:**` convention (canonical, shared by both kinds)

Every entry is `### F-N — <skill> · <phase> — <title>` (`### T-N — <file> · <test>`), then
`**Found:**`, `**What happened:**`, optional `**Recommendation:**`, exactly one final
`**Status:**` line, and `**Decision history:**`. Status values:

- `**Status:** Open` — unresolved (the default at creation).
- `**Status:** Resolved <YYYY-MM-DD> — <what changed & where>`
- `**Status:** Declined <YYYY-MM-DD> — <why it will not be acted on>`

Rules: "unaddressed" = `Open`. Resolving flips this line **and** appends a dated `**Decision history:**`
bullet (the A→B→A thrash guard). **Never delete an entry or reword its prose.** Ids are global and
monotonic per ledger; the bare id is the address. `Declined` is an **`F-N` verdict only** — a `T-N` is
never declined and never expires.

## The script — deterministic facts, one JSON each

`node scripts/sdd/harvest.mjs <subcommand> --json` prints one JSON object (errors are JSON on stderr,
exit 1). Configuration and facts live in **`skills/sdd.config.json`** — the `harvest` block
(`expiryDays`, `topN`, `patternWeeks`, `slugPrefixes`, `seamPaths`), the ledger and plan paths under
`repo`, the `sweep` scope, the harnesses under `skills`, and the per-skill byte budgets in
`sizeBudgetBytes`. The script's own tests run with the doc meta-suite (config `repo.commands.docTests`).

| Subcommand | Emits | Who runs it |
|---|---|---|
| `scan` | `head`, fetch/behind count, every open `F-N` with full text (`--id` narrows), skill·phase, history form, sighting dates, gated age, the watermark, the **expiry list**, the open `T-N` count | harvest |
| `digest` | the open corpus as paged text — id, skill·phase, sightings, age, `What happened` truncated to `harvest.digestWhatChars`, full `Recommendation` | harvest |
| `patterns` | skill·phase groups with their ISO weeks; `recurring` = groups active in ≥ `harvest.patternWeeks` weeks | harvest |
| `seams` | open PRs overlapping `harvest.seamPaths`; max `F-N` across the default branch and every open head | harvest |
| `slug` | `<skill>-<YYMMDD><letter>` in the feature-branch pattern (config `repo.branches.feature`) — lowest unused letter across branches, plan dirs and git history; `--skill` picks the prefix | harvest |
| `sweep` | project-structure listing (config `sweep.listing`): `stale` (referenced, absent) and `missing` (tracked, unlisted) | harvest |
| `parity` | every harness mirror vs tracked source, content with line endings normalized **and** version; `ok` | harvest, impl, post-impl |
| `size` | bytes per skill (CR stripped) vs `sizeBudgetBytes`; `ok` | harvest, impl |
| `flips --decisions <file>` | applies `{id, status, historyBullet}` entry-scoped, both history forms, verified per entry | **impl only** |
| `watermark --to F-N --date D --note <text>` | rewrites the `SCAN-WATERMARK` block in the grammar the meta-test parses | **impl only** |

The writing subcommands run from the plan's decisions JSON, under impl's **EDIT-MECHANISM** block —
cited here by name, never restated.

## Expiration — the sweep behind the watermark (F-N only)

`scan` computes it under the **`EXPIRY-GATE`** stated in the friction ledger's header: an entry
expires only if it is at or below the **scan watermark** *and* older than `harvest.expiryDays` on the
gated clock `max(Found, last-scan)`. Entries above the watermark are ineligible, not deprioritized;
they still cluster. **The script identifies; the plan writes** — each expiry is a
`**Status:** Declined <today> — expired: no action taken within <expiryDays> days of its Found date`
flip carried into the plan, and the watermark advance (the highest id this run clustered, dated today)
is a plan deliverable applied by impl's `watermark` call. Report the list even when empty; state the
watermark either side — `scanned through F-<n> (was F-<m>)` — and how many entries sat above the old
mark. A run with expirations but no clusters still hands off.

## Phase 1 — Scan (F-N: skill friction)

1. **State the mirror advisory** per the `MIRROR-ADVISORY` block in pre-impl: no advisory present, all
   current, the named stale/misplaced/orphaned skills, or could not determine. When it is absent or
   inconclusive, run `node scripts/sdd/skills.mjs status --json` yourself and act on that.
2. **Run `scan`, `patterns`, `seams`.** If `behindOriginMain > 0`, pull first and re-run — a stale
   ledger clusters entries trunk already resolved. The harvest reads **every** open entry, by design
   (`digest` pages it; `scan --id` gives full text); skip template placeholders (`<…>`). Friction
   blocks inside archived plans, where a repo has them, are historical record — never re-harvested.
3. **Take the expiry list from `scan`** (above). Survivors continue.
4. **Cluster by root cause, not by entry.** A cluster is **one sentence naming the single change that
   resolves it**; evict any entry the sentence does not cover; one that cannot be reduced to one
   sentence is two clusters. Cluster on the `Recommendation` (the fix), not the heading (the phase).
   Frequency = entry count.
5. **Rank** by frequency × severity × recency: severity from the worst `What happened` (a silent
   shipped defect outranks an annoyance); recency de-weights a cluster with no recent recurrence but
   never promotes one on its own.
   - **5b. Look back — do not thrash.** `git log --since='45 days ago' --date=short --format='%h %ad %s' -- skills/`
     (the skills directory is config `skills.source`) and the last commits on each target. Re-read
     the **current** text the cluster targets: if it already says what the entries ask, the cluster is
     **already fixed** — plan its flip (`Resolved <today> — already addressed by <commit>, verified
     against current text`) and drop it from the ranking. If fixing it would reverse a recent
     deliberate decision, that is a **question for the developer** (`F-N asks for X; <plan> chose
     not-X on <date>`), never a quiet re-flip.
   - **5c. Broad patterns.** Every `patterns.recurring` group (activity in ≥ `harvest.patternWeeks`
     distinct weeks) gets its **own row** marked `⟳ recurring`. Its remedy must be **structural** — a
     script, a meta-test, a config value, a deleted step — never another prose clause on the same
     phase. A recurring group may be selected in place of a top-N cluster; the developer decides.
6. **Print the full ranked table** — every cluster, as a Markdown table, never prose:
   `| # | Issue (one line) | Entries | Frequency | Severity | Span | Look-back | Rank |`. Nothing
   surviving is a clean result: say so and stop.
7. **State the top N** (config `harvest.topN`) and offer a swap from the table.

**Invocation scope is explicit.** **directed-only** — the default when `$ARGUMENTS` names a skill or
an `F-N`: scope the scan to it, skip corpus clustering and ranking, resolve it in Phase 2; never
broaden a directed request. **mixed directed-plus-ranked** — only when the invocation asks for both:
run the full scan/expire/cluster/rank for the ranked portion and keep the directed result distinct;
directives arrive **pre-decided**, **bypass ranking slots**, are grilled for **scope only**, and still
carry **full flip and deliverable bookkeeping** (entries, status and history targets, files,
verification, handoff). **ranked-only** — no argument: the top-N flow above.

## Phase 2 — Decide (the selected clusters, in rank order)

One cluster at a time, one question at a time, a recommended answer each; a cluster is one decision
applied to **all** its entries. Nothing is written here — impl writes from the plan.

1. **Present** the cluster: its representative `What happened` and `Recommendation`, its entries, its
   target skill and phase. A diagnosis is a permanent-record claim, so the **`FALSIFIABILITY-GATE`**
   (stated in impl Phase 2 and pre-impl Phase 7) applies: label it **`observed`** (you opened the
   current text or reproduced it) or **`inferred`** (read from the entry's prose, which describes the
   skill as it was).
2. **Route by runtime ROI.** A resolution that **adds** a step names its cadence: a check on this
   run's own work → the trio; a sweep of a standing surface → a harvester. When an entry proposes a
   trio step that reads as a periodic sweep, offer the harvester home and record the choice.
3. **Offer the options:** **apply to the workflow skill** (which skill, which phase, what it says —
   precise enough that impl need not re-decide; a prose clause must be paid for under the SIZE-RULE);
   **resolve-with-note** (the fix lives in the codebase, a spec, a script, a config value);
   **decline** (with the reason — still a flip). Recommend what the entries point at.
4. **Record the locked decision**: target, substance, and the exact entry list to flip.
5. Every unselected cluster stays `Open`, never `Declined`.

## Phase 3 — Hand off to pre-impl, then STOP

The branch is `slug`'s answer — `sdd-skill-improve-<YYMMDD><letter>` in the feature-branch pattern
(config `repo.branches.feature`; local date; the letter is a uniqueness device, not an ordering). The
plan is `<repo.docs.plans>/YYYY-MM-DD-<slug>.md`. The subject arrives pre-grilled; pre-impl owns the
sync, the branch, the plan file and the local plan commit (config `repo.commits.plan`).

**The hand-off payload MUST carry:**

1. The **ranked cluster table** and the **recurring-pattern rows**, verbatim, for the plan's Context,
   with `scan.head` as the evidence base.
2. **The edits**, per cluster — skill, phase, wording — and the **classification** (`Feature` for a
   skill behavior change, `Bug fix` only for restoring one) pre-impl's acceptance test requires.
3. **The decisions JSON** — `[{ "id", "status", "historyBullet" }, …]` for **every** flip: cluster
   resolutions, already-fixed resolutions, expiries and declines — and the **watermark** target. The
   plan cites the path; impl runs `flips` and `watermark` from it. An unlisted sibling resurfaces next
   run as if its cluster were still open.
4. **Verification** — the deploy phase below, verbatim.
5. **The sweep findings** (Phase 3b) as deliverables.

### Deploy phase — redeploy and verify (the one canonical statement)

Stated once here; pre-impl, impl and post-impl cite it by name. Redeploy the harness mirrors with
`node scripts/sdd/skills.mjs install --yes`, then `node scripts/sdd/harvest.mjs parity --json` →
`ok: true` (a positive control: touch one mirror, `ok: false` names it); `size --json` → `ok: true`
with each edited skill's budget lowered to its new size; a `version` patch bump on every edited
skill; a content-preservation review of `git diff HEAD -- skills/` (a working skill fails by a rule
quietly vanishing); the doc meta-suite (config `repo.commands.docTests`) green.

Write the payload once, after every decision is locked — a later section must never silently
supersede an earlier one. Then invoke **pre-impl** and **STOP**:

> **Next:** review the plan under the plans folder, then run **impl** to apply the edits and flips,
> and **post-impl** to publish.

A hand-off that cannot invoke pre-impl in the same session is a valid completion **only** when the
report carries the full payload and the exact command to run. Planning a change to this file is
expected — impl applies it in a later run.

## Phase 3b — Standing-surface sweep

Run `node scripts/sdd/harvest.mjs sweep --json` every harvest. It lives here for **cadence**: the
project-structure listing (config `sweep.listing`) drifts on its own schedule, and a per-build check
would pay for the same answer on every run. Report both counts even at zero; anything found is a
deliverable of the plan this run hands off, and a run whose only finding is drift still hands off.

<!-- SIZE-RULE:START -->
## SIZE-RULE — every skill edit ends smaller

Stated once here; post-impl cites it; the doc meta-tests enforce it from `skills/sdd.config.json`'s
`sizeBudgetBytes`, measured with CR stripped so a line-ending flip cannot break a budget.

1. **Every edit to a project skill's `SKILL.md` ends at or below that skill's byte budget.** A rule
   that adds text removes at least as much in the same skill.
2. **Narrative evidence is the ledger's.** A skill carries the rule and at most the `(F-N)` cite;
   "real instance", "measured <date>" and the story of how it went wrong live in the friction ledger.
3. **Anything a script performs is deleted from the prose.** Prefer deterministic code and JSON
   configuration over interpretable Markdown logic; state a fact once and cite it by name.
4. **Budgets only ratchet down.** A run that shrinks a skill lowers its budget in the same commit; a
   budget is never raised.
5. **Every harvest measures.** `size --json` before and after, in the Phase 4 report.
<!-- SIZE-RULE:END -->

## Phase 4 — Report

```markdown
## SDD Skill Improvement

### Expired (the expiry sweep — F-N only)
| # | F-N | Found | One-line summary |
|---|-----|-------|------------------|

### Planned clusters (the selected clusters and any ⟳ recurring rows)
| # | Issue | Entries (F-N, …) | Decision | Skill(s) to edit | Status after impl |
|---|-------|------------------|----------|------------------|-------------------|

### Still open (not selected this run)
| # | Issue | Entries (F-N, …) | Rank | Why not selected |
|---|-------|------------------|------|------------------|

### Sizes
| Skill | Bytes before | Bytes after (budget) |
|-------|--------------|----------------------|

### Planned onto
`<branch>` · `<repo.docs.plans>/<date>-<slug>.md` — run **impl** to apply, then **post-impl** to publish.
```

The Expired table is omitted only when the sweep closed nothing (say so). Planned holds exactly the
clusters carried into the plan; its last column is what the entries read **after impl**. Still-open
lists every unselected cluster. Close with the watermark line, the listing-sweep counts, the tool-call
count the scan took, and — when the scan met open `T-N` points — one line with the count, pointing
at **test-improve**.

## Guardrails

- Never delete a friction entry or edit its `What happened` / `Recommendation`; only the `**Status:**`
  line flips, and only via the plan.
- Never touch a `T-N`; never adopt a filtered read — the harvest reads every open entry.
- This skill never edits tracked source and never commits; the read-only subcommands are its reach.
- A cluster's plan lists every entry it comprises; an unselected cluster stays `Open`.
- Apply the SIZE-RULE to this file first: each harvest deletes what the script now does.
