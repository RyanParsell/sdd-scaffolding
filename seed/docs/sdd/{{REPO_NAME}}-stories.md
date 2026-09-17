# {{PRODUCT}} — Stories Document

## Index

**Read this index first, then read only the `## Area:` section(s) your work touches** — this document grows large and a full read is rarely warranted. If the interview later surfaces an area you did not load, read it then.

**Story IDs.** Stories carry self-minting UTC-timestamp IDs — `S-YYMMDD.HHMMSSx` (e.g. `S-260715.143022a`), where the trailing letter enumerates the stories added in one authoring run; acceptance criteria derive as `AC-<id>.<n>` (e.g. `AC-260715.143022a.1`). The timestamp form sorts chronologically and needs no shared counter, so branches never collide on a "next ID" line. An ID is **never renumbered** once written. The post-impl skill owns the minting rule.

**Areas.** Each `## Area:` section is one thematic slice of the product and maps 1:1 to an `area:<slug>` tag declared in `docs/artifacts/README.md`. Adding an area means adding its heading here, its index row below, and its slug row in the tag vocabulary — in the same commit.

| Area | Stories | Summary |
|------|---------|---------|

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
