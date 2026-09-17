# sdd-scaffolding — Stories Document

## Index

**Read this index first, then read only the `## Area:` section(s) your work touches** — this document grows large and a full read is rarely warranted. If the interview later surfaces an area you did not load, read it then.

**Story IDs.** Stories carry self-minting UTC-timestamp IDs — `S-YYMMDD.HHMMSSx` (e.g. `S-260715.143022a`), where the trailing letter enumerates the stories added in one authoring run; acceptance criteria derive as `AC-<id>.<n>` (e.g. `AC-260715.143022a.1`). The timestamp form sorts chronologically and needs no shared counter, so branches never collide on a "next ID" line. An ID is **never renumbered** once written. The post-impl skill owns the minting rule.

**Areas.** Each `## Area:` section is one thematic slice of the product and maps 1:1 to an `area:<slug>` tag declared in `docs/artifacts/README.md`. Adding an area means adding its heading here, its index row below, and its slug row in the tag vocabulary — in the same commit.

| Area | Stories | Summary |
|------|---------|---------|
| [Seed content](#area-seed-content) | S-260917.163805a | The skills, scripts and docs skeleton that `sdd deploy` copies into a target |

> Story IDs record the order work was done, not where it belongs — an area's IDs are not contiguous.

---

**Template** — copy this section for the first area (kept in a code fence so it is not read as a real area):

```markdown

## Area: <Area Name>

### Story S-YYMMDD.HHMMSSx: <Short title>
**As a** <role>
**I want to** <capability>
**So that** <outcome>

**Acceptance Criteria:**
- [ ] AC-YYMMDD.HHMMSSx.1: <observable, testable statement — one behavior per line>
- [ ] AC-YYMMDD.HHMMSSx.2: <…>

**Status:** Planned | Done <YYYY-MM-DD> (<plan slug>)
```

## Area: Seed content

The skills, scripts (`scripts/sdd/`) and docs skeleton under `seed/` that `sdd deploy` copies into a target, and their self-hosted copies at the repository root.

### Story S-260917.163805a: The seed names no other project
**As a** developer deploying the seed into my repository
**I want to** receive skills, scripts and docs that name no other project, local path or product version
**So that** nothing I adopt points at code I cannot see

**Acceptance Criteria:**
- [x] AC-260917.163805a.1: The pre-impl, impl, post-impl, sdd-skill-improve, test-improve and tdd skills carry no provenance note naming a source project, in both `skills/` and `seed/skills/`; each is at version 1.0.1 with its size budget lowered to its new size
- [x] AC-260917.163805a.2: The harvester skills keep the sentence stating the copy is the target repository's own
- [x] AC-260917.163805a.3: `suite-run.mjs` and its test name no source project (root and seed), and the upgrade manifest matches them with no drift
- [x] AC-260917.163805a.4: The architecture doc names no source project or local path, describes what was left out of the port generically, and its example config uses `myapp`
- [x] AC-260917.163805a.5: A case-insensitive search of tracked files for the source project, the former sample product and the source checkout path returns nothing (34 lines on the base commit)
- [x] AC-260917.163805a.6: Seed and root copies stay byte-identical; 178/178 doc meta-tests and 4/4 CLI tests pass, 0 failures

**Status:** Done 2026-09-17 (scrub-project-references)
