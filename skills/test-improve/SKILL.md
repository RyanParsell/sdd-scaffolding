---
name: test-improve
description: Weekly harvester for test health, in two tracks. The FLAKE track (default) reads every open T-N flaky-test entry in the test-health ledger, clusters by test case and by cause, ranks by recurrence, and proposes a fix for every one (redesign, delete with the lost coverage stated, or a note pointing at racy production code); a T-N is never declined and never expires. The ROI track (roi) times the suite through the configured runner adapter, classifies candidates into four judgment buckets, resolves the top 5 per run, and records verdicts in the test-ROI ledger. Both tracks PLAN rather than edit and hand off to pre-impl. Use when chasing flaky tests, investigating suite time cost, deciding what to speed up or delete, or sweeping for test debt. Developer-only.
user_invocable: true
version: 1.0.1
# ⚠️ IMPORTANT: When editing this file, increment the patch version above (e.g., 1.0.0 → 1.0.1).
---

## Test Health Harvester: $ARGUMENTS

*This copy is the target repository's own.*

**First step of every run:** read `skills/sdd.config.json` and the profile document
(config `repo.docs.profile`). Resolve the build and test commands (config `repo.commands.build`,
`repo.commands.test`, optional `repo.commands.testFilter`), the runner adapter (`repo.testRunner`),
the test globs (`repo.testGlobs`), the ledgers (`repo.ledgers.testHealth`, `repo.ledgers.testRoi`)
and the paths the profile document excludes from ROI scans. State the resolved commands in the plan's
Actions-taken table; never from memory.

This skill owns **test health**, in two independent tracks — as **sdd-skill-improve** owns *skill*
health. They share nothing but this file and the fact that both read test code:

| Track | What it harvests | Bound | Source of truth |
|-------|------------------|-------|-----------------|
| **Flake (`T-N`)** — the default | Open `T-N` entries the pre-impl/impl/post-impl trio logged when it saw a test flake | **Every** open cluster is examined and gets a proposed fix — uncapped | The entry's `**Status:**` line in the test-health ledger |
| **ROI** | Tests whose *time cost* isn't earning its keep | **Top 5** per run | The test-ROI ledger (config `repo.ledgers.testRoi`) |

> ## This skill PLANS; it does not edit
>
> **Neither track modifies tracked source.** Both decide *what* to fix and hand that to the trio:
> **pre-impl** cuts the branch and writes the plan, **impl** applies the test edits, flips the
> `**Status:**` lines and appends any test-ROI ledger rows, **post-impl** publishes. Each track ends
> at a plan on a branch.
>
> The reason is the repo's own rule, not tidiness. The agent-instruction surfaces (config
> `repo.agentSurfaces`) put work on a branch behind a plan, and **impl** enforces it by **refusing to
> run on the default branch** (config `repo.defaultBranch`). This skill used to redesign and *delete*
> tests directly, on whatever branch was checked out, with less ceremony than impl demands for a
> command-line flag. Delegating is also why neither track needs verify/commit rules of its own: they
> exist in impl, and a second copy would drift. **Measuring is still a read**, so the ROI track's
> timing runs (Phase 1) and the closing suite re-run (Phase 3) happen here. Only the *edits* move.

### Seven skills, two cadences

`pre-impl`, `impl`, `post-impl`, `sdd-skill-improve`, `test-improve`, `tdd` and `git-recenter` are
one system (config `skills.project`), not a trio plus outside tools. All seven are legitimate targets
of a `T-N` (and of an `F-N`) — including this file. The split decides where a *new step* belongs:

| | Skills | Runs | A step added here costs |
|---|---|---|---|
| **Per-build** | pre-impl → impl → post-impl | once per feature or bug — many times a week | its own time × every build, forever |
| **Refinement** | sdd-skill-improve, test-improve | roughly weekly | its own time × ~1 |

The technique skills (`tdd`, `git-recenter`) inherit the cadence of whichever skill invokes them.
**The harvesters are the periodic home for standing test-health work — use it.** A check that sweeps
a *standing surface* rather than this run's own work — a full scrub of the end-to-end suite, a
whole-suite timing pass, an audit of every fixture for a shared assumption — belongs in a phase here,
not in the trio: per-build it buys the same answer dozens of times and slows every feature; weekly it
catches the same drift. The reverse holds too: a check about the code a run just wrote belongs in the
trio, because deferring it a week lets broken work through. **sdd-skill-improve** Phase 2 states the
same routing rule for skill friction; this is its test half.

### Invocation

| `$ARGUMENTS` | Runs |
|---|---|
| *(empty)* | **Flake track** — Phases F1–F3 |
| `roi` | ROI track — Phases 1–3, then the same hand-off |
| `all` | Both, **flakes first** — one plan covering both |
| a path (a directory under one of `repo.testGlobs`) | Scope filter, applied to whichever track(s) run |
| a `T-N` id | Flake track, scoped to that one entry |

**The flake track is the default deliberately: a flaky test breaks CI today, while a slow test only
costs minutes.** Correctness outranks cost, so it gets the bare invocation. Do not "simplify" this
back to ROI-by-default — the flake track is also the *cheaper* one to start, since it reads existing
ledger entries rather than timing a full suite.

**Explicitly out of scope for the ROI track:** the paths the profile document excludes from ROI
scans — typically a **benchmark project** (it measures performance by design, not correctness) and a
**browser end-to-end suite** (it often can't execute in a given environment, so 0 findings would read
as "clean" rather than "couldn't check"). Never *scan* an excluded path.

> **Those exclusions are ROI-scoped and do NOT bind the flake track.** The ROI track *discovers by
> timing*, and a suite it cannot execute yields a misleading zero. A `T-N` needs no discovery run —
> the trio already observed the flake and wrote it down — so an end-to-end flake **is in scope for
> F1/F2**. A benchmark project stays out of both: nothing logs a `T-N` against it.

# Track A — the flake track (`T-N`)

The governing principle, and the reason this track exists at all: **a flaky test is worse than no test
at all.** It fails builds that should pass, trains everyone to re-run rather than read, and — because
it *sometimes* passes — never gets attributed to anything. So every open point gets examined and gets
a proposed fix. "Leave it and see" is not one of the outcomes.

## Phase F1 — Scan (flakes)

> **Open with a fetch — the scan must not read a stale ledger.** `git fetch origin` (and `git pull`
> when behind) **before reading a single entry**. This harvest runs on whatever tree is checked out,
> while the trio's own sync happens later in pre-impl Phase 1 — so without this, a run clusters, ranks
> and grills decisions against entries trunk already resolved. Measured: one run grilled three
> decisions on a tree four commits behind; the pull then brought in a PR implementing one of them.

> **State the SessionStart mirror advisory before anything else.** The `MIRROR-ADVISORY` block in
> pre-impl is the single statement of what it means and what to do — cite it, do not restate it. Say
> which it reported: **no advisory present**, **all mirrors current**, the specific
> `stale`/`misplaced`/`orphaned` skills it named, or **could not determine**; when absent or
> inconclusive, run `node scripts/sdd/skills.mjs status --json` yourself. The trio runs from the
> deployed mirror, so this run may be executing text older than the file it is about to act on — and
> an advisory nobody repeats is not evidence a stage ran.

1. **Read the test-health ledger** (config `repo.ledgers.testHealth`) — the one central `T-N` ledger.
   Every trio and harvester run appends its flake observations there under the `LEDGER-CONVENTION`
   block (stated in pre-impl, impl and post-impl), so there is no per-plan sweep. **Skip placeholder
   entries** — a `What happened:` that is a template stub (`<…>`) or `…` is an example, not a real
   point. Friction blocks inside archived plans, where a repo has them, are never re-harvested.
2. **Collect every `### T-N` entry whose final `**Status:**` is `Open`.** Record each as
   `{T-N, Found provenance, test file · test name, what, recommendation, decision history}`.
3. **Two non-steps, stated explicitly so neither is re-added by analogy to the ROI track:**
   - **No expiry sweep.** `T-N` never expires. Age is not evidence a test stopped flaking, and the
     `Declined` verdict the sweep writes is not available on this track at all. **sdd-skill-improve**
     runs an expiry sweep (config `harvest.expiryDays`) over `F-N` only.
   - **No test-ROI ledger exclusion.** The ROI ledger answers *"is this test's time cost justified?"*
     and says **nothing** about determinism. A test recorded `Necessary` there is an ordinary flake
     candidate here — in the source repository the two most-recurrent flaky files were both recorded
     `Necessary`. Never let an ROI verdict suppress a flake.
4. **Cluster by test CASE — file + test name — then rank by recurrence.** The same case flagged across
   five plans is one problem seen five times, not five problems. Recurrence is the primary ranking
   signal — direct evidence of how often the flake costs someone a run. Break ties with severity
   (does it fail the build, or just run slow) and recency.

   > **Cluster on the case, never on the file alone.** A file can hold two unrelated flaky cases, and
   > merging them produces a resolution that is *false for one of them*. On this track's first live
   > run one integration file carried a headline case and a separate gridline case; clustering by
   > file marked six entries resolved with "the headline case was split", but two of those named the
   > gridline case, which the split never touched, and both had to be reverted to `Open`. Two entries
   > in one file naming different tests are **two clusters**, however similar their symptoms look.
   >
   > **And the converse: one case can carry two distinct root causes, and that is also two clusters.**
   > Two entries naming the **same** test look like an obvious merge — the one shape the warning
   > above does not cover. Measured on a later harvest: two entries named the same end-to-end case
   > and described **different** causes — a stale assertion after a deliberate product rename versus
   > serial-mode non-execution cascading from an earlier failure. The test is **cause**, not name:
   > split when two entries describe different mechanisms, join when they describe one — and say
   > which mechanism each cluster owns, so the split is auditable.

5. **Print the full ranked cluster table** as an actual Markdown table (never a prose or dash list,
   even for one or two rows):

   ```markdown
   | # | Test target | Suite | Sightings | Entries (T-N, …) | Span (oldest → newest) | Rank |
   |---|-------------|-------|-----------|-------------------|------------------------|------|
   | 1 | …           | …     | 5         | …                 | …                      | 1    |
   ```

6. **Every cluster is examined — there is no top-N selection step.** This is the one structural
   difference from the ROI track's Phase 1g, and it is deliberate. If the list is long, say so and
   work down it in rank order; the developer can stop at any point, and whatever is unresolved stays
   `Open` (never `Declined`).

If nothing is open, say so and stop — a clean harvest is a valid result.

## Phase F2 — Decide (flakes, per cluster, in rank order)

Run the grill interview (one question at a time, recommend an answer — the method pre-impl Phase 4
carries inline). Do **not** batch — settle one cluster before the next. **The output is a locked
decision, not an edit** — impl writes the fix from the plan Phase F3 produces.

> **A cluster's diagnosis is a permanent-record claim, so the `FALSIFIABILITY-GATE` applies** — stated
> in impl Phase 2 and pre-impl Phase 7, cited here, never restated. Mark each diagnosis
> **`observed`** (a reproduce run, a captured failure message) or **`inferred`** (read from the entry
> text plus a quick look), and carry the label into the plan. An inferred diagnosis reads exactly like
> an observed one once it reaches a locked-decision table; the reproduce-first gate below exists
> because that is where the wrong ones get committed to.

1. **Reproduce-first gate.** If the cluster names no runnable target — an aggregate ("seven
   pre-existing end-to-end failures") or an unidentified one ("unidentified UI test, full-suite run
   only") — you cannot diagnose it and you cannot close it, since `Declined` and expiry are both
   unavailable. Re-observe before anything else: **it identifies** → expand it into real per-test
   clusters and resolve those normally; **it won't reproduce** → close it `**Status:** Resolved
   <today> — not reproducible, N clean runs on <date>`, recording the command and run count.

2. **Diagnose the root cause before proposing a fix.** Common shapes, roughly by frequency:
   - **Real-time sleep standing in for a condition wait** (`setTimeout`, `sleep`, `Thread.Sleep`, a
     fixed-duration poll) — replace with an explicit wait on the actual condition (a `waitFor`, an
     event, a resolved promise/task) or the runner's fake timers so elapsed wall-clock is ~0.
   - **Ambient/host dependency** — the test assumes a live process, port, or host state that wasn't
     guaranteed stopped/started. Usually the *test* should mock or isolate the dependency.
   - **Order/isolation dependency** — shared mutable state (module-level singletons, statics,
     uncleared mocks, a shared fixture) leaking between tests. Fix with a per-test reset or isolation.
   - **Machine contention rather than the test** — a full-suite figure can be 20× the isolated one
     (the ROI track's Phase 1 caveat). Re-time in isolation before concluding the test is slow.
   - **Genuine non-determinism in the code under test** — rare; that is a real bug, and the
     resolution is the note in option 3c rather than a test redesign.

   **Deterministic production defect outcome.** If the same assertion fails deterministically because
   production behavior is wrong, it is **not a T-N flake**. Record a **product-defect finding** with
   the exact test, command, failure, and owning production surface; route it to pre-impl as bug work
   rather than redesigning or deleting a correct test. Existing T-N siblings remain Open until their
   actual flaky behavior is resolved.

3. **Propose a fix for every cluster**, then offer the ladder:
   - **a. Redesign the test** — the default and expected outcome. Deterministic and fast, asserting the
     same thing it asserted before.
   - **b. Delete the test** — **first-class, not a failure.** If a redesign can't make it deterministic,
     or the coverage isn't worth the redesign, deleting it is a legitimate fix: a flaky test is worse
     than no test. **The resolution MUST state what coverage is lost**, in the `**Status:**` line, so
     the deletion is an auditable decision rather than a quiet retreat.
   - **c. Resolve-with-note** — the production code itself is genuinely racy. Record where the real fix
     belongs; still remove any >59 s wait from the test.
   - **d. Deliberately deferred real defect** — the team confirms the production defect but chooses
     not to repair it this round. The evidence and exact target stay explicit in the plan and ledger;
     do not call the test fixed, redesign it away, or spend a deletion on hiding the defect. Its T-N
     semantics are unchanged: **never Declined**, **never expires**; it stays Open until the production
     fix or a valid test redesign actually resolves the observed flake.

   **Banned as resolutions — these are what produced the backlog in the first place:**
   - ❌ **Raising a timeout** (a 10 s process wait → 30 s) or **widening a `waitFor` budget** — it
     converts a fast failure into a slow one and resolves nothing.
   - ❌ **Skip / todo / quarantine** — "no test" that still costs suite time and still looks like
     coverage; strictly worse than deleting it.
   - ❌ **`Decline`** — not available on this track. Every flake gets a fix; "not worth fixing" is an
     argument for **delete**, option b.

4. **Record the locked decision** — the chosen rung (a/b/c/d) or the deterministic-product-defect
   route, the specific change or exact product-defect finding, the exact entry list (`T-N`, …),
   which entries remain Open versus have their `**Status:**` lines flipped, and whether it needs a
   test-ROI ledger row. Nothing is edited here. A deterministic production defect records a bug-plan
   subject rather than pretending a correct test needs redesign or deletion; rung d retains the
   evidence and exact target without promising a clean run.
5. Move to the next cluster. **Uncapped** — the decision pass ends when the open set is empty or the
   developer stops it. Anything undecided stays `Open`; never `Declined`.

## Phase F3 — Hand off to pre-impl, then STOP

Invoke the **pre-impl** skill with the decided clusters as the subject.

### The branch slug is DERIVED, not invented

A harvester run has no natural topic name — its subject is "whatever ranked top this time" — so the
slug is **mechanical**: `<skill-name>-<YYMMDD><letter>` in the feature-branch pattern (config
`repo.branches.feature`), e.g. `test-improve-260814b`. Derive it before invoking pre-impl and pass it
as the branch to use: `node scripts/sdd/harvest.mjs slug --skill test-improve --json`.

**The letter is a uniqueness device, not an ordering.** It guarantees two runs never collide on a
name; it does **not** order a day's runs across the two harvesters — the script hands out the lowest
*unused* letter, unrelated to when a run started, and the earlier claim that it ordered them was
measured false. The `YYMMDD` prefix already orders by day.

The script consults **four sources**, each closing a gap the others leave: **branches** (local and
remote) miss a run whose branch was deleted on merge; **both plan directories** (config
`repo.docs.plans` and `repo.docs.artifacts`), because a day's earlier run may already be archived;
and **every plan path git has ever seen added** (`git log --all --name-only --diff-filter=A` over
both folders), the only source that survives a plan being renamed or deleted after merge — a letter
cannot be quietly freed by tidying a directory. A real run scanned clean and returned `a`, which a
merged PR had already consumed that morning. Prefixes are config `harvest.slugPrefixes`. **Never
substitute commit *subjects* for that fourth source** — squash-merge subjects are PR titles, which
name the skill but never carry the slug; over 400 commits of the source repository, **zero** matches.

The plan filename follows pre-impl's own convention: `<repo.docs.plans>/YYYY-MM-DD-<slug>.md`.
**Use the LOCAL date, not UTC.** The plan's filename prefix and the commits it ships are both local,
so a UTC slug disagrees with both for the hours either side of midnight — the straddle post-impl
already documents. Story IDs are UTC by their own convention; the two answer different questions.

The subject arrives **pre-grilled** — the reproduce gate, the diagnosis and the ladder already
converged it — so pre-impl's grill (Phase 4) has nothing left to settle and its grounding-phase
reproduce step is satisfied by step 1's re-observation. Pre-impl still owns the sync, the branch,
the plan file, and the local plan commit (config `repo.commits.plan`).

**The generated plan MUST carry all four of these**, or the fix ships incomplete. It must explicitly
separate **fix deliverables from product-defect/deferred evidence**:

1. **The ranked cluster list from Phase F1**, in the plan's Context — the evidence for what was chosen.
2. **The deliverable**, per cluster. For an actual flakiness fix: the test file, rung a/b/c, and the
   exact redesign/delete/note edit — a **delete MUST state what coverage is lost**. For a
   deterministic production defect: an **exact product-defect finding/bug-plan subject** with the
   test, command, failure, owning production surface, and expected repair — never a redesign or
   deletion of the correct test, never a relabel of the deterministic failure as a fixed flake. For
   deferred rung d: the evidence and exact target; no test edit whose purpose is to hide it.
3. **Status handling, listed per entry** (`T-N`), cross-referencing cluster siblings: **status flips
   and 3-consecutive-clean verification apply only to actual flakiness fixes** (rungs a/b/c). For a
   deterministic product defect or deferred rung d, leave every affected T-N Open and carry the
   evidence forward. For a real fix, change **only** the `**Status:**` line, never delete an entry or
   reword its prose; an unmarked sibling resurfaces next run as if the cluster were still open. Add a
   test-ROI ledger row (config `repo.ledgers.testRoi`) **only if the fix deletes a test or materially
   moves its runtime** — otherwise no ROI row; one fact, one home.
4. **Verification, stated as a number rather than the word "fixed":** for an actual flakiness fix,
   re-run the specific test enough times to be confident — **minimum 3 consecutive clean runs** — and
   confirm no wait or timeout in it exceeds 59 s. The plan records the shape (*"3/3 clean, longest
   wait 1.8 s"*); impl fills in the actual figures. A deterministic product defect or deferred rung d
   has **no clean-run requirement** until a production repair or valid test redesign exists; its
   verification is the preserved exact reproduction/evidence, not a manufactured green run.

   > **Hard constraint, non-negotiable: no test may sleep, await, or time out for longer than 59
   > seconds.** A plan that leaves one in place, however justified, is not done.

**Then STOP** and hand off:

> **Next:** review the plan under the plans folder, then run **impl**: for actual flakiness fixes it
> applies the test edits and listed `**Status:**` flips; for deterministic product defects or deferred
> rung d it carries the bug/evidence deliverable without hiding the correct test and leaves every
> affected T-N Open. Then run **post-impl** to publish.

# Track B — the ROI track

## The judgment model (4 buckets — no numeric scoring)

Time is directly measurable; "does this test actually catch a real regression" is not. Classify each
candidate — don't score it:

- **Necessary** — a genuine integration/trust-boundary test where the cost *is* the point (real
  process spawn, real file I/O across a public contract, a real timeout genuinely exercised). No
  edit. Record the verdict so it isn't re-flagged.
- **Slow-but-fixable** — the *same coverage* is achievable faster: a real-timeout wait that could use
  a fake clock, real file I/O that could use an in-memory fake, an expensive fixture (a large string,
  a rendered report) built N times that could be built once and asserted N ways. **The highest-value
  bucket** — full coverage retained, time cost removed.
- **Redundant** — multiple parameterized rows, or near-identical test methods / `it(...)` blocks,
  asserting materially the same thing with no distinct failure mode. Candidate to consolidate — keep
  whichever case(s) actually differ in outcome.
- **Testing the framework, not the code** — the assertion never calls into production logic (the
  files under config `repo.sourceGlobs`): a plain data object round-trips, a DI registration exists,
  a config object has the property you just set. Candidate to delete outright.

This is prose guidance for the agent's own judgment, not a coded formula — the stance
**sdd-skill-improve** takes on its cluster ranking.

## Phase 1 — Scan

**1a. Skip anything already judged.** Read the test-ROI ledger (config `repo.ledgers.testRoi`) if it
exists (Phase 2 step 6 has its shape). Any test already listed there — by fully-qualified name, or
`<file> :: <test name>` for file-based runners — is excluded from this run's candidate set. This is
what keeps repeat runs cheap: a "Necessary" verdict from three runs ago still counts today.

**1b. Time the suite — through the adapter named by config `repo.testRunner`.** Build first with
`repo.commands.build`; the `SUITE-DENOMINATOR` block in impl states the rules for a trustworthy run
(a quiet machine, no concurrent layers, the total read before the verdict) — cite it, never restate
it. **Stop any dev server or host the profile document names before building** (config
`repo.ui.devServer` when set): a live host can lock a build output, fail the build, and let a
`--no-build` test run report a clean but *stale* pass.

- **`dotnet` adapter.** Run `repo.commands.test` with a trx logger appended:
  `--logger "trx;LogFileName=test-improve-scan.trx" --results-directory <scratch-dir>`. Parse the
  `.trx`'s `<UnitTestResult testName="..." duration="HH:MM:SS.ffffff">` entries into
  `{name, seconds}`. These are per-test durations rather than wall-clock spans, so far less prone to
  contention inflation — but a loaded machine still skews them.
- **`vitest` adapter.** Run `repo.commands.test` with
  `-- --reporter=json --outputFile=<scratch-dir>/test-improve-scan.json` — through the configured
  command, so the project's own vitest config loads; a bare `npx vitest` from the wrong directory
  loads no config and fails everything with `document is not defined`, which is not a result. Parse
  `testResults[].assertionResults[]` (or `startTime`/`endTime` per `testResults[]` entry for
  file-level timing) into `{file, name, seconds}`. Any install or registry-auth precondition the
  profile document lists is satisfied first; an install failure is infrastructure, not a finding.
- **`generic` adapter.** No per-test timing: time the **whole suite only** (wall clock around
  `repo.commands.test`) and find candidates from the structural signals in 1d alone. The report says
  "structural candidates only" — never a clean timing pass.

> **Full-suite wall time FINDS candidates; it must never JUDGE them.** A per-file `startTime`/`endTime`
> measures elapsed clock while every other file competes for the same cores, conflating the test's
> own cost with machine load. Measured in the source repository: the largest figure in the suite was
> a 20× inflation of that test's actual body time, while a genuinely slow file ranked *below* it —
> ranking on the raw figure would have optimised a fast test and ignored the slow one. So before
> classifying **any** wall-clock-timed candidate in 1e, **re-time it in isolation** (config
> `repo.commands.testFilter` with `{filter}` substituted, or the runner's single-file form) and judge
> on the runner's own per-test figure (vitest's `tests` line in its `Duration` breakdown — not the
> total, which also carries `environment` and `setup`). Two corollaries, learned the same day:
> - **Check the machine is quiet first.** Orphaned dev servers and stuck test workers from earlier
>   sessions accumulate and silently inflate setup/environment time several-fold. A worker that fails
>   to start is **infrastructure, not a test failure** — do not change code; clear the processes.
> - **Report before/after from an interleaved B/A/B/A run on an idle machine.** A single pair drifts
>   enough to be wrong: the same change measured 43% one moment and 59% minutes later.

**1c. Apply the scope.** Drop every result under a path the profile document excludes from ROI scans,
and — when `$ARGUMENTS` carries a path — everything outside it. Say what was dropped and why.

**1d. Flag candidates** from the parsed timing plus two structural signals (grep/read, not full
semantic analysis):

- **Slow-test threshold** — top N by duration, or anything meaningfully above the suite's own
  baseline (most unit-style tests run well under 10 ms — treat anything **≥ 250 ms** for a
  unit-style test as worth a look, and let genuinely integration-shaped tests explain themselves via
  the Necessary bucket rather than tuning the threshold per-suite).
- **Redundancy** — a test class or file with several parameterized rows, or several test methods /
  `it(...)` blocks, sharing near-identical setup and assertion shape.
- **Testing-the-framework** — a test file where no test body's call graph reaches production code
  (config `repo.sourceGlobs`) — grep the `using`/`import` lines and the calls inside the test body,
  not just the file's location.

**1e. Classify each flagged candidate** into one of the 4 buckets above, from what the test's code
actually does (open the file — timing and grep signals only *find* candidates, they don't judge them).
**When several tests share one root cause** (three tests each paying the same uncached-fixture cost),
present them as **one clustered candidate** — one row in the 1f table, one decision in Phase 2 —
mirroring **sdd-skill-improve**'s clustering. **When a verdict is genuinely file-level** (cost spread
evenly across many ordinary tests, none pathological) record the *file* as the candidate rather than
forcing a per-test judgment you have no evidence for.

**1f. Print the full ranked candidate table** — every flagged candidate, not just the ones selected —
as an actual **Markdown table** (never a prose/dash list, even for a short list):

```markdown
| # | Test | File | Suite | Bucket | Time | Look-back | Why flagged |
|---|------|------|-------|--------|------|-----------|-------------|
| 1 | …    | …    | …     | …      | 8.5s | …         | top-3 slowest; builds and escapes a large fixture 3× |
```

**1h. Look back before selecting — do not thrash.** A test "fixed" twice already is evidence the
diagnosis was wrong both times, not that it needs a third pass of the same kind. Before printing the
table, run `git log -n 5 --date=short --format='%h %ad %s' -- <candidate test file>` and record the
answer in the `Look-back` cell:

- **Recently changed by a harvester run?** Re-read the test as it stands now. If a prior fix already
  did what this candidate proposes, it is stale — say so and drop it rather than re-timing it.
- **Changed repeatedly?** Two or more prior fixes to the same test means the *root cause was never
  the test*. Escalate to the resolve-with-note rung (production code) rather than proposing a third
  redesign, and say that is why.
- **The test-ROI ledger already carries a verdict?** Phase 1a excludes those, but a row added by the
  **flake** track (a delete, or a materially-moved runtime) can arrive between runs — re-check here.

**1g. State the top 5** (ranked primarily by time cost within the Slow-but-fixable and Redundant
buckets, where fixing something actually returns time; Necessary and Testing-the-framework candidates
by how confidently they're classified) and offer a lightweight override — *"here are the 5 I'd
resolve this run — swap any for a different one from the table?"* — the same convention as
**sdd-skill-improve**'s top-N offer.

If nothing survives Phase 1 (Phase 1a excluded everything, or nothing was flagged), say so and stop —
a clean scan is a valid result.

## Phase 2 — Decide (the 5 selected, one at a time)

For each of the 5 selected candidates, in order, run the grill interview (one question at a time,
recommend an answer). Do **not** batch — settle one candidate before the next. **The output is a
locked decision, not an edit** — impl writes the fix from the plan this phase hands off.

1. **Present** the candidate: its bucket + evidence (the timing, the redundant-case list, or the
   "never touches production code" finding), and which file/test it targets. The evidence is a
   permanent-record claim: the `FALSIFIABILITY-GATE` applies exactly as in Phase F2 — label it
   `observed` (an isolated re-time, an opened file) or `inferred`.
2. **Offer resolution options** (grill discipline): **Apply** — the plan edits the test file per the
   bucket (below); **Resolve-with-note** — the real fix is out of scope for a pure test edit (the code
   under test must change to make a faster test possible); record where it belongs, never edit
   production code here; **Decline** — not worth acting on this run; capture the reason. Recommend
   **Apply** for Slow-but-fixable and Testing-the-framework (usually mechanical); more cautiously for
   Redundant (real judgment about which case(s) to keep); Necessary candidates just get recorded.
3. **Record the locked decision** — the bucket, the specific change, and the ledger row it will
   produce. Nothing is edited here; the plan carries it.
4. **What the plan will apply**, per bucket:
   - **Necessary** → no edit.
   - **Slow-but-fixable** → replace the real wait/I-O with a fake/mock, or de-duplicate a repeated
     expensive setup, **without changing what the test asserts**.
   - **Redundant** → consolidate parameterized rows or delete a duplicate method / `it(...)`, keeping
     every case that produces a **distinct** outcome. This bucket is the most likely to lose real
     coverage — read what each removed case actually varied before deleting it, not just that it
     "looks similar."
   - **Testing-the-framework** → delete the test outright.
5. **What the plan's Verification must require** — the **actual result**, not "fixed":
   - Slow-but-fixable → re-run the specific test; report **before → after time** from an interleaved
     run on a quiet machine, and confirm it still passes with the same assertions.
   - Redundant → re-run the surviving test(s) in that class/file; confirm they're still green and
     state which distinct case(s) each retained one now covers.
   - Testing-the-framework → re-grep the deleted test's assertion for any reference to production
     types/methods you might have missed, and pass the new expected total to the suite runner
     (`--expect-total`, per `SUITE-DENOMINATOR`).
   - Necessary → nothing to verify; the verdict itself is the outcome.
6. **The plan records the verdict** as a new row in the test-ROI ledger (config
   `repo.ledgers.testRoi`; created with a header row if absent) — a plan deliverable, since the
   ledger is a tracked file:

   ```markdown
   | Test | File | Bucket | Verdict | Date | Note |
   |------|------|--------|---------|------|------|
   | <test name> | <test file> | Slow-but-fixable | Fixed <date> — built the fixture once, asserted 3 ways; 4.2s → 0.2s | <date> | — |
   ```

   Verdict vocabulary mirrors the friction ledger's: `Necessary` /
   `Fixed <date> — <what changed, before→after time>` /
   `Redundant-removed <date> — <what was kept and why>` / `Noted <date> — <where the real fix belongs>`
   (Resolve-with-note — worth acting on, but outside this skill's test-only editing scope) /
   `Declined <date> — <reason>` (not worth acting on at all — distinct from `Noted`, never conflate).

   **A clustered candidate** (1e) gets **one row per underlying test**, each cross-referencing its
   siblings in the Note column — not one merged row, so a future scan's per-test exclusion (1a) still
   works. **A file-level candidate** gets **one row for the file**, the Test column naming it as such
   (`(all 28 tests)`) and the Note stating the aggregate timing — never 28 fabricated judgments.
7. Move to the next of the 5. **Every other flagged candidate from the Phase 1 table stays
   unrecorded**, so it's a fresh candidate next run — not forgotten and not falsely marked Declined.

**Then hand off to pre-impl and STOP**, exactly as the flake track's Phase F3 does — same derived slug
(`slug --skill test-improve`), same plan path: the plan carries the Phase 1 candidate table (the
evidence), the per-bucket edits, the test-ROI ledger rows, and the per-bucket verification above.
Running **both** tracks in one invocation (`all`) produces **one** plan — one branch, one review.

## Phase 3 — Verify and report

> **This phase belongs to the ROI track's *measurement*, not to applying a fix.** The suites are
> re-run here so the report can state a real before→after for the run's timings; the *edits* those
> timings will reflect are applied by impl from the plan. On a decision-only run the baseline stands
> as the report's figure, and the plan carries the re-run as its own Verification step.

**3a. Full-suite re-run** (once at the end, not per-candidate): `node scripts/sdd/suite-run.mjs --json`.
It builds with `repo.commands.build`, runs `repo.commands.test`, and parses by the `repo.testRunner`
adapter; act on its `verdict` per `SUITE-DENOMINATOR` — a terminated runner or a denominator mismatch
is a failed run, never a baseline. Report the actual pass/fail counts and the suite's new total
timing, compared against this run's Phase 1 baseline.

**3b. Print the report:**

```markdown
## Test Health Harvester

### Flakes resolved (T-N — every open cluster)

| # | Test target | Sightings | Root cause | Resolution | Verified | Entries marked | ROI row? |
|---|-------------|-----------|------------|------------|----------|----------------|----------|
| 1 | …           | 5         | …          | Redesign / Delete / Note / Deferred | 3/3 clean, longest wait 1.8 s | T-1, … | yes/no |

### Candidates found (this run)

| # | Test | Suite | Bucket | Time | Selected? |
|---|------|-------|--------|------|-----------|
| 1 | …    | …     | …      | …    | ✅ (or: not selected) |

### Resolved this run (up to 5)

| # | Test | Bucket | Resolution | Verified | New ledger row |
|---|------|--------|------------|----------|----------------|
| 1 | …    | …      | Apply / Resolve-with-note / Decline | 4.2s → 0.2s | <repo.ledgers.testRoi> |

### Suite totals

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| <each suite the profile document names> | … | … | … |
```

The **Candidates found** table always lists everything Phase 1 flagged, not just the selected 5 — so
nothing silently vanishes from view even though it wasn't touched this run. Omit a track's section
when that track didn't run (say which in prose), and print the **Flakes resolved** table even when a
cluster ended in Delete — especially then, since the coverage lost is the part worth reading. Under
the `generic` adapter the Time column reads `n/a (structural)` and Suite totals carries wall time only.

## Guardrails

### Flake track (`T-N`)

- **A `T-N` is never `Declined` and never expires.** It stays `Open` until the test is redesigned,
  deleted, or its racy production code is noted. "Not worth acting on" is an argument for **delete**.
- **Banned as resolutions:** raising a timeout, widening a `waitFor`, skip/todo quarantine. Each
  leaves the flake in the suite while making the record look closed.
- **Delete is legitimate, but never silent** — the `**Status:**` line states what coverage is lost.
- **An end-to-end suite is in scope for this track**, though never for the ROI scan when the profile
  document excludes it; a `T-N` needs no discovery run.
- **The test-ROI ledger never suppresses a flake candidate.** `Necessary` is a verdict about time
  cost, not determinism. An ROI row is written only when a flake fix **deleted** a test or
  **materially moved its runtime**.
- **A cluster's plan lists every entry it comprises**, cross-referencing siblings — an unmarked one
  resurfaces next run as if the cluster were still open; the entry list is a plan deliverable.
- **Never touch an `F-N` entry** — that is **sdd-skill-improve**'s track, exactly as `T-N` is not its.
- **This track never edits test source, and never commits.** It produces a plan; impl applies it. A
  redesign that looks small enough to "just do here" is exactly the instinct this rule stops —
  deleting a test with no branch and no review is the outcome it prevents.

### ROI track

- **Never delete or edit a test's assertions to make it pass faster** — a Slow-but-fixable fix removes
  *time cost*, never *coverage*. If the only way to speed a test up is to assert less, that candidate
  is Necessary, not Slow-but-fixable — say so and don't force it.
- **The Redundant bucket gets the most scrutiny** — it's the one place a real coverage regression can
  hide behind "these look the same." Read what varies before consolidating, every time.
- **The test-ROI ledger is append-only** — never delete or reword a prior row; a test whose situation
  changes later gets a **new** dated row, not an edited old one.
- **A candidate not selected in the top 5 stays unrecorded** — never write a ledger row for it just
  because it appeared in the Phase 1 table; recording without resolving suppresses it from every
  future scan.
- **Never scan a path the profile document excludes from ROI scans** — out of scope by design, not by
  oversight; a suite that cannot run yields a misleading zero.
- **No numeric scoring formula** — bucket judgment is the agent's read of what the test actually does,
  the stance **sdd-skill-improve** takes on its own cluster ranking.
- **This track never edits test source or the ledger, and never commits.** It produces a plan; impl
  applies it. Measuring is a read, so the Phase 1 timings and Phase 3 suite re-run happen here.
- This skill may **plan a change to itself** when a rough edge in its own instructions surfaces while
  running it — put it in the plan and let impl apply it, under **sdd-skill-improve**'s SIZE-RULE;
  don't file a friction entry for it in the same run that found it, and don't hand-edit it mid-run.
