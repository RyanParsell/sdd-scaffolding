Markdown files in this folder are plans that have been completed. The preceding date in each filename is the date of implementation.

Bug fixes carry a `bug` segment — `<date>-bug-<slug>.md`; features are `<date>-<slug>.md` (the default; see `docs/plans/README.md` for the rule). The post-impl skill moves a finished plan here, re-dates the prefix to the implementation date, and writes the plan's index row below. A completed plan is a dated record: it is not edited afterwards except to correct a broken link.

**Friction does not live here.** Friction with a skill (`F-N`) and flaky or slow tests (`T-N`) go to
the central ledgers in `docs/logs/` (config `repo.ledgers.*`), where they are marked, never deleted,
and harvested by `sdd-skill-improve` and `test-improve`. An archived plan may *cite* a ledger entry
by id; it never carries one.

## Tag vocabulary

Every index entry (and every plan in `docs/plans/`, via its `**Tags:**` header) carries **tags**
that point back at the living SDD documents — so an agent grounding itself in a fresh context
window can filter this index by the part of the system it is about to change and read *how that
part came about*. Three namespaces:

- `prd:FR-N` / `prd:NFR-N` — a requirement in the PRD (config `repo.docs.prd`).
- `arch:<slug>` — an architecture component from the **curated list below**. Never invent a slug
  inline; add it to the table first (a deliberate one-line edit).
- `area:<slug>` — a stories `## Area:` section in the stories doc (config `repo.docs.stories`), via
  the mapping below.

**Rules** (enforced by the doc meta-tests under `scripts/sdd/tests/`): every entry has **≥1
`area:` tag**; `prd:`/`arch:` tags only where they genuinely apply — never padded; at most **6**
tags per entry. Workflow: **pre-impl** stamps `**Tags:**` into the plan from its grounding,
**post-impl** reconciles them against what actually shipped and copies them into the index row.

<!-- TAG-VOCAB:START -->
**`arch:` slugs** (curated — one row per architecture component; add a row before using a new slug):

| Slug | Component |
|------|-----------|

**`area:` slugs** (1:1 with the stories doc's `## Area:` sections; add a row when an area is added):

| Slug | Stories area heading |
|------|----------------------|
| `seed-content` | Seed content |
<!-- TAG-VOCAB:END -->

## Index

Sorted newest first.

| Date | Plan | Tags | Summary |
|------|------|------|---------|
| 2026-09-17 | [scrub-project-references](2026-09-17-scrub-project-references.md) | `area:seed-content` | Removed every reference to other projects from the shipped seed: skill provenance notes (versions 1.0.1, budgets lowered), suite-run comments and the upgrade manifest, and the architecture doc's origin name, local path and sample-product example (now `myapp`). Declared the first stories area, Seed content (S-260917.163805a). |
