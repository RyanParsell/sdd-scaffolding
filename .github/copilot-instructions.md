# sdd-scaffolding

<!-- SDD-SECTION:START — written by `sdd deploy`; this file is a BOOTSTRAP STUB. Do NOT add content here (command references, workflows, best practices, trigger terms). Product-facing agent instructions belong in a surface the product itself emits or in docs/sdd/ — content that only lives here goes stale the moment the product changes. -->

Repository changes follow **pre-impl → impl → post-impl**. Lifecycle hooks report advisory state; an
advisory is not proof that a stage ran. Canonical workflow instructions live in tracked `skills/`.

## Three stages — push is the gate

1. **Plan** — the **pre-impl** skill writes a plan in `docs/plans/`, creates the branch (`repo.branches` in `skills/sdd.config.json`) and stops for approval.
2. **Implement + test** — the **impl** skill writes code and tests, runs the build and the suite (`repo.commands`), ends in a **local** commit and stops. It refuses to run on the default branch unless the plan declares `**Hotbug:** YES`. Never `git push`.
3. **Publish** — developer-driven: the **post-impl** skill archives the finished plan to `docs/artifacts/`, commits docs separately, and publishes the way `repo.publish` declares (`trunk-ff` or `pr`). Its unattended `yolo` mode, available only when `repo.publish` is `pr`, may squash-merge once every CI check passes; it never deletes a branch.

**Hotbugs** — the pre-impl skill invoked with `--hotbug` is the one trunk-direct path: a bug plan carrying `⚠️ HOTBUG — TRUNK-DIRECT` and `**Hotbug:** YES`, still not pushed until stage 3.

**Harvesters feed stage 1.** The **sdd-skill-improve** and **test-improve** skills read the ledgers in `docs/logs/` and hand a subject to pre-impl; they never edit tracked source. The trio runs on every build, the harvesters roughly weekly — a new step goes to the cadence whose protection it needs.

## Documentation structure

| Folder | Contract |
|--------|----------|
| `docs/sdd/` | Living specs — what the product **is** (paths in `repo.docs`) |
| `docs/epics/` | Living strategy — never archived, never implemented directly |
| `docs/plans/` | Not yet done — the impl skill's work queue |
| `docs/artifacts/` | Done and dated — archived plans with an index |
| `docs/research/` | Investigation — reference material behind a question |
| `docs/logs/` | Operational ledgers — friction, test health, run log, test ROI; outside the grounding read |

Keep the SDD docs current when scope, architecture or capabilities change: `repo.docs.prd`, `repo.docs.architecture` (Design Decisions), `repo.docs.stories` (read the `## Index`, then only the relevant `## Area:`; story IDs are `S-YYMMDD.HHMMSSx`), `repo.docs.projectStructure`, `repo.docs.profile`.

New plans: `docs/plans/YYYY-MM-DD-<slug>.md` for a feature (the default), `YYYY-MM-DD-bug-<slug>.md` for a bug fix; archived plans keep the `bug` segment and are re-dated. Research goes in `docs/research/YYYY-MM-DD-<slug>.md`. Friction and flaky tests go to `docs/logs/`, never into a plan.

## `README.md` is human-authored

Never edit the root `README.md` on your own initiative; propose wording in your reply. Every other README is an agent-maintained index.
<!-- SDD-SECTION:END -->
