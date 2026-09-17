# sdd-scaffolding

Seed spec-driven development into a repository in one command.

```
npx sdd deploy <repo>      # or: node bin/sdd.mjs deploy <repo>
```

What a target receives:

- **Skills** — `pre-impl` (plan), `impl` (build test-first), `post-impl` (document and publish), the
  weekly harvesters `sdd-skill-improve` and `test-improve`, and the technique skills `tdd` and
  `git-recenter`. Generic prose; everything repo-specific comes from `skills/sdd.config.json` and one
  profile document.
- **Scripts** under `scripts/sdd/` — the lifecycle observer the harness hooks call, the harvest
  facts, a suite runner with a parsed verdict, the falsifiability gate's control, the skills
  installer, and the doc meta-tests that enforce the conventions (`node --test scripts/sdd/tests/`).
- **Docs taxonomy** — `docs/sdd` (specs), `docs/epics`, `docs/plans`, `docs/artifacts`,
  `docs/research`, `docs/logs` (the friction, test-health, run and test-ROI ledgers with their
  canonical blocks).
- **Hooks and stubs** — Claude Code and Copilot lifecycle hooks, `CLAUDE.md` and
  `.github/copilot-instructions.md` stubs, and the git-ignored harness mirrors.

`deploy` never overwrites a file the target already has. `upgrade` touches only `scripts/sdd/` and
reports drift instead of overwriting an edited script. Skills, docs and ledgers belong to the target
after deploy: improvements found there stay there.

Prerequisite: Node ≥ 20. `git` and, for the `pr` publish mode, `gh`.
