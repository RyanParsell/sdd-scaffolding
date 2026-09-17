# SDD run log — trio run accounting

**Status:** Living · **Started:** 2026-09-16 · append-only

One row per completed trio run (`pre-impl`, `impl`, `post-impl`). Specialized planning frontends
(`sdd-skill-improve`, `test-improve`) appear through the pre-impl invocation they end in. Each trio
skill appends its own row as its final act, so this file is the accounting of **when the SDD skills
actually ran, who ran them, and on what plan**. The absence of a row is itself the signal: post-impl
checks this log when archiving a plan and **warns** (never blocks) when the plan has no `pre-impl` or
`impl` row — work that reached "done" outside the guidelines is legitimate, but it must be visible,
not inferred.

**Row grammar** (append at the end; never edit or reorder existing rows):

`| <UTC timestamp, YYYY-MM-DDTHH:MMZ> | <skill> | <git user> | <plan path at the time> | <branch> | <outcome> |`

- **skill** — `pre-impl` | `impl` | `post-impl`.
- **a cell may not contain a pipe character** — the row grammar is `[^|]+` per cell, so describe a piped
  command in words rather than quoting it; even an escaped `\|` fails.
- **plan path** — the path the run addressed (the plans folder for pre-impl/impl; post-impl uses the
  final location, the artifacts folder when it archived).
- **outcome** — short and verifiable: `plan committed <hash>` / `feat committed <hash>` /
  `fix committed <hash>` / `pushed <hash>` / `PR #<n> opened` / `merged <hash>` / `stopped — <why>`.
  It must also end with the **friction token** below.

**The friction token** (required on every row). Every row states what its run did about friction, in
one of two forms:

- **Positive** — name the entries: `F-17 logged`, `F-12 resolved`, or both.
- **Negative** — `no friction — <reason>`. The reason is the point. A bare `none` is a reflex; `no
  friction — no phase misled this run` is a claim.

Why the negative needs a reason at all: the *inward* half of the loop is auditable because a run states
how many titles it scanned against what `grep` returned, so a truncated read cannot hide. The *outward*
half has no equivalent ground truth — nothing can reconcile "friction I experienced" — so the stated
reason is the only thing standing between a real negative and an unrun step. The write rate is
therefore instrumented forward rather than asserted.

| Time (UTC) | Skill | User | Plan | Branch | Outcome |
|---|---|---|---|---|---|
| 2026-09-17T15:44Z | pre-impl | Ryan Parsell | docs/plans/2026-09-17-scrub-project-references.md | feature/scrub-project-references | plan committed 5e311dd; no friction — one candidate (first plan on a fresh deploy has no area slug) drafted, developer declined to log it |
| 2026-09-17T16:19Z | impl | Ryan Parsell | docs/plans/2026-09-17-scrub-project-references.md | feature/scrub-project-references | feat committed bf15dfe; no friction — one candidate (baseline vs full-run denominator scope) drafted, developer declined to log it |
| 2026-09-17T16:39Z | post-impl | Ryan Parsell | docs/artifacts/2026-09-17-scrub-project-references.md | feature/scrub-project-references | docs committed (this commit); publish follows; no friction — no phase misled this run, every step matched the file |
