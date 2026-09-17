# {{PRODUCT}} — Architecture

**Status:** Living · **Started:** {{DATE}}

## Grounding Index

Use this table instead of reading the whole document. Match the work's `arch:` tag (curated in
`docs/artifacts/README.md`) to a row and read only the sections it names. The file and folder map
lives in the project-structure companion (config `repo.docs.projectStructure`).

| Component (`arch:` slug) | Read these sections | Start with these paths |
|--------------------------|---------------------|------------------------|
| TODO | TODO | TODO |

## Architectural Approach

TODO — the one or two principles that shape the design, and what they trade away.

## Components

TODO — one subsection per `arch:` slug, each stating responsibility, boundaries and the components
it talks to.

## Data Flow

TODO — how a request, command or event moves through the components.

## Design Decisions

A dated, append-only record. Each decision states the context, the options considered, the choice
and its consequences; a reversed decision gets a new entry that cites the old one rather than an
edit. Pre-impl reads this section before proposing a design; post-impl appends to it when a plan
settled a choice.

### DD-1 · <title> — <YYYY-MM-DD>

- **Context:** TODO
- **Options:** TODO
- **Decision:** TODO
- **Consequences:** TODO

## Key Libraries

TODO — the dependencies the design relies on and why each was chosen.
