# {{PRODUCT}} — SDD profile

**Status:** Living · **Started:** {{DATE}}

The per-repo profile the SDD skills read at the start of every run, alongside `skills/sdd.config.json`. The config carries every value a JSON string can hold — commands, paths, branch and commit conventions, harnesses. This document carries the stack conventions it cannot: which tests are the reference examples, how fakes are wired, which suites are counted and how many tests they hold, which failures are environmental. A skill never states any of this itself; it names the section here and reads it.

Every section opens with what the skills expect to find there. Replace each `TODO` with the repo's facts; a section that genuinely does not apply says so in one line (`Not applicable — <why>`) rather than staying `TODO`, so a reader can tell "unfilled" from "none".

## Stack and commands

The build, test, filtered-test, doc-test, lint, deploy-tool and e2e commands live in the config (`repo.commands.*`) and are read from there, never from prose. Use this section only for what a command string cannot say: prerequisites (SDK versions, a package restore step, an environment variable), the working directory each command assumes, and how long a full build + suite takes on a typical machine.

TODO

## Line endings

State the repository's line-ending convention (`.gitattributes` or editor config), which files are exceptions, and how an agent should write new files so a diff never turns into a whole-file rewrite. Skill sizes are measured with CR stripped, so this affects readability, not budgets.

TODO

## Test categories and reference tests

Name each category of test the repo has (unit, integration, contract, end-to-end, doc meta-tests, …), the naming or attribute that marks a test as belonging to it, and **one reference test file per category** that a new test should be modeled on. The tdd and impl skills copy the reference test's shape rather than inventing one.

TODO

## Fakes and stagers

List the test doubles the suite provides (fake clients, in-memory stores, fixture builders, stagers that set up a scenario) with the file each lives in and when to use it over a real dependency. State what must never be faked.

TODO

## Shared registration files

Name the files a new command, route, handler, migration or module must be registered in to exist at runtime (a DI container, a command tree, an index file, a manifest). An unregistered addition compiles and does nothing; post-impl's stale-surface audit checks these.

TODO

## Suite layers and their known-good totals

One row per suite the full test command runs (config `repo.commands.test`), with the runner, the command that runs only that layer, and the **known-good total** — the exact test count a green run reports. The `SUITE-DENOMINATOR` block in the impl skill requires a run to be reported as `N/M` against these totals; update a total in the same commit that adds or removes tests.

| Layer | Runner | Command | Known-good total | Last updated |
|-------|--------|---------|------------------|--------------|

TODO

## Prerequisites that look like product errors

List failures that are environmental — a missing tool on PATH, an unauthenticated session, a port already bound, a service that must be running — together with the exact message each produces and the fix. An agent that sees one of these must repair or report the environment, not debug the product.

TODO

## UI smoke environment

If the repo has a UI surface (config `repo.ui` non-null): how the dev server is started and stopped, the URL, which credentials or fixtures a smoke pass needs, and what "the page rendered" means for this product. If `repo.ui` is null, write `Not applicable — no UI surface`.

TODO

## Deploying the tool

If the built product must reach the machine before it can be exercised (config `repo.commands.deployTool` non-null): what the deploy command installs, where, how to confirm the installed version is the one just built, and what a stale install looks like. If null, write `Not applicable — the product is exercised from the build output`.

TODO

## Releases

How a release is cut and versioned (tags, a version file, a changelog), who may cut one, and whether post-impl's optional release tagging applies to this repo.

TODO
