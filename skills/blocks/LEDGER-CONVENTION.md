<!-- LEDGER-CONVENTION:START -->
> Friction and flake observations go to the **central ledgers**, never to the plan file:
> the **friction ledger** (config `repo.ledgers.friction`) holds `F-N` (friction with a skill itself —
> harvested by **sdd-skill-improve**) and the **test-health ledger** (config `repo.ledgers.testHealth`)
> holds `T-N` (a flaky or slow test — harvested by **test-improve**). Entries are **marked, never
> deleted**: every entry ends in a `**Status:**` line (`Open` / `Resolved <date> — <what/where>` /
> `Declined <date> — <reason>`), opens with a `**Found:**` provenance line (date; plan/branch;
> skill·phase), and carries a `**Decision history:**` line so a proposed fix must confront prior
> attempts before re-making one — the A→B→A thrash guard. A `T-N` is never `Declined` and never
> expires — it stays `Open` until the test is fixed or removed. IDs are **global and monotonic per
> ledger** (read the ledger, take the next free number, never reuse or renumber); the two ledgers
> number independently. Before logging, **check for an existing entry describing the same problem** —
> extend its Decision history or add a new dated sighting rather than minting a duplicate. (Plans
> never carry a friction block.)
>
> **The loop runs INWARD too — the ledger is read on the way in, not only written on the way out.**
> Every trio run opens by reading the `Open` `F-N` entries naming the skill it is about to run: they
> are **errata against the instructions you are executing**, and where an entry contradicts or
> supplements a phase, **the entry is the newer information**. Fixing happens only at the **bookends**
> — **pre-impl** may fold a small open fix into the round it is planning, **post-impl** may fix a small
> entry it just re-confirmed instead of logging another sighting, and **impl reads but never fixes**
> (it stays on the plan). An inline fix obeys the **small-fix rule stated once in the friction
> ledger's header** — a few lines in one file, no prior reversal in its Decision history, on a branch
> never the default branch, citing the entry and flipping its `**Status:**` with a dated
> Decision-history bullet in the same commit, and **at most two per trio run** across both bookends.
> The fix rides the hosting run's own branch as its own commit (never a separate branch, never a
> second push), and — having no plan of its own — cites that **hosting run's plan and branch** as its
> record.
<!-- LEDGER-CONVENTION:END -->
