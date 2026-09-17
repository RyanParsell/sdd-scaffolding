Markdown files in this folder are durable spec-driven development documents. These documents are continually updated.

They describe what sdd-scaffolding **is**. The ledgers recording how the *process* has behaved — skill friction, test health, run accounting — live in **`docs/logs/`** and are deliberately not part of a grounding read.

The skills never name these files literally; they read the paths from `skills/sdd.config.json`
(`repo.docs.*`). The config key is the document's name in every skill and script.

| File | Config key | What it is |
|------|------------|------------|
| `sdd-scaffolding-prd.md` | `repo.docs.prd` | Product requirements — the FRs/NFRs, with a Grounding Index to route a read |
| `sdd-scaffolding-architecture.md` | `repo.docs.architecture` | System design, components, data flow, conventions, and the Design Decisions record |
| `sdd-scaffolding-stories.md` | `repo.docs.stories` | Delivered stories with acceptance criteria, indexed by `## Area:` |
| `sdd-scaffolding-project-structure.md` | `repo.docs.projectStructure` | The file/folder map + a reverse architecture-and-area lookup; the sweep listing (config `sweep.listing`) |
| `sdd-scaffolding-sdd-profile.md` | `repo.docs.profile` | The per-repo profile the skills read at the start of every run — stack conventions a config value cannot carry |

Optional documents the config may also name (`repo.docs.agentGuide`, `repo.docs.changeChecklist`,
`repo.docs.vocabulary`) live here too when present; `null` in the config means the corresponding
skill step reports "not configured" rather than inventing a file.
