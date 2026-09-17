---
name: impl
description: Implement a plan from the plans folder test-first, ending in a single local commit (the feature or bug commit type from the config, chosen by the plan's type) with a green build and tests, no docs, no push. Refuses to implement on the default branch unless the plan declares itself a hotbug. Reads the open friction against itself before coding, and ends by logging skill friction and flaky tests into the central ledgers and appending its run-log row. Use when asked to implement, build, code up, or fix a planned feature, bug, or other change. Afterward run the post-impl skill to add docs and publish.
user_invocable: true
version: 1.0.1
# ⚠️ IMPORTANT: When editing this file, increment the patch version above (e.g., 1.0.0 → 1.0.1).
---

## Implementation: $ARGUMENTS

This skill implements one or more plan files from the plans folder (config `repo.docs.plans`) into working, tested code and captures the result as a **single local commit** — the `repo.commits.feature` type for a feature plan, the `repo.commits.bug` type for a bug plan — then stops. It does not write docs, does not move the plan file, and does not push.

**First step of every run: read `skills/sdd.config.json` and the profile document (config `repo.docs.profile`).** The config carries the build and test commands, the branch and commit conventions, the document and ledger paths, and whether a UI surface exists (`repo.ui`). The profile document carries what a JSON value cannot: the test categories and reference test files per layer, the fakes and their seams, the shared registration files, the line-ending convention of working copies, and the build-before-test prerequisites. State the resolved commands you will run in the Phase 7 table.

**Harness note.** The core workflow below is sequential and works in any agent harness. One optional acceleration (parallel git worktrees + sub-agents) is a Claude Code optimization, clearly marked as such — other harnesses simply implement the work units in sequence and get the same result. Skills are invoked differently per harness; this doc refers to other skills by name (e.g. "the post-impl skill").

### Output Style

- Output brief phase indicators: "Phase 1: Discovery...", "Phase 2: Writing tests...", etc.
- Do NOT narrate each file read or edit
- Do NOT add filler text like "Let me now...", "Good, that worked..."

---

### Phase 0 — Resolve Plan Files

> **State the SessionStart mirror advisory before anything else.** The `MIRROR-ADVISORY` block in
> the pre-impl skill is the single statement of what it means and what to do — read it there, do not
> restate it. Say which it reported: **no advisory present**, **all mirrors current**, the specific
> `stale`/`misplaced`/`orphaned` skills it named, or **could not determine**. The trio runs from the
> deployed mirror, not from tracked source, so this run may be executing text older than the file it
> is about to act on — and an advisory nobody repeats is not evidence a stage ran.

**Goal:** Determine which plan(s) to implement based on `$ARGUMENTS`.

**Plans directory:** config `repo.docs.plans` (relative to the repository root).

> **The plans folder is a BACKLOG, not a work queue.** It holds future/aspirational plans that nobody asked you to build, and occasionally a plan whose implementation already shipped but that post-impl never archived. **Never implement every plan in the folder.** Resolve to exactly the plan(s) the developer means — and when that is not unambiguous, **ask**.

**Resolution rules** (exclude `README.md` from all matching):

1. **Argument given** — find the matching plan:
   - Try exact match: `<plans dir>/$ARGUMENTS`
   - Try with `.md` suffix: `<plans dir>/$ARGUMENTS.md`
   - Try glob/substring match: `<plans dir>/*$ARGUMENTS*.md`
   - If multiple plans match a substring, list them and ask the user to disambiguate
   - If no match, list available plans and ask the user which one to implement

2. **No argument → match the current branch.** The pre-impl skill stamps every plan with a `**Branch:**` header naming the branch it belongs to. Use it:
   - `git branch --show-current`, then find the plan whose `**Branch:**` equals it. **Exactly one match → that is the plan.** This is the deterministic path and the normal case.
   - **No `**Branch:**` header** (a plan written before this convention, or by hand): fall back to matching the branch's slug against the plan filename (the `{slug}` of `repo.branches.feature` / `repo.branches.bug` → `*<slug>*.md`).
   - **Still ambiguous, or on the default branch** (config `repo.defaultBranch`, where no plan "owns" the branch): list the candidate plans with their `**Branch:**` and dates and **ask the developer which to implement**. Do not guess, and do not default to "all of them."
   - **More than one plan claims the current branch** → surface the conflict and ask; one branch carries one plan.
   - No plans at all → report "No plans found in `<plans dir>`" and stop.

3. **Multiple plans** are implemented in one run only when the developer **explicitly** names them.

**Before implementing, sanity-check the plan is not already done.** A plan whose story already appears in the stories document (config `repo.docs.stories`), or whose commits are already on the branch, was implemented and simply never archived — say so and stop rather than rebuilding it.

**Output:** A resolved list of 1+ plan file paths. Each plan is an independent work unit.

**Determine each plan's type** (it sets the commit type in Phase 6): a plan is a **bug** plan if it declares one (a `**Type:** Bug fix` line, written by pre-impl) or its filename carries the `-bug-` segment (`YYYY-MM-DD-bug-<slug>.md`). Everything else is a **feature** plan — **feature is the default**. Carry the type forward; do not re-litigate it here.

**REFUSE TO IMPLEMENT ON THE DEFAULT BRANCH.** Run `git branch --show-current`. If it is `repo.defaultBranch`, **STOP** — work belongs on a branch, and the pre-impl skill exists to create one:

> "This plan isn't a hotbug and I'm on the default branch. Implementation belongs on a branch. Run the **pre-impl** skill to plan it onto a feature or bug branch, or — if the plan already exists — cut the branch it names in its `**Branch:**` header and re-run me there."

**The ONE exception is a hotbug.** If the plan declares `**Hotbug:** YES` (pre-impl writes this only when the developer passed `--hotbug`, alongside a `⚠️ HOTBUG — TRUNK-DIRECT` callout), then implement **on the default branch** — that is the whole point of the flag. Say so out loud before you start:

> "HOTBUG: implementing on the default branch. No branch, and post-impl will publish straight to trunk."

Do **not** infer a hotbug from urgency, from the developer's tone, or from the plan being a bug fix. Only the literal `**Hotbug:** YES` declaration unlocks the default branch. If someone asks you to "just do it on main" without that declaration, point them at pre-impl's `--hotbug`.

**Scope & branch behavior.** This skill implements onto **whatever branch is already checked out** — it never creates or switches branches, never assumes the default branch, and (deliberately) **does not touch docs, plans, or the remote**. In particular, for a **multi-phase plan** every phase — including phases run later in fresh context windows — is implemented and committed on the **same, already-checked-out feature or bug branch**; never cut a new `<branch>-pN-…` branch per phase. (The only branches this skill ever makes are the throwaway worktree branches in the optional Phase 2 acceleration, which are deleted in Phase 5 and never pushed.) Its whole job is: implement → integrate → green build/test → make a **local feature/fix commit**. Then it stops.

- **Docs, the plan lifecycle (move-to-artifacts vs keep-in-plans), push, and PR are all the post-impl skill's job.** Run the post-impl skill *after* this one — it's **branch-aware** (does the right thing on the default branch vs a feature branch, per `repo.publish`). The plan-lifecycle decision lives entirely in post-impl, so this skill stays out of it and there's exactly one place that decision is made.

---

### Phase 1 — Discovery (read-only)

**Goal:** Read every resolved plan, decompose into work units, and absorb existing patterns.

**1a. Read each plan file.** For each plan, identify:
- The scope of work (new commands, UI features, modifications, etc.)
- Dependencies between plans (shared files, ordering constraints)
- Whether any plans conflict (modify the same files in incompatible ways)

**1b. Decide the work-unit breakdown.** Treat each plan file as one work unit; within a plan, subdivide into sequential steps if it helps. Note two things for later:
- **Shared registration files** — the ones the profile document names (a command registry, a route table, a DI composition root, a plugin manifest) — are integrated in Phase 4, not touched piecemeal while implementing individual units.
- If plans have dependencies or conflicts, record the order they must be integrated in (Phase 3).

**1b-errata. Read the open friction against THIS skill.** Before you write code, read the `Open` entries naming impl in the friction ledger (config `repo.ledgers.friction`). They are **errata against the phases you are about to execute** — where an entry contradicts or supplements this file, the entry is the newer information. This is how a trap like "worktree agents are cut from the remote default branch, not the branch tip" reaches the run that needs it instead of living in someone's session memory.

**How to read them is the `READ-PROTOCOL` block stated in the friction ledger's header — follow it there, do not restate it here.** In short: scan every title (`grep -n '^### F-.* — impl'` over the ledger), open in full only what this run can act on — which for this skill means the phases the plan actually exercises (a docs plan runs the non-code path, not 2b's test categories) plus anything the plan's subject touches — and state the counts in Phase 7's `Errata` row.

**impl reads but never fixes.** Resolving an entry — even a one-line one — is a **bookend** job (pre-impl when planning, post-impl at its friction phase); this skill's whole contract is that it implements the plan it resolved and nothing else. Carry what you read into the work, and if an entry turns out to be wrong or already fixed, say so in Phase 8 rather than editing the skill here.

**1c. Read reference patterns.** Read at least TWO test files and TWO implementation files from relevant domains to absorb conventions. The profile document names the reference test files per layer, the fakes and how they record calls, the assertion style, and the stack gotchas that survive until a test compares payloads — read what it names before writing a line.

> **Non-code plans (docs, skills, SDD, CI, packaging config).** "Two test files and two implementation files" is meaningless for a Markdown or YAML plan — **read two comparable artifacts instead**: an existing `SKILL.md` when editing a skill, an existing story under the target `## Area:` when adding one, the config file's current shape/schema when changing it. The goal is unchanged — absorb the conventions of the thing you're about to edit before editing it.

Things the profile document settles for a code plan, and that you should not guess: the base class or contract a new command/component/handler derives from and the fields it injects; the test framework's assertion vocabulary (one style, no mixing) and the invocation shape of a unit under test; how the fakes record what was called, so a dispatch assertion has something to read; the output-capture seams a test can observe and the ones it silently cannot; and the option-inheritance quirks of the command framework, where a leaf must redeclare a global flag or it emits empty output without error.

---

### Phase 2 — Implement (test-first)

**Goal:** Implement each work unit end-to-end (tests + code), then build and verify green.

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

<!-- EDIT-MECHANISM:START -->
> ## Edit mechanism — tracked content goes through the literal-text file tools
>
> Edit tracked files with the harness's literal-text file tools (Edit/Write) — never `sed -i`, `perl -i`,
> a Python text-mode round-trip, or a heredoc / `node -e` string carrying document-shaped content. Each
> has corrupted a repository silently: whole-file LF rewrites and NUL bytes (`sed -i`), skills flipped
> CRLF→LF with an empty `git diff` (Python text mode), a thousands-of-lines diff for a small change (an
> edit tool in a worktree with the other line ending), terms replaced by empty strings (bare backticks in
> a double-quoted shell string), and a regex edited to a valid-but-wrong pattern that built and passed.
>
> When a script rewrite is genuinely warranted, scope the file list with `grep -l` (never a bare glob),
> then:
> 1. **`git diff --numstat`** — a whole-file rewrite for an N-site substitution means the endings changed;
>    re-read/replace/write preserving the file's convention, never accept the churn.
> 2. **Byte-check the first edited file** for CRLF/LF and BOM with a byte read or `file(1)` — not
>    `git diff`, MSYS `grep` or `awk`, which strip CR in text mode. Match the file's own convention (the
>    profile document states which ending the working copies use) and preserve any BOM.
> 3. **Re-validate any construct with escaping depth** (regex, glob, path pattern): re-read it and confirm
>    it still parses and still says what it meant — bracket balance, branch count — not merely that the
>    replacement applied. A semantically valid wrong value is silent forever.
> 4. **A file-based edit script matches the target's line endings and asserts its replacement count** — a
>    `.replace()` built with `\n` against a CRLF file matches nothing and reports success.
>
> Stated once here; implementer briefs (contracts A and B), post-impl's Markdown phases and
> sdd-skill-improve's parity check cite it by name.
<!-- EDIT-MECHANISM:END -->

Implement the work units **sequentially** by default: for each plan, write its tests first (TDD — the tdd skill states the method), then implement until green, then move to the next. This sequential path is the complete, first-class way to run the skill.

> **### Claude Code acceleration (optional)**
> In Claude Code you can fan the work units out in parallel: one sub-agent per plan via the Agent tool with `isolation: "worktree"`, all in a **single message**. Worktree provisioning may start from another/default branch, so inheritance is never assumed. Each agent prompt carries: the **full plan text**; the Phase 1c conventions; tests first then implement until green; the build+test command for its layer (`repo.commands.build`, `repo.commands.test` or `repo.commands.testFilter`); **do not modify the shared registration files** (Phase 4); the autonomous build-test-fix loop (max 10 cycles); and the EDIT-MECHANISM block by name. Wait for all agents (2d), then merge in Phase 3. **Other harnesses:** implement the same units in sequence in the primary tree; Phase 3 has nothing to merge and Phase 5 is a no-op.
>
> - **A worktree contains only committed state from its intended base — commit each wave in the primary tree before spawning the next.** A unit written against an interface absent from its base had to be rebuilt.
> - **State the intended base commit in every agent prompt** and require `git log -1` to match before any code is written — nothing about the symptom says "wrong base".
> - **Name who builds the seam.** When unit A calls unit B through a *new* interface, the brief says which unit implements it; twice, two units each declared a different interface and neither built it.
> - **A fresh worktree has no restore assets** — open the prompt with the profile document's restore/install step (package restore, dependency install), or the first no-restore build fails with a wall of missing-asset errors that look like code.
> - **A killed worktree agent does not resume** — its work is on disk; launch a new agent into the same worktree with a take-stock preamble (`git status`/`git diff` first). Never re-run the unit into a fresh worktree.

> #### Execution contract A — verified-base worktree
>
> A **verified-base worktree** brief names the exact intended base commit/ref and treats the checkout
> as untrusted until the implementer runs `git log -1`. When it mismatches, use
> `git merge-base --is-ancestor <actual> <intended>` to distinguish **benign lag** from divergence:
> only benign lag may recover with `git merge --ff-only <intended>`; **stop on divergence**, a moved
> intended base, or any failed ancestry check. No edits begin until `HEAD` equals the intended SHA.
>
> Assign **disjoint owned files**, **coordinator-owned shared files**, and one **seam implementer/owner**.
> Capture the **before diff** and status, then the **after diff** and status before
> integration. Stop on out-of-scope changes, unexpected shared-file edits, an unresolved seam, or base
> movement. The coordinator alone integrates shared files and records seam decisions for concurrent
> plans. Every implementer edits under the EDIT-MECHANISM block above.

> #### Execution contract B — serialized in-tree implementer
>
> Use a **serialized in-tree implementer** when regenerated output, shared style/model files, a live
> smoke host, or another collision surface makes isolated worktrees misleading. The dispatch rule is:
> **exactly one implementer edits at a time**. Pin the base per unit, capture the before diff/status, assign owned files plus
> the coordinator-owned shared-file handoff, and inspect the after diff/status before the next implementer starts.
>
> Only **explicitly identified docs-only coordinator commits** may land during the unit. Tolerate those
> after verifying their paths; **stop on source changes**, concurrent mutation, unexpected paths, an
> unresolved seam, or a base commit that moved for any other reason. A killed, disconnected, or
> resumed implementer performs a **take-stock on resume**: re-read `git status`, both diffs, the base
> pin, and its owned files before continuing.
>
> Name the collision/interlock reasons in the brief rather than merely choosing "serialized":
> regenerated output and shared style/model files collide across units; a running host holds build
> outputs; and **two test layers** must not run concurrently (SUITE-DENOMINATOR). The EDIT-MECHANISM
> block binds each implementer; serialization does not replace either rule.

**The run-time multi-agent contract, whichever shape you chose.** Every brief states **ownership** (which files this implementer may edit, which are coordinator-owned), the **seams** (each new interface between units and who builds it), the **diff checks** (before and after diff/status captured and inspected by the coordinator), and the **stop conditions** (base moved, out-of-scope edit, shared-file edit, unresolved seam, unexpected concurrent mutation). An implementer that cannot name all four from its brief has an incomplete brief; fix the brief, not the implementer.

Whichever path you take, each work unit follows 2a–2c below.

> ### The non-code path (a plan with no code surface)
>
> Docs, skills, SDD, CI, and packaging-config plans are common, and 2b–2c as written do not apply to them: there is nothing to TDD and no test command that exercises the change. **Do not silently skip verification** — that is precisely how a restructure ships with content dropped. Instead:
>
> 1. **Say there is nothing to TDD.** Don't manufacture a test to satisfy the phase.
> 2. **Name the verification BEFORE you edit.** Take it from the plan's **Verification** section (pre-impl requires one). If the plan is hand-written and lacks one, **author the checks yourself and state them up front** — deciding what "correct" means *after* you've edited is how you end up proving nothing.
> 3. **Run it after, and report the actual result** — not "verified," but the output: *"duplicate-ID grep returns empty; sorted-line diff vs `HEAD` shows additions only; the version probe on a throwaway bug branch yields the expected prerelease string."*
> 3b. **Apply the falsifiability gate** (stated at the top of this phase) to every check whose result
>    reaches the Phase 7 table — state what a false claim would have produced. This path needs it most:
>    a compiled-language test against code that does not exist **fails to compile**, and the compiler
>    is the backstop that makes "it went red" mean something. A regex over prose has no backstop — it
>    matches something else in a large document and reports green. So when the verification is an
>    assertion over a document, **require every new assertion to fail before you implement, and read
>    the per-test list rather than the `Failed: 3, Passed: 2` summary** — a partial pass looks exactly
>    like ordinary progress. The doc meta-tests (config `repo.commands.docTests`) are the usual
>    instrument here; run them the same way, red first.
> 4. **Still run the full build + test suite when the change touches build config** — project files, version config, and CI yml are code by another name.
> 5. The verification and its result **must appear as a row in the Phase 7 table**, exactly where a code plan reports test counts. An absent row means the work was never proven.
>
> Typical checks: invariant greps, a generator round-trip / content-preservation diff against `HEAD`, a config probe on a throwaway branch, link/anchor checks, schema validation.
>
> **An investigation phase is the non-code path's second sibling — its deliverable is FINDINGS, and
> "the premise was wrong" is a result, not a failure.** A plan whose pre-impl declared an
> investigation/spike phase (a spike, a gate, a measurement, an inventory) is executed differently
> from an edit-shaped docs plan, because there is no prior content to preserve — there is a question
> to answer honestly:
>
> 1. **The deliverable is a findings section** written into the plan (or the research doc under config `repo.docs.research` that the plan names), and every spike/gate ends in an **explicit written verdict** — that verdict is what lets the phase be called done.
> 2. **Downstream phases the findings change are edited in the same run and marked as resized** — a verdict that quietly invalidates a later phase while leaving its text intact is the failure mode.
> 3. **The phase terminates in a `repo.commits.plan` / `repo.commits.docs` commit, not a feature/fix commit** — there is no code to label. (A plan mixing investigation and code phases still ends the code phases in the usual feature/fix commit; the shapes compose per phase.)
> 4. **Verification is measurement integrity, not content preservation:** findings numbers must be traceable to preserved raw output (embed script/agent output verbatim — never retype it), scoring criteria are fixed **before** results exist, and anything cut short is reported, never papered over. The **falsifiability gate** at the top of this phase applies in full — including its fifth shape, which this path hits hardest: a remove-it-and-see run over a pre-filtered sample cannot falsify the filter, and a measurement against a generated artifact inherits that artifact's staleness, so establish every input's provenance and freshness before measuring against it.
> 5. **Phase 7's table carries a verdict row** where a code unit shows test counts — the verdict is the phase's proof of completion, exactly as the verification row is for an edit-shaped unit.
>
> **Discovery found a real product defect — file-and-leave-red.** This is a narrow terminal state,
> available only at a **declared discovery/investigation boundary** where a **separately filed real product defect**
> blocks the exact proving journey that boundary exists to exercise. It is not an escape hatch for ordinary
> implementation: the build must be green, all tests outside the exact named blocking set must be green,
> and the blocking rung must reproduce the exact named expected failures at the real defect. There may be
> no unrelated red and no weakened assertion. Repoint a
> stale selector/symptom to the real failure, file the product defect with the **exact owed tests**,
> and record the defect plan/issue plus the expected-failure set. The current plan records the finding
> and stops at its declared boundary; it does not silently widen into fixing the product. If the
> journey is not blocked, file the defect and continue the unaffected discovery normally. Default
> ordinary implementation remains fully green.
>
> **A friction-resolution plan is a specific shape of non-code plan** — one produced by
> sdd-skill-improve or test-improve. Its deliverables are always three kinds, and **all three are
> required**; shipping the edit without the flips leaves the harvest looking undone next run:
>
> 1. **The edits** — `skills/*/SKILL.md` (skill friction) or test files (flakes/ROI). Bump the `version` patch on every `skills/*/SKILL.md` touched; that is the house rule at the top of each.
> 2. **The `**Status:**` flips** — the plan lists them per entry (`<ledger> · F-N` / `· T-N`), including expirations and any `Decline`. Apply them with the harvester's deterministic half: `node scripts/sdd/harvest.mjs flips --decisions <file>` (the decisions file the plan names or carries), then `node scripts/sdd/harvest.mjs watermark` to advance the scan watermark. Change **only** the `**Status:**` line (plus the dated Decision-history bullet); never delete an entry or reword its `What happened:` / `Recommendation:` prose. Mark **every** entry a cluster comprises — an unmarked sibling resurfaces next run as if the cluster were still open.
> 3. **The redeploy + parity check** — `node scripts/sdd/skills.mjs install --yes`, then `node scripts/sdd/skills.mjs status` and confirm the tracked version matches **every** deployed mirror across the configured harnesses (config `skills.harnesses`). The installer's own success report is not proof: one harness mirror once sat two patches ahead of another, so the copies actually being executed were the stale ones.
>
> **The load-bearing verification is content preservation.** Restructuring a working skill fails by a
> rule quietly vanishing, not by a visible break — review `git diff HEAD -- skills/` and confirm every
> removed instruction was re-homed rather than dropped.

**2a. Set up the work unit.** Implement directly in the checked-out tree (sequential path), or in the unit's worktree (Claude Code acceleration). Do **not** modify the shared registration files while implementing a unit — they are integrated in Phase 4.

**2b. Write tests first** covering the categories the profile document lists for the unit's layer. Where it lists none, use these defaults (adapt to domain):

> **Every category below is subject to the falsifiability gate** (top of this phase). Two of its five
> shapes are born here: a fixture written from the assumption it tests (so measure the claim against
> the real system before the fake encodes your belief), and a baseline asserting absence when the
> subject never existed (so assert the subject *exists* before asserting its state).

For commands, handlers and services:
1. **Happy path** — valid input, success exit code / result, correct data written to the output seam
2. **Boundary-call verification** — assert the correct downstream path/operation was invoked, read from the fake's recorded calls
3. **Missing required input** — null/empty required fields, the documented error code, no downstream call
4. **Not found** — entity absent from the fake, the documented not-found error
5. **Feature-specific edge cases** — filters, conditional dispatch, flags, empty results

For UI components:
1. **Rendering** — component mounts, shows expected initial state
2. **User interaction** — click, type, keyboard events produce correct behavior
3. **Edge cases** — empty data, loading states, error states
4. **Accessibility** — ARIA attributes, keyboard navigation

> **Required extra category: when one fact reaches two surfaces, pin that they AGREE.** Per-unit tests
> verify each surface against its own fixture, so both stay green while they disagree (at thousands of
> passing tests, a CLI once listed 22 sources and the UI host's manifest derived none). Whenever a
> feature projects one state onto **CLI + host/UI**, **endpoint + command**, or **store + manifest**, a
> conformance test asserting the two answers match is a **required deliverable of the unit that adds
> the second surface** — never left for e2e.

> **Stop the UI host before testing — always, every cycle** (only when config `repo.ui` is set). Before
> running *any* test command (not only before a build), confirm no dev server or product host started
> by this or an earlier session is running, and stop it first. A live host holds build outputs locked,
> which fails the *next* build with a copy error rather than a compile error, and can also collide with
> dev-server ports or leave a test exercising a stale bundle. Make the status check the first action of
> every 2c cycle, not a one-time setup step.

**2c. Run an autonomous build-test-fix loop** (max 10 cycles) per work unit, using the configured commands for its layer:
- Build: `repo.commands.build` — keep the **build** unfiltered.
- Test, narrowed to the new test class/file: `repo.commands.testFilter` with `{filter}` substituted, when configured; otherwise the full `repo.commands.test`.
- A second layer (a UI package with its own runner) runs the test command **the profile document gives for that layer, in the form it gives it** — a filtered or single-file run uses the **same form** as the full run, with the file appended. Do not substitute a "looks equivalent" invocation that changes the working directory or the config the runner loads: the runner then picks up none of its environment and every test fails on a missing global, *including ones that just passed*, which reads like your change broke them. **The tell:** the runner's startup banner names the package root; if it names the repository root, the invocation is wrong, not the code.

Then: build first, fix compiler/type errors; test (filtered to the new test class/file), fix implementation (NOT tests); report final pass/fail count.

> **Step 0 of every 2c loop — establish a BASELINE when the plan adds no test.** Run
> `node scripts/sdd/suite-run.mjs --baseline --json` *before touching anything* and write the number
> down; the comparison, not the absolute count, is the evidence — without it a pre-existing failure
> reads as *"my change broke this"*. Take it on the **branch you are on**; a number from another
> branch, session or the plan describes a different tree. The script builds first and scopes a
> docs-only diff to the docs meta-suite.

> **Never gate a commit on a piped build command.** `cmd | tail && git commit` gates on `tail`'s exit
> status, which is 0 whatever the build did (`set -o pipefail` is not in effect in an ad-hoc tool
> call). Capture the build's own status and gate on that:
> `<build command> > build.log 2>&1; status=$?; tail -3 build.log; [ $status -eq 0 ] || exit 1`.
> Trimming the output and honoring the status are two steps, not one — for every layer's build.

<!-- SUITE-DENOMINATOR:START -->
> ## Suite denominator — read the denominator before the verdict
>
> 1. **Sequential invocation is not sequential execution.** Never run two test layers concurrently, and
>    never edit source while a suite runs. Between layers, poll until the previous runner's processes
>    started by this run have exited, and clear any that outlive it. Stop every dev server and
>    parallel-smoke rung before a full-suite run; restart them before handover. A suite that dies at a
>    timeout with **no failed-tests block**, or a worker that fails to start, is resource starvation,
>    not a hanging test. Capture output in full — `| tail` discards the failed-tests block.
> 2. **Read the denominator.** The suite's reported total (test files, assemblies, or tests, per the
>    runner) must equal the suite's true count — the last known-good total, stated in the profile
>    document — and a lower total is an infrastructure result whatever the pass/fail line says. Run
>    `node scripts/sdd/suite-run.mjs --json` and act on its `verdict`: it builds with `repo.commands.build`,
>    gates on that build, runs `repo.commands.test`, and parses the result by the configured
>    `repo.testRunner` adapter — `BUILD_FAILED`, `RUNNER_TERMINATED`, `TESTHOST_FAILED`, `ZERO_MATCH`
>    and `DENOMINATOR_MISMATCH` are failed runs, never green. After adding tests pass
>    `--expect-total <old total + added>`.
> 3. **A non-default runner mode** (a single worker, an isolated pool) may diagnose one focused file; it
>    never replaces the canonical test command. Retry the canonical command once the machine is quiet.
> 4. **Prerequisites that look like product errors when absent.** The profile document lists the
>    build-before-test steps and machine-state prerequisites for each layer (a sibling project that
>    must be built, a package that must be installed, a runtime that must be present). A failure that
>    matches one of them is machine state, not code. A target framework whose runtime is missing is
>    reported "authored-but-unrun on this machine; CI is the gate" — never a regression and never green.
>
> Stated once here; post-impl's build-verification phase and test-improve cite it by name.
<!-- SUITE-DENOMINATOR:END -->

> **On red, classify BEFORE you diagnose** — the runner's one-line summary is rendered identically by
> all of these; read the failed-tests block and the errors line **first**, then act:
>
> | What you see | What it means | What to do |
> |---|---|---|
> | An assertion diff / assertion error under the failed-tests block | A real failure — the thing this loop is for | Fix the code (not the test) |
> | An errors count with a worker-pool / test-host startup failure or a worker timeout, often with a "no tests" summary | **Infrastructure** — workers never started; the code was never exercised | Re-run; stop competing processes; a single-worker mode if it persists. **Do not change code** |
> | The reported total below the true denominator, or a test-host-crashed line | **Infrastructure** — part of the suite never ran | SUITE-DENOMINATOR rules 1–2, then re-run |
> | A per-test timeout (`timed out in Nms`) | The test is **slow, not wrong** | Raise that test's own timeout and log a `T-N` (Phase 8) — do not "fix" the assertion |

> **An optional end-to-end layer is best-effort when its dependencies are unreachable.** When `repo.commands.e2e` is configured and its dependency install fails on network policy (a TLS intercept, a registry the machine cannot reach), do **not** stall retrying the install: treat "e2e green" as best-effort, state that the spec is authored-but-unrun, name where it will first run (a machine with access, or CI), and carry that as an explicit row in the Phase 7 table so it reaches post-impl and the publish step. An authentication failure on a private package feed is auth, not the package graph — refresh the credential the profile document names rather than re-running the install.

**2d. Collect results.** For each work unit, record: files added/modified, test counts and pass/fail status, and which plan it implemented. (Claude Code acceleration: wait for all parallel agents to finish and collect their worktree paths too.)

**2e. Smoke-test stop (UI-affecting MSUs).** This step applies only when config `repo.ui` is set; when it is `null` there is no UI surface and the step is **not applicable** — say so in one row of the Phase 7 table and continue. When the plan marks an MSU as UI-affecting, it gets a developer smoke test and a sign-off. **Serialized is the default**: STOP once the MSU is green, hand it over, and do not start the next until they confirm. This is the stop pre-impl's smoke phase declares.

**Offer parallel smokes when the plan has ≥2 UI-affecting MSUs.** Ask ONCE, before Phase 2 starts — not mid-build, when the answer costs a rebuild:

> "This plan has N UI-affecting MSUs. Build all N and stand up one environment each, so you can sign off back-to-back without waiting on me between them? Or stop after each one (default)?"

Serialized remains the default if they don't answer, so a single-MSU plan and an unattended run are unaffected. Parallel mode is worth offering because the serialized rhythm makes the *developer* the bottleneck: nothing progresses while they are away, and on return they clear one MSU before waiting on the agent again. **What parallel mode does NOT waive:** every MSU still gets its own smoke, its own observable pass/fail criteria, its own sign-off, and its own independently green commit with its own tests, built and verified before the next begins. Only the *stops* stop being serialized.

**Layout.** One commit per MSU on the current branch. Then one `git worktree add --detach` per MSU **pinned at that MSU's commit**, so rung N contains MSUs 1..N; one dev server each (config `repo.ui.devServer`) on consecutive ports; ONE shared backend (all rungs proxy to the same port); installed dependencies linked from the primary tree rather than installed N times — safe only while no MSU changes a dependency. Give the developer a table: rung → MSU → URL → what passing looks like.

**Failure policy: fix at the tip, never restack.** Stand up one MORE environment on the **primary tree** — the tip. Feedback lands there and is verified there; the rungs stay frozen. A rung's only job is to isolate *which MSU* a behaviour belongs to, so once a finding is understood that rung has done its work and may go stale. Do not rebuild rungs as fixes land: that re-serializes exactly what this mode exists to avoid, and nothing requires a rung to be current. Recreate one only if the developer needs to re-isolate that specific MSU.

The developer should never have to reconstruct a path, guess a port, or work out how to launch anything. **Hand them a ready-to-run block:**

1. **Absolute paths, always.** Every file the command references — the spec, the fixture, the script — is given as a **full absolute path**, never relative to a directory they'd have to be standing in. Quote it, and give it in a form their shell accepts (forward slashes work in both PowerShell and Bash on Windows; a `C:\…` path with backslashes does not survive Bash).
2. **A clickable URL on its own line.** `http://localhost:<port>` — not "open the UI" or "browse to the dev server."
3. **Say which URL, and why the other one is wrong** when more than one is listening (e.g. the dev server vs the raw backend).
4. **Serve the frontend from source, not the installed tool.** An installed tool runs the bundle packed at *install* time, so pointing the developer at it shows them **stale** frontend code and the smoke silently passes on the old build. For any UI MSU, bring up the dev-server loop (`repo.ui.devServer` proxied to a live backend) — or redeploy the tool first (`repo.commands.deployTool`, when configured). Say which backend is live. **This applies to CLI-only MSUs too**: a bare product command resolves to whatever is on `PATH`, which is stale until redeployed — either redeploy before the smoke or hand the developer the built binary by absolute path, and state out loud which one is live.
4b. **Before trusting *any* installed/live tool for a smoke or a spike, prove it isn't stale.** A tool built earlier in a multi-session branch, or a bundle rebuilt on the source side, can silently diverge from the branch's current HEAD with no error and no visible symptom. Two checks, pick whichever the situation calls for:
   - **Timestamp check** (a spike or CLI smoke against the installed tool): compare the installed binary's mtime against `git log -1 --format=%cd`. If the tool predates the HEAD you're standing on, redeploy, or explicitly state the divergence and bound it with `git log --since=<tool build time> -- <paths the current work touches>` before trusting a single observation from it.
   - **Asset-hash check** (a UI MSU, confirming what's actually served): when a built bundle is copied through more than one step before it is served (source build → project output → the served location), verifying the source-side hash proves nothing about the served copy. Compare the content-hashed filenames at the **served** location against the source build and require them to **match** — one `ls`/`grep` on each side. **When they don't match, the fix is the later hop**: re-run the step that copies the bundle into the served location. This binds **anything that serves the built bundle — a developer smoke, an e2e run, or your own agent-driven probe**; an e2e suite driving a built binary right after a UI change is the easiest way to spend an hour debugging a feature that was never actually deployed.
5. **Prove the setup before handing it over.** Validate the spec, confirm the data source actually returns the fields being exercised, and confirm the page/route responds. A smoke test that renders "No data available" proves nothing — and a spec that binds a column the source doesn't have will do exactly that.
6. **Hand over in THIS SHAPE — the form is required, not just the content.** "State what pass looks like" is a *content* rule; prose satisfies it and is far harder to execute. A handover is a set of instructions someone runs while you are not there, so write it as one. All seven parts:
   1. **A numbered `| Step | Expected |` table.** Not prose: the developer works down rows and stops at the first that disagrees.
   2. **Exactly one canonical URL on its own line — plus the plausible-wrong alternative and why it is wrong.** e.g. *"use the window the launcher opened; a pasted URL has no capability ticket, so the socket upgrade is 401 and the app sits on Disconnected."* Naming the wrong-but-reasonable option is what prevents a misattributed failure.
   3. **One step marked LOAD-BEARING, with its reason.** Without it every row reads as equally important.
   4. **An explicit split between what you already verified and what you could NOT — with the reason.** That is what tells the developer where their attention is worth spending.
   5. **A deliberately-out-of-scope line.** *"The sim toggle is MSU 4.3 — don't look for it."* Prevents a correct build being reported as incomplete.
   6. **The failure mode phrased as an observable**, not only the pass criteria — *"if the tab does not reload you keep seeing the old backend's data under the new backend's label"*. Without it a developer cannot tell a pass from a thing that merely looks fine.
   7. **Every MSU instruction is written in ASD-STE100 Simplified Technical English**: the `Do` and `Expected` cells, the preconditions and the observables. Imperative and active voice; one action and one result per step; at most 20 words per sentence; one term per thing (a window is never later a tab); no hedges, idioms or synonyms; a caution before its step; the expected result in the present tense, as what the developer sees. Reasoning goes in a note after the table, never inside a step.

   **A handover with more than one part states each part's PRECONDITION, and any part that leaves a resource running ends with the step that releases it.** The preflight sweeps orphans from earlier sessions, not what this handover created between its own parts.
7. **Write the handover to an MD file and open it in the developer's editor — the terminal is not the record** (the TUI scrolls it away mid-smoke). Write every MSU/smoke handover to a temp location outside the repo (the session scratchpad; never a tracked path) as `smoke-<msu-or-part>.md`, open it best-effort with the editor's open-file command (`code -r "<absolute path>"` or equivalent), and overwrite the same file on re-handover. Working notes only: never committed, never cited — the Phase 7 table is the durable account.

**Smoke-environment preflight — run these IN ORDER before handing anything over.** Items 1–7 above are handoff *quality* rules; this is the *sequence*, and skipping a step is how a broken environment gets handed over with confidence. Every step below exists because a run shipped a bad handoff without it. The profile document names the host command, its modes, its idle-shutdown grace periods and its ports; `repo.ui.smoke` names the smoke entry point.

1. **Sweep the ports you are about to use — for orphans from EARLIER sessions, not just your own.** A host's own status command only knows about hosts it started and will happily report "not running" while a stale dev server still owns the port. Check ownership directly (`Get-NetTCPConnection -LocalPort <ports> -State Listen` / `lsof -i`), and kill anything this run did not start, saying so. A multi-phase UI plan has a smoke stop per MSU across many sessions, so dev servers accumulate **by construction** — and a stopped *task* is not a stopped *process* when the dev script forks its server. The failure mode is silent: your new server loses the port bind and the developer is served a bundle from days ago.
2. **Pick the host mode deliberately, and say which you picked.** Host modes are not interchangeable when one requires a capability ticket or a launcher-minted session: a browser that arrives through a dev-server proxy never went through the launcher, so a ticket-requiring mode rejects its socket upgrade with 401 while every HTTP route keeps answering 200. A mode that inherits the invoking console is not the mode production runs, so a console-related bug is never exercised by it and the smoke passes on a configuration that does not ship. State the reason for the mode you chose, so a later run does not "helpfully" switch it.
3. **Launch so it survives — a foreground host is fragile in two different ways.** *Stdin EOF:* a foreground host blocks on stdin; started as an agent background task its stdin is the null device, so it takes EOF and exits ~immediately after printing its ready line. *Task reaping:* a `tail -f /dev/null | <host>` pipeline is parented to the agent task, so the host dies whenever that task is reaped — mid-session, with no error anywhere; dev servers SURVIVE the same reaping because the dev script forks its server, so only the backend vanishes and it presents as "the app loads but shows disconnected." Launch it **detached from the task**, into its own console, so it owns a real stdin and outlives the harness (`Start-Process <host> -ArgumentList "..."` in PowerShell, or the platform equivalent). Do NOT use the `tail -f` form for a session the developer will use over time.
4. **A host that shuts ITSELF down when idle** is routinely gone by the time the developer opens the tab and reads as a crash. Two supported ways to hold it: **restart it immediately before handing over**, so the window starts when the developer has the URL; or **park a keepalive client** — a genuine socket client held open and reconnecting (a ~15-line Node script; sanctioned). Switching to a mode with a longer grace is NOT the fix when that mode also changes the capability requirement (item 2).
5. **Prove it — and an HTTP 200 sweep is NOT proof for a WebSocket app.** The status indicator the developer reads means *the socket connected*. Check, in this order, and report each result:
   - HTTP: the data routes answer.
   - **Do NOT probe the socket upgrade with a plain HTTP client.** It looks like the obvious check and it can *kill the host*: the client closes without a close handshake, the handler throws, and — because the probe counted as the only client — the idle-grace countdown from item 4 then shuts the server down. Verify the socket the way the developer will: load the page and read the connection indicator, or check the host log for a registered client.
   - The **data source returns the fields being exercised** (item 5 above). **Do this BEFORE starting dev servers.** On a loaded machine a credential provider's process timeout is genuinely reachable, and it fails with an auth-shaped message for what is actually CPU starvation. Proving data first, on a quiet machine, keeps that ambiguity out of the run.
   - **Asset-hash parity** across the copy hops (item 4b) when the MSU touched the UI source. The tool's **version string does not change** without a new commit, so it is not a staleness signal; the asset hash is.
   - **For any UI MSU: assert on RENDERED OUTPUT, not transport.** Every check above is about the data path, and a page can satisfy all of them while rendering wrongly or not at all — three defects reached a developer in one run because the data path was verified and the page was reported as working. Drive the actual page with a browser automation CLI and assert at least one thing about what is *painted*: an element count, a piece of text, a computed style. "The endpoint returns 200 with the right JSON" is not a rendered-output assertion.
6. **Hand over** per items 1–7, then **stop the host before the next build** (locked outputs, Phase 2c).

If starting servers, note that they stay running, and offer to stop them when the developer is done. **Stop the smoke host BEFORE the next build**: a running host holds build outputs, so the next build fails with copy errors — and the failure is then masked (see the Phase 2c warning).

---

### Phase 3 — Merge Worktrees (Claude Code acceleration only)

**Skip this phase entirely on the sequential path** — the work already lives in the primary tree. This phase only applies when Phase 2 used parallel worktrees.

**Goal:** Copy all agent work into the main tree, keeping worktrees alive until the final commit succeeds.

**3a. For each worktree**, identify changed/new files:
```
cd <worktree_path>
git diff --name-only HEAD          # modified tracked files
git ls-files --others --exclude-standard  # untracked new files
```

**3b. Merge order.** If plans have dependencies or conflicts (noted in Phase 1b), merge in dependency order. Otherwise merge in any order.

**3c. Integrate each worktree with `git merge` — do NOT hand-copy files.** ("Primary tree" = the checkout this skill runs in — the non-worktree clone — whichever branch (the default branch **or** a feature branch) is checked out there. It is NOT the default *branch*; nothing in this phase switches branches.)

Commit inside each worktree, then merge its throwaway branch into the primary tree, one unit at a time:

```bash
# in each worktree
git add -A && git commit -m "wu: <unit>"
# in the primary tree, per unit, in the Phase 3b order
git merge --no-ff <worktree-branch>
```

- **Resolve only real conflict markers by hand.** Git already knows which hunks are disjoint; hand-copying throws that away and re-decides every line by eye.
- **Skip the shared registration files** from all worktrees — they are integrated manually in Phase 4. (`git checkout --ours -- <file>` if a merge touches one.)
- Untracked files are carried by the commit, so nothing needs a separate copy step.

> A real merge is diff-checked, fails loudly on genuine conflicts instead of silently losing a hunk, and leaves history showing which unit contributed what; hand-copying re-decides every shared line from memory.

> **A green worktree proves nothing about its siblings.** A shared-contract change inside one unit (a method that stops mutating its input, a widened interface, a renamed field) is invisible to the others until this merge — three units green alone, 21 tests red the instant they merged. Re-run the suite after each merge before merging the next, and when decomposing (Phase 1b) land any unit that changes a type its siblings touch first.

**3d. Do NOT clean up worktrees yet.** Keep them alive as a safety net until Phase 4's full build+test passes green (that green run is what proves the merge was complete). Cleanup happens in Phase 5.

---

### Phase 4 — Integrate shared registration files

**Goal:** Manually integrate all registrations, defaults, and imports into the **shared registration files named in the profile document** (a command registry, a route table, a DI composition root, a plugin manifest). **Skip this phase entirely if no unit added anything that needs registering.**

**4a.** Review what each work unit needs registered (from its diff, or the plan) to see what registrations must be added
**4b.** Apply all changes to the primary tree's shared files:
- Add imports / using statements for new namespaces or modules
- Add entries to any default-verb or default-route tables
- Register the new command/component/handler in the appropriate group (or create a new group)
- Remove stubs that were replaced

**4c.** Build and run the full test suite: `node scripts/sdd/suite-run.mjs --json --expect-total <old total + added>` (it runs `repo.commands.build` then `repo.commands.test` and returns a verdict per SUITE-DENOMINATOR). Record the `N/M` denominator and, if the runner has several targets, which one the counts describe.

For the declared file-and-leave-red state only, Phase 4 completes when the build is green, the full
non-blocking suite is green, and a focused run reproduces only the exact named expected failures at
the separately filed product defect. Record both commands and their `N/M` denominators. Any unrelated
failure remains an ordinary red build/test result and must be fixed.

**4d.** If build or tests fail, fix issues. Common problems:
- Missing imports
- Namespace or module-path mismatches
- Duplicate registrations
- Locked output files (a running host or a stale test process — stop it, retry)

---

### Phase 5 — Clean Up Worktrees (Claude Code acceleration only, build-gated)

**No-op on the sequential path** (no worktrees were created). This phase only applies when Phase 2 used parallel worktrees.

**Only run this once Phase 4's full build+test is green.** That green run is the safety gate: had the Phase 3 merge dropped a file, the build/test would have failed there — so a green Phase 4 proves the primary tree has everything, and the worktrees are safe to discard.

- **If the build/test is RED and can't be made green:** do NOT clean up. Leave the worktrees in place as a debugging safety net, report the failure, and stop.
- **Narrow expected-red exception:** cleanup is allowed only after integration completeness is proved
  by a green build, the green non-blocking suite, and exact expected-red reproduction of the named
  blocking set at the filed defect. Otherwise preserve the worktrees. A broad or unexplained red run
  is not this exception.
- Otherwise remove each worktree and its throwaway branch:
  ```
  git worktree remove <path> --force
  git branch -D <branch>
  ```

Cleanup happens here — **before** the commit — so no worktree file locks interfere with the commit (a known Windows issue), and so the post-impl skill (run later) never has to know worktrees existed.

---

### Phase 6 — Local feature/fix commit (no push)

This skill captures the implementation as a **single local commit** and **stops**. It does **not** push, and it does **not** commit docs (those are the post-impl skill's `repo.commits.docs` commit, layered on top later).

> **"Single commit" describes the sequential path; the acceleration produces a series, and that is
> correct too.** Worktree units are already committed (`wu: <unit>`) and merged `--no-ff`, so the
> feature/fix commit is the **labeled tip of that series** — summary body plus remaining integration
> work, routinely near-empty. **Never squash the `wu:` series**; per-unit history is what makes a bad
> unit attributable. Say which shape the run produced in Phase 7.

**6a. Stage the implementation — explicit paths, never `git add -A`.** Stage the new + modified code/test files this run produced by path. Exclude unrelated working-tree changes (check `git diff --stat`), and do **not** stage the plan file — it stays as-is for the post-impl skill to move or keep. (Phase 8's ledger entries and run-log row edit the ledger files under `repo.docs.logs`, not the plan; commit those with, or immediately after, this commit — never leave them uncommitted.)

> **Staging a committed generated bundle: `git diff --numstat -- <bundle dir>` first** (EDIT-MECHANISM rule 1). A rebuild rewrites every file; stage the bundle **only when numstat reports non-zero line counts** — the content-hashed asset filenames corroborate. Committed churn hides a real bundle change and enlarges the next reconcile's unresolvable generated-file conflicts.

> **Non-code plans: the deliverable docs ARE the implementation.** For a docs/skills/SDD/config plan, the plan's own deliverable files — edited `skills/*/SKILL.md`, restructured SDD docs, README conventions, CI/config — **are** the implementation and belong in this feature/fix commit. "Does not commit docs" means specifically the layer post-impl owns: the *new* story for this change, the plan move to the artifacts folder, and the docs ledger. Do not defer the plan's deliverables to post-impl — that leaves this commit near-empty and buries the implementation under a later docs subject.

**6b. Commit locally** with a Conventional-Commits subject whose type is the **plan type resolved in Phase 0** — `repo.commits.bug` for a bug plan, `repo.commits.feature` for a feature plan (the default):
```
<repo.commits.feature|repo.commits.bug>: <concise description of what was implemented>

<One-line summary of each major area>. <N> total tests, 0 failures.
```
**Attribution follows `repo.commits.attribution`.** When it is `false` (the seed default), do **not** add a model/agent attribution or `Co-Authored-By` trailer — commits are attributed only to the repository's configured git user, whatever the harness's own default says. When it is `true`, add the harness's attribution trailer. If multiple plans were implemented, summarize all of them. If they are of mixed type, use the feature type and name the fix in the body.

**Phase 6 may commit this narrow expected-red exception** when every Phase 2/4/5 condition above is
met. Its commit body names the product-defect plan/issue, the exact owed tests, the green build and
non-blocking-suite counts, and the K exact expected failures reproduced in the blocking set. Do not claim `0 failures`;
label the outcome `⚠ expected red`. Ordinary implementation still cannot commit until fully green.

**6c. Do NOT push.** The commit is local only — this preserves the review gate (trivially `git reset` / `git commit --amend`-able before anything reaches the remote). Pushing, the docs commit, the plan move, and the PR (or trunk fast-forward, per `repo.publish`) are all the post-impl skill's responsibility.

> Why a local commit rather than leaving the tree dirty: it hands the post-impl skill a real, correctly-labeled commit to build on — post-impl's docs commit and its PR title/body derivation both assume the implementation is already committed. Nothing is pushed, so the "review before it reaches the remote" gate stays intact.

---

### Phase 7 — Actions taken (summary table)

Every skill in the trio ends with the **same table**, so three runs read alike. **One table — the old metrics/status tables are absorbed as rows, not printed alongside.**

```markdown
## Actions taken

| Action | Target | Result |
|--------|--------|--------|
| Config | skills/sdd.config.json | build `<repo.commands.build>`; test `<repo.commands.test>`; profile `<repo.docs.profile>` read |
| Resolved plan | <plans dir>/<file>.md | matched **Branch:** → <branch> (or: named by the developer) |
| Implemented on | <branch> | (or: ⚠ HOTBUG — on the default branch, plan declares Hotbug: YES) |
| Errata | <friction ledger> | N titles scanned, M read in full, K acted on (F-…) — or: none open |
| Friction | <friction ledger> | N logged (F-…) — or: none — <why this run produced none> |
| Work unit 1 | <scope> | ✅ green (or ❌ failed — <why>) |
| Work unit N | <scope> | … |
| Tests | <suite> | N/M passed, 0 failures (K new) — denominator from <where> |
| Tests — discovery boundary | <exact blocking set> | ⚠ expected red — N/M non-blocking tests green; K exact expected failures reproduced; defect reference <plan/issue>; exact owed tests <names> |
| Verification (non-code) | <the named check> | <its actual result — e.g. "duplicate-ID grep: empty; content diff vs HEAD: additions only"> |
| Smoke | <MSU> | handed over / signed off — or: not applicable (repo.ui null) |
| Build/verify cycles | — | N |
| Worktrees | — | N cleaned (or: none created) |
| Committed | <feat\|fix>: | <hash> — local, NOT pushed |
```

**Rules that make it useful rather than decorative:**
- **Every Result is verifiable** — a hash, a count, a path, a branch. Never "done" or "✅" on its own.
- **A non-code plan MUST still show a Verification row** with the check and its outcome, exactly where a code plan shows test counts. An absent row means the work was never proven — that is a failure, not a formatting choice.
- **Use the discovery-boundary row only for the declared file-and-leave-red exception.** Report the
  `N/M` denominator, K exact expected failures, and defect reference; never print the ordinary
  `0 failures` row for that state. The handoff to post-impl remains explicit and carries the defect
  plan/issue plus exact owed tests. Every ordinary implementation uses the fully green row.
- **Report the non-actions too**: a refusal to run on the default branch, a smoke-test stop, a deferred unit, a skipped optional phase — each gets a row.
- **This is the only summary** — no second table, no prose recap of the same facts.

Then print the hand-off line:

> **Next:** run the **post-impl skill** (branch-aware, per `repo.publish` — on a feature branch it keeps the plan in the plans folder and opens/refreshes the PR or fast-forwards trunk; on the default branch it moves the plan to the artifacts folder and pushes trunk) to update docs, handle the plan file, add the docs commit, and publish.

---

### Phase 8 — Friction → the central ledgers (self-improvement)

Look back over **this session** and ask whether anything about the **impl skill itself** should change.

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
### F-<next> — impl · Phase 2 (test-first loop) — <short title>
**Found:** YYYY-MM-DD · `<plans dir>/<this plan>.md` · branch <branch>
**What happened:** <Enough narrative that a fresh context window — one that never saw this session —
can reason about a fix: what the skill told you to do, what you actually did, where it misled you or
wasted effort, and what that cost. Name the phase, the file, the command.>
**Recommendation:** <Only when there is a clear one. Omit the line entirely otherwise.>
**Status:** Open
**Decision history:** _none yet_

### T-<next> — <test file> · <test name or describe block>
**Found:** YYYY-MM-DD · `<plans dir>/<this plan>.md` · branch <branch>
**What happened:** <The observed flaky/slow behavior — e.g. "failed 1 of 3 runs with `<error>`",
"only passes with a 15s `setTimeout` wait", or "order-dependent: fails when run after `<other
test>`". Name the exact command that reproduced it. If it relies on a sleep/poll/timeout, state the
duration — this is exactly what test-improve's redesign targets.>
**Recommendation:** <Only when there is a clear one — e.g. "replace the sleep with fake timers /
`waitFor` on the real condition". Omit otherwise.>
**Status:** Open
**Decision history:** _none yet_
```

**The bar (F-N).** Log friction that is **recurring or structural** — something an edit to the skill would actually prevent next time. Do **not** log: one-off environment hiccups (a flaky network call, a locked binary, an expired token); trivia (a typo, a stale line number); anything you already fixed in-session; or feedback about the *codebase* rather than the *skill*. **Writing nothing is the expected outcome of a clean run** — an empty run adds nothing to the ledger, and that is a signal, not a failure.

**State the negative, and justify it.** Writing nothing is a legitimate result, but a bare `none` in the Friction row is a reflex, not a finding — say *why* this run produced none (`none — no phase misled this run; every step matched the file`). The read half is auditable because a scanned count reconciles against what `grep` returned; the write half has no such ground truth, so the stated reason is the only thing that turns the negative into a claim.

**The bar (T-N) — deliberately different from F-N's.** Log **every** test you observed being flaky or slow this run — a test that failed then passed with no code change, needed a retry, depends on a `sleep`/`setTimeout`/polling wait to pass, or is order- or timing-dependent. Your test exposure in this skill is **Phase 2c's build-test loop**. Do **not** filter T-N for "is this worth fixing" the way F-N is filtered — that triage happens in test-improve's harvest, not here. Your job in this phase is only to capture the raw observation before the context window closes. A clean run with no flakiness logs nothing under `T-` either — don't manufacture one.

**Before logging one, run the `ANTIPATTERN-GATE` stated in the test-health ledger's header (config `repo.ledgers.testHealth`) — follow it there, do not restate it here.** It is the one exception to "don't triage", and it is not a judgment about whether a fix is worth it: it is a structural check on how the test *observes*. A test matching one of its anti-patterns is **fixed — or deleted — in THIS run**, alongside the work already in flight, and reported in the Phase 7 table rather than logged for a harvest. Routing it onward is exactly how the cost compounds; the same flakiness has been handed across three plans before anyone fixed it, and every hand-off cost more than the fix. **This is the one place impl edits a test it did not come here to change** — the read-but-never-fix rule governs *skills*, not this gate.

**A `T-N` entry MUST name a specific test file and a specific test name.** "Seven pre-existing e2e failures" or "unidentified UI test, full-suite run only" is a **defect in the entry**, not a valid entry: the harvester cannot cluster it, cannot reproduce it, and — since `T-N` is never `Declined` and never expires — cannot close it either. If you genuinely cannot identify which test flaked, re-run to find out before writing the entry. Also capture the exact symptom, the reproducing command, and the wait/timeout duration if any.

**Ask before you write.** Draft the candidate entries (both buckets), show them to the developer, let them confirm/edit/add/drop, then append the confirmed set to the ledgers and commit it (with, or immediately after, the Phase 6 commit — never leave it uncommitted).

**Append the run-log row.** With (or immediately after) the Phase 6 commit, append one row to the run log (config `repo.ledgers.runLog`; grammar in its header): UTC timestamp, `impl`, the git user, the plan path, the branch, and the outcome (`<feature|bug type> committed <hash>`). A missing row reads as a departure from the guidelines.
