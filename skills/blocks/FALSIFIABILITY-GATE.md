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
