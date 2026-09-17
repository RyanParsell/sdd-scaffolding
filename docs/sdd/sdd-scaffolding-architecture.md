# sdd-scaffolding — architecture and porting contract

**Status:** Living · **Started:** 2026-09-16

`sdd-scaffolding` is a seed for spec-driven development (SDD) in any repository: a set of agent
skills (the **trio** pre-impl → impl → post-impl, the two weekly **harvesters** sdd-skill-improve and
test-improve, and two technique skills tdd and git-recenter), the scripts that give those skills
deterministic facts, the doc meta-tests that enforce the conventions, and the docs taxonomy and
ledgers the skills read and write. It was lifted from an earlier project on 2026-09-16, where the
system evolved over thirteen rounds of an epic, and generalized so that a fresh repository can adopt
it in one command.

## The five decisions that shape everything

1. **Config-driven skills, not templates.** Skills are generic prose. Everything repo-specific —
   commands, document paths, branch and publish conventions, harnesses — lives in one file,
   `skills/sdd.config.json`, under the `repo` block, plus one per-repo **profile document**
   (`repo.docs.profile`) for stack conventions a JSON value cannot carry (test categories, reference
   test files, fakes, smoke environments). A skill never states a repo command literally; it names
   the config key and the agent reads the value at the start of the run.
2. **Vendored and upgradeable.** `sdd deploy <repo>` copies the seed into a target, which is then
   self-contained: its own `skills/`, `scripts/sdd/`, docs and ledgers, with no runtime dependency on
   this repository. `sdd upgrade <repo>` touches only `scripts/sdd/` (code that is generic by
   construction) and reports drift rather than overwriting an edited script.
3. **Improvements stay where they are found.** A target's sdd-skill-improve edits that target's own
   skills. Nothing flows back to the seed automatically: most friction is repo-specific, and the
   seed is a starting point, not a shared source of truth.
4. **Enforcement is Node, stack-agnostic.** The doc meta-tests are `node --test` files under
   `scripts/sdd/tests/`, driven by the config, so a target of any stack runs them with the same
   command. Node ≥ 20 is the one prerequisite.
5. **Self-hosted.** This repository is itself a deployed target: its root `skills/`, `scripts/sdd/`,
   `docs/` and hooks are the deploy output, and it runs under its own trio. Deploy bugs are felt
   here first.

## Repository layout

```
sdd-scaffolding/
  package.json                 npm package; bin "sdd" → bin/sdd.mjs
  bin/sdd.mjs                  CLI entry: deploy | upgrade | status
  src/                         the CLI's implementation (deploy, upgrade, status, hook merge, prompts)
  seed/                        what deploy copies into a target
    skills/<name>/SKILL.md     the seven skills (tdd has companion .md files)
    skills/sdd.config.template.json
    skills/sdd.config.schema.json
    skills/README.md
    skills/blocks/*.md         the canonical shared blocks (see below) — pasted verbatim into skills
    scripts/sdd/*.mjs          lifecycle, harvest, gate-control, suite-run, skills, lib/config
    scripts/sdd/tests/*.test.mjs   doc meta-tests + script tests
    docs/                      the docs taxonomy skeleton: READMEs, ledger headers, doc skeletons
    hooks/                     claude-settings.fragment.json, github-hooks.sdd-lifecycle.json
    agent/                     CLAUDE.section.md, copilot-instructions.md
    gitignore.fragment
  skills/, scripts/sdd/, docs/, .claude/, .github/   this repo's OWN deployed instance (self-host)
```

`seed/skills/`, `seed/scripts/sdd/` and the root `skills/`, `scripts/sdd/` are kept identical by
`sdd deploy .` (self-deploy); the root `docs/` and config are this repo's own instance and are not
copied to targets (targets get `seed/docs/` skeletons).

## The config: `skills/sdd.config.json`

One file per target, at `skills/sdd.config.json`. Scripts find the repo root by walking up until a
directory contains `skills/sdd.config.json` (never a solution file). The full schema is
`seed/skills/sdd.config.schema.json`; the shape:

```jsonc
{
  "sddVersion": "0.1.0",                       // seed version this config was written by
  "repo": {
    "name": "myapp",                           // short name; used in slugs and prose
    "product": "myapp",                        // how prose names the product
    "defaultBranch": "main",
    "publish": "trunk-ff",                     // "trunk-ff" (branch → ff-merge → push) | "pr" (push branch, open PR, optional CI watch + squash)
    "branches": { "feature": "feature/{slug}", "bug": "bug/{slug}" },
    "commits": { "feature": "feat", "bug": "fix", "docs": "docs", "plan": "docs(plan)", "attribution": false },
    "commands": {
      "build": "dotnet build -nologo -v q",                       // optional: null when the repo has no build step
      "test": "dotnet test tests/MyApp.Tests -nologo -v q --no-build", // required; the full suite
      "testFilter": "dotnet test tests/MyApp.Tests --no-build --filter \"{filter}\"", // optional; {filter} substituted
      "docTests": "node --test \"scripts/sdd/tests/*.test.mjs\"", // required; the glob is quoted so node, not the shell, expands it (Node 24 rejects a bare directory)
      "lint": null,                                              // optional
      "deployTool": "pwsh -NoProfile -File ./install.ps1",       // optional: how the built product reaches the machine ("deploy the tool" phase)
      "e2e": null                                                // optional
    },
    "testRunner": "dotnet",                     // "dotnet" | "vitest" | "generic" — which suite-run adapter parses results
    "sourceGlobs": ["src/**/*.cs"],
    "testGlobs":   ["tests/**/*.cs"],
    "docs": {
      "sdd": "docs/sdd",
      "prd": "docs/sdd/myapp-prd.md",
      "architecture": "docs/sdd/myapp-architecture.md",
      "stories": "docs/sdd/myapp-stories.md",
      "projectStructure": "docs/sdd/myapp-project-structure.md",
      "profile": "docs/sdd/myapp-sdd-profile.md",     // per-repo stack conventions the skills read
      "agentGuide": null,                              // optional: an agent-instruction doc post-impl keeps in sync
      "changeChecklist": null,                         // optional: a surfaces checklist post-impl's stale-doc audit derives from
      "vocabulary": null,                              // optional
      "plans": "docs/plans", "artifacts": "docs/artifacts", "epics": "docs/epics",
      "research": "docs/research", "logs": "docs/logs"
    },
    "ledgers": {
      "friction": "docs/logs/friction-log.md",
      "testHealth": "docs/logs/test-health-log.md",
      "runLog": "docs/logs/sdd-run-log.md",
      "testRoi": "docs/logs/test-roi-log.md"
    },
    "agentSurfaces": ["CLAUDE.md", ".github/copilot-instructions.md"],  // files post-impl keeps stubs/in sync; may include product files (e.g. an agent-guide command source)
    "ui": null                                   // optional: { "devServer": "...", "smoke": "..." } — enables the UI/MSU phases
  },
  "skills": {
    "source": "skills",
    "project": ["pre-impl", "impl", "post-impl", "sdd-skill-improve", "test-improve", "tdd", "git-recenter"],
    "harnesses": ["claude", "copilot", "codex"],  // deploy targets: .claude/skills, .github/skills, .agents/skills
    "retired": []                                  // names swept from the mirrors at install; a lingering copy reports as orphaned
  },
  "harvest": { "expiryDays": 30, "topN": 3, "patternWeeks": 3, "digestWhatChars": 700,
               "slugPrefixes": ["sdd-skill-improve", "test-improve"],
               "seamPaths": ["skills/", "docs/logs/friction-log.md", "docs/logs/test-health-log.md", "scripts/sdd/"] },
  "sweep": { "listing": "docs/sdd/myapp-project-structure.md", "scope": ["src/**", "tests/**", "scripts/**"],
             "extensions": ["cs", "mjs", "md", "json", "ps1", "sh", "yml"] },
  "sizeBudgetBytes": { "pre-impl": 0, "impl": 0, "post-impl": 0, "sdd-skill-improve": 0, "test-improve": 0, "tdd": 0, "git-recenter": 0 }
}
```

`sizeBudgetBytes` values of `0` mean "set at first deploy to the deployed size"; deploy writes the
measured sizes. Budgets only ratchet down afterwards (the SIZE-RULE). Sizes are measured with CR
stripped, so a line-ending flip cannot break the budget.

## How a skill refers to the repo

- **Never a literal repo command or path.** Write `run the build command (config \`repo.commands.build\`)`,
  `the PRD (config \`repo.docs.prd\`)`, `the friction ledger (config \`repo.ledgers.friction\`)`.
  The one path a skill may state literally is `skills/sdd.config.json` itself, and the script paths
  under `scripts/sdd/`, which the seed owns.
- **First step of every skill:** read `skills/sdd.config.json` and the profile document
  (`repo.docs.profile`). State the resolved commands you will run in the Actions-taken table.
- **Optional config keys gate optional phases.** `repo.commands.deployTool` null → the "deploy the
  tool" phase is skipped with an explicit row. `repo.ui` null → the MSU/smoke phases collapse to
  "no UI surface". `repo.docs.agentGuide`/`changeChecklist` null → those sync steps are "not
  configured". `repo.publish` decides which post-impl publish phases run.
- **Harness-neutral spine + optional accelerations.** The neutral path is
  complete on its own; Claude Code parallel worktrees, background tasks and AskUserQuestion go in a
  clearly labeled optional section. Refer to other skills by name, never by slash.
- **Frontmatter:** `name` (== directory), `description` (1–1024 chars, single line, no `: ` or ` #`),
  `user_invocable: true`, `version: 1.0.0` for every seeded skill, and the patch-bump comment line.

## Canonical shared blocks — stated once, cited everywhere

Some passages are load-bearing in more than one skill. Each is kept in `seed/skills/blocks/<NAME>.md`
and pasted **byte-for-byte** (between `<!-- NAME:START -->` and `<!-- NAME:END -->` markers) into the
skills that own a copy; every other skill cites it by name. The doc meta-tests compare the copies.

| Block | Copies in | Cited by |
|---|---|---|
| `MIRROR-ADVISORY` | pre-impl (owner) | impl, post-impl, sdd-skill-improve, test-improve |
| `FALSIFIABILITY-GATE` | pre-impl (plan authoring), impl (verification run) | post-impl, both harvesters |
| `LEDGER-CONVENTION` | pre-impl, impl, post-impl | both harvesters |
| `EDIT-MECHANISM` | impl | post-impl, sdd-skill-improve |
| `SUITE-DENOMINATOR` | impl | post-impl, test-improve |

The ledgers own four more blocks in their headers, cited by the skills and never restated:
`SMALL-FIX-RULE`, `READ-PROTOCOL`, `EXPIRY-GATE`, `SCAN-WATERMARK` (friction log) and
`ANTIPATTERN-GATE` (test-health log).

## What was stripped in the port, and why

- **`F-N`/`T-N` citations** from the source project's ledgers. They are provenance there and
  dangling ids anywhere else. The lesson each one carried stays in the text.
- **Product wiring**: the source product's own host lifecycle, build and versioning setup, UI bundle
  rules, package-feed authentication, demos and stories areas are not part of the seed.
  Where a concept survives generically (a UI dev server, a "deploy the tool" step, a suites-by-layer
  table) it is driven by the config or the profile document.
- **Story ids, tags, run-log grammar, the canonical blocks, the phase structure, the YOLO envelope,
  the multi-agent execution contracts, the investigation-phase shape, the falsifiability gate, the
  MSU/smoke discipline** all survive unchanged in substance.

## Deploy, upgrade, status

- `sdd deploy <repo> [--yes] [--name X] [--product X] [--harness claude,copilot,codex]`: refuses to
  overwrite any existing file (reports what it kept); copies `seed/skills/`, `seed/scripts/sdd/`;
  creates the docs skeleton and ledger headers; writes `skills/sdd.config.json` from the template with
  prompted or defaulted `repo` values (build/test commands are asked for unless `--yes`, then left as
  `TODO` markers the doc tests flag); merges hooks into `.claude/settings.json` (creating it if
  absent) and writes `.github/hooks/sdd-lifecycle.json`; creates `CLAUDE.md` and
  `.github/copilot-instructions.md` stubs or appends the SDD section when the file exists without it;
  appends the mirror dirs to `.gitignore`; runs `node scripts/sdd/skills.mjs install --yes` to
  produce the harness mirrors; measures skill sizes into `sizeBudgetBytes`; prints what to do next.
- `sdd upgrade <repo>`: for each file under `seed/scripts/sdd/`, compares the target's copy to the
  seed's copy **and** to the seed version the target was deployed from (`sddVersion`); unchanged →
  replaced; locally edited → left in place and reported as drift with a diff summary. Never touches
  skills, docs or ledgers.
- `sdd status <repo>`: config validity, mirror status (delegates to the target's `skills.mjs status`),
  ledger header blocks present, doc-test result.

## Scripts (`scripts/sdd/`)

| Script | Role | Portability notes |
|---|---|---|
| `lib/config.mjs` | find root, load + validate config, resolve paths | shared by every script |
| `lifecycle.mjs` | the lifecycle observer for SessionStart / first-mutation hooks (Claude + Copilot adapters); fails open | mirror status comes from `skills.mjs status --json` |
| `harvest.mjs` | deterministic half of sdd-skill-improve: scan, digest, patterns, seams, slug, sweep, parity, size; impl-only flips, watermark | ledger paths and sweep listing from config |
| `gate-control.mjs` | the falsifiability gate's narrowed-check control in a detached worktree | git + node only |
| `suite-run.mjs` | runs `repo.commands.build` then `repo.commands.test`, parses by `repo.testRunner` adapter (dotnet, vitest, generic), verdict taxonomy kept | the dotnet adapter is the original parser; generic = exit code + optional `--expect-total` |
| `skills.mjs` | `install [--harness …] [--yes]`, `status [--json]`: validate frontmatter, copy `skills/<project skill>/` to each harness's project dir, classify mirrors ok/stale/misplaced/orphaned/foreign | the one install path for every harness mirror |
| `tests/*.test.mjs` | doc meta-tests (config-driven) and script tests | run by `repo.commands.docTests` |

## Docs taxonomy a target receives

`docs/sdd/` (durable specs: PRD, architecture, stories, project structure, profile), `docs/epics/`,
`docs/plans/`, `docs/artifacts/`, `docs/research/`, `docs/logs/` (friction, test-health, run log,
test-roi). Each folder carries a README stating its contract. The stories doc opens with an
`## Index` over `## Area:` sections; story ids are `S-YYMMDD.HHMMSSx`; artifacts index rows are
tagged with `prd:FR-N`, `arch:<slug>`, `area:<slug>`.
