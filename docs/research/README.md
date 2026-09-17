Material in this folder is research that will be used to help craft future plans — reference
material behind a question, not a decision and not a work item.

## Naming

| | Form |
|---|---|
| Research doc | `YYYY-MM-DD-<slug>.md` — the date is when the investigation was written up |

## Contract

- **Investigation, not implementation.** A research doc records what was found, the sources, and the
  options it opens or closes. It does not schedule work; a plan in `docs/plans/` does that and cites
  the research it rests on.
- **Investigation phases land here.** A plan's declared investigation phase (deliverable = findings,
  not code) ends in a local `docs(research):` commit that adds or extends a file in this folder.
- **Dated, not living.** A research doc is a snapshot as of its date. If the question is reopened
  later, write a new dated doc that cites the old one rather than editing history.
- **Not a grounding read.** Grounding starts from `docs/sdd/`; research is reached from a plan or an
  epic that cites it.
