---
name: post-impl
description: Publish completed work after implementation. Updates the SDD documents and agent surfaces, archives the plan once every phase is built (keeping it in the plans folder mid-plan), makes separate implementation and documentation commits, then publishes by the configured mode (fast-forward the default branch, or push the branch and open or refresh its PR) and optionally tags a release. Use after the impl skill or when asked to finish, document, push, publish, release, or open a PR for completed work.
user_invocable: true
version: 1.0.1
# ⚠️ IMPORTANT: When editing this file, increment the patch version above (e.g., 1.0.0 → 1.0.1).
---

## Post-Implementation Processing

> **Invocation across harnesses.** This skill activates by name/description in any harness — in Claude
> Code as a `/`-command, in Codex via `$`-prefix or the `/skills` menu, and in GitHub Copilot by
> matching the `description` above. Any arguments described below are read from the invocation (e.g.
> release type, `--pr`); if your harness passes them, use them, otherwise infer intent from the
> request and the current branch. References to other skills below use their **names** (the impl
> skill, the pre-impl skill, sdd-skill-improve, test-improve, git-recenter) — invoke them with your
> harness's own mechanism.

**First step of every run: read `skills/sdd.config.json` and the profile document** (config
`repo.docs.profile`). Every command, document path, ledger and branch convention below is a config
key, never a literal — resolve each one at the start and state the resolved commands you will run in
the Phase 9 table. The profile document carries what a JSON value cannot: the suites-by-layer table,
the last known-good suite total, the merge method and CI wall time, and (optionally) a `release`
section.

**One branch-aware skill for both trunk and feature-branch flows.** Behavior keys off the current
branch and off `repo.publish`:

- **On the default branch (config `repo.defaultBranch`) — trunk mode:** push to the default branch
  (or open a PR with `--pr`); release-tag eligible.
- **On any feature branch — feature mode**, published by `repo.publish`:
  - **`pr`** — push the current branch, open/refresh its PR (stacked base = the prior phase's branch
    when there is one). Never touches the default branch; never release-tags. YOLO available.
  - **`trunk-ff`** — after the docs commit, fast-forward the default branch to this branch locally,
    push the default branch, delete nothing. No PR, no CI watch; YOLO is meaningless and is refused.

**Universal in every mode:** **archive the plan to `repo.docs.artifacts` once it is finished** (a
mid-plan run leaves it in `repo.docs.plans` — Phase 2); separate `repo.commits.feature`/`repo.commits.bug`
(code) and `repo.commits.docs` (docs) commits — never bury implementation under a docs subject; sync
skill mirrors; and "verify, don't manufacture" doc edits.

**Orthogonal to all of the above: YOLO — an unattended run.** post-impl is routinely the last thing a
developer does in an evening, and two things in it require them to still be there: Phase 5b's
friction confirmation, and the merge itself. **YOLO** removes both, so a run continues from invocation
through merge with nobody watching. It is selected at **Phase −1**, before anything else happens, and
it is **feature-branch-only in `pr` publish mode** — see that phase for why, and for the three
behaviors it comprises.

### Output Style
- Brief phase indicators ("Phase 1: SDD docs…"). Do NOT narrate each file edit. End with a summary table.

---

### Argument grammar

```
post-impl [yolo] [<release-type> [<version>]] [--pr | --push-main] [--branch=<name>] [--base=<branch>]
```

- **`yolo` / `--yolo`** — run **unattended**: enable all three YOLO behaviors and skip the Phase −1
  prompt entirely. Exists so a scheduled/cron invocation can select the mode without a human present.
  **Feature-branch-only and `pr`-mode-only** — ignored with a stated reason on the default branch,
  refused with a one-line reason when `repo.publish` is `trunk-ff`.
- `<release-type>` — `noteworthy` | `silent` (**default branch only**; requires a `release` section in
  the profile document — Phase 8). Omitted = no tag.
- `<version>` — semver following `<release-type>`; omitted = auto-derive (Phase 8).
- `--pr` — force PR publish (even from the default branch, and even when `repo.publish` is `trunk-ff`).
- `--push-main` — force direct push to the default branch (escape hatch; valid **only** when on it).
- `--branch=<name>` — override the auto-derived head branch name (default-branch→PR migration only).
- `--base=<branch>` — override the stacked-PR base (feature-branch PR).

**Branch-aware default** (no `--pr`/`--push-main`): on the default branch → push directly to it; on
any other branch → the `repo.publish` path for that branch.

**Refusal rules** (validate immediately, STOP if violated):
- `--pr` + `noteworthy` → REFUSE: "Stable releases must be tagged on the default branch. Merge the PR
  first, then re-run this skill with `noteworthy` from there."
- `--pr` + `--push-main` → REFUSE (mutually exclusive).
- `--push-main` while **not** on the default branch → REFUSE: "`--push-main` requires being on the
  default branch."
- `<release-type>` while on a **feature branch** → REFUSE: "Release tags are cut on the default branch
  only — publish first, then re-run this skill with `<release-type>` from there."
- `<release-type>` when the profile document has no `release` section → REFUSE: "releases are not
  configured for this repo."
- `noteworthy <version>` containing `-` → REFUSE; `silent <version>` **not** containing `-` → REFUSE
  (a release workflow reads hyphenated tags as prereleases).
- `yolo` when `repo.publish` is `trunk-ff` → REFUSE in one line: "YOLO needs a PR and CI as the gate;
  `trunk-ff` has neither — running standard." Then continue as a standard run.

---

### Phase −1 — Mode selection (STANDARD or YOLO)

**Runs before everything, including Phase 0's branch check.** It has to: the behaviors it selects
apply from the very first suite run onward, so asking later would be asking after the answer mattered.

Resolve in this order:

**1. Read the branch and the publish mode first** (`git branch --show-current`; `repo.publish`). On
the default branch, **skip the prompt entirely**, say *"YOLO is feature-branch-only — running standard
post-impl"*, and continue into Phase 0. When `repo.publish` is `trunk-ff`, skip it too, with the
one-line refusal from the grammar. This ordering is load-bearing: prompting and *then* discovering
there is no gate asks a question whose answer must be thrown away.

> **Why feature-branch-only, without exception.** YOLO's whole premise is that a PR's CI is the gate
> between the work and the default branch. Trunk mode has no PR, so there is no gate — an unattended
> run there would push straight to trunk with nothing between the commit and everyone else. The same
> is true of `trunk-ff`, which is a local fast-forward and a push. **This holds even for a declared
> hotbug.** A hotbug is the tired-and-urgent case and is exactly when the temptation arises, but a
> hotbug already skips branch, PR and review; adding "and nobody was watching" to that list is not a
> trade worth having an exception for. One unconditional rule, nothing to reason about at 11pm.

**2. If `yolo` / `--yolo` was passed** — enable all three behaviors, skip the prompt, and announce it.

**3. Otherwise prompt** — a **multi-select**, all three pre-checked, using whatever multi-select UI
the harness provides (optional, Claude Code: `AskUserQuestion` with `multiSelect: true`; any harness:
a numbered list the developer answers in one line):

```
Post-impl mode                                          [multi-select]
  [x] Auto-accept friction entries   — write the drafted F-N/T-N without asking
  [x] Tolerate test flakiness        — isolate-and-verify, log, continue
  [x] Watch CI and auto-merge on green — squash to the default branch when every check passes
```

All three checked = **full YOLO**. **None checked = standard post-impl.** They are independent
because the useful middle ground is real: *"stop asking me about friction, but I'll merge it myself."*

**4. If the harness cannot prompt at all** (headless, non-interactive, scripted with no argument) →
run **standard**, and say so: *"could not prompt — running standard; pass `yolo` to run unattended."*
**Silence is never consent to land on the default branch.** The repo's push gate (stated in the
`CLAUDE.md` stub, config `repo.agentSurfaces`) requires an explicit instruction before anything
reaches origin; the prompt or the argument *is* that instruction, and an absent answer is not one.

**Announce the resolved mode in one line before Phase 0 begins**, naming exactly which behaviors are
active — the transcript is the record of what authority the run was given. In full YOLO, say plainly
that it will merge to the default branch without further confirmation.

Carry the three flags through the run; each phase below names the one it honors.

**Authority changes mid-run.** If the developer's authority narrows, honor it immediately:
**immediately re-announce** the active flags and re-evaluate every remaining action against the
narrower mode. Authority **cannot widen** into unattended behavior after work has begun: in
particular, never enable **auto-merge mid-run**. A later request for wider authority requires a fresh
invocation so the full run starts under that explicit gate.

---

### Phase 0 — Branch + commit-state check (sets the mode)

> **State the SessionStart mirror advisory before anything else.** The `MIRROR-ADVISORY` block in the
> pre-impl skill is the single statement of what it means and what to do — read it there, do not
> restate it. Say which it reported: **no advisory present**, **all mirrors current**, the specific
> `stale`/`misplaced`/`orphaned` skills it named, or **could not determine**. The trio runs from the
> deployed mirror, not from tracked source, so this run may be executing text older than the file it
> is about to act on — and an advisory nobody repeats is not evidence a stage ran.

```
git branch --show-current      # commits/pushes target THIS
git status --short ; git diff --stat
```

**Interrupted prior run / resume state.** Before applying any phase, take stock of durable
branch/plan/commit state: staged paths, an already-moved plan, existing stories/index rows, local
code or docs commits, pushed refs, and PR state. If these show an interrupted prior run, record which
outputs are complete and **resume from the first incomplete phase**; do not remint, re-move, or
reapply completed work. The transcript's memory is optional evidence; the durable state is the
authority.

- **Mode** = **trunk** if on the default branch, else **feature**; in feature mode the **publish
  path** is `repo.publish` unless `--pr` overrides it. (Together these drive plan handling, push
  target, PR base, and release eligibility.) State both as a row in Phase 9.
- **Trunk mode + a `**Hotbug:** YES` plan** → this is the sanctioned trunk-direct path: push straight
  to the default branch, **no PR**, `repo.commits.bug` commits. Announce it (`⚠ HOTBUG — pushing
  direct to trunk, no PR`) so nobody mistakes it for the normal flow. Hotbug behavior is identical
  under both publish modes.
- **Trunk mode + a plan that is NOT a hotbug** → the work skipped the branch discipline (the impl
  skill refuses to implement on the default branch for exactly this reason). **Warn the developer and
  offer `--pr`** — which migrates the commits to a branch and opens a PR (Phase 6a) — before pushing
  to trunk. Proceed with the direct push only if they confirm.
- Note whether the **implementation is already committed** (the impl skill makes a local code commit;
  UI plans commit per-MSU) or is still uncommitted in the working tree — decides the Phase 6 commit
  shape.
- Identify **unrelated** modified/untracked files (other WIP, scratch) to exclude from staging.
- **Self-editing check:** if this plan edited `skills/{pre-impl,impl,post-impl}`, the tracked
  `skills/…` source is **authoritative for this run** — the deployed copy you are executing from may
  predate the change. Follow the tracked version wherever the two disagree.
- **Errata read:** read the entries naming post-impl in the friction ledger (config
  `repo.ledgers.friction`) that are still marked `**Status:** Open`. They are **errata against the
  phases below** — where one contradicts or supplements this file, the entry is the newer
  information. Note which ones this run is at risk of re-encountering; Phase 5b is where a small one
  can be *resolved* rather than re-observed.
  **How to read them is the `READ-PROTOCOL` block stated in the friction ledger's header — follow it
  there, do not restate it here.** In short: scan every title (`grep -n '^### F-.* — post-impl'`),
  open in full only what this run can act on, and state the counts in Phase 9's `Errata` row. Note
  the standing bias for this skill: an entry naming a phase *this* run will execute is the common
  trigger, since post-impl runs nearly all of its phases every time.
- **Reconcile with the base before the doc phases (feature mode only).** `git fetch origin`, resolve
  the base name (the default branch for an unstacked feature; the prior phase's branch for a stacked
  one — the same resolution Phase 7 uses), and make every comparison against **`origin/<base>`**,
  never a stale local base branch. If the branch is behind, merge or rebase **now**, before Phases
  1–5 write anything — so the docs commit lands on current history instead of a stale base that a
  busy trunk will race. A branch already even with its remote-tracking base needs no action; say so
  either way rather than skipping the check silently. **In `trunk-ff` mode this reconcile is also
  what makes Phase 6d possible**: a fast-forward requires this branch to contain `origin/<default>`,
  so a branch that is behind and not reconciled here will be refused at the merge.
  - **Read the branch's own PR state here too, not at Phase 7 (when `repo.publish` is `pr`, or
    `--pr` was given)** — `gh pr list --head <branch> --state all --json number,state`. A multi-phase
    plan runs post-impl once per phase, days apart, and the PR can **merge between runs**. That
    changes this run's whole shape: Phase 7 must *create* a new PR rather than refresh the old one,
    and a **squash** merge leaves the branch simultaneously ahead and behind (trunk has the content,
    not the commits), so it needs reconciling before anything else. Reading it late invites the
    specific mistake of reusing a PR number already in context and editing a **merged** PR's
    title/body — rewriting the permanent record of work it does not contain.
  - **Committed generated output is never reconciled as if it were source.** If the profile document
    names any committed build output, a conflict in it is not resolvable by choosing a side — each
    side is correct only for its own source, so "ours"/"theirs" ships output that matches no tree
    that exists. Settle every *source* conflict first, then regenerate and stage only a real change.
    And a **clean** merge that touches that output's source still leaves the committed output stale,
    with nothing downstream to complain: regenerate and commit it as part of finishing the merge,
    not as a Phase 5 concern. Prefer `merge` over `rebase` for such a branch — a rebase replays the
    same unresolvable conflict once per commit.
  - **If the reconcile pulled in test files, every count the impl run reported is now STALE.**
    Phases 1b and 2 write the full-suite number into a story AC, an artifacts index row and the PR
    body — all *before* Phase 5 runs anything — so a merge that adds or deletes tests silently
    poisons three permanent records at once. Check it here, where the merge just happened. Inspect
    merge changes only once the merge is represented: after a merge commit use
    `git diff --name-only ORIG_HEAD HEAD -- <repo.testGlobs>`; before committing a merge, use the
    **staged merge diff before commit** (`git diff --cached`). **Never compare a pre-merge tree as if
    the merge changes existed.** Any test-path hit means **do not reuse impl's numbers**; measure
    before Phase 1 writes them, or treat every written count as provisional and reconcile it at
    Phase 5.
  - **Then check both ledgers for duplicate ids, and for content the resolution dropped.** A
    concurrent mint **merges cleanly** — two branches appending different entries at different
    offsets is not a textual conflict — so the collision arrives with no marker pointing at it:
    `grep -o '^### F-[0-9]*' <repo.ledgers.friction> | sort | uniq -d` (and the `T-` equivalent
    against `repo.ledgers.testHealth`). Resolve it here, under the tie-break stated in the ledger
    header (**the side already on `origin/<default>` keeps its ids; the unpushed side renumbers**,
    with a dated Decision-history bullet on each renumbered entry), and repoint every in-branch
    reference before any later phase cites an id. **And when a ledger conflict *is* textual, verify
    content preservation after resolving it** — a hand-reconstructed tail conflict can silently
    truncate the last entry's closing lines. Normalize line endings on both sides — the index may be
    LF and the working tree CRLF (the profile document states the convention), so the raw form can
    never return empty here:
    `comm -23 <(git show origin/<default>:<file> | tr -d '\r' | sort -u) <(tr -d '\r' < <file> | sort -u)`
    must be empty. It proves only that no *unique* line was lost — a missing instance of a repeated
    closer line is invisible — so run the doc meta-tests (`repo.commands.docTests`) after any
    hand-resolved ledger conflict. Every cross-check comparing `git show` output to a working-tree
    file needs the same normalization.
  - **Sequence the reconcile against the commit state gathered above.** If the implementation is
    **still uncommitted** *and* the branch is **behind**, make the code commit **first**, then
    reconcile, then continue into the doc phases. Merging upstream commits into a tree full of
    unstaged implementation risks the work, can be refused outright on overlapping paths, and leaves
    conflicts interleaved with uncommitted edits — with no commit to fall back to. A clean tree
    reconciles immediately, as written. (Committing first has a second benefit: the doc phases are
    then written *on top of* the merged content, so the stories index usually needs no conflict
    resolution at all.)

---

### Phase 1 — Update SDD Documents

> **Read the plan's locked decisions FIRST, and extract the negative ones.** Phases 1–2 write
> narrative — architecture bullets, a story, an epic round row, an artifacts summary — and narrative is
> where a decision that said *"deliberately do NOT record this"* gets cheerfully recorded anyway. A
> plan's decision table carries two kinds: **positive** (build X) and **negative** (X is out of scope,
> deliberately not measured, left open on purpose). Only the positive ones are self-enforcing, because
> the code exists to check them against. List the negative ones before writing a word, and treat each
> as a constraint on what these phases may claim.
>
> They have a second use: they are one of the two feeds into **Phase 4's retired-token check** — a
> reversed or narrowed rule is exactly a token whose old wording must not survive in a current-state
> document.

Read each file first to find the insertion point.

**Mint the story ID FIRST — before 1a, not inside 1b.** Run `date -u +'S-%y%m%d.%H%M%S'` **once** for
this run and append a per-story letter (`a`, `b`, …); that is the ID 1b files. It is minted here
because **1a needs it**: architecture bullets attribute themselves to the story that introduced them
(`(S-260815.002908a)`), so writing 1a before the ID exists forces you to invent a plausible-looking
one and reconcile it afterwards. That reconciliation is easy to skip and its failure is silent and
permanent — an invented ID is indistinguishable from a real one and resolves to nothing. A dangling
reference has shipped to trunk this way. Minting first costs nothing and removes the incentive
entirely; the doc meta-tests' story-id reference check fails the run if one slips through anyway.

**Never write a story ID from memory — grep it first.** Any ID you cite in prose (architecture,
another story, a plan) must be confirmed to exist in **this branch's** stories document (config
`repo.docs.stories`) before you write it: `grep -n 'S-260815.002908a' <repo.docs.stories>`. Recalled
session context is not evidence — an ID minted on a sibling branch that has not merged looks exactly
like one that exists here, and reads as correct right up until it resolves to nothing.

**Backticked Markdown is written from a file, never as an inline double-quoted shell string.** These
phases write more backticked Markdown than any other (tag slugs, index and epic rows, architecture
identifiers), and bash performs command substitution on bare backticks inside double quotes — terms
have been replaced with empty strings this way, the only tell a `command not found` on stderr above
the script's own success line. Author the text with the editor tool, or have the script read it from
a file, then grep the backticked terms back out and confirm the count; the corruption is valid
Markdown and survives every other check. Every tracked-file edit here follows the impl skill's
`EDIT-MECHANISM` block (line endings, replacement count) — cited, not restated.

- **1a. Architecture + project structure** (config `repo.docs.architecture`,
  `repo.docs.projectStructure`) — in architecture, update command tree/design/data-flow/conventions
  when behavior changed and keep its Grounding Index routing accurate; in project structure, add new
  files to the structure listing (the source, test and script trees the document enumerates), update
  the reverse architecture/area lookup table if ownership or grounding tags changed, and maintain
  test-file listings.
- **1b. Stories** (config `repo.docs.stories`) — the doc opens with an **`## Index`** (Area | Stories |
  Summary) over thematic **`## Area:`** sections. Adding a story is three edits:
  1. **Use the ID minted at the top of this phase** — story IDs are **self-minting UTC timestamps**,
     `S-YYMMDD.HHMMSSx`: `date -u +'S-%y%m%d.%H%M%S'` run **once** for this run, then a per-story
     letter (`a`, `b`, `c`, …). Always start at `a`, even for a single story; the letter enumerates
     the stories added in *this* run (overflow past `z` → `aa`, `ab`, … — effectively unreachable).
     Acceptance criteria derive as `AC-<id>.<n>`. There is **no shared counter** — nothing to bump,
     nothing to cross-check. (Stories added to the same feature in a *later* run get a *new*
     timestamp — chronological grouping still holds.)
     > **The ID is UTC by design, and may legitimately carry a different date than the archive.**
     > Phase 2 re-dates the plan by **local** date, so across a local/UTC midnight straddle the story
     > ID reads `S-260715…` while every commit and the archived filename say `2026-07-14`. That is not
     > drift and must not be "corrected" — the two answer different questions (a globally-ordered mint
     > vs. the day the work shipped here), and forcing them to agree breaks whichever one you change.
  2. **File it** — append the story under the **`## Area:` section that owns it**, in
     **chronological / authoring order** (new timestamp IDs and any legacy `S-N` IDs don't sort
     cleanly against each other — append by time), with ACs all `[x]`; the final AC carries the
     **full-suite** test count (match the whole-suite convention prior stories use). Do not append to
     the end of the file. If the work genuinely fits no existing area, add a new area (section + index
     row) rather than forcing it.
  3. **Update the index** — extend that area's `Stories` cell with the new ID, and refresh the area's
     `Summary` if its scope actually widened. (No counter line to maintain.)
- **1c. PRD** (config `repo.docs.prd`) — update the relevant FR and keep its Grounding Index mapping
  accurate. A capability *extension* of an existing FR (another block, output mode, flag) updates that
  bullet rather than inventing a new FR.

---

### Phase 2 — Plan handling (archive when the plan is DONE, not after its first phase)

**First, decide whether the plan is finished.** This skill runs after *every* phase of a multi-phase
plan, but a plan may only be archived **once**, when the last phase lands. Read the plan's own phase
list and compare it to what has actually shipped (its stories, and the commits on this branch):

- **Plan complete** — every phase built, or the plan was single-phase → **ARCHIVE** (below).
- **Phases remain** — this is a **mid-plan run**: real work shipped and is being pushed, but the plan
  is still live → **LEAVE the plan in `repo.docs.plans`** and **write no artifacts index row**. Say so
  explicitly in the Phase 9 table (`Plan | kept in <plans> — Phases N–M unbuilt`). Everything else in
  this skill still runs: stories, SDD updates, agent surfaces, the docs commit, the publish.
- **`kept, blocked`** — a remaining phase cannot become actionable within this plan because a separate
  **blocking plan**, PR, issue, or named external evidence must change first. Keep the plan in
  `repo.docs.plans`, write no artifacts row, and record the blocker plus the exact condition that makes
  the phase **actionable** in the plan Outcome and Phase 9 table. This is distinct from ordinary
  unbuilt work: nobody should re-run impl until the named condition clears.

**Why this is conditional rather than "always move."** `repo.docs.plans` is the **impl skill's
backlog**, so an archived live plan makes the next impl run report *"no plan claims this branch"*; and
the artifacts index row asserts the work is **done**, which is false while phases remain. Both must
then be undone by hand.

> **A mid-plan run is normal, not an exception.** Multi-phase plans are the common shape for anything
> with a spike phase or sequential UI MSUs. Shipping Phase N and pushing it is exactly what should
> happen; the plan simply is not an artifact yet.

**When the plan IS complete, archive it:**

**MOVE** `<repo.docs.plans>/YYYY-MM-DD-<topic>.md` → `<repo.docs.artifacts>/<impl-date>-<topic>.md`
(re-date the prefix to the implementation date; add one if absent), then **insert a top row** in the
artifacts folder's `README.md` (table is newest-first):
`| <impl-date> | [<slug>](<file>) | <tags> | 2–3 sentence outcome summary. |`. Use a filesystem move
if untracked, `git mv` if tracked. The row and any epic round row are backticked Markdown — write them
from a file per Phase 1's rule (`EDIT-MECHANISM`).

**Reconcile the tags first.** The plan's `**Tags:**` header (stamped by pre-impl from its grounding)
may predate scope drift — before writing the index row, adjust it to match **what actually shipped**
(add the area/component the work grew into, drop what fell out), then copy the reconciled tags into
the row's Tags cell as backticked slugs. Tags draw from the vocabulary block at the top of the
artifacts README (`prd:FR-N` / `arch:<slug>` / `area:<slug>`; ≥1 `area:`, ≤6 total); if the work
genuinely needs a new `arch:` slug, add it to the vocabulary table **deliberately in the same run** —
never write an undeclared slug. The doc meta-tests enforce all of this (see Phase 5).

**`<impl-date>` is the LOCAL author-date of the implementation commits** —
`git log -1 --format=%cd --date=format:%Y-%m-%d` on the branch head — **never "today" and never a UTC
stamp**. A session that straddles local/UTC midnight will otherwise stamp a date that disagrees with
every commit the plan ships (this has happened: UTC said 07-15, every commit said 07-14). One
authoritative source, and it's the commits. (If the implementation is still uncommitted in the working
tree, the local calendar date is what the commit will get — use that.) Use the same `<impl-date>`
everywhere this run writes a date: the moved filename, the README row, and any story/spec text.

**Only the date prefix changes.** A **bug** plan keeps its `bug` segment:
`<plans>/YYYY-MM-DD-bug-<slug>.md` → `<artifacts>/<impl-date>-bug-<slug>.md`. Never drop it — the
segment is how a bug fix is told from a feature at a glance, forever.

**If the plan cites an epic, re-point that epic's round-ledger link in the same edit.** A plan that
opens with an `**Epic:**` header is one round of a living epic in `repo.docs.epics`, and that epic's
round ledger links the plan at its plans-folder path — moving the file breaks the link, and nothing
else will notice (no meta-test covers epic links, and the epic is never archived, so the 404 is
permanent). Update that round's row to the new `../artifacts/<impl-date>-<slug>.md` path (relative to
the epics folder), and complete its **Shipped** cell — pre-impl wrote the row marked *(in flight)*
when it planned the round.

**Legacy friction blocks travel verbatim; new friction lives in the ledgers.** Friction is centralized
in `repo.ledgers.friction` / `repo.ledgers.testHealth` (see Phase 5b) — a plan written under the
current convention carries **no** friction block, and there is nothing to carry. A plan that predates
the convention may still end in a `FRICTION:START` … `FRICTION:END` block: it moves with the plan
**unedited** — do not strip, summarize, or "tidy" it — because it is the dated historical record.

**Check the run log before archiving.** Read the run log (config `repo.ledgers.runLog`) for this
plan's rows. Archiving a plan that has **no `pre-impl` or no `impl` row** means the work reached "done"
outside the guidelines — **WARN, don't block**: name the missing rows in the Phase 9 table
(`Run accounting | <run log> | ⚠ no impl row for this plan`) so the departure is visible, and proceed.
Legitimate ad-hoc work exists; invisible ad-hoc work is the thing this prevents.

The archive/keep decision above applies in **both** trunk and feature modes and under **both** publish
modes — it keys off whether the *plan* is finished, never off the branch. A **stacked** series is the
one case where a plan may legitimately be archived with phases still open: when each phase has its own
branch and its own plan file, the phase's plan is complete even though the feature is not. A single
branch carrying several phases of **one** plan file is the mid-plan case and keeps it.

---

### Phase 3 — Update Agent Instructions and Help

The surfaces this phase keeps in sync are **config**, not a fixed list: `repo.docs.agentGuide` (an
agent-instruction document, optional) and `repo.agentSurfaces` (the files post-impl keeps stubs of or
in sync — the two bootstrap stubs `CLAUDE.md` and `.github/copilot-instructions.md` by default, plus
any product file the repo adds, such as the source that embeds an agent guide or a command's help
text). When a key is `null` or a surface is absent, the Phase 9 row reads **"not configured"** — a
stated row, never a silently skipped one.

- **3a. Agent guide** (config `repo.docs.agentGuide`, when configured) — examples, options, workflow
  entries; new error codes in both the inline list and the error-handling table; keep the Grounding
  Index routing accurate. Sync only the categories the guide tracks (trigger terms, workflows, error
  codes, best practices). If the feature introduced none, it needs **no change** — say so.
- **3b. Product agent surfaces** (any entry in `repo.agentSurfaces` that is not one of the two
  bootstrap stubs) — **kept in sync with the agent guide**; the profile document states what each one
  carries (e.g. a generated `agent-guide --json`, a command's `.WithDescription()`/`.WithExample()`
  help and its known-subcommands list). Sync only when a command/subcommand/flag or a tracked category
  changed; otherwise "No change needed".
- **3c. Bootstrap stubs** (`CLAUDE.md` and `.github/copilot-instructions.md` in `repo.agentSurfaces`)
  — **each is a bootstrap stub; it carries no command reference**, so a CLI change is normally "No
  change needed" here. Touch one only if the *working agreement* changed (the push gate, docs
  structure/naming, harness gotchas). The doc meta-tests (`repo.commands.docTests`) pin the stub's
  shape and fail the run if a command listing, an installation/diagnostics section, or a trigger-term
  list reappears — the full sync obligation lives in the change checklist
  (`repo.docs.changeChecklist`) when the repo has one.
- **3d. Skill mirrors** — if a product skill (the profile document names any) mirrors the agent guide,
  update it to match any contract/block/flag changes. **Redeploy the workflow skills whenever tracked
  `skills/**` moved for ANY reason this run** — this run edited one, the Phase 0 reconcile merged
  trunk commits touching `skills/` (drift arrives *by merge*), or the mirror advisory reports
  `stale`/`misplaced`/`orphaned`. The command is `node scripts/sdd/skills.mjs install --yes`; **its
  verification is stated ONCE, in sdd-skill-improve's deploy phase — use that, do not restate it
  here.** It carries the every-harness requirement (config `skills.harnesses`) and the rule that the
  installer's own success report is not proof; a paraphrase here dropped both. Any `skills/**` edit
  this run made obeys the **SIZE-RULE** stated in sdd-skill-improve (the doc meta-tests enforce the
  byte budgets in `skills/sdd.config.json` `sizeBudgetBytes`).

> Many phases touch **no agent surface** (internal behavior, a renderer change). Then 3a–3c are "No
> change needed" — **verify, don't manufacture edits.**

---

### Phase 4 — Audit for Stale Documentation

Grep the codebase for each check below:
1. Every command or entry point the profile document says the product exposes is in the architecture
   command tree (config `repo.docs.architecture`).
2. Every agent-guide command has matching examples (when `repo.docs.agentGuide` is configured).
3. Any embedded error-code list in a product agent surface includes any new codes.
4. Any block/component/contract enumeration (agent guide, skill, PRD) is **complete** — grep the old
   enumeration string and fix every stale copy.
4b. **The retired-token check — the audit's only *removal*-shaped check.** Checks 1–4 all ask "is the
   new thing present everywhere?", which works because a new surface has a name you can look up. A
   **removal** and a **reversal** have no such name, so the old rule simply survives: a README has
   described a picker deleted three phases earlier and outlived two prior audits, and a rule reversed
   two days after shipping has sat asserted in three documents at once.

   **Collect the retired tokens from two feeds, then run ONE grep** (two feeds, not two steps):
   - **From the diff** — identifiers, filenames, attributes and capability names this branch
     *deleted*: `git diff --diff-filter=D --name-only <base>...HEAD` plus the removed symbols in
     `git diff <base>...HEAD | grep '^-'`.
   - **From the plan** — every **reversed** or **negative** locked decision (see the Phase 1 note): a
     rule this run retired, narrowed, or deliberately chose *not* to record. Take the old rule's
     distinctive wording as the token.

   **Grep those tokens across CURRENT-STATE documents ONLY.** That set is **cited, not restated** — a
   hand-copied list is what let this check go blind once already:
   - **When `repo.docs.changeChecklist` is configured: every surface named in it** — the canonical
     list of what a product change must touch, which the bootstrap stubs already point every change
     at. Skip its glob rows — they are directory patterns, not documents.
   - **Plus the SDD current-state specs** — `repo.docs.prd`, `repo.docs.architecture`,
     `repo.docs.projectStructure` (and `repo.docs.agentGuide` when configured). A checklist omits
     these on purpose (its subject is product surfaces, not specs), and they are exactly where a
     retired assertion survives, so citing the checklist **adds** to this phase's set rather than
     replacing it. **When no checklist is configured, the SDD specs are the whole set.**

   The doc meta-tests derive the same set the same way from the config, so the skill and its guard
   cannot disagree (a hand-copied five-document list once left two retired references alive in an
   installer script).

   **History is excluded deliberately:** the stories document and `repo.docs.artifacts` correctly
   retain old wording — a delivered story records what was true when it shipped — and an ungated
   check can never return empty, which is a check people learn to skip.

   A hit in a current-state doc is a stale assertion: fix it. A hit only in history is correct: leave
   it.

The plan's location should match Phase 2's decision: archived under `repo.docs.artifacts` if the plan
is complete, still in `repo.docs.plans` if phases remain. Flag a mismatch either way — an
archived-but-unfinished plan is invisible to the impl skill's backlog, and a finished-but-unarchived
one invites re-implementation. Fix gaps found.

5. **Stale-plan sweep.** List `<repo.docs.plans>/*.md` and check each against the stories document:
   any plan whose story is already delivered **shipped but was never archived**. That is a real hazard
   — the plans folder is the impl skill's backlog, so a shipped plan left there invites
   re-implementation. Report each one and offer to move it to `repo.docs.artifacts` (it is *not*
   automatic — a plan may legitimately be mid-flight across phases; ask). **In YOLO the sweep REPORTS
   and never acts** — the plans it finds belong to *other* features, and YOLO's no-prompt authority
   covers this run's own work and this branch's merge, never someone else's artifacts. A phase whose
   prompt is about another run's work degrades to reporting, not to acting.

> **Optional (Claude Code):** if the audit surface is large, dispatch a read-only Explore sub-agent to
> run these greps in parallel and report gaps. This is a speed-up only — running the greps inline is a
> complete, first-class way to do Phase 4.

---

### Phase 5 — Build Verification

Confirm doc-adjacent code edits didn't break anything.

> **This run's counts are permanent-record claims, so the `FALSIFIABILITY-GATE` applies** — stated
> once in the impl skill's implementation phase and once in the pre-impl skill's plan-writing phase,
> cited here, never restated. Two of its shapes bite this phase specifically: a **count with no
> denominator** (report `N/M` and say where `M` came from — this phase's numbers go straight into a
> story AC, the artifacts index row and the PR body), and a **derived input whose provenance went
> unchecked** (Phase 0's reconcile may have moved the totals impl measured, so impl's numbers are a
> point-in-time record of a different tree, never to be copied forward). **What turns `N/M` into an
> action is the impl skill's `SUITE-DENOMINATOR` block** — wait for the previous runner to exit, the
> reported total equal to the true total stated in the profile document, no runner-crash lines, no
> zero-match filter — cited here, never restated.

**Run this ONCE, and only for the layers this run actually touched.** The impl skill already left a
green build + full suite behind, so re-running a layer post-impl did not change is pure cost. Decide
per layer from the edits **this run** made (Phases 1–4). **The profile document supplies the
suites-by-layer table** — which paths belong to which layer, and the command for each; the shape it
must resolve to is:

| Touched this run | Run |
|---|---|
| Any product source (per `repo.sourceGlobs`, e.g. a product agent surface edited in Phase 3b) | `repo.commands.build` then `repo.commands.test` — through `node scripts/sdd/suite-run.mjs --json`; before any second layer that follows, wait until this run's runner processes have exited (`SUITE-DENOMINATOR` rule 1) |
| Markdown / docs only — no product source edited | **Skip the product suite here.** Phase 5b runs the doc meta-tests, `repo.commands.docTests`, only after the ledgers, run log, and PR-facing Markdown are final. The meta-tests are the whole guard over Markdown — tags, ledger convention, stub shape, story-ID references — so naming only one of them once routed a run that touched stories or a ledger to "skip" while sitting on the tests written to catch exactly those edits. Say the count out loud in the Phase 9 table ("docs meta-tests: 53/53") rather than omitting the row. |
| Any `skills/**` or a bootstrap stub | `repo.commands.docTests`, plus the deploy + parity check from sdd-skill-improve's deploy phase. **Do not route a skill edit to the docs-only row** — the meta-tests pin the canonical blocks **byte-identical across the skills that own a copy**, so changing one without the others fails there and nowhere else, and they fail the run if a command listing regrows in a stub. They take seconds; they have been run from memory because a table did not name them. |
| A UI layer (only when `repo.ui` is configured) | the UI build + test commands the profile document names for that layer |

Phase 3b is the usual reason a docs-focused run compiles at all, and it is genuinely optional — many
features introduce no trigger term, workflow, or error code, and Phase 3 tells you to say so out loud.
When it needs no edit, this phase has nothing to build.

**Authoritative-count horizon.** Measure authoritative counts before editing count-bearing SDD, plan,
artifacts-index, run-log, or PR prose. If an earlier phase had to use provisional numbers, reconcile
every count-bearing document after the final measurement and before staging. A copied impl count or a
count measured before the base reconcile is not authoritative for this tree.

**Order matters: this phase comes AFTER Phases 1–4 on purpose.** Those phases are the ones that edit
product source, so building earlier would just force a second build. If you find yourself building
twice in one run, the cause is almost always an edit made after this phase — make the edit first,
then verify.

**Run the product suite through `node scripts/sdd/suite-run.mjs --json`** — it builds with
`repo.commands.build`, gates on that build, runs `repo.commands.test`, and parses the result by the
`repo.testRunner` adapter; act on its `verdict` — `RUNNER_TERMINATED` is a crashed runner, not a
failed test (`SUITE-DENOMINATOR` rule 2). If the profile document names committed build output,
regenerate it so the committed output matches source before staging, and stage it only when
`git diff --numstat` reports non-zero line counts for it (`EDIT-MECHANISM` rule 1) — a rebuild
rewrites every file, and committed line-ending churn buries a real change and enlarges the next
reconcile. Capture final pass counts for the story AC + summary. Fix any failure before proceeding.

> #### YOLO: tolerate flakiness (only when that behavior is active)
>
> "Fix any failure before proceeding" needs a decision procedure when nobody is available to make it.
> **The boundary is empirical, not a heuristic** — the same way a human settles it. On a red suite:
>
> 1. **Capture the failing test's identity and the verbatim failure FIRST**, before re-running anything.
>    A re-run that goes green destroys the only evidence you had.
>    **This starts at how you INVOKE the suite, not at what you do after it goes red.** A background or
>    piped run must preserve failure detail: write the runner's full output to a file, or filter with a
>    failure-preserving pattern (the profile document names the runner's failure markers).
>    `| tail -N` — and its PowerShell twin `| Select-Object -Last N` — is evidence destruction, not
>    tidiness: it truncates to the summary, and the failing test's assertion is gone before step 2 can
>    ask for it. The identity may survive by luck; the message does not, and it is unrecoverable once
>    the re-run passes.
> 2. **Re-run only that test/file, in isolation, three times** — `repo.commands.testFilter` with
>    `{filter}` substituted by the test's name; when that key is `null`, the per-test invocation the
>    profile document names. Run it from the repo root with absolute paths: a runner whose `--prefix`
>    or project path resolves against a drifted cwd fails on a missing file, not on the test.
> 3. **3/3 clean → flake.** Log a `T-N` carrying the verbatim failure, the reproducing command and the
>    `3/3` evidence, and **continue**.
> 4. **Anything less → regression. STOP.** Do not push, do not open a PR, do not merge. Report the
>    failure verbatim.
>
> **This is the one place YOLO refuses to continue, and it is the point of the mode rather than an
> exception to it.** Tolerating a *flake* is safe because CI is the real merge gate downstream; a
> *regression* is bounded by nothing, and pushing one spends a full CI cycle to learn what a
> thirty-second isolated re-run already proved.
>
> Do **not** substitute the shape-based classification impl uses (assertion-diff vs pool crash vs
> timeout) for the re-run. It is a good triage hint while a human watches; it is not evidence, and this
> is precisely the situation where nobody can catch it being wrong.

**A verification that CANNOT execute must be named, not skipped over.** Before declaring that state,
**execute a compatible runner/runtime probe** (for example the target runtime, the package's own
runner, or the CI-equivalent command) and capture its result; **do not infer incompatibility** from a
different runner's failure or from prose about the environment. "Fix any failure" has no answer for a
suite that still cannot run after that probe (the classic case: an `e2e` suite, `repo.commands.e2e`,
whose package registry is blocked on this machine, so a spec authored during the work has never
executed). Running the suites that *do* work does not satisfy this phase for the ones that don't:
state explicitly **what** could not run, **why**, which compatibility probe ran, and **where it will
first run** (a machine with registry access, or CI), and carry it as the `Unrun verification` row in
the Phase 9 table so it reaches the story, the commit message, and the PR body. A reviewer must never
be able to read "tests green" and reasonably assume an unrun spec is among them.

Phase 5 produces the final build/test results and authoritative counts. Do not stage yet: Phase 5b
performs every remaining Markdown mutation and closes the final verification horizon.

---

### Phase 5b — Friction, run accounting, and final Markdown gate

This is the last run in the trio — the final chance to record what the trio got wrong before the
context window closes. Look back over **this session** and ask whether anything about the
**post-impl skill itself** should change.

<!-- LEDGER-CONVENTION:START -->
> Friction and flake observations go to the **central ledgers**, never to the plan file:
> the **friction ledger** (config `repo.ledgers.friction`) holds `F-N` (friction with a skill itself —
> harvested by **sdd-skill-improve**) and the **test-health ledger** (config `repo.ledgers.testHealth`)
> holds `T-N` (a flaky or slow test — harvested by **test-improve**). Entries are **marked, never
> deleted**: every entry ends in a `**Status:**` line (`Open` / `Resolved <date> — <what/where>` /
> `Declined <date> — <reason>`), opens with a `**Found:**` provenance line (date; plan/branch;
> skill·phase), and carries a `**Decision history:**` line so a proposed fix must confront prior
> attempts before re-making one — the A→B→A thrash guard. A `T-N` is never `Declined` and never
> expires — it stays `Open` until the test is fixed or removed. IDs are **global and monotonic per
> ledger** (read the ledger, take the next free number, never reuse or renumber); the two ledgers
> number independently. Before logging, **check for an existing entry describing the same problem** —
> extend its Decision history or add a new dated sighting rather than minting a duplicate. (Plans
> never carry a friction block.)
>
> **The loop runs INWARD too — the ledger is read on the way in, not only written on the way out.**
> Every trio run opens by reading the `Open` `F-N` entries naming the skill it is about to run: they
> are **errata against the instructions you are executing**, and where an entry contradicts or
> supplements a phase, **the entry is the newer information**. Fixing happens only at the **bookends**
> — **pre-impl** may fold a small open fix into the round it is planning, **post-impl** may fix a small
> entry it just re-confirmed instead of logging another sighting, and **impl reads but never fixes**
> (it stays on the plan). An inline fix obeys the **small-fix rule stated once in the friction
> ledger's header** — a few lines in one file, no prior reversal in its Decision history, on a branch
> never the default branch, citing the entry and flipping its `**Status:**` with a dated
> Decision-history bullet in the same commit, and **at most two per trio run** across both bookends.
> The fix rides the hosting run's own branch as its own commit (never a separate branch, never a
> second push), and — having no plan of its own — cites that **hosting run's plan and branch** as its
> record.
<!-- LEDGER-CONVENTION:END -->

Entry shape (append to the appropriate ledger; each ledger's header restates its grammar):

```markdown
### F-<next> — post-impl · Phase 1b (SDD stories) — <short title>
**Found:** YYYY-MM-DD · `<artifacts>/<the archived plan>.md` · branch <branch>
**What happened:** <Enough narrative that a fresh context window — one that never saw this session —
can reason about a fix: what the skill told you to do, what you actually did, where it misled you or
wasted effort, and what that cost. Name the phase, the file, the command.>
**Recommendation:** <Only when there is a clear one. Omit the line entirely otherwise.>
**Status:** Open
**Decision history:** _none yet_

### T-<next> — <test file> · <test name or describe block>
**Found:** YYYY-MM-DD · `<artifacts>/<the archived plan>.md` · branch <branch>
**What happened:** <The observed flaky/slow behavior — e.g. "failed 1 of 3 runs with `<error>`",
"only passes with a 15s `setTimeout` wait", or "order-dependent: fails when run after `<other
test>`". Name the exact command that reproduced it. If it relies on a sleep/poll/timeout, state the
duration — this is exactly what test-improve's redesign targets.>
**Recommendation:** <Only when there is a clear one — e.g. "replace the sleep with fake timers /
`waitFor` on the real condition". Omit otherwise.>
**Status:** Open
**Decision history:** _none yet_
```

**The bar (F-N).** Log friction that is **recurring or structural** — something an edit to the skill
would actually prevent next time. Do **not** log: one-off environment hiccups (a flaky network call,
a locked executable, an expired token); trivia (a typo, a stale line number); anything you already
fixed in-session; or feedback about the *codebase* rather than the *skill*. **Writing nothing is the
expected outcome of a clean run** — an empty log is a signal, not a failure.

**State the negative, and justify it.** Writing nothing is a legitimate result, but a bare `none` in
the Friction row is a reflex, not a finding — say *why* this run produced none (`none — no phase
misled this run; every step matched the file`). The read half is auditable because a scanned count
reconciles against what `grep` returned; the write half has no such ground truth, so the stated
reason is the only thing that turns the negative into a claim.

**The bar (T-N) — deliberately different from F-N's.** Log **every** test you observed being flaky
or slow this run — a test that failed then passed with no code change, needed a retry, depends on a
`sleep`/`setTimeout`/polling wait to pass, or is order- or timing-dependent. Your test exposure in
this skill is **Phase 5** — the *entire* product suite (`repo.commands.test`) and, whenever a UI layer
changed, that layer's entire suite too. That is broader than impl's targeted loop, so this skill is
often the first place a cross-class, ordering, or load-dependent flake shows up. It is also the first
run to happen **after Phase 0 merged the base**, so a flake here may belong to code this branch never
touched — log it anyway; whose branch it came from is not your call to make. Do **not** filter T-N
for "is this worth fixing" the way F-N is filtered — that triage happens in test-improve's harvest,
not here. A clean run with no flakiness logs nothing under `T-` either — don't manufacture one.

**Before logging one, run the `ANTIPATTERN-GATE` stated in the test-health ledger's header — follow
it there, do not restate it here.** It is the one exception to "don't triage", and it is not a
judgment about whether a fix is worth it: it is a structural check on how the test *observes*. A test
matching one of its anti-patterns is **fixed — or deleted — in THIS run**, on the branch already in
hand, and named in the Phase 9 table rather than logged for a harvest. Routing it onward is exactly
how the cost compounds; the same flake has been handed across three plans before anyone fixed it, and
every hand-off cost more than the fix.

**A `T-N` entry MUST name a specific test file and a specific test name.** An aggregate ("seven
pre-existing e2e failures") or an unidentified target ("unidentified UI test, full-suite run only")
is a **defect in the entry**, not a valid entry: the harvester cannot cluster it, cannot reproduce it,
and — since `T-N` is never `Declined` and never expires — cannot close it either. A full-suite run
makes this easy to get wrong; re-run to identify the test before writing the entry.

**The fix window — resolve a small entry instead of re-observing it.** post-impl is the trio's
closing bookend, so when this run **re-confirmed an entry that is already `Open`** — you hit the same
friction the entry describes — the default is not to append another sighting. If the fix meets the
**small-fix rule stated once in the friction ledger's header** (a few lines in one file, no prior
reversal in its Decision history, on a branch never the default branch, cited and flipped in the same
commit, **≤2 per trio run** counted across both bookends of this plan), apply it now:

- **Its own commit on this branch**, `<repo.commits.bug>(skills):` or `<repo.commits.docs>(sdd):`,
  riding this run's own publish — never a separate branch, never a second push.
- The same commit sets the entry's `**Status:**` to `Resolved <date> — <what/where>` and appends a
  dated `**Decision history:**` bullet naming **this plan and branch** (an inline fix has no plan of
  its own; the hosting run is its record).
- Apply an inline fix only when its skill/ledger paths are disjoint from the hosting plan's own
  deliverables, so the dedicated commit can be staged by explicit whole paths without interactive
  hunk selection. Otherwise leave it Open for the harvester; a fix that cannot be isolated is not
  small within this run.
- Anything wider — two skills, a convention, a meta-test — stays `Open` and goes to the
  sdd-skill-improve harvest. When unsure, leave it open; the weekly cadence exists to absorb it.

**Decide this BEFORE the push, with the friction entries.** The run normally makes exactly one push,
so a fix decided after it either forces the explicit follow-up path below (which restarts CI in `pr`
mode) or silently does not ship. Under **YOLO** the smallness rule and CI are the gate — the fix
proceeds unattended like the friction entries do.

**Draft and confirm friction before writing.** Draft the candidate entries (both buckets), show them
to the developer, let them confirm/edit/add/drop, then **update the central ledgers** with the
confirmed set. Under YOLO, print the complete draft and auto-accept it; the entry-quality rules above
do not change.

> #### YOLO: auto-accept (only when that behavior is active)
>
> Draft the entries exactly as above, **print them in full**, then write them without waiting. The
> confirmation step is what YOLO removes; the drafting standard is not.
>
> Two obligations get **stricter** here, not looser, precisely because nobody reviews the result:
> - **The `T-N` entry-quality rule is now the only thing between the log and an unactionable entry.**
>   An entry that cannot name a specific test file and test name **must not be written at all** —
>   re-run to identify it first. (If the flake surfaced in Phase 5, its isolation re-run has already
>   produced exactly that identification.) A `T-N` is never `Declined` and never expires, so an
>   unidentifiable one can never be closed by anyone, ever.
> - **The `F-N` bar is unchanged: writing nothing is still the expected outcome of a clean run.**
>   Auto-accept is not licence to pad the log. If there was no real friction, the log stays empty —
>   an empty log is a signal, and a log full of manufactured entries destroys that signal silently.

**Append the post-impl run-log row before the gate.** Use the grammar in the run log's header
(config `repo.ledgers.runLog`): UTC timestamp, `post-impl`, the git user, the plan path (its final
location), the branch, and the most specific staging-boundary outcome. Before the docs commit exists,
use the run log's accepted `(this commit)` reference and `docs committed; publish follows` outcome;
do not invent a future hash. **Prepare PR-facing Markdown** at the same time (in `pr` mode),
including the Phase 9 table draft and any unrun-verification or expected-red disclosures, so
submission only consumes already-reviewed text.

**Final Markdown verification horizon — mandatory literal final sequence:**

1. Finish every Markdown edit, including SDD, plan/artifact, epic, friction/test-health ledgers,
   run log, the Phase 9 table draft, and PR-facing Markdown.
2. Run the doc meta-tests, `repo.commands.docTests`, as the FINAL Markdown action over that
   completed tree.
3. Stage the explicit paths for the **next commit only** after the doc meta-tests are green. If
   Phase 5b accepted an inline friction fix, stage its disjoint skill + ledger paths first; Phase 6
   commits that dedicated fix before staging the remaining documentation paths.

Do not stage any Markdown before this sequence completes.

---

### Phase 6 — Commit (separate impl + docs), publish by mode

**Phases 6–8 must not mutate tracked or PR-facing Markdown.** They consume the staged, verified text
from Phase 5b while committing, fast-forwarding or pushing, opening/refreshing the PR, watching CI,
merging, or tagging. If genuinely new friction or another fact requiring Markdown arises during
Phases 6–8, **return to Phase 5b, edit the Markdown, rerun the doc meta-tests, and make and push a
follow-up docs commit before Phase 9**. Never silently patch Markdown after the gate.

**Resolve the target ref:** trunk default / `--push-main` → the default branch; feature default /
`--pr` → the current (or `--branch`) branch.

**6a. Default-branch→PR migration** (only when on the default branch and `--pr`):
- Clean local default branch, dirty working tree only → `git switch -c <target>` (derive `<target>`
  from `repo.branches.feature` or `repo.branches.bug` with the slug from the invocation arguments or
  the moved plan; **a bug plan — one whose file carries the `-bug-` segment or declares
  `**Type:** Bug fix` — takes the bug pattern**; otherwise the feature pattern).
- Local commits ahead of `origin/<default>` → print `git log --oneline origin/<default>..<default>`,
  **confirm with the user**, then `git switch -c <target>; git switch <default>;
  git reset --keep origin/<default>; git switch <target>`. If `reset --keep` would discard
  uncommitted work, surface the error and stop.
- On a feature branch already: the current branch **is** the target — skip 6a.

**6b. Stage** with explicit paths; exclude the unrelated files from Phase 0. **Never `git add -A <dir>`
or `git add .`** — a directory-wide add reads as "stage my changes" but silently defeats the Phase 0
exclusion list, sweeping in files another agent or the developer deliberately left out. If Phase 2
`git mv`-archived the plan, its **destination** is already staged by the move — the enumerated list
must **not** include the old pre-move plans-folder path; a stale path in the list aborts the *entire*
`git add` on a missing pathspec (git add is all-or-nothing), so never suppress its stderr (no
`2>/dev/null`) or you won't see the abort. **After staging, verify before committing:** print
`git diff --cached --name-only` and confirm it (a) contains nothing from the Phase 0 exclusion list
and (b) contains every expected path, including the moved destination — a `git status --short`
staging-column glance (` M` → `M `) is too easy to misread as "unchanged."

**When 6c needs the two-commit split** (impl left the code uncommitted, so this run makes a code
commit *and* a docs commit) **and Phase 2 archived the plan**, the `git mv`'s staged rename is sitting
in the index from Phase 2 — before staging the **first** (code) commit's explicit path list,
`git restore --staged <old-plans-path> <new-artifacts-path>` so the rename doesn't ride along into
the wrong commit. "Plan moved to artifacts" belongs in the **second** (docs) commit per 6c's own
template below; add the destination path back to that commit's staging list when you get there.

**6c. Commit:**

> **Which type?** `repo.commits.bug` when the plan is a **bug** plan (`-bug-` segment /
> `**Type:** Bug fix`); `repo.commits.feature` otherwise — **feature is the default**. Same rule the
> impl skill used, so the two commits on a branch never disagree.

- **Impl still uncommitted → TWO commits.** First the code
  (`<repo.commits.feature|bug>(<scope>): <feature> — <what>`, **never the docs type**), then the docs:
  ```
  <repo.commits.docs>: post-impl updates for <feature>

  Updates architecture, PRD, stories (S-YYMMDD.HHMMSSx), agent surfaces, skill. Plan moved to artifacts. <N>/<M> tests, 0 failures.
  ```
- **Impl already committed** (via the impl skill or per-MSU) → make **only** the docs commit.
- **Phase 5b accepted an inline friction fix** → before either shape above, commit the already-staged,
  disjoint fix paths as their own `<repo.commits.bug>(skills):` or `<repo.commits.docs>(sdd):` commit.
  Then stage the remaining explicit paths and continue with the ordinary code/docs split. This
  dedicated bookend commit is the sole carve-out from "only the docs commit" when impl was already
  committed; it introduces no post-gate Markdown mutation.
- **Attribution follows `repo.commits.attribution`.** When it is `false`, no commit receives a
  model/agent attribution or `Co-Authored-By` trailer — commits are attributed only to the
  repository's configured git user, and any harness-level attribution instruction yields to this
  repo rule. When it is `true`, append the harness's own attribution lines.

**6d. Publish** — one of three paths, decided by the mode row from Phase 0:

- **Trunk mode (on the default branch; hotbug or confirmed direct push)** → `git push`.
  Non-fast-forward → STOP ("branch diverged — pull/rebase first"); never `--force`.
- **Feature mode, `pr`** → **always `git push -u origin <target>:<target>` (the explicit refspec),
  regardless of tracking state.** Do not branch on tracked-vs-untracked here: a feature branch cut
  the ordinary way from fresh trunk (`git switch -c <target> origin/<default>`) sets its upstream to
  `origin/<default>` itself, not to a like-named remote branch — it reads as "tracked," and a bare
  `git push` on it pushes straight to the default branch, bypassing the branch/PR discipline
  entirely. The explicit refspec is correct for both the new-branch and already-tracked cases and
  can never resolve to trunk. Non-fast-forward → STOP; never `--force`. Continue to Phase 7.
- **Feature mode, `trunk-ff`** → fast-forward the default branch to this branch and push it:
  ```
  git switch <default>
  git merge --ff-only <target>
  git push origin <default>
  ```
  `--ff-only` is the whole safety of this path: it refuses when the default branch has commits this
  branch does not contain, which means Phase 0's reconcile was skipped or trunk moved since — on a
  refusal, STOP, `git switch <target>`, reconcile against `origin/<default>` (Phase 0), re-run the
  doc meta-tests if the reconcile touched Markdown, and try again. Never `--no-ff`, never a merge
  commit, never `--force`. If the push itself is rejected as non-fast-forward, STOP the same way.
  **Delete nothing**: the feature branch stays, local and remote if it was ever pushed. The checkout
  is now on the default branch as a consequence of the merge; the run neither switches back nor
  tidies — git-recenter owns branch cleanup and moving between branches. Phases 7 and 7b do not run.
  **Then, when `repo.commands.deployTool` is set, run it** — this is how the repo's own tool is
  reinstalled after publish — and state the resulting version in the Phase 9 `Deploy tool` row
  (`null` → the row reads "not configured"; in `pr` mode the row reads "skipped — pr publish; deploy
  from the default branch after merge").

---

### Phase 7 — Open or refresh the PR (`pr` publish only)

Runs only when the publish path is `pr` (trunk `--pr`, or feature mode with `repo.publish` = `pr`).
Skip it — with a stated Phase 9 row — on a direct trunk push and in `trunk-ff` mode.

**Detect existing:** `gh pr list --head <target> --state open --json number,url,baseRefName`. If one
exists → capture it, refresh the body if scope changed, skip create. (A PR that Phase 0 found
**merged** is never refreshed — create a new one.)

**Resolve the base:**
- **Trunk `--pr`** → base = the default branch.
- **Feature (stacked)** → base = the **prior phase's branch** (the branch this was cut from). Inspect
  the stack (`gh pr list --state open --json number,title,headRefName,baseRefName`); if the prior
  phase already merged, base = the default branch; `--base` overrides; if genuinely ambiguous, **ask
  the user**. Confirm the base exists on origin.
  - **When the prior phase merged as a squash**, `origin/<default>` gets a new SHA that is not an
    ancestor of this branch's history — a three-dot diff (`merge-base(default, HEAD)..HEAD`) would
    re-include the *entire* parent phase's changes, making the PR unreviewable. Before opening:
    `git fetch origin`, then `git merge-base --is-ancestor origin/<default> HEAD`; if that fails (not
    an ancestor), rebase this branch's own commits onto it —
    `git rebase --onto origin/<default> <parent-branch-tip-at-cut-time>` — so the now-redundant parent
    commits are dropped rather than replayed-with-conflicts. Verify
    `git log --oneline origin/<default>..HEAD` shows only this phase's own commits before creating the
    PR. (A never-pushed feature branch rebases for free — no force-push concern.)

**Create:** `gh pr create --base <base> --head <target> --title "<type>(<scope>): <feature>[ (Phase N)]" --body-file <body-file>`
— `<type>` follows the **same bug/feature rule as 6c** (`repo.commits.bug` for a bug plan,
`repo.commits.feature` otherwise). The body file is the PR-facing Markdown prepared and meta-tested
in Phase 5b; this phase consumes it without rewriting it. If scope changed after the gate, return to
Phase 5b rather than editing here. If `gh pr create` fails, surface it verbatim (the branch is already
pushed).

> **No agent-authorship call-outs in the PR.** Do not mention any model, harness, AI, or agent
> authorship anywhere in the PR **title or body** — no generated-with footer, no tool badge, no
> "authored by an agent" note. The PR describes the change; how it was produced is not part of that
> description. This is scoped to the PR surface only: commit attribution is governed by
> `repo.commits.attribution` (Phase 6c) and is unchanged by this rule.

---

### Phase 7b — YOLO: watch CI, then merge (`pr` publish only)

Runs **only** when the auto-merge behavior is active **and** Phase 7 opened or refreshed a PR. Skip
it otherwise, and say which in the Phase 9 table.

> **Why the agent watches instead of `gh pr merge --auto`.** Native auto-merge only *waits* when a
> required check or review blocks the PR. The profile document states whether the default branch has
> branch protection or a ruleset with required checks; when it has **none**, `--auto` would merge
> **immediately, before CI ran a single job**. With required checks in place, `--auto` becomes
> strictly better than watching — re-check the profile document before choosing.

1. **Wait for the checks to attach.** Straight after `gh pr create`, `gh pr checks` can report *"no
   checks reported"* and exit non-zero simply because nothing has registered yet. Poll for up to
   **2 minutes** before concluding the PR genuinely has none.
   - **A PR with genuinely no checks does NOT auto-merge.** Stop and report. *"Nothing ran"* is not
     *"everything passed"*, and that distinction is the entire gate.
2. **Watch:**
   ```
   gh pr checks <n> --watch --fail-fast --interval 30
   ```
   `--fail-fast` exits on the first failure instead of waiting out the rest. A 30-second interval is
   ample against a run of several minutes and keeps the polling quiet.
3. **Bound the wait.** `gh pr checks --watch` has **no built-in timeout**, so a hung check would hang
   the session indefinitely. Cap the total wait at **≈3× the CI wall time the profile document
   states** (45 minutes when it states none). On timeout, treat it exactly as a failure (step 6):
   stop, do not merge, report what was still pending.
4. **Verify the conclusions explicitly — do not merge on the watch command's exit status alone:**
   ```
   gh pr checks <n> --json name,state,bucket
   ```
   **Every** check must have completed successfully. Anything `pending`, `failing`, or otherwise
   unresolved → stop. There is deliberately **no allow-list**: a check the org adds next month is
   gated automatically rather than silently ignored, and a genuinely failing security scan is exactly
   the case an unattended merge must not walk past.
5. **Merge:**
   ```
   gh pr merge <n> --squash
   ```
   Squash unless the profile document names another merge method as the repo's default. Report the
   resulting commit on the default branch.

   > **This skill never deletes branches — local or remote.** No `--delete-branch`, no `git branch -d`,
   > no `git push origin --delete`, in this phase or any other, under either publish mode. Whether
   > the remote branch survives a merge is a repo setting; a surviving branch is the intended outcome,
   > not an omission to tidy up. Branch cleanup is the developer's own act (git-recenter offers it
   > against merged-PR state), and an unattended run is the worst possible place to make an
   > irreversible one — the flag also deletes the **local** branch and moves the checkout, which is
   > exactly the code-loss risk this rule exists to remove.
6. **On a failed/errored check or the timeout: STOP.** No merge, no CI retry, no force. The branch
   stays pushed and the PR stays open; end the run naming the check by **name, conclusion and URL**.
   A watcher **transport/tooling** error (connection reset, EOF, GraphQL 5xx) is not a gate result:
   reconnect the observer inside the original cap, then re-read every check explicitly and include the
   reconnect count in Phase 9. Reconnecting the observer never reruns CI. A failed check is evidence;
   re-running it unattended risks landing a real break as *"passed on retry"*.

**Never `--admin`, never `--force`, never re-run a failed check.** Merging past a failing gate is
categorically outside the authority this mode was granted — the gate *is* the mode's justification.

**Do not switch back to the default branch or pull after merging.** Tempting for the wake-up case,
and out of scope: git-recenter owns that move.

---

### Phase 8 — Release tag (default branch only; when `<release-type>` given)

Skip if no `<release-type>` (or if not on the default branch — already refused in the grammar).
**This phase is gated on a `release` section in the profile document**: it names the tag pattern,
the release workflow, and the Actions URL. Treat releases as **"not configured"** — a stated Phase 9
row, and the grammar's refusal of `<release-type>` — unless the profile document describes them.

1. Working tree clean (`git status --porcelain` empty).
2. Resolve the tag: `noteworthy <version>` → verbatim; `noteworthy` (none) → patch-bump the latest
   stable `git tag --list 'v*' --sort=-v:refname | head -1` (ask the user if the bump dimension is
   ambiguous); `silent <version>` → verbatim; `silent` (none) → `v<base>-alpha.<N>` (N = max existing
   alpha at this base + 1); cold start → ask the user.
3. Validate shape: `noteworthy` MUST NOT contain `-`; `silent` MUST; tag must not already exist
   locally or on origin.
4. Verify the tagged commit **exists on origin** (`git rev-parse HEAD` appears in
   `git ls-remote origin`); if not, the push hasn't landed — retry briefly, then fail.
5. `git tag -a <tag> -m "Release <tag>"` then `git push origin <tag>` (separate from the branch push).
6. Print the tag + the Actions URL the profile document names; the release workflow runs
   automatically — do not poll.

**Hard rules:** do not edit the release workflow or the project's version file to effect a release;
no manual package upload and no `gh release create` by hand; no `--force`/`git tag -f`; never push a
tag before its commit is on origin; never tag from a dirty tree.

---

### Phase 9 — Actions taken (summary table)

Every skill in the trio ends with the **same table**, so three runs read alike. **One table — the old
document ledger and the mode-specific footers are absorbed as rows, not printed alongside.**

```markdown
## Actions taken (<trunk | feature branch> · publish <pr | trunk-ff>)

| Action | Target | Result |
|--------|--------|--------|
| Config | skills/sdd.config.json + <profile> | read; build=<cmd>, test=<cmd>, docTests=<cmd>, publish=<pr|trunk-ff>, deployTool=<cmd|not configured> |
| Mode | — | STANDARD (or: YOLO — auto-accept friction, tolerate flakiness, auto-merge / or: YOLO requested but skipped — feature-branch-only, on <default> / or: YOLO refused — publish is trunk-ff) |
| Mirror advisory | — | no advisory present / all current / <stale|misplaced|orphaned: names> / could not determine |
| Errata | <friction ledger> | N titles scanned, M read in full, K acted on (F-…) — or: none open |
| Friction | <friction ledger> | N logged (F-…), M resolved (F-…) — or: none — <why this run produced none> |
| Story added | <stories> | S-YYMMDD.HHMMSSx under Area: <area>; area Stories cell extended |
| Architecture / project structure | <architecture> + <project structure> | <what changed in each> (or: No change needed) |
| PRD | <prd> | FR-NN extended (or: No change needed — <why>) |
| Agent guide | <agentGuide> | <what> (or: No change needed — no agent surface; or: not configured) |
| Agent surfaces | <repo.agentSurfaces entries> | <what> per entry (or: No change needed — <why>) |
| Plan | <artifacts>/<date>[-bug]-<slug>.md | archived — tags reconciled → `area:…` `arch:…` (or: **kept in <plans> — Phases N–M unbuilt**, no index row written; or: **kept, blocked** — <blocking plan/evidence>, actionable when <condition>) |
| Run accounting | <run log> | rows present for pre-impl + impl; post-impl row appended as `(this commit)` / `docs committed; publish follows` (or: ⚠ no <skill> row for this plan — departure noted) |
| Stale-plan sweep | <plans> | N shipped plans found (or: clean) |
| Build + tests | <layer(s)> | N/M, 0 failures — total from <profile / --expect-total> (or: skipped — docs only) |
| Docs meta-tests | <docTests> | N/N green, run as the final Markdown action |
| Unrun verification | <suite/spec> | could not execute — <why>; first runs: <where> (row REQUIRED whenever one exists) |
| Committed | <feature|bug type>: + <docs type>: | <impl-hash> + <docs-hash> (or: docs only — impl already committed) |
| Published | origin/<default> (trunk-ff: ff-merged from <branch>) / origin/<branch> (pr) | <hash> (or: ⚠ HOTBUG — direct to trunk, no PR) |
| Deploy tool | <deployTool> | <resulting version> (or: not configured; or: skipped — pr publish) |
| PR | <url> | → base <base> (stacked: merge order …) (or: not opened — trunk-ff) |
| CI watch | PR #<n> | 6/6 checks SUCCESS in 11m 40s (or: STOPPED — <check> FAILED, <url>; or: not run — auto-merge off / trunk-ff) |
| Merged | <default> | <squash-commit> via --squash — branch left intact (or: NOT merged — <why>) |
| Release tag | <tag> | pushed; Actions: <url> (or: not configured; or: none requested) |
```

**Rules that make it useful rather than decorative:**
- **Every Result is verifiable** — a hash, a story number, a URL, a count. Never "done" or "✅" on
  its own.
- **"No change needed" and "not configured" rows are REQUIRED, with the reason.** This is the
  load-bearing half of *verify, don't manufacture*: the table is how a reader tells "correctly
  skipped" from "forgotten," and dropping the row destroys that distinction.
- **The publish mode is a stated row, never implied** — the `Published` row names which of the three
  Phase 6d paths ran, and the `PR`, `CI watch` and `Merged` rows say "not opened — trunk-ff" rather
  than vanishing.
- **Omit only rows for actions this mode cannot take** (no `Merged` row on a direct trunk push; no
  tag row when no release type was given and none is configured).
- **This is the only summary** — no second table, no prose recap of the same facts.
