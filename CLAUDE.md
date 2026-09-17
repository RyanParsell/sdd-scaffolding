# sdd-scaffolding

<!-- SDD-SECTION:START — appended by `sdd deploy`; keep this a stub. Do NOT add command references, usage listings, installation steps or trigger terms here: this file is loaded into EVERY session, so every byte is paid on every turn, and content that only lives here goes stale the moment the product changes. Product-facing agent instructions belong in a surface the product itself emits or in docs/sdd/. -->

## ⚠ Three stages of development — nothing reaches `origin` without explicit instruction

Work on this repo is split into three distinct stages. The gate that matters is **push**: a *local* commit is reviewable and trivially `reset`/`amend`-able, so what must never happen unprompted is reaching `origin` (or opening a PR). Respect the boundaries:

1. **Plan** — Produce a plan document in `docs/plans/`. Stop here and wait for approval. Via the **pre-impl** skill this also creates the branch (the feature or bug form declared in `skills/sdd.config.json`, `repo.branches`) and stamps the plan with `**Branch:**` and `**Tags:**` headers.
2. **Implement + test** — Write code, write tests, run the build, run the test suite (the commands in `skills/sdd.config.json`, `repo.commands`).
   - Via the **impl** skill: it ends by making a **local feature/bug commit** (code + tests only) and stops — **no push**, and it does not touch docs or the plan file. It **refuses to implement while on the default branch** unless the plan declares `**Hotbug:** YES`. A plan's declared **investigation phases** (deliverable = findings, not code) instead end in local `docs(plan):`/`docs(research):` commits — same gate, different label.
   - Ad-hoc / manual implementation (not through impl): leave the working tree dirty for review; do not `git commit` unprompted.
   - Either way: **do not `git push`.**
3. **Publish** — Developer-driven: push manually, or invoke the **post-impl** skill (one branch-aware skill). It archives the plan from `docs/plans/` to `docs/artifacts/` **once the plan is finished**; a mid-plan run (phases still unbuilt) leaves it in `docs/plans/` and writes no artifacts index row, so the next impl run can still resolve it. It commits implementation and docs as separate feature/bug + `docs:` commits on the *current branch*, then publishes the way `repo.publish` declares: `trunk-ff` fast-forwards the branch onto the default branch and pushes; `pr` pushes the branch and opens or refreshes the PR, with optional release tagging.
   - **`post-impl yolo` runs unattended and may MERGE the PR** — only when `repo.publish` is `pr`. Selected at its first phase (or by the `yolo` argument), it auto-accepts its own friction entries, tolerates verified test flakiness, then watches the PR's CI and squash-merges once **every** check passes — so stage 3 can end on the default branch without a further instruction. It is **feature-branch-only**, including for a hotbug: the CI gate is what makes it acceptable, and trunk has no PR to gate. Any failing check stops it with the PR left open; it never retries, forces, or merges past a gate. **It never deletes a branch, local or remote** — the merged branch is left intact and cleanup is yours to do. A run that cannot prompt defaults to standard — silence is not the explicit instruction this gate requires.

**Hotbugs — the one trunk-direct path.** Work belongs on a branch, and impl enforces that by refusing to run on the default branch. The single exception is the pre-impl skill invoked with `--hotbug` (also "hotbug" / "hot bug" / "hot-bug"): an **urgent bug fix** that stays on the default branch with **no branch and no PR**. Its plan opens with a `⚠️ HOTBUG — TRUNK-DIRECT` callout and a `**Hotbug:** YES` line — the only declaration that unlocks impl on the default branch and tells post-impl the trunk push is intentional. A hotbug is always a bug fix; anything shipping new capability takes a branch. The push gate itself is unchanged: even a hotbug is not pushed until stage 3.

**The harvesters feed stage 1; they are not a fourth stage.** The **sdd-skill-improve** skill (skill friction) and the **test-improve** skill (flaky/slow tests) read the ledgers in `docs/logs/`, decide what is worth fixing, and then hand that to **pre-impl** like any other subject — they never edit tracked source or commit. So improving a skill, or deleting a flaky test, goes on a branch behind a plan exactly like a product change does.

**All five are SDD skills, in two cadences — and that decides where a new step goes.** The trio and the two harvesters are one system: friction may be logged against any of them, a harvester included. What differs is cost — the trio runs on **every** feature and bug build, the harvesters roughly **weekly** — so a fix that *adds* a step goes to the cadence its protection actually needs. A check on the work a run just did belongs in the trio; a sweep of a standing surface that drifts on its own (an audit of every skill mirror, a scrub of a demo set) belongs in a harvester phase, where it is paid once a week instead of on every build.

Repository changes follow **pre-impl → impl → post-impl**. Lifecycle hooks report advisory state; an
advisory is not proof that a stage ran. Canonical workflow instructions live in tracked `skills/`.

## ⛔ `README.md` is human-authored — never edit it on your own initiative

The root `README.md` is written and maintained **by a human**. Never create, edit, reword, reformat
or delete any part of it on your own initiative — not to document a change you shipped, not to add a
note, not in passing. If your work makes it wrong, **propose the wording in your reply**; the
developer edits.

The only exception is an explicit developer instruction naming the file ("update the README to…").
A plan, checklist, locked decision, or your own judgement that it "should" change is **not** that —
nor is a topic the README has never covered.

**Root `README.md` only.** Every other README (`docs/*/README.md`, `skills/README.md`, `scripts/`) is
an ordinary agent-maintained index; post-impl writes the artifacts one every run.

## Documentation structure

The `docs/` folder is organized into six categories:

| Folder | Purpose | Examples |
|--------|---------|---------|
| `docs/sdd/` | **Spec-Driven Development** — living specs that track current system state | PRD, architecture, stories, project structure, the SDD profile |
| `docs/epics/` | **Living strategy** — goals, question-driven tracks with options held open, a round ledger; never archived, never implemented directly | a multi-round initiative |
| `docs/artifacts/` | Completed task docs — designs, implementation plans, guides | an archived plan with its index row |
| `docs/plans/` | Future work — not yet executed | the impl skill's work queue |
| `docs/research/` | Investigation/reference documents | an API surface survey |
| `docs/logs/` | **Operational ledgers** — how the *process* behaved, not what the product is; living, appended forever, and deliberately **outside** the grounding read | friction log, test-health log, SDD run log, test ROI log |

### Keeping SDD docs current

When you do work that changes the scope, architecture, or capabilities of this project, update the
relevant SDD docs. The paths are in `skills/sdd.config.json` under `repo.docs`:

| Document (config key) | Update when… |
|----------|-------------|
| `repo.docs.prd` | Adding or changing functional requirements, output modes, or supported sources |
| `repo.docs.architecture` | Changing system design, adding components, modifying data flow, or introducing new dependencies; record the choice under Design Decisions |
| `repo.docs.stories` | Adding new user stories, completing stories (mark done), or changing acceptance criteria. The doc opens with an `## Index` over thematic `## Area:` sections — **read the index and only the relevant area(s)** rather than the whole file, and when adding a story, file it under its area and update that area's index row. Story IDs are self-minting UTC timestamps (`S-YYMMDD.HHMMSSx`) — the post-impl skill owns the minting rule |
| `repo.docs.projectStructure` | Adding, moving or removing files: update the lookup row and the full structure listing in the same commit |
| `repo.docs.profile` | Changing a test category, a reference test, a fake, a registration file, a suite's known-good total, or an environmental prerequisite |

### Creating new docs

- New plans go in `docs/plans/`: `YYYY-MM-DD-<topic>.md` for a **feature**, `YYYY-MM-DD-bug-<topic>.md` for a **bug fix**. Branch and commits follow suit (the feature vs bug forms in `repo.branches` and `repo.commits`). **Default to feature** — a fix that ships any capability beyond closing the defect is a feature. See `docs/plans/README.md`.
- Once a plan is executed, move it to `docs/artifacts/` (re-dated to the implementation date, `bug` segment preserved).
- Epic-scale work gets a living epic in `docs/epics/` plus **one plan per round**; plans cite their epic, the epic is never archived, and impl never builds one. See `docs/epics/README.md`.
- Research docs go in `docs/research/` as `YYYY-MM-DD-<slug>.md`.
- Friction and flaky-test observations go to the ledgers in `docs/logs/`, never into a plan.
<!-- SDD-SECTION:END -->
