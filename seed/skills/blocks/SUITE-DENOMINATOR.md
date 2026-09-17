<!-- SUITE-DENOMINATOR:START -->
> ## Suite denominator — read the denominator before the verdict
>
> 1. **Sequential invocation is not sequential execution.** Never run two test layers concurrently, and
>    never edit source while a suite runs. Between layers, poll until the previous runner's processes
>    started by this run have exited, and clear any that outlive it. Stop every dev server and
>    parallel-smoke rung before a full-suite run; restart them before handover. A suite that dies at a
>    timeout with **no failed-tests block**, or a worker that fails to start, is resource starvation,
>    not a hanging test. Capture output in full — `| tail` discards the failed-tests block.
> 2. **Read the denominator.** The suite's reported total (test files, assemblies, or tests, per the
>    runner) must equal the suite's true count — the last known-good total, stated in the profile
>    document — and a lower total is an infrastructure result whatever the pass/fail line says. Run
>    `node scripts/sdd/suite-run.mjs --json` and act on its `verdict`: it builds with `repo.commands.build`,
>    gates on that build, runs `repo.commands.test`, and parses the result by the configured
>    `repo.testRunner` adapter — `BUILD_FAILED`, `RUNNER_TERMINATED`, `TESTHOST_FAILED`, `ZERO_MATCH`
>    and `DENOMINATOR_MISMATCH` are failed runs, never green. After adding tests pass
>    `--expect-total <old total + added>`.
> 3. **A non-default runner mode** (a single worker, an isolated pool) may diagnose one focused file; it
>    never replaces the canonical test command. Retry the canonical command once the machine is quiet.
> 4. **Prerequisites that look like product errors when absent.** The profile document lists the
>    build-before-test steps and machine-state prerequisites for each layer (a sibling project that
>    must be built, a package that must be installed, a runtime that must be present). A failure that
>    matches one of them is machine state, not code. A target framework whose runtime is missing is
>    reported "authored-but-unrun on this machine; CI is the gate" — never a regression and never green.
>
> Stated once here; post-impl's build-verification phase and test-improve cite it by name.
<!-- SUITE-DENOMINATOR:END -->
