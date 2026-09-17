Markdown files in this folder are **epics** — living strategy documents for work too large, too
long-running, or too undecided to fit in a single plan.

An epic states a **goal**, breaks the ground under it into **question-driven tracks**, and holds the
**options** for each track open until something makes the choice obvious. It does not schedule work.
The work happens in **rounds**: each round is an ordinary plan in `docs/plans/` that cites the epic,
and the epic's **round ledger** records what that round settled and what it left open.

Holding options open is the point, not a deferral. A track that names its question, its candidate
answers, and what would trigger deciding is more useful for years than a decision made early on thin
evidence — and it leaves a trail for the developer who returns and asks *why is it still like this?*

## Lifecycle

| Rule | Meaning |
|---|---|
| **Living** | An epic is never finished, so it is **never archived**. It is edited in place as rounds land and questions resolve. Nothing moves it to `docs/artifacts/`. |
| **Never a plan** | An epic is not a work queue. **The impl skill never "builds" an epic** — there is nothing in it to implement. Implementation reads the round's plan. |
| **Plans cite their epic** | A plan belonging to an epic names it in its opening context, so the round is readable as part of the arc rather than as a one-off. |
| **Rounds append** | A finished round adds a row to the epic's round ledger; it does not rewrite the history above it. Tracks are updated to reflect what the round settled. |
| **Options are held, not faked** | A track records the options genuinely under consideration and the trigger that would force a choice. Recording a decision nobody has made is the failure mode this folder exists to prevent. |

## How this differs from the sibling folders

Lifecycle is the folder contract — that is what distinguishes all six:

| Folder | Contract |
|---|---|
| `docs/epics/` | **Living strategy** — goals and open questions, never archived, never implemented directly |
| `docs/sdd/` | **Living spec** — what the system *is* right now |
| `docs/plans/` | **Not yet done** — the impl skill's work queue; each file is executable work |
| `docs/artifacts/` | **Done and dated** — completed plans, archived on implementation |
| `docs/research/` | **Investigation** — reference material behind a question |
| `docs/logs/` | **Operational ledgers** — how the process behaved; appended forever, outside the grounding read |

An epic is neither backlog nor archive, which is why it needed its own folder: filing it under
`docs/plans/` would put a permanent document in the impl queue, and filing it under
`docs/artifacts/` would date-stamp something that is never done.

## Writing one

Open with a short header — title, `**Status:** Living`, `**Started:** YYYY-MM-DD`, `**Rounds:** N`.
Then the goal, the tracks, and the round ledger. Each track states plainly: **current state**, **the
question**, **the options held**, and **what would trigger deciding**.

Current epics: _none yet_.
