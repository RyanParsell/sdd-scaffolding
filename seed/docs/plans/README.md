Markdown files in this folder are plans that are currently or will soon be implemented. The preceding date is the date the plan was originally documented.

## Naming

The branch and commit forms below are the defaults; the skills read the live values from
`skills/sdd.config.json` (`repo.branches`, `repo.commits`).

| | Bug fix | Feature (default) |
|---|---|---|
| Plan | `YYYY-MM-DD-bug-<slug>.md` | `YYYY-MM-DD-<slug>.md` |
| Branch | `bug/<slug>` | `feature/<slug>` |
| Commits | `fix(<scope>): …` | `feat(<scope>): …` |

A change is a **bug fix** only if its entire deliverable is restoring intended behavior. If it ships anything with utility beyond closing the defect — a new flag, a new surface, a reusable capability — it is a **feature**. **When in doubt, feature.**

## Epics — one plan per round

Work too large or too undecided for a single plan gets a **living epic** in [`docs/epics/`](../epics/README.md) plus **one plan per round**. The epic holds the goal, the open questions and the options; the plan is the round that acts on them, and cites its epic in its opening context. An epic is **never a plan** — it stays out of this folder because this folder is the impl skill's work queue, and **impl never builds an epic**. When a round is archived, the epic's round ledger is what records it.

## Tags

Every plan carries a `**Tags:**` header line (alongside `**Branch:**`) of backticked SDD-anchored
tags — `prd:FR-N`, `arch:<slug>`, `area:<slug>` — drawn from the vocabulary declared in
`docs/artifacts/README.md` (≥1 `area:` tag mandatory, ≤6 total). The pre-impl skill stamps it from
its grounding; the post-impl skill reconciles it against what actually shipped and copies it into
the artifacts index row when the plan is archived. Enforced by the doc meta-tests under
`scripts/sdd/tests/` (config `repo.commands.docTests`) — an untagged plan fails them.

The pre-impl skill classifies the work and applies this; impl and post-impl follow it. When post-impl moves a plan to `docs/artifacts/` it re-dates the prefix to the implementation date and **keeps the `bug` segment**.

## Friction never lives in a plan

A plan carries no friction block. Friction with a skill (`F-N`) and flaky or slow tests (`T-N`) go to
the central ledgers in `docs/logs/` — see that folder's README and the `LEDGER-CONVENTION` block the
trio skills carry.

## Hotbugs — the one trunk-direct path

Work normally lives on a branch: pre-impl always creates one, and **impl refuses to implement while on the default branch**. The single exception is a **hotbug** — an urgent fix that goes straight to trunk with **no branch and no PR**, requested by invoking the pre-impl skill with `--hotbug <the broken thing>`.

Such a plan is still a `YYYY-MM-DD-bug-<slug>.md` bug plan, but it opens with a `⚠️ HOTBUG — TRUNK-DIRECT` callout and a `**Hotbug:** YES` line. That declaration is the *only* thing that lets impl run on the default branch, and it tells post-impl the direct push to trunk is intentional rather than an accident. A hotbug is by definition a bug fix — if it ships any new capability, it is a feature and belongs on a branch.
