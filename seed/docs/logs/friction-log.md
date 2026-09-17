# Friction log — the central F-N ledger

**Status:** Living · **Started:** {{DATE}} · authoritative from that date

Every piece of **skill friction** (`F-N`) observed while running the SDD workflow skills lands here —
one ledger instead of blocks scattered across plans, so duplicates are visible, refinement compounds,
and open work is one grep away. Harvested by **sdd-skill-improve**. Friction is **marked, never
deleted**.

**Entry grammar** (each entry, in order):

- `### F-<n> — <skill> · <phase/area> — <short title>` — ids are **global and monotonic**: take the
  next free number, never reuse one.

  > **The one exception — a concurrent mint.** "Never renumber" is written for a single checkout, and
  > ids are only monotonic *within* one. Two branches that both append before either merges will mint
  > the **same** id for different entries, and the collision surfaces as a textual merge conflict with
  > no rule to resolve it. **Tie-break: the side already on the default branch keeps its ids; the
  > unpushed side renumbers to the next free numbers**, appending a dated `**Decision history:**`
  > bullet on each renumbered entry saying what it was and why. Renumber at the **merge**, where the
  > collision is created — not later, where plan and PR references have already spread. **Never
  > delete an entry to resolve a collision** — that is the failure a literal reading of "never
  > renumber" invites.
- `**Found:** <date> · <plan/branch or session>` — provenance.
- `**What happened:**` — narrative a fresh context window can reason from.
- `**Recommendation:**` — only when there is a clear one.
- `**Status:**` — `Open` / `Resolved <date> — <what/where>` / `Declined <date> — <reason>`.
- `**Decision history:**` — dated bullets recording every attempt, reversal, and why (`_none yet_`
  until there is one). **The thrash guard:** a proposed fix must confront what was tried before —
  going A→B→A without reading this line is the failure this ledger exists to prevent.

<!-- SMALL-FIX-RULE:START -->
## The inline small-fix rule — stated here, cited everywhere

This ledger is read on the way **in**, not only written on the way out: every trio run opens by
reading the `Open` entries naming the skill it is about to run, and the bookends of the trio
(**pre-impl** when planning a round, **post-impl** at its friction phase) may **resolve** a small one
on the spot rather than waiting for the weekly `sdd-skill-improve` harvest. `impl` reads but never
fixes. The harvest itself uses this same rule for its direct-apply carve-out — one definition, cited
by name from the skills, never restated there.

A fix qualifies as **small** only when **all** of these hold:

1. **A few lines in ONE file.** Multiple skills, a convention change, a meta-test, or anything needing
   its own verification is **structural** — it takes the plan path through the trio. When unsure, plan.
2. **Its Decision history shows no prior reversal.** An entry that has already been fixed one way and
   moved back is exactly the A→B→A case; it gets a plan and a decision, not a quick edit.
3. **On a branch, never on the default branch** — the same refusal `impl` enforces.
4. **Cited, flipped, and recorded in the SAME commit:** the commit names the entry (`F-N`), sets its
   `**Status:**` to `Resolved <date> — <what/where>`, and appends a dated `**Decision history:**`
   bullet. A fix whose entry still reads `Open` is indistinguishable from an unfixed one.
5. **At most TWO per trio run**, counted across both bookends of one plan. The cap is what keeps a
   feature run from quietly becoming an unplanned harvest; anything beyond it stays `Open` for the
   harvester, which is the cadence built to absorb it.
6. **"Small" bounds the EDIT, never the verification.** A qualifying fix passes the same full build
   and suite gate as any other change — a filtered run that covers only the tests you thought were
   relevant is not a verification, it is a guess. The lesson behind this: a textbook six-line fix to
   a build script was verified against the two test classes that looked related, went green, and
   committed **red**, because a third class pinned the exact string it changed.

**The one carve-out — impl may repair its own EXECUTING ENVIRONMENT.** The split above is
bookend-vs-middle: *impl reads but never fixes.* That assumes impl's blocker is always in the plan's
subject matter, and sometimes it is in the machinery impl is running on — a stale or misplaced skill
mirror, an unbuilt tool, a worktree with no deployed skills at all. Waiting for a bookend there means
halting a run over a file copy. So impl **may** repair a defect in the environment executing the run,
under conditions 1–6 above **plus** the `FALSIFIABILITY-GATE` (the canonical block copied in the
pre-impl and impl skills).

The line is **environment versus subject**, not bookend versus middle: if the defect is in what the
plan is about, the rule is unchanged and impl still does not fix it.

**Where the fix is recorded when it has no plan of its own:** an inline fix always happens inside some
trio run, so its `Resolved` line and its Decision-history bullet name that **hosting run's plan path
and branch**. The fix rides that run's branch and PR as its own commit — never a separate branch,
never a second push.
<!-- SMALL-FIX-RULE:END -->

<!-- READ-PROTOCOL:START -->
## The errata read — breadth over titles, depth by relevance

Every trio run opens by reading the `Open` entries naming the skill it is about to run. **This block is
the method** — stated once here, cited by name from `pre-impl`, `impl`, and `post-impl`, never restated
there.

**Why it is not "read them all".** Measured in the repository this system was lifted from: the open
slice ran to **several hundred lines (~8–10k tokens) per skill**, so a full trio build spent ~27k
tokens re-reading friction before doing any work — against a ledger of ~100 open entries that only
grows. Reading everything is also what produced one of that ledger's own entries: an improvised block
extraction silently dropped the last 8 entries. And it buys little — in the run that authored this
protocol, **4 of 29** entries changed what the run did, all four found by relevance, none by recency.

1. **Scan every title for your skill — completely.**
   `grep -n '^### F-.* — <skill>' docs/logs/friction-log.md` (the path is config
   `repo.ledgers.friction`). **The grep's output *is* the index**: each heading carries the skill, the
   phase, and a one-line statement of the problem, which is enough to triage on. Scanning all of them
   is mandatory, and **reconciling the count you scanned against the count the grep returned** is what
   makes a truncated read impossible to miss. Never page this through `head`.
2. **Open in full only what this run can act on.** An entry earns a full read when its title:
   - **names a phase this run will execute**, or
   - **touches this plan's subject**, or
   - **reads as a silent or irreversible trap** — something that ships a wrong artifact, loses work, or
     passes vacuously — **regardless of the entry's age or phase**.

   Everything else stays title-only. Recency is a tiebreak note, not a trigger: these skills are revised
   every few days, so an entry two weeks old has already seen several revisions of the text it is errata
   against.
3. **Skipping is not deferral.** A title-only entry stays `Open`, and the next run scans its title again.
   Nothing is closed, downgraded, or hidden by this protocol — only left unopened.
4. **Check the `**Status:**` line of anything you open.** The grep matches every entry regardless of
   status; only `Open` ones are errata. Resolved and Declined entries are history.
5. **State the counts in your run's summary table** — `N titles scanned, M read in full, K acted on`,
   naming the entries acted on. The Errata row is where the loop's inward half becomes auditable rather
   than inferred.

**The harvest is exempt.** `sdd-skill-improve` reads **every** open entry, by design — clustering and
ranking the whole corpus is its entire job, and a filtered read would silently shrink the survey it
exists to produce. This protocol governs the trio's per-run read only.
<!-- READ-PROTOCOL:END -->

<!-- EXPIRY-GATE:START -->
## The expiry gate — an entry is judged before it can expire

The expiry sweep (config `harvest.expiryDays`, 30 by default) is `sdd-skill-improve`'s, and this block
is **when it is allowed to fire** — stated once here, cited by name from the harvest, never restated
there.

**Two conditions, both required.** An `F-N` may be auto-`Declined` as expired only when:

1. **It has been scanned** — its id is at or below the **scan watermark** below. An entry no harvest
   has ever clustered has not been judged, and `Declined` is a verdict, not a timeout.
2. **It is older than the expiry window on the gated clock** — age runs from **`max(Found, last-scan)`**,
   not from `**Found:**` alone.

**Why the clock is gated too.** Condition 1 alone buys exactly one scan: the harvest clusters and
ranks *every* surviving entry and caps only the *decisions* at the top N, so a single run would advance
the watermark across the whole corpus at once and everything would age out on its original dates
regardless — a bulk rubber-stamp wearing the shape of judgment. Resetting the clock on scan means an
entry expires only if a harvest looked at it **and** it still did not matter a month later.

**Why this exists.** In the repository this system was lifted from, the sweep computed age from
`**Found:**` alone, with no carve-out for entries migrated in bulk from older per-plan blocks whose
provenance dates predated the central ledger. Every open entry would have auto-`Declined` within a
month — expiry draining entries roughly **8× faster than triage** could judge them. The rule's
justification — *"a skill's friction genuinely goes stale as the skill changes underneath it"* — is
sound for friction that was seen and deferred, and simply does not describe entries that no harvest
had read even once. They would have been closed with *"no action taken within 30 days of its Found
date"* when the reason no action was taken is that nobody had looked yet.

**`T-N` is untouched by all of this** — a flaky test never expires and is never `Declined`, whatever
its age or scan state. The gate narrows `F-N` expiry; it does not extend expiry anywhere new.

**Advancing the watermark is a plan deliverable, never a direct write** — the same invariant the
sweep already obeys: the harvest *computes* the new value and reports it, and the plan it hands to
pre-impl carries the edit.
<!-- EXPIRY-GATE:END -->

<!-- SCAN-WATERMARK:START -->
**Scan watermark:** `F-0` · {{DATE}}

Every `F-N` at or below this id has been judged by a harvest and is eligible under the age gate
above if it remains Open; everything above it has not yet been judged and cannot expire. Ids are
**global and monotonic**, so this one number stands in for a per-entry field, and any new entry is
necessarily above the mark.

Not yet advanced — no harvest has run against this ledger. The first `sdd-skill-improve` run
computes the new value and reports it; the plan it hands to pre-impl carries the edit, replacing
this paragraph with `Advanced from the prior watermark <id> · <date> — by harvest <slug>, which
scanned <n> open entries …`.
<!-- SCAN-WATERMARK:END -->

---
