---
name: tdd
description: Test-driven development in vertical red-green-refactor slices using the repository's own test conventions, reference tests and fakes named in its profile document. Use when building or fixing a feature test-first, or when the user mentions "red-green-refactor", test-first, tracer bullet, or integration tests.
user_invocable: true
version: 1.0.1
# ⚠️ IMPORTANT: When editing this file, increment the patch version above (e.g., 1.0.0 → 1.0.1).
---

## Test-Driven Development: $ARGUMENTS

This is the single TDD skill for this repo: the general red-green-refactor *philosophy* plus the *mechanics* of applying it here. The philosophy is in this file and its companions; the mechanics (test categories, reference test files, fakes, scaffolding shape, runner gotchas) come from the repository's profile document. **First step of every run:** read `skills/sdd.config.json` and the profile document (config `repo.docs.profile`), and state the resolved build and test commands you will run.

## Philosophy

**Core principle**: Tests should verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

**Good tests** are integration-style: they exercise real code paths through public APIs. They describe _what_ the system does, not _how_ it does it. A good test reads like a specification - "user can checkout with valid cart" tells you exactly what capability exists. These tests survive refactors because they don't care about internal structure.

**Bad tests** are coupled to implementation. They mock internal collaborators, test private methods, or verify through external means (like querying a database directly instead of using the interface). The warning sign: your test breaks when you refactor, but behavior hasn't changed. If you rename an internal function and tests fail, those tests were testing implementation, not behavior.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Anti-Pattern: Horizontal Slices

**DO NOT write all tests first, then all implementation.** This is "horizontal slicing" - treating RED as "write all tests" and GREEN as "write all code."

This produces **crap tests**:

- Tests written in bulk test _imagined_ behavior, not _actual_ behavior
- You end up testing the _shape_ of things (data structures, function signatures) rather than user-facing behavior
- Tests become insensitive to real changes - they pass when behavior breaks, fail when behavior is fine
- You outrun your headlights, committing to test structure before understanding the implementation

**Correct approach**: Vertical slices via tracer bullets. One test → one implementation → repeat. Each test responds to what you learned from the previous cycle. Because you just wrote the code, you know exactly what behavior matters and how to verify it.

```
WRONG (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical):
  RED→GREEN: test1→impl1
  RED→GREEN: test2→impl2
  RED→GREEN: test3→impl3
  ...
```

## Coverage stance

- **Lean and prioritized.** You can't test everything. Test the critical paths and the behavior that actually matters for this feature — not a fixed checklist of every conceivable case.
- **One always-on rule:** assert the **boundary call the profile document names as the one always-on assertion** (for a CLI that talks to a service, typically "the command reached the right endpoint"; for a data layer, "the right query or write was issued"). A unit's whole job is usually "inputs → right boundary call → format the result," so that call *is* observable behavior, and an output-only test can pass while doing the wrong thing at the boundary. This is boundary-scoped (the fake at the boundary is the only interaction seam; we never mock internal collaborators), so it does not violate the "don't assert on internal collaborators" rule below.
- **Runner gotchas — apply when the code path is relevant** (not as a blanket minimum): the profile document lists the runner gotchas for this stack (the known ways a test passes for the wrong reason, hangs, or parses a value under the wrong type). Read that list in Phase 1, note which apply to the feature, and fold each relevant one into the behavior test that exercises that path.

## Output Style

- Brief phase indicators between tool calls: "Planning…", "Slice 2: happy path…", "Grinding slice 3 (cycle 2)…".
- Do NOT narrate what each file read/edit does, and don't add filler ("Let me now…", "Good, that worked…").

---

### Phase 1 — Planning & Discovery (read-only)

**Goal:** understand the feature and absorb existing patterns before writing code. Vertical work still starts from shared understanding of *which behaviors matter* — not a full test suite.

**1a. Parse `$ARGUMENTS`.** Identify: the area of the codebase (the profile document names the areas or modules and how tests are grouped by them); whether this is a **new unit** (a new command, module, endpoint, component) or a **modification** of an existing one; and the boundary call(s) the feature will make (the always-on assertion above).

**1b. Read reference tests** to absorb conventions (read at least TWO): the reference test files the profile document names, or another test file in the same area. Extract from them the conventions you MUST follow exactly — the profile document states them (fixture and field naming, how the unit under test is constructed, how it is invoked, which assertion library, how test payloads are built). Follow those conventions, not the ones you know from other repositories.

**1c. Read the fakes** the profile document names (the test doubles at the system boundary: what they record, what they can be told to return or throw). These are the only interaction seam a test may assert through.

**1d. For a NEW unit**, also read the base class or module shape the profile document names for that kind of unit, an existing unit of the same kind in the same area, and its settings/options/props type if the stack has one.
**1e. For a MODIFICATION**, read the unit's source file, its existing test file, and its settings/options/props type if any.

**1f. Agree the behavior list (the plan gate — skippable).** Following the general planning checklist ([deep-modules.md](deep-modules.md), [interface-design.md](interface-design.md)):
- [ ] Confirm the public interface / options shape.
- [ ] List the **behaviors** to test in priority order (behaviors, not implementation steps).
- [ ] Note which runner gotchas from the profile document are relevant.

Present that list and get a quick nod. **Skip the gate when the shape is obvious** (a templated unit whose behaviors you already know cold) — don't turn it into ceremony.

---

### Phase 2 — Tracer bullet, then the incremental loop (vertical)

Work **one behavior at a time**. Never write the next test until the current one is green.

**2a. Tracer bullet.** Write ONE test for the first, most fundamental behavior (usually the happy path) and drive it to green — this proves the path end-to-end (test file compiles or loads, wiring resolved, boundary reached, output produced).

**2b. Incremental loop.** For each remaining behavior from the plan list:
```
RED:   write the next single test → it fails
GREEN: minimal code to pass → it passes
```
Rules:
- One test at a time. Only enough code to pass the current test. Don't anticipate future tests.
- Keep tests on observable behavior (see [tests.md](tests.md)).
- Fold the boundary-call assertion into the relevant behavior test — it's an assertion style, not a separate test.

**2c. Autonomous execution *within* a slice.** Driving a single test red→green is hands-off — don't stop for input mid-slice. Grind up to ~10 build-test-fix cycles on that one behavior, then break to the human only if stuck:

```
per behavior:
  loop (max ~10 cycles):
    BUILD:  run the build command (config `repo.commands.build`)
            build fails → fix SOURCE (not the test), next cycle
    TEST:   run the filtered test command (config `repo.commands.testFilter`, with {filter}
            substituted by the test class/file/name pattern for this behavior);
            when testFilter is null, run the full test command (config `repo.commands.test`)
            pass → behavior done, go to next behavior
            fail → read expected-vs-actual, fix IMPLEMENTATION (not the test), next cycle
    stuck on the same failure 3 cycles, or hit the cap → surface to the human
```
Common failures → fixes:

| Symptom | Usual cause → fix |
|---|---|
| Null/undefined reference inside the unit under test | a dependency not wired, or a fake left uninitialized → wire it or initialize the fake |
| A value parsed under the wrong type (string vs number, etc.) | the parser assumed one representation → read the raw value with the right accessor, and keep the test payload realistic |
| The unit reports a missing required input instead of running | the test did not set the option/setting → set it in the test, not by relaxing the unit |
| Wrong exit/error code or error type | exception handling maps the wrong exception → check which exception is thrown and which handler catches it |
| The test hangs | the unit waited for interactive input or a non-terminating stream → the fake must default to non-interactive; see the profile document's runner gotchas |

**Never modify a test to make it pass** — tests are the spec. The only exception is a genuine test defect (typo, a constant that contradicts the feature description). **Never refactor while RED** — get to green first.

**Scaffolding a NEW unit** follows the profile document's shape (do this as part of the tracer-bullet slice, just enough to compile or load): the base class or module template, the settings/options/props type with its required members, the dependencies to accept, the members to implement, and where the unit must be registered (a command tree, a router, an index, a DI container). Do not invent a shape; if the profile document does not describe one for this kind of unit, copy the nearest existing unit of the same kind and say so in the summary.

---

### Phase 3 — Refactor (only when GREEN)

After the behaviors are green, look for [refactor candidates](refactoring.md):
- [ ] Extract duplication
- [ ] Deepen modules (move complexity behind simple interfaces)
- [ ] Apply SOLID where natural
- [ ] Consider what the new code reveals about existing code
- [ ] Run tests after each refactor step

**Per-cycle checklist:** test describes behavior not implementation · uses the public interface only · would survive an internal refactor · code is minimal for this test · no speculative features.

---

### Phase 4 — Summary & follow-ups

Report:

```markdown
## TDD Summary

**Feature**: {from $ARGUMENTS}
**Commands**: build `{resolved repo.commands.build}` · test `{resolved repo.commands.test}`
**Tests**: {count} in `{test file}` — {one line each}
**Files created/modified**: {path (new|modified)}
**Result**: {ALL PASS | N still failing}
{if failing} **Unresolved**: {test — suspected root cause}
**Gotchas applied**: {which runner gotchas from the profile document were relevant}
```

**Confirm no regressions** — run the full suite once (unfiltered) with the test command (config `repo.commands.test`), running the build command first when the test command does not build on its own. Report any pre-existing test that broke.

**Change checklist.** If a user-facing surface was added, removed, renamed, or changed (a command, subcommand, argument, flag, endpoint, exported API), remind the user to work through the change checklist, when config `repo.docs.changeChecklist` is set — it names every surface that must be updated and is kept current in one place rather than restated here. When that key is null, say "change checklist: not configured" and list the surfaces you believe are affected instead.
