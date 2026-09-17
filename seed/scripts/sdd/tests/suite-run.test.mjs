import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { fixtureHome, fixtureRepo, git, makeConfig, run, script, write } from "./fixture.mjs";

const {
  parseTestOutput, parseDotnetOutput, parseVitestOutput, parseGenericOutput, chooseFilter, changedPaths,
  selectCloneProcesses, globToRegExp, matchesAny, filteredCommand, globalToolDirs,
} = await import(pathToFileURL(script("suite-run.mjs")).href);

// ---------------------------------------------------------------- dotnet adapter (the original parser, verbatim)

// Fixture lines are copied from real `dotnet test` runs (2026-09-13, SDK for net10.0). Only the checkout prefix is shortened.
const BIN = "C:\\Code\\Product";
const RUN_TESTS = `Test run for ${BIN}\\Product.Tests\\bin\\Debug\\net10.0\\Product.Tests.dll (.NETCoreApp,Version=v10.0)`;
const RUN_BENCH = `Test run for ${BIN}\\Product.Benchmarks\\bin\\Debug\\net10.0\\Product.Benchmarks.dll (.NETCoreApp,Version=v10.0)`;
const MATCHED = "A total of 1 test files matched the specified pattern.";
const PASSED_TESTS = "Passed!  - Failed:     0, Passed:     5, Skipped:     0, Total:     5, Duration: 467 ms - Product.Tests.dll (net10.0)";
const ZERO = (filter, dll) => `No test matches the given testcase filter \`${filter}\` in ${BIN}\\${dll.replace(".dll", "")}\\bin\\Debug\\net10.0\\${dll}`;

test("dotnet: a normal pass is GREEN with per-assembly counts (parseTestOutput is the dotnet adapter)", () => {
  assert.equal(parseTestOutput, parseDotnetOutput);
  const r = parseDotnetOutput([RUN_TESTS, MATCHED, "", PASSED_TESTS, ""].join("\r\n"));
  assert.equal(r.verdict, "GREEN");
  assert.deepEqual(r.assemblies, [{ dll: "Product.Tests.dll", passed: 5, failed: 0, skipped: 0, total: 5, state: "PASSED" }]);
  assert.equal(r.total, 5);
});

test("dotnet: a filtered solution run where one assembly matches nothing is still GREEN", () => {
  const f = "FullyQualifiedName~SddRunLogTests";
  const text = [RUN_BENCH, RUN_TESTS, MATCHED, MATCHED, ZERO(f, "Product.Benchmarks.dll"), "", "",
    "Passed!  - Failed:     0, Passed:     5, Skipped:     0, Total:     5, Duration: 105 ms - Product.Tests.dll (net10.0)"].join("\n");
  const r = parseDotnetOutput(text);
  assert.equal(r.verdict, "GREEN");
  assert.deepEqual(r.assemblies.map((a) => [a.dll, a.state]), [["Product.Benchmarks.dll", "ZERO_MATCH"], ["Product.Tests.dll", "PASSED"]]);
  assert.equal(r.total, 5);
});

test("dotnet: a Failed! summary is RED", () => {
  const text = [RUN_TESTS, MATCHED, "  Failed Product.Tests.Docs.SddRunLogTests.Rows_parse [12 ms]", "",
    "Failed!  - Failed:     1, Passed:     4, Skipped:     0, Total:     5, Duration: 467 ms - Product.Tests.dll (net10.0)"].join("\n");
  const r = parseDotnetOutput(text);
  assert.equal(r.verdict, "RED");
  assert.equal(r.assemblies[0].state, "FAILED");
  assert.equal(r.assemblies[0].failed, 1);
});

test("dotnet: an announced assembly with no result line is RUNNER_TERMINATED, outranking a failure", () => {
  const text = [RUN_BENCH, RUN_TESTS, MATCHED, MATCHED,
    "Failed!  - Failed:     1, Passed:    44, Skipped:     0, Total:    45, Duration: 5 s - Product.Benchmarks.dll (net10.0)"].join("\n");
  const r = parseDotnetOutput(text);
  assert.equal(r.verdict, "RUNNER_TERMINATED");
  assert.deepEqual(r.assemblies.map((a) => [a.dll, a.state]), [["Product.Benchmarks.dll", "FAILED"], ["Product.Tests.dll", "RUNNER_TERMINATED"]]);
});

test("dotnet: a result line only counts when it comes after its announcement", () => {
  assert.equal(parseDotnetOutput([PASSED_TESTS, RUN_TESTS, MATCHED].join("\n")).verdict, "RUNNER_TERMINATED");
});

test("dotnet: output that announces no assembly at all is RUNNER_TERMINATED", () => {
  assert.equal(parseDotnetOutput("").verdict, "RUNNER_TERMINATED");
});

test("dotnet: a testhost launch failure is TESTHOST_FAILED", () => {
  const text = [RUN_TESTS, MATCHED,
    `Testhost process for source(s) '${BIN}\\Product.Tests\\bin\\Debug\\net10.0\\Product.Tests.dll' exited with error: Cannot find the host.`,
    PASSED_TESTS].join("\n");
  assert.equal(parseDotnetOutput(text).verdict, "TESTHOST_FAILED");
});

test("dotnet: a filter that matches nothing anywhere is ZERO_MATCH", () => {
  const f = "FullyQualifiedName~NoSuchTestZzz";
  const text = [RUN_TESTS, RUN_BENCH, MATCHED, MATCHED, ZERO(f, "Product.Benchmarks.dll"), "", ZERO(f, "Product.Tests.dll"), ""].join("\n");
  const r = parseDotnetOutput(text);
  assert.equal(r.verdict, "ZERO_MATCH");
  assert.equal(r.total, 0);
  assert.ok(r.assemblies.every((a) => a.state === "ZERO_MATCH"));
});

test("dotnet: --expect-total is checked against the summed total", () => {
  const text = [RUN_TESTS, MATCHED, "", PASSED_TESTS].join("\n");
  assert.equal(parseDotnetOutput(text, { expectTotal: 6 }).verdict, "DENOMINATOR_MISMATCH");
  assert.equal(parseDotnetOutput(text, { expectTotal: 5 }).verdict, "GREEN");
});

// ---------------------------------------------------------------- vitest adapter

const VITEST_PASS = [" ✓ src/a.test.ts (3 tests) 12ms", "", " Test Files  2 passed (2)", "      Tests  7 passed (7)", "   Start at  10:00:00", "   Duration  1.02s", ""].join("\n");
const VITEST_FAIL = [" Test Files  1 failed | 1 passed (2)", "      Tests  1 failed | 5 passed | 1 skipped (7)", ""].join("\n");

test("vitest: Test Files / Tests summary lines give the counts and verdict", () => {
  const ok = parseVitestOutput(VITEST_PASS);
  assert.equal(ok.verdict, "GREEN");
  assert.deepEqual([ok.total, ok.passed, ok.failed, ok.skipped], [7, 7, 0, 0]);
  assert.deepEqual(ok.files, { passed: 2, failed: 0, skipped: 0, total: 2 });
  const red = parseVitestOutput(VITEST_FAIL);
  assert.equal(red.verdict, "RED");
  assert.deepEqual([red.total, red.passed, red.failed, red.skipped], [7, 5, 1, 1]);
  assert.equal(parseVitestOutput("\x1b[32m Tests  2 passed (2)\x1b[0m").verdict, "GREEN", "ANSI colour is stripped");
});

test("vitest: no summary is RUNNER_TERMINATED, no files is ZERO_MATCH, and --expect-total is honoured", () => {
  assert.equal(parseVitestOutput("").verdict, "RUNNER_TERMINATED");
  assert.equal(parseVitestOutput("No test files found, exiting with code 1\n").verdict, "ZERO_MATCH");
  assert.equal(parseVitestOutput(VITEST_PASS, { expectTotal: 8 }).verdict, "DENOMINATOR_MISMATCH");
  assert.equal(parseVitestOutput(VITEST_PASS, { expectTotal: 7 }).verdict, "GREEN");
});

// ---------------------------------------------------------------- generic adapter

test("generic: the exit code decides and counts are a best-effort grep across common reporters", () => {
  assert.equal(parseGenericOutput("all good\n", { exit: 0 }).verdict, "GREEN");
  assert.equal(parseGenericOutput("all good\n", { exit: 0 }).total, null, "no count line means an unknown total");
  assert.equal(parseGenericOutput("all good\n", { exit: 1 }).verdict, "RED");
  assert.equal(parseGenericOutput("", { exit: null }).verdict, "RUNNER_TERMINATED");
  const tap = parseGenericOutput("# tests 12\n# suites 3\n# pass 11\n# fail 1\n# skipped 0\n", { exit: 1 });
  assert.deepEqual([tap.total, tap.passed, tap.failed, tap.verdict], [12, 11, 1, "RED"]);
  const spec = parseGenericOutput("ℹ tests 4\nℹ suites 1\nℹ pass 4\nℹ fail 0\n", { exit: 0 });
  assert.deepEqual([spec.total, spec.passed, spec.verdict], [4, 4, "GREEN"]);
  const words = parseGenericOutput("Tests: 2 failed, 8 passed, 10 total\n", { exit: 1 });
  assert.deepEqual([words.total, words.passed, words.failed, words.verdict], [10, 8, 2, "RED"]);
  const mocha = parseGenericOutput("  5 passing (40ms)\n  1 pending\n", { exit: 0 });
  assert.deepEqual([mocha.total, mocha.passed, mocha.skipped, mocha.verdict], [6, 5, 1, "GREEN"]);
  assert.equal(parseGenericOutput("# pass 3\n# fail 0\n", { exit: 0 }).verdict, "GREEN");
  assert.equal(parseGenericOutput("# pass 3\n# fail 0\n", { exit: 0, expectTotal: 4 }).verdict, "DENOMINATOR_MISMATCH");
  assert.equal(parseGenericOutput("3 passed\n", { exit: 0, expectTotal: 3 }).verdict, "GREEN");
  assert.equal(parseGenericOutput("0 passed, 1 failed\n", { exit: 0 }).verdict, "RED", "a reported failure is RED even on exit 0");
});

// ---------------------------------------------------------------- chooseFilter / globs / changedPaths

test("globToRegExp and matchesAny follow the usual ** / * / ? rules", () => {
  assert.ok(matchesAny("src/a/b.cs", ["src/**"]));
  assert.ok(matchesAny("src/b.cs", ["src/**/*.cs"]));
  assert.ok(matchesAny("src/a/b.cs", ["src/**/*.cs"]));
  assert.ok(!matchesAny("src/a/b.cs", ["src/*.cs"]));
  assert.ok(matchesAny("tests\\x.test.mjs", ["tests/**"]), "backslashes are normalized");
  assert.ok(!matchesAny("docs/x.md", ["src/**", "tests/**"]));
  assert.ok(globToRegExp("a.b?").test("a.bc"));
  assert.ok(!globToRegExp("a.b?").test("axbc"));
});

test("chooseFilter narrows to doc tests only when no changed path matches a source or test glob", () => {
  const globs = { sourceGlobs: ["src/**/*.cs"], testGlobs: ["tests/**/*.cs"] };
  const docs = chooseFilter(["skills/impl/SKILL.md", "scripts/sdd/suite-run.mjs", "docs/plans/x.md"], globs);
  assert.equal(docs.narrow, true);
  assert.match(docs.reason, /no source\/test path/i);
  const cs = chooseFilter(["skills/impl/SKILL.md", "tests/Docs/FalsifiabilityGateTests.cs"], globs);
  assert.equal(cs.narrow, false);
  assert.match(cs.reason, /FalsifiabilityGateTests\.cs/);
  assert.equal(chooseFilter(["src/Product.cs"], globs).narrow, false);
  const unread = chooseFilter(null, globs);
  assert.equal(unread.narrow, false);
  assert.ok(unread.reason.length > 0);
});

test("filteredCommand substitutes {filter} in testFilter or appends --filter", () => {
  assert.equal(filteredCommand({ test: "dotnet test", testFilter: 'dotnet test --filter "{filter}"' }, "Name~X"), 'dotnet test --filter "Name~X"');
  assert.equal(filteredCommand({ test: "dotnet test", testFilter: null }, 'Name~"q"'), 'dotnet test --filter "Name~\\"q\\""');
});

test("changedPaths unions the branch diff against the base with the working tree's changes", () => {
  const repo = fixtureRepo("suite run changed", { files: { "README.md": "base\n" } });
  git(repo, "checkout", "-q", "-b", "feature/x");
  write(repo, "docs/committed.md", "on the branch\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "branch");
  write(repo, "README.md", "dirty\n");
  write(repo, "src/New File.cs", "untracked\n");
  const paths = changedPaths(repo, "main");
  assert.deepEqual([...paths].sort(), ["README.md", "docs/committed.md", "src/New File.cs"]);
  assert.equal(chooseFilter(paths, { sourceGlobs: ["src/**"] }).narrow, false, "the untracked .cs forces the full suite");
  assert.equal(changedPaths(repo, "no-such-ref"), null, "an unresolvable base is reported, not guessed");
});

// ---------------------------------------------------------------- selectCloneProcesses

const ROOT = "C:\\Code\\Product";
const HOME_TOOLS = "C:\\Users\\dev\\.dotnet\\tools";

test("selectCloneProcesses selects by executable path under the repo root, never by name", () => {
  const list = [
    { ProcessId: 101, ExecutablePath: `${ROOT}\\Product\\bin\\Debug\\net10.0\\product.exe` },
    { ProcessId: 102, ExecutablePath: `${ROOT}\\Product.Fake\\bin\\Debug\\net10.0\\Product.Fake.exe` },
    { ProcessId: 103, ExecutablePath: `${HOME_TOOLS}\\.store\\product\\1.2.3\\product\\1.2.3\\tools\\net10.0\\any\\product.exe` },
    { ProcessId: 104, ExecutablePath: `${HOME_TOOLS}\\product.exe` },
    { ProcessId: 105, ExecutablePath: "C:\\Code\\Other\\Product\\bin\\Debug\\net10.0\\product.exe" },
    { ProcessId: 106, ExecutablePath: "C:\\Code\\Product2\\bin\\product.exe" },
    { ProcessId: 107, ExecutablePath: null },
    { ProcessId: 108 },
    { ProcessId: 109, ExecutablePath: "c:/code/product/Product.Web/bin/Debug/net10.0/Product.Web.exe" },
  ];
  const picked = selectCloneProcesses(list, ROOT, { excludeRoots: [HOME_TOOLS], platform: "win32", selfPid: 1, parentPid: 2 });
  assert.deepEqual(picked.map((p) => p.pid), [101, 102, 109]);
  assert.equal(picked[1].path, list[1].ExecutablePath, "the reported path is the process's own spelling");
});

test("selectCloneProcesses defaults its exclusion to the global tool dirs and skips itself and its parent", () => {
  const home = join(tmpdir(), "suite-run-home");
  const root = join(tmpdir(), "suite-run-root");
  const list = [
    { pid: 1, path: join(root, "bin", "a.exe") },
    { pid: 2, path: join(root, "bin", "self.exe") },
    { pid: 3, path: join(root, "bin", "parent.exe") },
  ];
  const picked = selectCloneProcesses(list, root, { selfPid: 2, parentPid: 3, homeDir: home });
  assert.deepEqual(picked.map((p) => p.pid), [1]);
  // a tool dir that lives under the root is still excluded by default
  for (const dir of globalToolDirs(root)) {
    assert.deepEqual(selectCloneProcesses([{ pid: 9, path: join(dir, "tool.exe") }], root, { selfPid: 0, parentPid: 0, homeDir: root }), [], dir);
  }
});

test("selectCloneProcesses honours extra exclude roots such as nested worktrees", () => {
  const list = [
    { ProcessId: 201, ExecutablePath: `${ROOT}\\Product\\bin\\Debug\\net10.0\\product.exe` },
    { ProcessId: 202, ExecutablePath: `${ROOT}\\.claude\\worktrees\\agent-x\\Product\\bin\\Debug\\net10.0\\product.exe` },
  ];
  const picked = selectCloneProcesses(list, ROOT, { excludeRoots: [HOME_TOOLS, `${ROOT}\\.claude\\worktrees\\agent-x`], platform: "win32", selfPid: 1, parentPid: 2 });
  assert.deepEqual(picked.map((p) => p.pid), [201]);
});

test("selectCloneProcesses is case-sensitive off Windows", () => {
  const list = [
    { pid: 1, path: "/home/dev/product/Product/bin/product" },
    { pid: 2, path: "/home/dev/Product/Product/bin/product" },
  ];
  const picked = selectCloneProcesses(list, "/home/dev/product", { excludeRoots: [], platform: "linux", selfPid: 0, parentPid: 0 });
  assert.deepEqual(picked.map((p) => p.pid), [1]);
});

// ---------------------------------------------------------------- end to end (commands are node one-liners; nothing stops a process)

function suiteFixture(name, commandsOverride = {}, extra = {}) {
  const config = makeConfig({ repo: { commands: commandsOverride, ...extra } });
  return fixtureRepo(`suite run ${name}`, { config, files: { "README.md": "x\n" } });
}

test("runs build then test from the config and parses with the generic adapter", () => {
  const repo = suiteFixture("green");
  const r = run("suite-run.mjs", ["--root", repo, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.verdict, "GREEN");
  assert.equal(r.out.runner, "generic");
  assert.equal(r.out.build.exit, 0);
  assert.equal(r.out.exit, 0);
  assert.equal(r.out.total, 3);
  assert.equal(r.out.filter.command, "test");
  assert.equal("stopped" in r.out, false, "process stopping is off by default");
  assert.match(readFileSync(r.out.output, "utf8"), /3 passed/);
  assert.equal(r.out.head, git(repo, "rev-parse", "--short", "HEAD"));
  const mismatch = run("suite-run.mjs", ["--root", repo, "--expect-total", "4"]);
  assert.equal(mismatch.out.verdict, "DENOMINATOR_MISMATCH");
  const bad = run("suite-run.mjs", ["--root", repo, "--expect-total", "x"]);
  assert.equal(bad.status, 1);
  assert.equal(bad.err.error, "SUITE_RUN_ERROR");
});

test("a failed build is BUILD_FAILED and the test never runs; a red test is RED", () => {
  const failed = suiteFixture("build failed", { build: 'node -e "process.exit(3)"' });
  const r = run("suite-run.mjs", ["--root", failed]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.verdict, "BUILD_FAILED");
  assert.equal(r.out.build.exit, 3);
  assert.equal(r.out.exit, null);
  const red = suiteFixture("red", { test: 'node -e "console.log(\'1 failed, 2 passed\'); process.exit(1)"' });
  const rr = run("suite-run.mjs", ["--root", red]);
  assert.equal(rr.out.verdict, "RED");
  assert.equal(rr.out.failed, 1);
  const silent = suiteFixture("silent red", { test: 'node -e "process.exit(1)"' });
  assert.equal(run("suite-run.mjs", ["--root", silent]).out.verdict, "RED", "a non-zero exit is never green");
  const noBuild = suiteFixture("no build", { build: null });
  const nb = run("suite-run.mjs", ["--root", noBuild]);
  assert.equal(nb.out.verdict, "GREEN");
  assert.equal(nb.out.build.skipped, true);
});

test("--filter uses the testFilter form when configured, else appends --filter to the test command", () => {
  const form = suiteFixture("filter form", { testFilter: 'node -e "console.log(\'filter=\' + process.argv[1] + \' 1 passed\')" {filter}' });
  const r = run("suite-run.mjs", ["--root", form, "--filter", "Name~X"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.verdict, "GREEN");
  assert.equal(r.out.filter.expr, "Name~X");
  assert.match(readFileSync(r.out.output, "utf8"), /filter=Name~X/);
  // the trailing `--` keeps node from reading the appended --filter as its own option
  const appended = suiteFixture("filter appended", { test: 'node -e "console.log(process.argv.slice(1).join(\' \') + \' 1 passed\')" --' });
  const a = run("suite-run.mjs", ["--root", appended, "--filter", "Name~Y"]);
  assert.match(readFileSync(a.out.output, "utf8"), /--filter Name~Y 1 passed/);
  assert.match(a.out.filter.cmd, /--filter "Name~Y"$/);
  const missing = run("suite-run.mjs", ["--root", appended, "--filter"]);
  assert.equal(missing.status, 1);
});

test("--baseline narrows to repo.commands.docTests when no source/test path changed, else runs the full suite", () => {
  const repo = suiteFixture("baseline");
  git(repo, "checkout", "-q", "-b", "feature/docs-only");
  write(repo, "docs/plans/x.md", "plan\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "docs");
  const docs = run("suite-run.mjs", ["--root", repo, "--baseline", "--base", "main"]);
  assert.equal(docs.status, 0, docs.stderr);
  assert.equal(docs.out.filter.command, "docTests");
  assert.equal(docs.out.runner, "generic");
  assert.equal(docs.out.total, 2, "the doc tests' own count is parsed");
  assert.equal(docs.out.verdict, "GREEN");
  assert.match(docs.out.filter.reason, /against main: no source\/test path/);
  write(repo, "src/change.cs", "code\n");
  const full = run("suite-run.mjs", ["--root", repo, "--baseline", "--base", "main"]);
  assert.equal(full.out.filter.command, "test");
  assert.equal(full.out.total, 3);
  assert.match(full.out.filter.reason, /1 source\/test path\(s\) changed \(src\/change\.cs\)/);
  const unresolved = run("suite-run.mjs", ["--root", repo, "--baseline", "--base", "no-such-ref"]);
  assert.equal(unresolved.out.filter.command, "test");
  assert.match(unresolved.out.filter.reason, /could not be read/);
});

test("the vitest adapter is selected by repo.testRunner", () => {
  const repo = suiteFixture("vitest", { test: 'node -e "console.log(\' Test Files  1 passed (1)\'); console.log(\'      Tests  4 passed (4)\')"' }, { testRunner: "vitest" });
  const r = run("suite-run.mjs", ["--root", repo]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.runner, "vitest");
  assert.equal(r.out.verdict, "GREEN");
  assert.equal(r.out.total, 4);
  assert.deepEqual(r.out.files, { passed: 1, failed: 0, skipped: 0, total: 1 });
  const bad = suiteFixture("bad runner", {}, { testRunner: "jest" });
  const b = run("suite-run.mjs", ["--root", bad]);
  assert.equal(b.status, 1);
  assert.match(b.err.message, /repo\.testRunner/);
});

test("--help prints usage; a directory without a config is an error", () => {
  const help = run("suite-run.mjs", ["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usage: suite-run\.mjs/);
  const none = run("suite-run.mjs", ["--root", fixtureHome("suite no root")]);
  assert.equal(none.status, 1);
  assert.match(none.err.message, /sdd\.config\.json/);
});
