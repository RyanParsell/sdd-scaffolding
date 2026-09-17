# Scrub references to other projects from tracked files

**Branch:** feature/scrub-project-references
**Type:** Feature
**Tags:** `area:seed-content`
**Date documented:** 2026-09-17

## Context

The seed was lifted from an earlier project on 2026-09-16 and generalized. The port left that
project's name, its local checkout path, its version numbers and a second product's name (used as a
sample config) in tracked files. Most of them sit under `seed/`, so `sdd deploy` copies them into
every target repository, where they point at code the target can't see.

**This plan names neither project on purpose.** The plan is archived to `docs/artifacts/` and becomes
permanent, so naming the projects here would put back exactly what the plan removes. Below, **the
origin project** is the repository the seed was lifted from, and **the sample product** is the name
used in the architecture doc's example config. The verification greps match the names through
character classes (`w[e]xpert`, `f[i]nops`), so this file never contains either literal.

**Measured on `main` @ 389d28f (observed, 2026-09-17).** `git grep -nIi -e 'w[e]xpert' -e 'f[i]nops'`
returns **35 lines in 18 files**:

| Where | Lines | What |
|---|---|---|
| `skills/{pre-impl,impl,post-impl,sdd-skill-improve,test-improve,tdd}/SKILL.md` + the same six under `seed/skills/` | 1 hit per file, 12 in total | A provenance note (a 1–5 line blockquote, italic paragraph or plain paragraph near the top) naming the origin project and its skill version |
| `scripts/sdd/suite-run.mjs:231` + seed copy | 2 | JSDoc: "Kept under its <origin> name for callers…" |
| `scripts/sdd/tests/suite-run.test.mjs:14` + seed copy | 2 | Section comment: "the <origin> parser, verbatim" |
| `docs/sdd/sdd-scaffolding-architecture.md` | 18 lines: 8 for the origin, 10 for the sample product | The origin's name and its local checkout path in the intro (9–10); "Same convention as <origin>" (142); the "What was stripped in the port" section, including a list of the origin's own product wiring (168–172); script-table notes (205–206); and the sample-product name all through the example config (71–120) |
| `README.md:28` | 1 | **Human-authored — out of scope for impl** (see *Developer action*) |

The first commit message (`21b3f2a`) also names the origin project. **Git history is not rewritten.**

**Seed parity (observed).** Apart from `seed/skills/sdd.config.template.json` (which only exists under
seed), every file under `seed/skills/` and `seed/scripts/sdd/` is byte-identical to its root copy.
That has to stay true.

**Constraints the change must respect (read from the tree):**
- **SIZE-RULE.** `sizeBudgetBytes` in `skills/sdd.config.json` equals each skill's current
  CR-stripped size exactly (pre-impl 69514, impl 75299, post-impl 79007, sdd-skill-improve 18392,
  test-improve 42256, tdd 12255). Budgets only go down: a change that shrinks a skill lowers its
  budget to the new measured size in the same commit.
- **Version bump.** Each skill's frontmatter says to increment the patch version on any edit
  (`1.0.0` → `1.0.1`, the same byte length).
- **Upgrade manifest.** `scripts/sdd/.seed-manifest.json` records a hash per script. `sdd upgrade`
  compares against it, so editing `suite-run.mjs` and its test means refreshing the manifest here in
  the self-hosted repo.
- `parseTestOutput` is a public alias; only its comment changes, not the export name.
- The harvester skills' note ends with a sentence that is **not** provenance and stays: "This copy is
  the target repository's own[: improve it here, through its own harvest]."

**Grounding.** Config and profile read (the profile is still all `TODO`). SDD: architecture doc read
in full (it is the subject); PRD, stories and project structure are still unfilled skeletons. No open
`F-N` against pre-impl, no epics, no archived plans, no other branches. Baseline suites on `main`:
doc tests **178/178**, CLI tests **4/4** (observed this run).

**Area.** The tag vocabulary and the stories doc had no areas. This plan's commit declares the first
one, `area:seed-content` → `## Area: Seed content`, so the plan's `**Tags:**` header can pass the
doc meta-tests.

## Locked decisions

| # | Decision |
|---|---|
| 1 | **Delete** the provenance note from all six skills (root and seed). Don't replace it with neutral wording. The generalization rule it restated is already in the architecture doc. Keep the harvesters' "This copy is the target repository's own…" sentence. |
| 2 | **Rewrite generically** the architecture doc's "What was stripped in the port" section. Keep the rules (ledger-entry ids from the source are not carried over, and their lessons stay in the text; a source product's own wiring is not part of the seed; any concept that survives generically is driven by the config or the profile document; the listed disciplines survive unchanged). Drop the named product-wiring items. Remove the origin's name and local path from the intro, and reword lines 142 and 205–206 so they name no project. |
| 3 | The sample config uses **`myapp`**: `"name"`/`"product"` `myapp`, `tests/MyApp.Tests`, `docs/sdd/myapp-*.md`. The example keeps its dotnet flavor. |
| 4 | **No guard test.** This is a one-time scrub; a denylist test would have to contain the words it bans, and it would ship to targets. |
| 5 | `README.md` is not edited (it is human-authored). The replacement wording is proposed under *Developer action*. |
| 6 | Git history is not rewritten. |
| 7 | Classification: **Feature** (a content change to the shipped seed, not a restored defect; when in doubt, feature). |

## Build strategy

Non-UI (`repo.ui` is null, so there is no MSU phase). Three **independent work units**. They touch
disjoint files, so they could fan out, but together they are about 20 small edits, so run them
**sequentially in the primary tree**. One `feat` commit at the end.

### Per-work-unit execution contract (shared by all three units)

- **Execution mode:** sequential primary tree.
- **Base ref:** the tip of `feature/scrub-project-references` after this plan's `docs(plan)` commit.
- **Coordinator-owned shared files:** `skills/sdd.config.json` (WU1 only), `scripts/sdd/.seed-manifest.json` (WU2 only).
- **Seam owner:** none. No unit reads another's output.
- **Before/after diff checks:** V1–V3 below, scoped to the unit's files.
- **Stop conditions:** a root copy and its seed copy would differ after the edit; any `-` line in the
  skill diff that isn't part of a provenance note or the version line; the doc-test count drops below
  178 or a CLI test fails; `sdd upgrade .` reports **drift**.

### WU1 — skills (12 files + config)

- **Owned files:** `skills/{pre-impl,impl,post-impl,sdd-skill-improve,test-improve,tdd}/SKILL.md`,
  the same six under `seed/skills/`, and `skills/sdd.config.json` (`sizeBudgetBytes` only).
- Delete each provenance note and the blank line that separates it, so the layout doesn't gain a
  double blank. In sdd-skill-improve and test-improve, keep the final sentence as its own italic line.
- Bump `version: 1.0.0` → `1.0.1` in each edited skill.
- Edit the root copy and copy it over the seed copy (`cp skills/<s>/SKILL.md seed/skills/<s>/SKILL.md`).
- Set `sizeBudgetBytes.<skill>` to the new CR-stripped size (`tr -d '\r' < skills/<s>/SKILL.md | wc -c`).
  Don't change `seed/skills/sdd.config.template.json`: its budgets are `0` (set at deploy).
- Reinstall the mirrors: `node scripts/sdd/skills.mjs install --yes`, then `status --json`.

### WU2 — scripts (4 files + manifest)

- **Owned files:** `scripts/sdd/suite-run.mjs`, `scripts/sdd/tests/suite-run.test.mjs`, their
  `seed/` copies, and `scripts/sdd/.seed-manifest.json`.
- `suite-run.mjs:231` → `/** Kept under its original name for callers that import the dotnet parser directly. */`
- `suite-run.test.mjs:14` → `// ---------------------------------------------------------------- dotnet adapter (the original parser, verbatim)`
- Copy the root files over the seed copies, then refresh the manifest with `node bin/sdd.mjs upgrade .`
  (expect `unchanged` for both files, no drift).

### WU3 — architecture doc

- **Owned file:** `docs/sdd/sdd-scaffolding-architecture.md`.
- Apply decisions 2 and 3. Keep the example config's keys, comments and structure identical; change
  only the names.

## Verification

Each check says what it would show if the claim were false.

- **V1 — the names are gone (the check that proves the change).**
  `git grep -nIi -e 'w[e]xpert' -e 'f[i]nops' -e 'C[o]de.MS' -- . ':!README.md'` returns **empty**.
  *Falsifier:* on `main` the same command returns **34 lines** (35 minus README; observed). If any
  edit is missed, lines remain. Positive control: run `node scripts/sdd/gate-control.mjs --base 389d28f
  --revert <the 17 edited files> --build "node --version" --test "<the V1 grep, negated so a hit exits non-zero>"`
  after the `feat` commit and record `RED`. The same test on HEAD must exit 0.
- **V2 — seed parity holds.** `for f in $(cd seed && git ls-files skills scripts); do cmp -s seed/$f $f || echo DIFF $f; done`
  prints only `DIFF skills/sdd.config.template.json`. *Falsifier:* editing only one copy of any file
  prints an extra `DIFF` line. The loop already caught the template, so it isn't blind.
- **V3 — nothing but provenance was removed from the skills.**
  `git diff main -- skills seed/skills | grep '^-[^-]'` lists only provenance lines and
  `version: 1.0.0`, and `grep '^+[^+]'` lists only `version: 1.0.1` plus the two kept harvester
  sentences. Also: `grep -c "This copy is the target repository's own" skills/{sdd-skill-improve,test-improve}/SKILL.md seed/skills/{sdd-skill-improve,test-improve}/SKILL.md`
  returns 1 for each of the 4 files. *Falsifier:* an over-eager deletion shows up as a `-` line
  outside the notes, or as a count of 0.
- **V4 — budgets went down to the new sizes.** For each of the six skills,
  `sizeBudgetBytes.<s>` equals `tr -d '\r' < skills/<s>/SKILL.md | wc -c`, and each value is below
  the baseline listed in Context. *Falsifier:* budgets left at the baseline are larger than the new
  sizes, so the equality fails. The size test alone would still pass, which is why this check is
  separate.
- **V5 — the manifest matches.** `node bin/sdd.mjs upgrade .` reports no drift, and
  `git diff scripts/sdd/.seed-manifest.json` changes exactly the `suite-run.mjs` and
  `tests/suite-run.test.mjs` hashes. *Falsifier:* a stale manifest leaves those two hashes unchanged
  while the files changed. A drift report means a file was edited out of step with seed.
- **V6 — mirrors are current.** `node scripts/sdd/skills.mjs status --json` reports no `stale` mirror
  for the six skills. *Falsifier:* skipping the reinstall reports all six `stale`, because the edited
  source no longer matches its mirror. The git-recenter user-scope `misplaced` finding predates this
  plan and is out of scope.
- **V7 — suites stay green, with totals.** `node --test "scripts/sdd/tests/*.test.mjs"` → **178/178**
  and `node --test "src/tests/*.test.mjs"` → **4/4** (totals are the baselines observed on `main`
  this run). *Falsifier:* a broken shared block, a size budget or a frontmatter version fails a named
  doc test, and a dropped count shows as N/178.
- **V8 — the example config still reads correctly.** `grep -c myapp docs/sdd/sdd-scaffolding-architecture.md`
  returns 10, the same number of lines as the sample-product hits it replaces on `main` (observed: 10).
  *Falsifier:* a missed or doubled rename changes the count.

## Developer action (not impl)

`README.md:28` is human-authored. Proposed replacement for the first clause:

> The method was lifted from an earlier project on 2026-09-16 and generalized; the contract that
> every ported piece follows is `docs/sdd/sdd-scaffolding-architecture.md`. …

V1 excludes `README.md` until you make that edit.
