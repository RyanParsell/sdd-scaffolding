---
name: pre-impl
description: Plan new features and bug fixes before implementation. Syncs the repo, grounds in the current specs and live behavior, grills requirements one question at a time, writes a phased plan in the plans folder, and creates or reuses the correctly named feature or bug branch. UI work is divided into smoke-testable units. Use when starting, scoping, or planning work, or before the impl skill. Supports --main, --with-docs, and --hotbug; hotbug is the explicit urgent-fix path that stays on the default branch with no PR. Ends with a reviewable plan and branch, not implementation.
user_invocable: true
version: 1.0.1
# ⚠️ IMPORTANT: When editing this file, increment the patch version above (e.g., 1.0.4 → 1.0.5).
---

## Pre-Implementation: $ARGUMENTS

The **front bookend** of the trio (**pre-impl → impl → post-impl**): get the repo current and the tool deployed, then interview the feature into a **phased `plan.md`** on a correctly-named **feature branch** — ready to hand to the impl skill. It ends at *a plan on a branch*; it does **not** implement.

> **Harness-neutral.** Every phase below is written as concrete `git` / shell commands any agent can run directly, plus references to sibling skills **by name**. Invocation differs by harness: Claude Code runs a skill as a slash command, Codex as `$name` or via its skills menu, and Copilot activates it by matching its description — so wherever this file says "run the X skill," use whatever your harness does to invoke a skill named X. If a referenced skill isn't installed, do its work inline. A **Claude Code accelerations** section at the end lists optional speedups (sub-agents, worktrees, background tasks); the numbered phases are the complete, first-class path on their own.

> **Effort is not measured in human-hours.** When shaping the plan, do **not** give implementation *time* any strong weight — the hours a human would spend building a feature generally don't apply to an agent. Decide the approach on merit: the most correct, complete, and maintainable result (right decomposition, proper tests, thorough coverage), not whatever looks fastest or smallest to hand-build. Never trim scope, skip tests, or pick a shallower design to "save time." If two approaches differ mainly in human effort, that difference is not a deciding factor.

### Arguments
- `--main` — switch to the default branch (config `repo.defaultBranch`) and sync trunk before starting (default: sync the current branch — so a later phase of an in-flight feature continues **on that feature's existing branch**, not on a new one).
- `--with-docs` — the Phase 4 interview additionally challenges terminology against the domain vocabulary and writes decisions into the vocabulary/context document (config `repo.docs.vocabulary`) inline as they lock.
- **`--hotbug`** — the **trunk-direct escape hatch**: work on the default branch with **no branch and no PR**. Match it liberally — `--hotbug`, `hotbug`, `hot bug`, `hot-bug`, `--hot-bug` in the invocation all mean the same thing. **This is the ONLY way any skill in the trio works on the default branch.** See below.

**No-topic invocation state.** When `$ARGUMENTS` supplies neither a topic nor a complete specialized
handoff, **resolve the topic explicitly** from the developer's request before syncing or grilling. If
there is no concrete subject to resolve, STOP with **"no plan produced"**; never drift into a generic
cleanup, backlog, or "improve the product" plan merely because the skill was invoked.

### The `--hotbug` escape hatch

Normally pre-impl **always** puts work on a branch (the feature or bug pattern from config `repo.branches`) and the impl skill **refuses to implement on the default branch**. `--hotbug` is the single, deliberate exception: an urgent fix that goes straight to trunk without the branch/PR ceremony.

Because it bypasses the review gate, it carries obligations:

- **It is always a bug fix.** A hotbug is by definition restoring broken behavior *now*. If the change ships any new capability, it is not a hotbug — drop the flag and take a branch. **Say this to the developer** if what they describe sounds like a feature.
- **It stays on the default branch** — no branch is created, at any point, by any skill in the trio.
- **It is declared in the plan** (`**Hotbug:** YES` — Phase 7), and that declaration is what unlocks the impl skill's default-branch refusal. No declaration → impl stops.
- **Confirm before proceeding.** State plainly: *"Hotbug: this goes straight to the default branch with no branch and no PR — the review gate is skipped. Confirm?"* If the developer hesitates or the fix isn't genuinely urgent, use a normal bug branch instead.

### Output Style
- Brief phase indicators ("Phase 1: Sync…", "Phase 3: Grounding (SDD + repro)…", "Phase 4: Grilling…").
- Do NOT narrate each file read/edit.
- End at a clear "plan written + branch created — review, then run the impl skill." (Under `--hotbug`: "plan written on the default branch — HOTBUG, no branch.")

---

### Phase 0 — Resolve the config

Before anything else, read **`skills/sdd.config.json`** and the **profile document** (config `repo.docs.profile`). Every command, document path, ledger path, branch pattern and commit prefix this skill names below is a key in that file, never a literal — resolve them now and **state the resolved values in the Actions-taken table** (Phase 8, the `Config resolved` row), so a wrong config is caught at the top of the run rather than at the first command that fails. The profile document carries what a JSON value cannot: the test categories and reference test files, the fakes and stagers, the smoke environment, the product's entry point for a live repro, and anything the deploy or dev loop needs beyond one command line.

A config that is missing, fails validation, or still carries a `TODO` marker in a key this run needs (`repo.commands.build`, `repo.commands.test`, `repo.commands.docTests` at minimum) is a **stop condition** — say which key, and do not improvise a command in its place.

---

### Phase 1 — Sync to current

- If `--main` **or `--hotbug`**: `git switch <defaultBranch>` first (a hotbug lands on trunk, so it must *start* from trunk — even if you were on a feature branch). Refuse (and stop) if switching would abandon real uncommitted work.
- **Dirty-tree rule (before pulling):** inspect `git status --porcelain`.
  - Only uncommitted changes are **incidental churn the profile document names as discardable** (lockfiles regenerated by a restore, generated manifests) → discard them (`git checkout -- <those paths>`), then pull. Nothing else is ever discarded on this rule.
  - **Real work the developer wants put on a branch** (typically: work started ad-hoc on the default branch — common precisely because the impl skill *refuses* to run there, so people get stopped mid-flight and need exactly this) → **RESCUE it, don't stop.** Cut the branch **now**: `git switch -c <feature-or-bug pattern with slug>` — uncommitted changes follow the switch, so nothing is lost and trunk is left clean. Then **record the branch name and reuse it in Phase 7 — do NOT create a second branch there.** If the grill hasn't named the work yet, use a provisional slug and rename before the plan commit (`git branch -m <new>`); a branch that has never been pushed renames for free.
  - **Any other** uncommitted change → **STOP and surface it.** Never stash/discard real work; let the developer decide. Stopping stays the default whenever the developer has *not* asked for the work to be branched.
- `git pull` (fast-forward the current branch, or the default branch under `--main`). If the pull reports conflicts, stop and surface them.

---

### Phase 2 — Deploy the tool (when the work touches code)

The deploy (config `repo.commands.deployTool`) is how the built product reaches the machine — typically a pack + reinstall that costs **minutes of wall-clock**. It exists so that Phase 3b (reproduce/exercise the live system) and the impl skill run against current bits. So the question is not *"does this work have a code surface"* but **"will anything this plan runs invoke the installed tool?"** — decide that before paying for it:

- **`repo.commands.deployTool` is null** → the phase is **not configured**. Write the explicit row (`Deployed tool | — | deferred — not configured`) and move on; nothing else in this phase applies except the mirror advisory and the skill redeploy below.
- **Something will invoke the installed tool** — a CLI repro, a UI smoke, a spike against the deployed binary (or you don't yet know) → run it.
- **Nothing will** → **defer or skip it, and say so explicitly** ("Phase 2: deploy deferred — nothing here invokes the installed tool"). A silent skip is indistinguishable from a forgotten step; an explicit one is a decision. This covers docs/SDD/skills/config work — and, less obviously, **test-only and e2e-only plans**: a test harness usually resolves the *built* binary from the build output (and its sibling fixture executables), not the tool on `PATH`, so the installed tool is never in the loop. What such a plan actually needs is the **build command** (config `repo.commands.build`) — the whole build, because a harness spawns those siblings independently. The profile document says which it is for this repo.
- **Change type still unknown at this point** (the grill hasn't run) → **kick it off in the background** and reconcile the reported version before writing the plan. Where the harness supports background tasks, this is the default rather than an optimization.
- **A host process is holding the installed binary** (a running dev server or detached UI host, yours or the developer's) → a reinstall can silently no-op against a locked binary, so stopping it is a precondition, not a courtesy — see the locked-binary check below. If it is the *developer's* smoke host, defer rather than kill it.

<!-- MIRROR-ADVISORY:START -->
> **The SessionStart hook measures the mirrors; every skill states what it said.** `scripts/sdd/lifecycle.mjs` runs `node scripts/sdd/skills.mjs status --json` once per session and reports any deployed mirror that is **stale** (ours, drifted from tracked `skills/`), **misplaced** (ours, at a scope the installer never writes) or **orphaned** (a retired name still deployed). It is deliberately **unconditional** — a guard that fires only "when the sync pulled changes under `skills/`" stays silent through a drift whose cause is an installer defect rather than a sync. Each skill **states the advisory's result at its opening phase**, including "no advisory present" and "could not determine" — an advisory nobody repeats is not evidence a stage ran.
>
> **A mid-run redeploy repairs the NEXT invocation, not this one.** Installing refreshes every mirror on disk, but it cannot replace instructions already loaded into the running prompt — so when the loaded skill predates tracked source, **the tracked `skills/<name>/SKILL.md` is authoritative for the current run and must be read directly**. Deploy anyway (the next run needs it), and say which text you followed.
>
> **`misplaced` is the one the installer cannot fix.** The installer writes project skills to the project-scope mirror of each configured harness (config `skills.harnesses`) and never to user scope (`~/.claude/skills/<skill>/` and its equivalents). A project skill found at user scope shadows the project copy silently; the remedy is to **delete the stray directory** and let resolution fall through to the project mirror — reinstalling reports success and changes nothing.
<!-- MIRROR-ADVISORY:END -->

> **Skipping the tool deploy must NOT skip the skill deploy.** The trio executes from the **deployed
> mirrors** (`.claude/skills/…` and the other harness project dirs), not the tracked `skills/` source.
> So skipping the expensive tool deploy silently leaves you executing whatever the last install left
> behind — and the case that most often skips it, *a docs/skills plan*, is exactly the case where
> `skills/` just changed. The pre-impl reading its own instructions can therefore be a version behind
> the file it is about to edit. Whenever the Phase 1 sync pulled changes under `skills/` — or this plan
> will touch them — redeploy the skill mirrors on their own even when the full tool deploy is skipped
> or not configured. It is a file copy, seconds, not minutes:
>
> ```
> node scripts/sdd/skills.mjs install --yes
> node scripts/sdd/skills.mjs status --json
> ```
>
> The installer's own success report is not proof — the `status` call afterwards is, and it must
> come back with no `stale`, `misplaced` or `orphaned` mirror for the skills this run uses. The full
> deploy-and-verify procedure for skills lives in **sdd-skill-improve**'s deploy phase; this is the
> minimum, not a restatement.

**Before running the tool deploy, check for a locked binary.** A reinstall silently fails (or no-ops
on a same-version repack) when a running host is holding the installed executable open — the failure
can be swallowed and read as success, leaving a stale tool deployed with no visible error. The profile
document names how to check for and stop such a host (a dev server, a detached UI host); do that
first.

```
<repo.commands.deployTool>
```

Report the resulting version.

**After it reports success, verify the *invoked* version, not just the installer's own report.** The
deploy proves its own binary installed correctly; it does not prove that the bare command this
session will actually type resolves to it — a stray shadowing binary earlier on `PATH` silently wins
otherwise. Run the bare version command yourself (the profile document names it) and confirm it
matches the version the deploy just reported before treating the deploy as done; a mismatch means
PATH shadowing (`where`/`which <tool>` names the culprit).

---

### Phase 3 — Ground in the current system

pre-impl usually runs in a **fresh context window**, so before interviewing the developer, ground yourself in what the product already is — first from its specs (3a), then, for changes to existing behavior, from the running system (3b).

**3a. Read the SDD selectively.** Ground yourself in the SDD folder (config `repo.docs.sdd`) — the
living specs that track what the product *currently is*. The core SDD files can exceed a single
document-read cap, so **never read them end to end "to be safe."** Build one candidate tag set as you
route the request, using the controlled `prd:` / `arch:` / `area:` vocabulary declared at the top of
the artifacts index (the README in config `repo.docs.artifacts`), then reuse it across every index:

1. The PRD (config `repo.docs.prd`) — read its **Index**, then the universal product baseline
   (problem statement, vision, target users) plus only the matching FR/NFR sections.
2. The architecture doc (config `repo.docs.architecture`) — read its **Index**, then the
   architectural-approach section plus only the matching design/data-flow/convention sections.
3. The project-structure doc (config `repo.docs.projectStructure`) — read its **area lookup**, then
   search/read only the matching paths in the full structure listing.
4. The agent guide (config `repo.docs.agentGuide`), **when configured** — read its Index, then the
   what-it-is / when-to-use sections plus only the matching workflows or command branches. When the
   key is null there is no such document; say so and move on.

Read any other **spec** in the SDD folder relevant to the work. **The logs folder (config
`repo.docs.logs`) is deliberately not part of this read** — the operational ledgers (friction,
test-health, run log, test-roi; they grow without bound) record how the *process* has behaved, not
what the *product* is, and reading one end-to-end would spend most of this phase's budget to no
benefit. They are reached two ways only: the **targeted errata read** below, and a harvester run.
**Exception — when the work's subject IS the process** (the workflow skills, the friction convention,
the trio itself): the friction corpus is the evidence base for the change, not noise — ground in it
too, as data (open-entry counts by kind, age distribution, recurrence) rather than improvising that
measurement mid-run. And keep the **vocabulary document** (config `repo.docs.vocabulary`, when
configured) — the users-first term decoder — in reach: the grill and the plan must use its words (a
term the vocabulary defines is never re-invented under another name), and work that coins a
genuinely new user-visible term should note that the vocabulary needs the entry.

The stories doc (config `repo.docs.stories`) is the exception — it is **large and grows forever**, so read it **selectively**:

1. Read its **`## Index`** (the table at the top: Area | Stories | Summary). Story IDs are self-minting UTC timestamps (`S-YYMMDD.HHMMSSx`) — there is no shared "next free ID" to read.
2. From the index, pick the **1–3 `## Area:` sections** the work touches and read **only those**, in full.
3. If the Phase 4 grill later surfaces an area you did not load, read that area **then** — don't guess from the index summary.

A full read of any indexed SDD doc is rarely warranted; do it only if the work genuinely spans most
of that document (a cross-cutting refactor, say). Reading a whole file "to be safe" wastes the
context this phase exists to spend well.

**Errata read — the open friction against THIS skill.** Before grounding in the product, ground in
the instructions: read the `Open` entries naming pre-impl in the friction ledger (config
`repo.ledgers.friction`). They are **errata against the phases you are about to execute** — where an
entry contradicts or supplements this file, the entry is the newer information.

**How to read them is the `READ-PROTOCOL` block stated in the friction ledger's header — follow it
there, do not restate it here.** In short: scan every title (`grep -n '^### F-.* — pre-impl' <ledger>`),
open in full only what this run can act on, and state the counts in Phase 8's `Errata` row. The
protocol is one definition for all three trio skills because separate copies of it drift into
vagueness.

> **Before folding an inline fix, re-read that entry from the remote default branch — not from your
> working tree** (`git fetch origin` then `git show origin/<defaultBranch>:<ledger> | grep -A3 '^### F-<n> '`).
> A `**Status:**` is accurate only for the branch reading it; an entry has been fixed twice by two
> unmerged branches that each correctly read `Open`.

Being a **bookend**, pre-impl may also *resolve* one: an entry whose fix is small (the rule is stated
once in the ledger's header — a few lines in one file, no prior reversal, on a branch, cited and
flipped in the same commit, **≤2 per trio run**) can be folded into this round as an explicit plan
deliverable, or — when it is unrelated to the plan's subject — applied directly as its own commit on
the branch created in Phase 7. Anything structural stays `Open` for the **sdd-skill-improve** harvest;
that cadence exists to absorb it. Say which entries you read and which (if any) you are resolving.

**Epic scan — is this request a round of standing strategy?** Check the epics folder (config
`repo.docs.epics`) for a track that matches the request (the folder is small; read the epic titles,
then the matching epic). This does **not** require the developer to name the epic in the invocation —
requiring that was the papercut. On a match:

1. Read the epic and carry the matching track's **current state, options held, and revisit triggers**
   into the grill as context — those options are deliberately open, so do not re-decide them silently.
2. Cite the epic in the plan's header block (an `**Epic:**` line naming the file and track).
3. **Append the round's row to the epic's round ledger as part of this run** — link the plan at its
   plans-folder path and mark the Shipped cell *(in flight)*; post-impl completes the row and re-points
   the link to the artifacts folder when it archives. A round that exists only as a plan is invisible to
   the next person reading the epic.

**A harvest is the ambiguous case, and the test is what the run SHIPS.** A run is a round of an epic
when its deliverables change the scaffolding the epic is about; a harvest whose output is ordinary
test or product fixes is the loop *running*, not a round *of* it. A spurious row pollutes a document
never archived; a missing one hides a real round — when torn, state the judgment as overturnable
rather than adding the row.

No matching epic is the normal case for ordinary feature work — say so in one line and move on.

**Related-work scan (the archive knows how it came about).** The SDD says what the system *is*; the plan archive says *how it got that way* — decisions, rejected alternatives, the traps prior work hit. Every row in the artifacts index (the README in config `repo.docs.artifacts`) carries **tags** (`prd:FR-N`, `arch:<slug>`, `area:<slug>` — vocabulary declared at the top of that README). After the SDD read identifies the FRs, components, and areas this work intersects:

1. **Translate them to candidate tags** and filter the index by those tags (a grep over the README rows works: `grep 'area:<slug>' <artifacts>/README.md`).
2. **Absorb every matching row's summary** — breadth is cheap; the summaries are dense.
3. **Fully read at most ~3 closest-ancestor artifact docs** (weigh recency + how directly they shaped the thing you're changing) — depth is expensive; the cap is the point. State which docs you read.
4. **Check active sibling plans/branches for shared files or seams.** Search the plans folder (config
   `repo.docs.plans`) plus local and remote feature branches for work that overlaps the paths or
   contracts this plan will touch. **Diff with the THREE-dot form** —
   `git diff --name-only <defaultBranch>...<branch> -- <your paths>` — and, where `repo.publish` is
   `pr`, filter to branches with an **open PR** (`gh pr list --head <branch> --state open`). Two-dot
   folds in everything trunk advanced past (dozens of phantom overlaps in practice); a squash-merged
   branch's retained ref still shows its whole diff, so a merged branch reads as a live overlap unless
   its PR state is checked. Under `trunk-ff` there is no PR to check — a branch already contained in
   trunk (`git merge-base --is-ancestor`) is the equivalent of merged.
   When active sibling plans/branches share files or seams, contact the owning run where the harness
   permits it, **exchange and record** the **locked seam decision** (shape, owner, and integration
   order), and carry that decision into both plans. If it cannot be exchanged, mark the seam unresolved
   and make it an explicit stop condition rather than letting concurrent plans decide it independently.

Carry what the ancestors teach — prior decisions, rejected approaches, named traps — into the grill and the plan's Context, exactly like the FRs and conventions from the SDD read.

**Already grounded?** This phase assumes a **fresh context window** — the usual case. When that assumption is false (a continuation session that already read, or *authored*, these documents), re-reading them buys nothing. You may **skip a grounding read you already hold from this session**, but you must **state which documents you are relying on and where that knowledge came from**, so the developer can catch you if you're wrong:

> "Grounding: skipped the re-read — this session authored the architecture *workflow trio* section and the stories index. Relevant area: Agent Integration & Skills."

In a genuinely fresh window, or whenever you are unsure whether what you "know" came from the file or from inference, **read**. This is a continuity exception, not a license to skim.

This is **grounding, not editing** — make no changes here. The point is that the grill (Phase 4) and the resulting plan land *inside* the existing system: correct domain terminology, the right FR to extend (vs a redundant new one), the right component / command branch to touch, existing conventions honored, and no reinventing or contradicting what already ships. Carry forward the specific FRs, components, stories, and conventions the new feature intersects — you'll reference them during the grill and cite them in the plan's Context.

**3b. Classify the change, then reproduce / exercise the current behavior.** Reading specs isn't the same as seeing the system run. Classify the requested change from `$ARGUMENTS` / the request as **new feature**, **update to an existing feature**, or **bug fix**.

> **This classification is binding — it names the plan, the branch, and the commits (Phase 7).** A change is a **bug fix** only if its entire deliverable is restoring intended behavior. If it ships anything with utility beyond closing the defect — a new flag, a new surface, a reusable capability — it is a **feature**. **When in doubt, feature.** State the classification to the developer and let them correct it.
>
> Under **`--hotbug`** the classification is **bug fix, by definition** — and if the work you just grilled looks like a feature, say so and push back on the flag rather than shipping a feature straight to trunk.

Under `--hotbug`, still **reproduce the bug** (the default below): a fix going to trunk unreviewed is the *last* place to guess at the defect.

Then **offer the developer a choice** of how to ground in the *live* system before planning — a **multi-select** where the harness supports one (in Claude Code, use `AskUserQuestion` with `multiSelect: true`; otherwise ask plainly). Pre-select the default by change type:

- **Bug fix (declared)** → **default: reproduce the bug.** Drive the failing flow yourself so the plan targets the *real* defect, not the reported symptom: for a **UI** bug (config `repo.ui` set), start the dev server or smoke environment it names and drive it with the browser driver the profile document names; for a **CLI/behavioral** bug, invoke the product's entry point (the tool deployed in Phase 2, or the entry point the profile document names). Record the observed failure + exact repro steps.

  > **Driving the UI here has the same preconditions as an impl smoke — follow that preflight**, don't
  > improvise one. The impl skill's *smoke-environment preflight* already owns the port sweep for
  > orphaned dev servers, the foreground-vs-detached decision and why, launching so the host survives,
  > and the idle-grace numbers. Deliberately a pointer rather than a copy: two copies drift, and a
  > restated copy is a copy that goes stale.
- **Update to an existing feature (declared)** → **default: exercise the current feature** the same way, so you understand the behavior you're about to change before changing it.
- **New feature, or change type unspecified** → **default: skip** (there is nothing to reproduce yet). Still present the option — the two choices are *"do an exploratory run of an adjacent/related capability"* vs *"skip and go to the grill"* — but leave **skip** selected.
- **Docs / config plan (the subject is a *document*)** → **default: measure the current artifact.** There is
  no flow to drive, which reads as "skip" — and skipping is how a plan gets built on a premise nobody
  checked. The equivalent of reproducing is **measurement**: section spans and line counts, duplication
  counts, a diff of every copy of the thing being consolidated, and *reading the files that supposedly
  make it redundant*. State the numbers in the plan's Context.
- **Supply-chain / infra / CI plan (the subject is not the product)** → **default: query the authoritative
  source, not the local one.** Dependency advisories, a registry, a credential provider, a shell's own
  semantics — none of these are reachable through the product's entry point or the UI, so the bullets
  above read as exhaustive when they are not. Two traps come with this class: **a local package-manager
  or tool view may be proxied, filtered, or stale** — treat it as a hypothesis and name the corroborating
  source — and **verify payload identity before hashing anything**, since a redirect or error body hashes
  just as cleanly as a real artifact. Where the authoritative source cannot be reached from this machine,
  say so and mark the affected conclusion **inferred** rather than **observed**.

> **Specialized-planner-supplied subject (`sdd-skill-improve` or `test-improve`).** These skills
> replace pre-impl's discovery/interview frontend, then invoke this skill with a **pre-grilled
> handoff**. Accept the handoff only when it carries all five parts:
> 1. evidence and provenance, including the commit/base against which it was gathered;
> 2. the complete candidate set and every locked developer decision;
> 3. classification inputs (`Feature` / `Bug fix`), not an unexplained conclusion;
> 4. exact affected paths and implementation obligations; and
> 5. runnable verification with the expected clean result.
>
> **Reconcile before trusting it.** Phase 1 still owns normal repository sync. If the supplied base
> differs from the synced commit, diff the intervening commits against the evidence inputs and affected
> paths named in the handoff. No overlap → record the reconciliation and continue. Any overlap, missing
> base, or changed evidence → **STOP** and route back to the specialized planner for a fresh scan; a
> stale pre-grill is worse than repeating it.
>
> A complete, current handoff changes these phases:
> - **Phase 3b:** do not repeat evidence already measured. Skill-friction has no running repro;
>   test-flake evidence already passed the harvester's reproduce-first gate. Exercise only a genuinely
>   open behavior the handoff names.
> - **Phase 4:** do not re-litigate locked decisions. Grill only omissions or questions explicitly left
>   open, then carry the supplied evidence and decisions verbatim into the plan's Context and Locked
>   decisions table.
> - **Classification:** derive the plan type from the supplied inputs using the ordinary Phase 3b rule.
>   A skill behavior change is normally `Feature`; restoring a defect is `Bug fix`; a mixed set is
>   `Feature`.
> - **Branch ownership:** the two harvesters supply a deterministic branch (the feature pattern from
>   `repo.branches` with slug `<skill-name>-<YYMMDD><letter>`, local date, letter enumerating that
>   day's runs across both skills); use it exactly rather than inventing a topic slug.

Honor the developer's selection; if they decline, proceed. Whatever you observe (real behavior, repro steps, surprises, error codes) feeds the grill (Phase 4) and the plan's Context — a bug plan should cite the reproduction; an update plan should reflect the current behavior you exercised.

---

### Phase 4 — Understand the feature (grill)

**The interview method is this skill's own — run it directly** (nothing external is invoked):

- **One question at a time.** Each question is crisply decidable, carries 2–4 concrete options, and
  **recommends one** with the reasoning visible — the developer corrects a recommendation far faster
  than they answer an open question. Batch only questions that are genuinely independent.
- **Walk the decision tree.** Resolve each branch before descending into its dependents; a dependent
  question asked before its parent is settled produces answers that have to be re-asked.
- **Explore before asking.** A question the available data can answer (a grep, a file read, a quick
  probe of the live system) is answered by exploring, not by asking — and the exploration sharpens
  the questions that remain.
- **Converge on locked decisions.** The grill ends when every load-bearing choice is locked and
  numbered — those become the plan's *Locked decisions* table verbatim.
- **Under `--with-docs`**, additionally: challenge the developer's terminology against the vocabulary
  document (config `repo.docs.vocabulary`; the SDD where it has no entry), and write the decisions
  into that document inline as they lock — the interview then leaves a durable decision record beside
  the plan. **When `repo.docs.vocabulary` is null, state that `--with-docs` is not configured for this
  repo** and run the plain grill; do not invent a context document or an ADR folder to satisfy the flag.

**Deferred-grill dossier state.** If the developer defers the grill or the session must stop before
convergence, write a reviewable dossier in the plan draft/session handoff containing the grounded evidence,
provenance, decisions actually locked, and every open question. Label those open questions
**not locked decisions**, make the plan non-implementable, and state exactly how the next run will
**resume** the grill. A deferred-grill dossier preserves autonomous grounding without presenting an
unfinished interview as approval.

**Detect UI.** During the grill, determine whether this is a **UI feature** — it touches the UI surface the config declares (`repo.ui` set; the profile document names the UI source tree — components, routes, views). Confirm with the developer. This decides Phase 5's strategy and whether MSUs (Phase 6) are mandatory. **When `repo.ui` is null the repo has no UI surface**: every unit is non-UI, and Phase 6 does not apply — say so in one line.

---

### Phase 5 — Pick the build strategy (it shapes the plan)

The decomposition **is** the plan, so choose now — you can't defer it to the impl skill:
- **Non-UI → fan-out into independent work units (default).** Decompose into *independent, parallelizable work units* with minimal cross-dependencies so implementation can proceed unit-by-unit (or concurrently where the harness supports it). No per-phase pause.
- **UI → sequential MSU mode (Phase 6).** UI-affecting units are built + smoke-tested one at a time; parallel fan-out does not apply.
- **Mixed features are both:** backend-only units fan out; UI-affecting units are sequential MSUs.
- **Investigation → spike phases (findings, not code).** When a phase's deliverable is **knowledge**
  — a spike, a gate, a measurement, an inventory the developer asked for — name it an
  **investigation phase** in the plan. Its shape: the deliverable is a **findings section** written
  back into the plan (or a research doc under config `repo.docs.research` the plan names); it carries
  an explicit acceptance (**a written verdict**) so it can be called done; downstream phases are
  declared **resizable by the findings** — and *"the premise was wrong"* is a legitimate, valuable
  verdict, not a failure to implement. The impl skill terminates such a phase in a plan/research docs
  commit (config `repo.commits.plan` / `repo.commits.docs`) rather than a feature/bug commit (its
  non-code path carries the matching half). A plan may freely mix investigation phases with fan-out or
  MSU phases — declare the shape per phase.

Record the chosen shape in the plan so the impl skill executes the right one. Every work unit names
one explicit **execution mode**:

- **sequential primary tree** — the coordinator implements the unit directly;
- **serialized in-tree implementer** — one delegated implementer edits the live checkout at a time;
- **isolated worktree** — a delegated implementer receives a separately verified checkout.

The mode is a contract, not an optimization hint; changing it later requires taking stock and
revalidating its base, ownership, and stop rules. The rest of the per-unit contract (base ref, owned
files, seams, diff checks, stop conditions) is the **per-work-unit execution contract** the plan
carries — stated once, in Phase 7's plan contents.

---

### Phase 6 — MSU decomposition (UI features)

**Gate: config `repo.ui`.** When it is null, write the single row `MSU decomposition | — | no UI surface, MSU phase not applicable` in the Actions-taken table and skip to Phase 7.

For any **UI-affecting** work, decompose each phase into **Minimum Smoke-testable Units (MSUs)** — the smallest units that each produce an *observable, smoke-testable behavior*. In the plan, every MSU documents:
- **Scope** — the smallest slice.
- **The smoke test that proves it** — a concrete "drive this route/interaction → see this," authored *with* the MSU, not after.
- **Delivery order** — MSUs are sequential.

**Mandatory smoke-test stop per UI-affecting MSU.** The impl skill **STOPS** after each so the developer drives the *real* UI and confirms before the next. This is non-negotiable for UI (and is exactly why UI work is sequential, not fanned out) — mark it in the plan so the impl skill honors it unconditionally. Backend-only MSUs in a mixed feature can still fan out / run without a stop.

**Record the UI-MSU rhythm in the plan:**
1. **TDD** — test-first with the UI test runner the profile document names for UI MSUs; use the **tdd** skill for any backend/CLI MSU.
2. **Iterate on the fast dev loop** — the dev server (config `repo.ui.devServer`) with hot reload, not the slow build+repack.
3. **Developer smoke-tests** the MSU in the real UI (the mandatory stop; the smoke environment is config `repo.ui.smoke`).
4. **Ship gate before commit** — when the UI is built into an artifact that ships with the product (a bundle copied into the build output, a generated asset folder), **rebuild it and commit the regenerated artifact**; the profile document states the build step and the committed path. The product build usually only *copies* such a bundle, so the committed bundle is what ships — never let a UI change land without rebuilding + committing it (this is the stale-bundle trap). **And if anything will drive the built executable — an e2e run, a manual smoke — run the product build (config `repo.commands.build`) after the UI build**, because the executable's copy of the bundle is taken at build time and is stale until then.
5. **Commit the green MSU** (`MSU N: …`), then the next.

---

### Phase 7 — Name, branch, and write the plan

Only now that the work is understood (so names reflect what it really is):

1. **Slug** — a short kebab-case topic slug. For a harvester handoff, use the slug already encoded in
   its deterministic supplied branch; every other route leaves branch naming here.
2. **Apply the bug/feature naming split**, driven by the Phase 3b classification (bug fix → **bug**; new feature or update to an existing feature → **feature**; when in doubt, **feature**). The patterns come from config — `repo.branches.bug` / `repo.branches.feature` (with `{slug}` substituted) and `repo.commits.bug` / `repo.commits.feature`:

   | | Bug fix | Feature (default) |
   |---|---|---|
   | Branch | `repo.branches.bug` with the slug | `repo.branches.feature` with the slug |
   | Plan | `<repo.docs.plans>/YYYY-MM-DD-bug-<slug>.md` | `<repo.docs.plans>/YYYY-MM-DD-<slug>.md` |
   | Impl commits (impl/post-impl) | `<repo.commits.bug>(<scope>): …` | `<repo.commits.feature>(<scope>): …` |

   Record the classification **explicitly in the plan** (a `**Type:** Bug fix` / `**Type:** Feature` line) so the impl and post-impl skills pick the right commit type without re-deriving it.

   **Rolling initiative / continuation state.** A rolling initiative has a standing parent (normally
   an epic) and one plan for the **current round**. The round can complete and archive without claiming
   the standing parent is complete; the parent **does not archive** merely because one continuation
   ships. Record what this round advances, what remains open, and the next continuation trigger.

3. **Create the branch — at most ONE branch per feature/bug, never one per phase/plan-run.** Decide by where you are:

   **First gather the branch state, then derive the action from it.** The cases below are the common
   readings of that state, not an exhaustive list — when reality matches none of them, do NOT force the
   closest-looking one. Read these five facts and reason from them:
   `(current branch, its base, whether that base's PR is open/merged/absent, ahead/behind counts vs the base, tree clean?)`
   — `git branch --show-current`, `git fetch origin`, `git rev-list --left-right --count HEAD...origin/<defaultBranch>`,
   and, under `repo.publish: pr`, `gh pr list --head <branch> --state all --json number,state` (under
   `trunk-ff`, "merged" means `git merge-base --is-ancestor <branch> origin/<defaultBranch>`). Two state
   readings that the enumerated cases below silently get wrong:
   - **The branch's own PR has already MERGED** (commonly a squash, so trunk carries the content but
     none of the commits). "Already on this work's branch" then means standing on landed work: the next
     phase needs the branch reconciled onto the new trunk tip first, and squash-merged commits will not be
     detected as ancestors. Say so and reconcile rather than planning onto a stale base.
   - **One session legitimately produces two plans.** "At most ONE branch per feature/bug" is about not
     fragmenting *one* feature across per-phase branches — it is not a claim that a session yields exactly
     one plan. Two genuinely separate features found in one sitting are two plans, and post-impl archives
     both; say which branch each belongs on instead of merging unrelated work to satisfy the rule.
     **The procedure is in step 4c below** — the rule alone is not enough to execute on.

   - **`--hotbug`** → **create NOTHING. Stay on the default branch.** This is the only case in the entire trio where work lives on trunk. Skip the rest of this step.
   - **Already on this work's branch** (the current branch is the feature or bug branch for this same work, or the plan you are extending/continuing already lives on the current branch) → **stay on it; create nothing.** Later phases of a multi-phase plan, re-runs, and fresh-context continuations all commit to the *same* branch. Do NOT derive a new per-phase slug (`…/<slug>-p2-…`) — that fragments one feature across stacked branches.
   - **On the default branch (new work)** → `git switch -c <pattern with slug>`. **Always** — being on trunk is never a reason to *stay* on trunk.
   - **On a different, unrelated feature or bug branch** → STOP and ask the developer whether to stack deliberately or restart from trunk (`--main`).
   (pre-impl **owns** branch creation; it happens here, deliberately, not earlier — and at most once per feature/bug.)
4. **Write the plan** — at the path from the table above. Per the plans folder's README the date prefix is when the plan is *documented* (today); the post-impl skill re-dates it to the implementation date when it moves to the artifacts folder (**preserving the `bug` segment**). Use the **same slug** as the branch.

   **The three cases above assume greenfield — one new plan, at a path with nothing in it.** That is the common case, not the only one, and each of the others below was improvised from scratch by a separate run before it was written down. Check which applies before writing:

   **4a. A backlog stub already exists at the target path.** **Rewrite it in place** — replace its body with the real plan and restamp `**Branch:**`, `**Type:**` and `**Tags:**`. **The filename wins the date tie-break:** leave the filename *and* `**Date documented:**` at the stub's date (inbound links, some in never-edited artifacts, pin the filename; post-impl re-dates on archive anyway) and record the grill date in the status line. **Never create a second file** — impl resolves a plan by `**Branch:**`, and a duplicate stops the next impl run. Say in the Phase 8 table that you revised a stub.

   **4b. You are planning a later phase of a plan that already exists.** **Deepen it in place** — add the new phase's detail to the existing file and re-commit it with the plan commit prefix. Never duplicate the plan under a new date, and never split a phase into its own file; one plan carries all its phases, which is what lets post-impl decide archive-vs-keep from the phase list.

   **First, re-resolve every target the unbuilt phases name** — grep each file path, line cite, ledger id, branch and spec reference against the *current* tree, and record what moved in the plan. Every name may have been correct when written and had its referent move underneath it; on a week-old plan it is normal for a cited plan to have never existed, a checkout path to have relocated, and an "outstanding ask" to have since shipped.

   Two further consequences worth stating because both have been got wrong:
   - **The same-slug rule binds at plan *creation* only.** If the original branch already merged and this phase needs a fresh one, the new branch's slug will not match the plan's filename — and that is correct. Do **not** rename the plan file to chase it: the old name is referenced by a merged PR and its artifacts row. Update the `**Branch:**` header to the new branch and leave the filename alone.
   - **Once they diverge, the filename fallback for branch-matching no longer works.** impl's slug-from-filename fallback exists for plans written before the `**Branch:**` convention; on a continued plan it will match the *wrong* thing or nothing. The `**Branch:**` header is the only reliable link, so it must be exact.

   **4c. This session produced two plans.** Run steps 1–4 **once per plan, to completion, before starting the next** — slug, classification, branch, plan file, plan commit. The ordering is the part that is easy to get wrong: **cut each branch from the same clean base** (return to it between plans rather than cutting plan B's branch off plan A's, which silently stacks two unrelated features), and stamp each plan with its own `**Branch:**` header pointing at its own branch. Then **repeat the `Created branch` and `Wrote plan` rows in the Phase 8 table, once per plan** — a single row for a two-plan run reads as if one of them did not happen.

**The plan MUST open with this header** — the plans folder is a *backlog*, not a work queue, and the impl skill resolves which plan to build by matching **`**Branch:**`** against the checked-out branch. Without it that match is guesswork:

```markdown
# <Title>

**Branch:** feature/<slug>          <!-- the branch created in step 3, in the repo's own pattern (repo.branches); how impl finds this plan -->
**Type:** Feature                   <!-- or: Bug fix — drives the feature/bug commit prefix in impl + post-impl -->
**Tags:** `area:<slug>` `arch:<slug>` <!-- SDD-anchored tags from the Phase 3a grounding; vocabulary in the artifacts README; ≥1 area:, ≤6 total -->
**Date documented:** YYYY-MM-DD
**Epic:** <repo.docs.epics>/<epic>.md — Track <n>   <!-- ONLY when Phase 3a's epic scan matched; omit the line otherwise -->
```

The `**Tags:**` line comes straight out of the Phase 3a grounding (the FRs/components/areas the work intersects, as tags). post-impl **reconciles** it against what actually shipped and copies it into the artifacts index row — so stamp what you know now; drift is expected and handled. The doc meta-tests (config `repo.commands.docTests`) fail on an untagged plan or an undeclared slug. **Run them before committing the plan** so a missing header or an undeclared `area:`/`arch:` slug is caught here, not two MSUs later in an unrelated full-suite run.

Write `**Branch:**` with the branch's **exact** name, and never let it drift: if a later run moves the work to a different branch, update this line. One plan names one branch; one branch carries one plan.

**Under `--hotbug` the header is different, and the callout is not optional** — the impl skill **refuses to implement any plan while on the default branch** unless it finds this declaration, so it is both a warning to humans and the literal unlock:

```markdown
# <Title>

> ## ⚠️ HOTBUG — TRUNK-DIRECT
> **This plan lands on the default branch with NO branch and NO PR.** The review gate is deliberately
> skipped because the fix is urgent. Everything here goes straight to trunk: read it as if it were
> already in production, because it is about to be.

**Hotbug:** YES                     <!-- the flag impl checks before it will run on the default branch -->
**Branch:** main                    <!-- deliberate: the default branch (repo.defaultBranch); no branch is ever created -->
**Type:** Bug fix                   <!-- a hotbug is always a bug fix -> bug-prefix commits -->
**Tags:** `area:<slug>` `arch:<slug>` <!-- same tag rules as a normal plan -->
**Date documented:** YYYY-MM-DD
```

The `**Hotbug:** YES` line and the `⚠️ HOTBUG — TRUNK-DIRECT` callout are a matched pair — write **both**. Never write `**Hotbug:** YES` into a plan the developer did not explicitly flag as a hotbug.

The `plan.md` then contains:
- **Context** + the **locked decisions** from the grill.
- **Phases** — always. UI phases carry the **MSU breakdown** (scope + smoke test + order) and the mandatory-smoke-test-stop marking; non-UI phases carry the parallel work-unit decomposition.
- **Build strategy** (fan-out work units vs sequential MSUs) recorded so the impl skill runs the right shape.
- **Per-work-unit execution contract** — execution mode; **exact intended base commit/ref**; **owned files**;
  **coordinator-owned shared files**; **seam implementer/owner**; required **before/after diff checks**;
  and **explicit stop conditions**. Include any locked seam decisions exchanged with active
  concurrent plans. Use `none` explicitly where a field does not apply; omission is not a decision.
- **Verification — MANDATORY, every plan.** How the work will be *proven*, not just built.
  - **Code plan** → the test strategy (what gets tested, at what level, the suites that must be green — named in the profile document's terms, with the commands from `repo.commands`).
  - **Docs / config plan** → **concrete, runnable checks**, named here so the impl skill doesn't have to invent them: **invariant greps** ("no duplicate story ID: `grep '^### ' … | uniq -d` returns empty"), a **content-preservation diff against `HEAD`** (a restructure must not silently drop content), a **config probe** (prove a config change works on a throwaway branch rather than by reading it), **link/anchor checks**, schema validation, the **doc meta-tests** (`repo.commands.docTests`) — plus the **full build + test suite whenever the change touches build config** (project files, lockfiles, CI yml are code by another name).
  - A plan with no Verification section is **incomplete**. "It's only docs" is exactly when verification gets skipped and a silent regression ships.

<!-- FALSIFIABILITY-GATE:START -->
> ## The falsifiability gate — a check that could not have failed is not evidence
>
> **When it fires.** Any verification whose result will enter a **permanent record**: the Actions-taken
> table, a story's acceptance criteria, a PR body, a plan's Findings or Outcome section, or a
> harvest's diagnosis. Not every check you run — only the ones you are about to make a claim with.
>
> **What it requires.** One clause, written next to the result: **what would this check have produced
> if the claim were false?** If you cannot answer, the check is decoration and the claim is unproven.
> The cheapest honest form of the answer is a label — **`observed`** (a run, a captured message, a
> diff) versus **`inferred`** (read from prose, or from another document's summary).
>
> **Five shapes where the answer turns out to be "nothing".** These are worked examples, not a
> checklist to walk — the question above is the rule:
>
> 1. **The fixture was written from the assumption it tests.** A fake that returns what you believe
>    the real system returns cannot tell you the belief is wrong. Measure the claim against the
>    system, then write the fixture from the measurement.
> 2. **The baseline asserts absence, and the subject never existed.** `expect(x).toBe(0)` passes
>    identically when the feature is off and when the element is missing entirely. Assert the subject
>    *exists* before asserting anything about its state.
> 3. **The probe has no positive control** — or the instrument changed in the same run as the thing
>    it measures. A negative result from an unvalidated instrument is a fact about the instrument.
> 4. **A count with no denominator.** "44 passed" is unverifiable without the total it came from, and
>    "0 did not run" is a claim *about* the denominator. Report `N/M` and say where `M` came from.
> 5. **The input was filtered or derived, and its own provenance went unchecked.** A remove-it-and-see
>    run over a pre-filtered sample cannot falsify the filter; a measurement against a generated
>    artifact inherits that artifact's staleness. Establish freshness and provenance *before* you
>    measure against something.
>
> **The gate binds the instrument's reach as well as its logic.** Seven places the logic passes and the
> instrument still proves nothing:
>
> - **A red proof must reach the artifact.** When a sabotage comes back green, establish that it reached
>   the surface under test before calling the assertion vacuous — for anything generated then copied or
>   compiled (a built bundle, a generated source, a staged fixture, any no-build run) the copy or build
>   step is part of the proof; the positive control is the edit present in the served artifact.
> - **A negative's control lives in the same region.** A negative assertion's positive control names a
>   subject inside the region the negative is scoped to — what must exist for the absence to mean
>   anything — never a sibling elsewhere on the page.
> - **State what unit each instrument counts before comparing them.** The mapping is 1:1 or the control
>   models the expansion; a raw-count mismatch is a stop condition only once the units match, and the
>   expansion factor is itself a finding.
> - **The gate binds the input pipeline, not only the check.** A bespoke extractor, parser or `jq`
>   pipeline gets one hand-verified row before the sweep — a mis-parse is syntactically perfect output.
> - **A narrowed check is re-run against the pre-change artifact** with `node scripts/sdd/gate-control.mjs`
>   and must come back `RED` for the original reason — never by reverting files in the primary tree. A
>   narrowed check that no longer fails is a deleted test that still reports.
> - **A threshold assertion is run against the unfixed code** and the number it reports is recorded; a
>   bound never seen exceeded is decoration.
> - **A fixture or test that supplies its own context cannot observe what it supplies.** A hand-staged
>   fixture comes from the repo's own stager or copies its literal shape (the profile document names
>   the stagers); one reporting exactly the failure state under test is far likelier malformed than a
>   product defect. A component re-homed across a provider boundary is not done until one real-host
>   render exercises the wired affordance from its actual mount point; a direct-render suite hands the
>   component its provider and cannot see scope.
>
> **This is the gate; it is stated in full in exactly two places** — pre-impl's plan-writing phase and
> impl's implementation phase, where the verification is run. Both copies, because an inert check is
> just as often written into the plan as into the run. Everywhere else cites it by name.
<!-- FALSIFIABILITY-GATE:END -->

> **Here, it binds the Verification section you are about to write.** Every check named above gets its
> falsifying clause *in the plan*, not left for impl to supply — a verification that structurally
> cannot observe the change is authored here, and impl inherits it pre-broken and runs it in good
> faith. The check that proves a change landed is usually the one that **fails against the current
> code**; name that one explicitly.

Then run **Phases 8 and 9** (below) before committing, so the summary and any ledger entries land with the plan commit.

Make a **local** `<repo.commits.plan>: <slug>` commit of the plan on the branch (reviewable + resettable — no push; push is the gate). **Under `--hotbug` this commit lands on the default branch and is still local — pre-impl never pushes, hotbug or not.**

**Append the run-log row.** After the commit, append one row to the run log (config `repo.ledgers.runLog`; grammar in its header): UTC timestamp, `pre-impl`, the git user, the plan path, the branch, and the outcome (`plan committed <hash>`). Amend it into the plan commit or commit it immediately — the log is the accounting of when the trio actually ran, and a missing row reads as a departure from the guidelines.

**Open the plan for review.** Best-effort, harness-neutral: when the VS Code CLI resolves on PATH (`command -v code`), run `code -r "<absolute plan path>"` so the plan lands as a tab in the developer's connected window. No editor CLI → skip silently; this step can never fail a run.

**Then STOP.** pre-impl ends at a plan on a named branch, ready for review. It does **not** implement — hand off:

> **Next:** review the plan in the plans folder, then run the **impl** skill to build it (which ends in local commit(s); UI plans stop for a smoke test per MSU). Finish with the **post-impl** skill (branch-aware) for docs + publish (push and fast-forward, or push and PR, per `repo.publish`).

Under `--hotbug`, say so explicitly instead:

> **Next (HOTBUG):** review the plan — it is on the default branch, and impl will build it **there** because the plan declares `**Hotbug:** YES`. post-impl will then push **straight to trunk, no PR**. Nothing else in the trio will ever put work on the default branch.

---

### Phase 8 — Actions taken (summary table)

Every skill in the trio ends with the **same table**, so three runs read alike:

```markdown
## Actions taken

| Action | Target | Result |
|--------|--------|--------|
| Config resolved | skills/sdd.config.json | build `<repo.commands.build>`; test `<repo.commands.test>`; docTests `<…>`; deployTool `<… or null>`; ui `<set or null>`; profile read |
| Mirror advisory | SessionStart hook | no advisory present (or: stale pre-impl mirror reported; tracked source followed) |
| Synced | main | fast-forward → da76b13 |
| Deployed tool | <repo.commands.deployTool> | 1.4.2 (or: deferred — nothing invokes the installed tool / deferred — not configured) |
| Classified | — | Feature (or: Bug fix / ⚠ HOTBUG — trunk-direct) |
| Grounded | SDD | PRD + architecture read; stories areas: <area> |
| Errata | <repo.ledgers.friction> | 29 titles scanned, 6 read in full, 2 acted on (F-…); 1 resolved inline (F-…) — or: none open |
| Friction | <repo.ledgers.friction> | N logged (F-…), M resolved (F-…) — or: none — <why this run produced none> |
| Epic scan | <repo.docs.epics> | matched `<epic>.md` Track 1a; round row appended (or: no epic matches this request) |
| Related work | <repo.docs.artifacts>/README.md | 12 rows matched `area:<slug>`; read 3 ancestor docs (or: no tag matches) |
| Reproduced | <entry point> <cmd> | <observed failure> (or: skipped — new feature) |
| MSU decomposition | plan | 3 MSUs, smoke stop marked (or: no UI surface, MSU phase not applicable) |
| Created branch | feature/<slug> | new (or: stayed on <branch> / none — HOTBUG, on the default branch) |
| Wrote plan | <repo.docs.plans>/<file>.md | N phases, verification specified |
| Doc meta-tests | <repo.commands.docTests> | N/M passed (or: not run — <why>) |
| Committed | <repo.commits.plan> | <hash> — local, NOT pushed |
| Run log | <repo.ledgers.runLog> | row appended (or: missing — <why>) |
```

**Rules that make it useful rather than decorative:**
- **Every Result is verifiable** — a hash, a version, a path, a count, a branch name. Never "done" or "✅".
- **Report the non-actions too.** A deferred deploy, a skipped repro, a grounding read you already had in context — each gets a row saying so. A step that silently vanishes is indistinguishable from a step that was forgotten.
- **Anything skipped, deferred, refused, or not configured appears**, with the reason in the Result cell.
- **This is the only summary** — do not also emit a second table or a prose recap of the same facts.

---

### Phase 9 — Friction → the central ledgers (self-improvement)

The trio has no other feedback loop: friction you hit *running these skills* evaporates when the context window closes unless it is written down. So before committing the plan, look back over **this session** and ask whether anything about **pre-impl itself** should change.

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
### F-<next> — pre-impl · Phase 3a (grounding) — <short title>
**Found:** YYYY-MM-DD · `<repo.docs.plans>/<this plan>.md` · branch <branch>
**What happened:** <Enough narrative that a fresh context window — one that never saw this session —
can reason about a fix: what the skill told you to do, what you actually did, where it misled you or
wasted effort, and what that cost. Name the phase, the file, the command.>
**Recommendation:** <Only when there is a clear one. Omit the line entirely otherwise.>
**Status:** Open
**Decision history:** _none yet_

### T-<next> — <test file> · <test name or describe block>
**Found:** YYYY-MM-DD · `<repo.docs.plans>/<this plan>.md` · branch <branch>
**What happened:** <The observed flaky/slow behavior — e.g. "failed 1 of 3 runs with `<error>`",
"only passes with a 15s `setTimeout` wait", or "order-dependent: fails when run after `<other
test>`". Name the exact command that reproduced it. If it relies on a sleep/poll/timeout, state the
duration — this is exactly what test-improve's redesign targets.>
**Recommendation:** <Only when there is a clear one — e.g. "replace the sleep with fake timers /
`waitFor` on the real condition". Omit otherwise.>
**Status:** Open
**Decision history:** _none yet_
```

**The bar (F-N).** Log friction that is **recurring or structural** — something an edit to the skill would actually prevent next time. Do **not** log: one-off environment hiccups (a flaky network call, a locked executable, an expired token); trivia (a typo, a stale line number); anything you already fixed in-session; or feedback about the *codebase* rather than the *skill*. **Writing nothing is the expected outcome of a clean run** — an empty run adds nothing to the ledger, and that is a signal, not a failure.

**State the negative, and justify it.** Writing nothing is a legitimate result, but a bare `none` in the Friction row is a reflex, not a finding — say *why* this run produced none (`none — no phase misled this run; every step matched the file`). The read half is auditable because a scanned count reconciles against what `grep` returned; the write half has no such ground truth, so the stated reason is the only thing that turns the negative into a claim.

**The bar (T-N) — deliberately different from F-N's.** Log **every** test you observed being flaky
or slow this run — a test that failed then passed with no code change, needed a retry, depends on a
`sleep`/`setTimeout`/polling wait to pass, or is order- or timing-dependent. Your test exposure in
this skill is **Phase 7's doc meta-tests run** (`repo.commands.docTests`) — narrow, so a `T-N` here
is rare, but a flake in a meta-test is worth exactly as much as any other. Do **not** filter T-N for
"is this worth fixing" the way F-N is filtered — that triage happens in **test-improve**'s harvest,
not here. A clean run with no flakiness logs nothing under `T-` — don't manufacture one.

**Before logging one, run the `ANTIPATTERN-GATE` stated in the test-health ledger's header — follow it
there, do not restate it here.** It is the one exception to "don't triage", and it is not a judgment
about whether a fix is worth it: it is a structural check on how the test *observes*. A test matching
one of its anti-patterns is **fixed — or deleted — in THIS run**, folded into the plan being written,
and named in the Phase 8 table rather than logged for a harvest. Routing it onward is exactly how the
cost compounds: the same flakiness handed across three plans costs more at every hand-off than the
fix would have.

**A `T-N` entry MUST name a specific test file and a specific test name.** An aggregate ("seven
pre-existing e2e failures") or an unidentified target ("unidentified UI test, full-suite run only")
is a **defect in the entry**, not a valid entry: the harvester cannot cluster it, cannot reproduce it,
and — since `T-N` is never `Declined` and never expires — cannot close it either. If you cannot
identify which test flaked, re-run to find out before writing the entry.

**Ask before you write.** Draft the candidate entries (both buckets), show them to the developer, and let them confirm, edit, add, or drop. Then append the confirmed set to the ledgers and include the ledger edits in the plan commit (or an immediate follow-up) — never leave them uncommitted.

### Claude Code accelerations (optional)

These speed the phases up in Claude Code and are **not required** — the numbered phases above stand on their own in any harness.

- **Phase 2 (deploy) as a background task.** Kick off the deploy command (config `repo.commands.deployTool`) in the background and continue into the Phase 3 SDD read + Phase 4 grill while it runs; reconcile the reported version before writing the plan.
- **Phase 3b repro choice via `AskUserQuestion`.** Present the live-grounding choice as a multi-select with the change-type default pre-selected, instead of a prose question.
- **Phase 5 fan-out via sub-agents / worktrees.** For non-UI work units, the plan can note that the impl skill may build independent units concurrently in parallel **git worktrees** (one sub-agent per unit). This is purely an execution accelerant for the impl stage — the *decomposition* into independent units is the harness-neutral requirement; whether they run concurrently is up to the executing harness.
- **tdd as an invoked skill.** Where available, invoking the sibling **tdd** skill is faster than reproducing its loop by hand. (The grill is Phase 4's own text — nothing to invoke.)
