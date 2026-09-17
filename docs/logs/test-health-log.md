# Test-health log — the central T-N ledger

**Status:** Living · **Started:** 2026-09-16 · authoritative from that date

Every **flaky or slow test** observation (`T-N`) lands here — one ledger instead of blocks scattered
across plans. Harvested by **test-improve**, which redesigns or deletes the test rather than tuning
the entry. A `T-N` is **never `Declined` and never expires** — it stays `Open` until the test is
fixed or removed, because a flaky test is worse than no test at all. Entries are **marked, never
deleted**.

**Entry grammar** (each entry, in order):

- `### T-<n> — <test file> · <test name or describe block>` — a specific file AND a specific test
  name; an aggregate or unidentified target is a defect in the entry. Ids are **global and
  monotonic**: take the next free number, never reuse one.
- `**Found:** <date> · <plan/branch or session>` — provenance.
- `**What happened:**` — the observed behavior, the exact reproducing command, and any
  sleep/poll/timeout duration.
- `**Recommendation:**` — only when there is a clear one.
- `**Status:**` — `Open` / `Resolved <date> — <what/where>` (never `Declined`).
- `**Decision history:**` — dated bullets recording every attempt and reversal (`_none yet_` until
  there is one). The thrash guard: confront prior attempts before proposing one of them again.

---

<!-- ANTIPATTERN-GATE:START -->
## Before you log a `T-N`, check the test against the anti-patterns below

**Why this gate exists.** A test earns its keep by catching bugs before a user does. It stops earning
it the moment the effort of maintaining it exceeds the effort of fixing the bugs it would have caught
— and at that point **the test has inverted the problem to the same effect as having no test at all**,
because the cost lands on a person either way. A suite that consumes more attention than it protects
is not a safety net; it is the incident.

This ledger is where that inversion becomes visible, and it is also where it can become permanent. An
entry logged and left `Open` is a promise to spend *more* time later, on a harvest, on a test that is
already costing more than it returns. So the ledger demands a check on the way in.

**The gate.** Before appending any `T-N`, test the observation against the anti-patterns below.

- **No match** → log the entry as usual. It is a genuine flake and the harvest is the right home.
- **Match** → **do not log it. Fix the test now**, inside whatever feature, bug or hotfix you are
  already running, and say so in that run's summary table.
- **Match, and it cannot be fixed** → **delete the test now**, in the same run. State the coverage
  lost. **Coverage impact is not a defense** — a test that reports unreliably has negative value: it
  spends attention and it teaches people to disbelieve red, which is the state that lets a real
  failure through.

**This is deliberately not harvest work.** Routing an anti-pattern to `test-improve` is how the cost
gets deferred and compounded — in the repository this ledger was lifted from, one flake was handed
forward across three plans before anyone fixed it, and each hand-off cost more than the fix did.
**The run that observes it owns it.** That is the whole rule.

**One thing this gate is NOT.** It is not permission to delete a test that is merely *inconvenient*,
or to weaken an assertion so a suite goes green over a known-broken product. Never relax an assertion
to make a spec pass: if the product changed deliberately, update the assertion to the new intent; if
the product broke, fix the product. The anti-patterns below are all defects in **how the test
observes**, never in **what it asserts**.

### The anti-patterns

**A-1 · The assertion's budget meets or exceeds the test's ceiling.**
An assertion asking for `{ timeout: N }` inside a test whose total budget is also `N` (or less) can
never reach its own limit — the *test* dies first. The error then reads `Test timeout of Nms exceeded`
and names the ceiling instead of the cause, so the same underlying condition presents as a different
"bug" every time it fires. *Detect:* compare each file's max assertion timeout against its per-test
budget (the runner's config-level `timeout`, a per-test `setTimeout`, a per-suite `configure`).
*Fix:* raise the ceiling — centrally if the whole suite shares the cause. **Do not** delete the
assertion's timeout to resolve the contradiction; that silently drops it to the framework default and
makes it worse.

**A-2 · A framework default applied to an operation that never promised it — *once it has actually
failed on that default*.** Every assertion library ships a default wait (Playwright's `expect` is
5 s, for instance). Nothing about a host round-trip, a process start, a debounced search or a
disk-backed endpoint guarantees that budget, and under parallel load they routinely exceed it. An
assertion that inherits the default is asserting a latency budget nobody chose. *Fix:* give it an
explicit budget with the reason stated.

> **The trigger is an OBSERVED failure, not the presence of a default.** Written without that clause
> — as this rule originally was — A-2 matches essentially every assertion in a suite, hundreds of
> them, and an unenforceable rule is adopted once and then ignored. It fires when a *specific*
> assertion has been seen to miss its default budget; it is never a licence to sweep a suite adding
> timeouts to assertions that have never failed. Most assertions on a default are perfectly fine, and
> a budget added speculatively is A-5 wearing a different hat.

*Note the trap:* once a default is raised, every annotation *below* the new default silently inverts
from "give me more time" into "give me less" — re-read them rather than assuming they still mean what
they meant.

**A-3 · An assertion that cannot tell "not yet" from "not there".**
A count assertion on a list populated by a fetch reports `resolved to 0 elements` both when the data
has not arrived *and* when the data arrived without the thing being asserted. Those are a latency
problem and a product bug, and collapsing them into one message costs a diagnosis every single time.
*Fix:* a **settled post-condition** — poll for a state that is both settled *and* correct, and have it
name what it actually saw ("the list is still empty" vs "the list settled with 12 entities, none
matching X"). Never a bare inequality that a transient state can satisfy.

**A-4 · Shared machine-global state in a parallel suite.**
Any path outside the test's isolated workspace — the user's local app-data folder, a real user
profile, a fixed port, a well-known temp file — is shared with every other worker and with the
developer's own machine. *The tell:* a test that identifies "its" artifact by **diffing a directory
listing** rather than by reading the identifier the system reported to it. That works alone and fails
the moment a sibling writes to the same place. *Fix:* isolate the location, or take the identifier the
product already hands you. This also pollutes real user directories, which is its own reason to fix
it.

**A-5 · A wait tuned by raising a number instead of by naming the condition.**
Widening a timeout until a test passes hides what it is waiting for and buys only a slower failure.
The budget should follow from a stated reason ("this polls an endpoint that re-reads four files per
call"), not from experiment. **A bare timeout increase with no reason recorded is itself the
anti-pattern**, even when the resulting number is correct.

**A-6 · A reported count with no denominator, or from a filter that widened silently.**
`42 passed` means nothing without knowing 42 of how many, and a substring filter can quietly run more
than intended — a filter of `catalog` matches every file with that word in its name, so its total is
not `catalog.spec`'s total. Both produce confident, wrong, permanent records. *Fix:* report `N/M` with
the denominator's source named, and scope filters by exact path. This one is a **reporting** defect
rather than a test defect: it does not justify deleting a test, but it does invalidate the
observation, so re-measure before logging anything at all.

**A-7 · A timing compared across a machine that changed underneath it.**
A measurement is only comparable to another taken in the same conditions. On a laptop, moving to
battery drops the CPU to a power-saving profile — measured at **2.2–3.3× slower**, enough on its own
to push assertions past their budgets and produce failures that look like defects.

***Check BEFORE you measure, not after.*** Recording the state afterwards only lets you discover the
comparison was void; it does not stop you making it. Read the power source **as the first step of any
run whose numbers you intend to compare**, state it, and abandon the comparison outright if it changed
mid-way. This wording is the fix for the rule's own first failure: A-7 originally said only "record the
machine state", and on the day it was written **two separate measurements were spoiled by exactly this,
both caught by the developer rather than by the process** — once mid-session on a laptop that went
mobile, once on a profiling pair started without checking at all.

Counts — test totals, host starts, retries, entity counts — are the trustworthy figures either way,
because they do not move with clock speed. Prefer them when you can, and say which of your numbers are
counts and which are timings.

> **Where these came from.** Every one was observed in the repository this ledger was lifted from,
> most of them in one afternoon while diagnosing six different end-to-end tests that failed across six
> runs with none failing twice. They were one condition wearing different masks, and the masks were
> A-1 through A-3. Add to this list when a new shape is found — with the sighting that produced it, so
> the next reader can tell a rule from a preference.
<!-- ANTIPATTERN-GATE:END -->

---
