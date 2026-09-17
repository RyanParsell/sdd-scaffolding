# `skills/` — the tracked source of truth for this repo's agent skills

This folder holds the repo's agent **skills** (each a directory with a `SKILL.md`), the config the
skills read (`sdd.config.json`, validated by `sdd.config.schema.json`), and the canonical shared
blocks (`blocks/`). It is the **source of truth**, deliberately **not** read directly by any harness.
Deploy skills to the harness mirrors with the seed's own script:

```bash
node scripts/sdd/skills.mjs install     # copy every project skill to each configured harness dir (--harness to narrow, --yes to skip the prompt)
node scripts/sdd/skills.mjs status      # show what is deployed where: ok / stale / misplaced / orphaned / foreign
```

`SKILL.md` is a [cross-harness open standard](https://agentskills.io) read identically by Claude
Code, GitHub Copilot, and OpenAI Codex, so **deployment is a copy, not a conversion.**

## What is here

| Path | Role |
|------|------|
| `<name>/SKILL.md` | one skill per directory; the directory name is the skill's `name` |
| `sdd.config.json` | every repo-specific value the skills need — commands, doc paths, branch and publish conventions, harnesses, harvest and sweep settings, per-skill size budgets. A skill never states a repo command literally; it names the config key |
| `sdd.config.schema.json` | JSON Schema for the config; `sdd status` and the doc meta-tests validate against it |
| `blocks/<NAME>.md` | the canonical shared blocks, pasted byte-for-byte between `<!-- NAME:START -->` / `<!-- NAME:END -->` markers into the skills that own a copy and cited by name everywhere else; the doc meta-tests compare the copies |

The seeded skills are the **trio** (`pre-impl`, `impl`, `post-impl`), the two weekly **harvesters**
(`sdd-skill-improve`, `test-improve`) and two technique skills (`tdd`, `git-recenter`). The list a
deploy installs is `skills.project` in the config.

## Harness → directory map

Chosen via `--harness` (one or more, repeatable or comma-separated like `--harness claude,codex`);
omitted, the script installs to every harness listed under `skills.harnesses` in the config.

| Harness | Project mirror |
|---------|----------------|
| Claude Code | `.claude/skills` |
| GitHub Copilot | `.github/skills` |
| OpenAI Codex | `.agents/skills` |

The mirror dirs are **git-ignored** (the `gitignore.fragment` the deploy appended) — they are
reproducible install output, never edited by hand. Edit skills here in `skills/`, then re-run
`node scripts/sdd/skills.mjs install`. The lifecycle hook reports a stale or misplaced mirror at
session start; the `MIRROR-ADVISORY` block in pre-impl says what to do about it.

## Improvements stay here

A repo's `sdd-skill-improve` edits **this** folder. Nothing flows back to the seed it was deployed
from: most friction is repo-specific, and the seed is a starting point, not a shared source of
truth. `sdd upgrade` touches only `scripts/sdd/` and never a skill.

## Authoring for cross-harness (the portability convention)

Skills load in all three harnesses, but *content* can accidentally assume one. When writing or
editing a skill, keep it harness-neutral:

1. **Harness-neutral spine.** State the workflow, its outcomes, and the commands as config keys
   (`run the build command (config repo.commands.build)`) so any agent can follow them. This path
   must be complete on its own.
2. **Isolate harness-specific accelerations.** Claude Code niceties (parallel worktree sub-agents,
   background tasks, AskUserQuestion) go in a clearly-labeled *optional* section layered on top of
   the neutral spine — never load-bearing.
3. **Never hard-code slash invocation.** Refer to other skills by **name** ("the post-impl skill"),
   not `/post-impl`. Invocation differs by harness (Claude `/name`, Codex `$name` or `/skills`,
   Copilot activates by the skill's `description`).
4. **Invest in the `description` frontmatter.** It is the one universal activation surface across all
   three harnesses — make it say plainly what the skill does and when to use it.
5. **Never a literal repo command or path.** The one path a skill may state literally is
   `skills/sdd.config.json` itself and the script paths under `scripts/sdd/`, which the seed owns.
   Everything else is a config key or a section of the profile document (`repo.docs.profile`).

## Frontmatter rules

Every `SKILL.md` opens with YAML frontmatter that must hold across harnesses:

- `name` — exactly the directory name.
- `description` — 1–1024 characters, a single line. Plain YAML descriptions cannot contain `: ` or
  ` #`; quote or fold the value, or use different punctuation.
- `user_invocable: true`.
- `version` — semver; every seeded skill starts at `1.0.0`. Bump the patch on any edit, and keep the
  comment line beside it that says so.

`node scripts/sdd/skills.mjs install` validates every skill before writing anything, so a malformed
manifest cannot silently disappear from one harness while appearing in another.

## Size budgets

`sizeBudgetBytes` in the config holds one budget per skill, measured with CR stripped. A deploy
writes the measured sizes; afterwards a budget only ratchets **down** — a change that shrinks a
skill lowers its budget in the same commit, and a change that would grow one past its budget fails
the doc meta-tests. The point is that a skill loaded on every run cannot quietly regrow.
