---
name: git-recenter
description: Recenter git work — checkpoint-commit the current branch's dirty files (minus a carry-along set), hop to the default branch with auto fast-forward, show a selectable table of local branches with PR merge state plus stashes parked on the default branch, then jump to an existing branch or a new feature branch, carrying or parking the files. Use when the user invokes git-recenter or asks to "recenter", checkpoint work and get back to main, or hop between branches while bringing files along.
user_invocable: true
version: 1.0.0
# ⚠️ IMPORTANT: When editing this file, increment the patch version above (e.g., 1.0.0 → 1.0.1).
---

# git-recenter

Move the user from wherever they are back to the default branch, show them the state of every
local branch, and land them where they choose next — deterministically. All git mutations go
through the bundled script; you only do prompting, fuzzy file matching, and rendering.

**Script:** `<this skill's base directory>/recenter.ps1`, run with the PowerShell tool:
`pwsh -NoProfile -File "<base-dir>\recenter.ps1" <command> [args]`.
Every command prints one JSON object. Exit 1 means the JSON is `{error, message, ...}` — stop
and report it faithfully.

**Default branch:** it comes from `skills/sdd.config.json` `repo.defaultBranch` when that file is
present — pass it to every script call as `-DefaultBranch <name>`; without it the script detects
the default branch itself (`origin/HEAD`, then a local `main`, `master` or `trunk`). "main" below
means that branch, whatever it is called.

**Hard rules**
- NEVER `git push`, and never run raw git mutations yourself — use the script.
- NEVER commit on the default branch. If `status` says `onDefault: true` with a non-empty
  `dirty` list, REFUSE: tell the user main is dirty, list the files, and instruct them to
  resolve it manually (commit them onto a branch, `git stash`, or discard) before re-running.
  Do not offer to fix it for them; that refusal is deliberate.

## Flow

### 1. Status + carry-set resolution

Run `recenter.ps1 status`.
- Not a repo / errors → report and stop.
- `onDefault: true` + dirty → refuse (see hard rules). `onDefault: true` + clean → skip to step 3.

If the user's invocation described files to carry along (e.g. "git-recenter, bring the backlog
doc"), resolve that description against the `dirty` list yourself (fuzzy match on paths).
Then **confirm before acting**: show the exact resolved carry list (and note everything else
will be checkpoint-committed) via AskUserQuestion and wait for a yes. No description given →
carry nothing, no confirmation needed.

### 2. Checkpoint the source branch

`recenter.ps1 checkpoint -Carry <file1>,<file2>` (omit `-Carry` when carrying nothing).
Commits everything except the carry set as `wip(recenter): checkpoint <ts>`. A clean tree or
an all-carry tree is reported as `committed: false` — fine, continue.

### 3. Hop to the default branch

`recenter.ps1 switch -Branch <defaultBranch>`.
- The script stash-bridges automatically if git refuses the switch. On `POP_CONFLICT`, stop:
  report that the carried files conflict, that they are intact in the top stash entry, and
  how to resolve (`git stash pop`, fix conflicts). Do not continue to step 4.
- It also fetches and fast-forwards the default branch when possible; relay the
  `fastForward` result (including a diverged-main warning) to the user.

### 4. Table + selection

Run `recenter.ps1 table`. Render a markdown table from `branches`:

| Branch | Last commit | Ahead | PR | State | Unique work |

- `merged: true` → mark the State cell `MERGED ✓` and note it is safe-to-delete candidate.
- `pr: null` + `aheadOfMain > 0` → call out the dangling commits (`uniqueSubjects`).
- `ghAvailable: false` → say PR state is unavailable (offline / gh not authed) and show the
  local-only columns.

Below the table, **always** list `stashes` (files parked on main): ref, message, files.
If any exist, remind the user they can say "apply <stash>" to retrieve one — never
auto-apply.

Then AskUserQuestion (single-select, max 4 options; "Other" free-text covers the rest):
- The 2–3 most interesting branches (unmerged first, most recent first).
- "Create new feature branch".
- "Stay on main".
- If any `merged: true` branches exist, mention in the question text that they can also type
  "clean up" to delete merged branches.

### 5. Land on the selection

The carry-along files are currently dirty on main. Default: they travel to the destination.
If the user said to park them (in the invocation or the selection), pass `-Park` with a short
`-Label` describing the files — they become a `recenter: <label> (<date>)` stash on main.

- **Stay on main** → done. If carried files remain dirty on main, warn that the next
  recenter will refuse until they're handled.
- **Existing branch** → `recenter.ps1 switch -Branch <name> [-Park -Label "<desc>"]`.
  The script auto-uncommits a `wip(recenter): checkpoint` tip (reset --soft) so the branch
  looks as it was left; relay `uncommittedCheckpoint` when present. Handle `POP_CONFLICT` as
  in step 3.
- **New feature branch** → ask for / derive a name; prefix bare names with `feature/`
  (kebab-case slug). `recenter.ps1 switch -Branch feature/<slug> -Create [-Park ...]`.
  Created from the just-fast-forwarded main; carried files come along by default.
- **Clean up** → show the exact `merged: true` branch list, confirm, then
  `recenter.ps1 cleanup -Branches <a>,<b>`. Report `deleted` and `failed`. Then re-ask the
  destination question.

### 6. Final report

One summary: where the user now is, what was checkpointed (sha/message) or uncommitted,
which files were carried or parked (stash name), main's fast-forward result, and the current
list of parked stashes on main.
