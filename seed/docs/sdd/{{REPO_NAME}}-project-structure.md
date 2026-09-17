# {{PRODUCT}} — Project Structure

This SDD companion is split from the architecture document (config `repo.docs.architecture`). Use the lookup table first: match the work to the closest `arch:` or `area:` tag, then search this file or the repo for the listed paths instead of reading the full structure listing.

## Reverse Architecture and Area Lookup

One row per work area or recurring question. **Grounding tags** are drawn from the vocabulary in `docs/artifacts/README.md`; **Start with these paths** is the shortest set of files that lets a fresh context window begin; **Also check** is what a change there usually drags along (tests, docs, adjacent surfaces). Post-impl adds or updates a row when a shipped plan introduced a surface this table does not yet route to.

| Work area / question | Grounding tags | Start with these paths | Also check when relevant |
|----------------------|----------------|------------------------|--------------------------|

## Full Structure Listing

The tree below is the **sweep listing** (config `sweep.listing`): the sdd-skill-improve harvest compares it against the paths on disk under `sweep.scope` (filtered by `sweep.extensions`) and reports files present in one but not the other. Keep it an annotated tree — one line per file or folder, a `#` comment where the name alone does not say what it is for — and update it in the same commit that adds or removes a file.

```
```
