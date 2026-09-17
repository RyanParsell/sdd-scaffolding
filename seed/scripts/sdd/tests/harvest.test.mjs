import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { fixtureHome, fixtureRepo, git, makeConfig, run as runScript, script, write } from "./fixture.mjs";

const { parseLedger } = await import(pathToFileURL(script("harvest.mjs")).href);

function run(root, args, extra) {
  return runScript("harvest.mjs", [...args, "--root", root, "--no-fetch"], extra);
}
function runText(root, args) {
  const r = runScript("harvest.mjs", [...args, "--root", root, "--no-fetch"]);
  return { status: r.status, out: r.stdout, err: r.err };
}

const CONFIG = makeConfig();

const LEDGER = (eol) => [
  "# Friction log",
  "",
  "<!-- SCAN-WATERMARK:START -->",
  "**Scan watermark:** `F-2` · 2026-08-01",
  "",
  "Advanced from the prior watermark `F-1` · 2026-07-01.",
  "<!-- SCAN-WATERMARK:END -->",
  "",
  "### F-1 — impl · Phase 2 (edits) — inline history, old",
  "**Found:** 2026-06-01 · `docs/plans/a.md` · branch feature/a",
  "**What happened:** old and scanned.",
  "**Status:** Open",
  "**Decision history:** _none yet_",
  "",
  "### F-2 — impl · Phase 2 (edits) — bullet history, sighted twice",
  "**Found:** 2026-07-20 · `docs/plans/b.md` · branch feature/b",
  "**What happened:** bullets.",
  "**Status:** Open",
  "**Decision history:**",
  "- 2026-07-28 — first sighting.",
  "  continuation line.",
  "- 2026-08-12 — second sighting.",
  "",
  "### F-3 — post-impl · Phase 5 (suite) — above the watermark",
  "**Found:** 2026-06-15 · `docs/plans/c.md` · branch feature/c",
  "**What happened:** never scanned.",
  "**Status:** Open",
  "**Decision history:** _none yet_",
  "",
  "### F-4 — impl · Phase 2 (edits) — already resolved",
  "**Found:** 2026-06-15 · `docs/plans/d.md` · branch feature/d",
  "**What happened:** done.",
  "**Status:** Resolved 2026-07-01 — fixed",
  "**Decision history:** _none yet_",
  "",
].join(eol);

function fixture(name, { eol = "\n", config = CONFIG } = {}) {
  return fixtureRepo(`harvest ${name}`, {
    config,
    files: {
      "skills/alpha/SKILL.md": "---\nname: alpha\ndescription: alpha\nversion: 1.0.0\n---\n# alpha\n",
      ".claude/skills/alpha/SKILL.md": "---\r\nname: alpha\r\ndescription: alpha\r\nversion: 1.0.0\r\n---\r\n# alpha\r\n",
      "docs/logs/friction-log.md": LEDGER(eol),
      "docs/logs/test-health-log.md": "# T\n\n### T-1 — a.test.ts · flaky\n**Found:** 2026-08-01 · x\n**What happened:** y\n**Status:** Open\n**Decision history:** _none yet_\n",
      // nested on purpose: git's default pathspec `src/**/*.cs` matches `src/lib/x.cs`, not a direct child
      "src/lib/Present.cs": "",
      "src/lib/Unlisted.cs": "",
      "docs/sdd/fixture-project-structure.md": "`src/lib/Present.cs` and `src/lib/Gone.cs`\n",
      "docs/plans/2026-09-04-sdd-skill-improve-260904a.md": "",
    },
  });
}

test("parseLedger reads both decision-history forms and flags a double Status", () => {
  const { entries } = parseLedger(LEDGER("\n"));
  assert.equal(entries.length, 4);
  assert.equal(entries[0].historyForm, "inline");
  assert.equal(entries[1].historyForm, "bullets");
  assert.deepEqual(entries[1].sightingDates, ["2026-07-28", "2026-08-12"]);
  assert.equal(entries[1].skill, "impl");
  assert.equal(entries[1].phase, "Phase 2 (edits)");
  const bad = parseLedger(LEDGER("\n").replace("**Status:** Open\n**Decision history:** _none yet_\n\n### F-2", "**Status:** Open\n**Status:** Open\n**Decision history:** _none yet_\n\n### F-2"));
  assert.equal(bad.entries[0].statusCount, 2);
});

test("scan applies the expiry gate: scanned and old expires, above the watermark never does", () => {
  const repo = fixture("scan");
  const r = run(repo, ["scan", "--today", "2026-09-04"]);
  assert.equal(r.status, 0, JSON.stringify(r.err));
  assert.equal(r.out.openCount, 3);
  assert.equal(r.out.tOpenCount, 1);
  assert.equal(r.out.defaultBranch, "main");
  // F-1: found 2026-06-01, scanned at the 2026-08-01 watermark → gated clock 2026-08-01, 34 days → expires.
  // F-2: found 2026-07-20 (before the watermark date) → same clock, expires. F-3 is above the watermark: never.
  assert.deepEqual(r.out.expired.map((e) => e.id), ["F-1", "F-2"]);
  assert.equal(r.out.ineligibleAboveWatermark, 1);
  const f2 = r.out.entries.find((e) => e.id === "F-2");
  assert.equal(f2.gatedClockDate, "2026-08-01");
  assert.equal(f2.expirable, true);
  const f3 = r.out.entries.find((e) => e.id === "F-3");
  assert.equal(f3.expirable, false);
  const young = run(repo, ["scan", "--today", "2026-08-20"]);
  assert.deepEqual(young.out.expired, [], "19 days on the gated clock expires nothing");
});

test("scan reads the ledger path from config repo.ledgers.friction", () => {
  const config = makeConfig({ repo: { ledgers: { friction: "notes/friction.md" } } });
  const repo = fixture("ledger path", { config });
  write(repo, "notes/friction.md", LEDGER("\n"));
  const r = run(repo, ["scan", "--today", "2026-09-04"]);
  assert.equal(r.status, 0, JSON.stringify(r.err));
  assert.equal(r.out.openCount, 3);
  const missing = run(repo, ["scan", "--ledger", "nowhere.md"]);
  assert.equal(missing.status, 1);
  assert.match(missing.err.message, /not found/);
});

test("scan exits 1 naming an entry with two Status lines", () => {
  const repo = fixture("double");
  write(repo, "docs/logs/friction-log.md", LEDGER("\n").replace("**Status:** Open\n**Decision history:** _none yet_\n\n### F-2", "**Status:** Open\n**Status:** Open\n**Decision history:** _none yet_\n\n### F-2"));
  const r = run(repo, ["scan"]);
  assert.equal(r.status, 1);
  assert.equal(r.err.error, "SDD_HARVEST_ERROR");
  assert.equal(r.err.malformed[0].id, "F-1");
});

test("patterns groups sightings by skill·phase across ISO weeks", () => {
  const repo = fixture("patterns");
  const r = run(repo, ["patterns", "--today", "2026-09-04"]);
  assert.equal(r.status, 0, JSON.stringify(r.err));
  const g = r.out.groups.find((x) => x.key === "impl · Phase 2");
  assert.deepEqual(g.ids, ["F-1", "F-2"]);
  assert.ok(g.weeks.length >= 3);
  assert.ok(r.out.recurring.some((x) => x.key === "impl · Phase 2"));
});

for (const eol of ["\n", "\r\n"]) {
  test(`flips edits within the entry span, both history forms, preserving ${eol === "\n" ? "LF" : "CRLF"}`, () => {
    const repo = fixture(`flips-${eol.length}`, { eol });
    write(repo, "decisions.json", JSON.stringify([
      { id: "F-1", status: "Resolved 2026-09-04 — impl Phase 2 EDIT-MECHANISM block", historyBullet: "2026-09-04 — resolved by harvest." },
      { id: "F-2", status: "Resolved 2026-09-04 — same block", historyBullet: "2026-09-04 — resolved by harvest, bullet form." },
    ]));
    const r = run(repo, ["flips", "--decisions", "decisions.json"]);
    assert.equal(r.status, 0, JSON.stringify(r.err));
    assert.deepEqual(r.out.flipped, ["F-2", "F-1"]);
    assert.equal(r.out.openBefore, 3);
    assert.equal(r.out.openAfter, 1);
    const text = readFileSync(join(repo, "docs/logs/friction-log.md"), "utf8");
    assert.equal(text.includes("\r\n"), eol === "\r\n");
    assert.ok(text.includes(`**Status:** Resolved 2026-09-04 — impl Phase 2 EDIT-MECHANISM block${eol}**Decision history:**${eol}- 2026-09-04 — resolved by harvest.${eol}`));
    assert.ok(text.includes(`- 2026-08-12 — second sighting.${eol}- 2026-09-04 — resolved by harvest, bullet form.${eol}`));
    assert.ok(text.includes("### F-3"), "untouched entries survive");
    const again = run(repo, ["flips", "--decisions", "decisions.json"]);
    assert.equal(again.status, 1, "a second run refuses because F-1 is no longer Open");
  });
}

test("watermark rewrites the block in the grammar the meta-test parses, and refuses to overshoot", () => {
  const repo = fixture("watermark");
  const bad = run(repo, ["watermark", "--to", "F-9", "--date", "2026-09-04"]);
  assert.equal(bad.status, 1);
  const r = run(repo, ["watermark", "--to", "F-4", "--date", "2026-09-04", "--note", "by harvest test"]);
  assert.equal(r.status, 0, JSON.stringify(r.err));
  const text = readFileSync(join(repo, "docs/logs/friction-log.md"), "utf8");
  assert.match(text, /\*\*Scan watermark:\*\* `F-4` · 2026-09-04/);
  assert.ok(text.includes("Advanced from the prior watermark `F-2` · 2026-08-01 — by harvest test"));
  assert.ok(text.includes("### F-1"), "entries survive the block rewrite");
});

test("size measures CR-stripped bytes against the budget and treats 0 as unset", () => {
  const repo = fixture("size");
  const ok = run(repo, ["size"]);
  assert.equal(ok.out.ok, true);
  const lfBytes = ok.out.skills.alpha.bytes;
  write(repo, "skills/alpha/SKILL.md", readFileSync(join(repo, "skills/alpha/SKILL.md"), "utf8").replace(/\n/g, "\r\n"));
  assert.equal(run(repo, ["size"]).out.skills.alpha.bytes, lfBytes, "a line-ending flip does not move the size");
  write(repo, "skills/sdd.config.json", JSON.stringify(makeConfig({ sizeBudgetBytes: { alpha: 5 } })));
  const over = run(repo, ["size"]);
  assert.equal(over.out.ok, false);
  assert.equal(over.out.skills.alpha.overBudget, true);
  write(repo, "skills/sdd.config.json", JSON.stringify(makeConfig({ sizeBudgetBytes: { alpha: 0 } })));
  const unset = run(repo, ["size"]);
  assert.equal(unset.out.ok, true);
  assert.equal(unset.out.skills.alpha.unset, true);
});

test("sweep reports stale references and unlisted tracked files", () => {
  const repo = fixture("sweep");
  const r = run(repo, ["sweep"]);
  assert.equal(r.status, 0, JSON.stringify(r.err));
  assert.deepEqual(r.out.stale, ["src/lib/Gone.cs"]);
  assert.deepEqual(r.out.missing, ["src/lib/Unlisted.cs"]);
});

test("parity compares content with line endings normalized, version, and the installer's needsAttention", () => {
  const repo = fixture("parity");
  const home = fixtureHome("parity");
  const r = run(repo, ["parity"], { env: { SDD_SKILLS_HOME: home } });
  assert.equal(r.status, 0, JSON.stringify(r.err));
  assert.equal(r.out.rows[0].mirror, ".claude/skills/alpha/SKILL.md");
  assert.equal(r.out.rows[0].same, true, "CRLF mirror of an LF source is the same content");
  assert.equal(r.out.needsAttention, 0);
  assert.equal(r.out.ok, true);
  write(repo, ".claude/skills/alpha/SKILL.md", "---\nname: alpha\ndescription: alpha\nversion: 1.0.0\n---\n# alpha changed\n");
  const drift = run(repo, ["parity"], { env: { SDD_SKILLS_HOME: home } });
  assert.equal(drift.out.rows[0].same, false);
  assert.equal(drift.out.needsAttention, 1, "skills.mjs status reports the stale mirror");
  assert.equal(drift.out.ok, false);
  // a harness without a mirror is a missing row
  write(repo, "skills/sdd.config.json", JSON.stringify(makeConfig({ skills: { harnesses: ["claude", "codex"] } })));
  const missing = run(repo, ["parity"], { env: { SDD_SKILLS_HOME: home } });
  assert.deepEqual(missing.out.rows.map((x) => [x.mirror, x.missing ?? false]), [[".claude/skills/alpha/SKILL.md", false], [".agents/skills/alpha/SKILL.md", true]]);
});

test("scan, patterns and seams record the commit they read as head", () => {
  const repo = fixture("head");
  const head = git(repo, "rev-parse", "--short", "HEAD");
  const scan = run(repo, ["scan", "--today", "2026-09-04"]);
  assert.equal(scan.status, 0, JSON.stringify(scan.err));
  assert.equal(scan.out.head, head);
  const patterns = run(repo, ["patterns", "--today", "2026-09-04"]);
  assert.equal(patterns.status, 0, JSON.stringify(patterns.err));
  assert.equal(patterns.out.head, head);
  // seams lists PRs through gh, which needs a GitHub remote; the probe injects an empty PR lister
  // and runs in its own process so a gh failure cannot exit the test runner.
  write(repo, "seams-probe.mjs", [
    `import { COMMANDS } from ${JSON.stringify(pathToFileURL(script("harvest.mjs")).href)};`,
    `import { loadConfig } from ${JSON.stringify(pathToFileURL(script("lib/config.mjs")).href)};`,
    `const cfg = loadConfig(process.argv[2]);`,
    `process.stdout.write(JSON.stringify(COMMANDS.seams(process.argv[2], cfg, { "no-fetch": true }, () => [])));`,
  ].join("\n"));
  const probe = spawnSync(process.execPath, [join(repo, "seams-probe.mjs"), repo], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const seams = JSON.parse(probe.stdout);
  assert.equal(seams.head, head);
  assert.equal(seams.openPrs, 0);
  assert.equal(seams.ghAvailable, true);
  // a constant head would be a cached field: a new commit must move it
  write(repo, "next.txt", "x");
  git(repo, "add", "next.txt");
  git(repo, "commit", "-q", "-m", "next");
  const moved = run(repo, ["scan", "--today", "2026-09-04"]);
  assert.notEqual(moved.out.head, head);
  assert.equal(moved.out.head, git(repo, "rev-parse", "--short", "HEAD"));
});

test("seams degrades to ghAvailable=false when gh cannot run, instead of failing", () => {
  const repo = fixture("seams no gh");
  const r = run(repo, ["seams"], { env: { GH: join(repo, "no-such-gh-binary") } });
  assert.equal(r.status, 0, JSON.stringify(r.err));
  assert.equal(r.out.ghAvailable, false);
  assert.equal(r.out.openPrs, null);
  assert.deepEqual(r.out.seams, []);
  assert.match(r.out.reason, /gh/);
  assert.equal(r.out.head, git(repo, "rev-parse", "--short", "HEAD"));
});

test("digest emits one block per open entry, each id once, from scan's own entry set", () => {
  const repo = fixture("digest");
  const scan = run(repo, ["scan", "--today", "2026-09-04"]);
  const r = runText(repo, ["digest", "--today", "2026-09-04"]);
  assert.equal(r.status, 0, JSON.stringify(r.err));
  const headers = r.out.split("\n").filter((l) => l.startsWith("=== F-"));
  assert.equal(headers.length, scan.out.openCount);
  const ids = headers.map((l) => l.split(" ")[1]);
  assert.equal(new Set(ids).size, ids.length, "no id repeated");
  assert.deepEqual(ids, scan.out.entries.map((e) => e.id));
  const blocks = r.out.trimEnd().split("\n\n");
  assert.equal(blocks.length, scan.out.openCount, "blocks are separated by exactly one blank line");
  const f2 = blocks.find((b) => b.startsWith("=== F-2 ")).split("\n");
  assert.deepEqual(f2, [
    "=== F-2 | impl · Phase 2 (edits) | found 2026-07-20 | sightings 2 (last 2026-08-12) | age 34",
    "TITLE: impl · Phase 2 (edits) — bullet history, sighted twice",
    "WHAT: bullets.",
    "REC: ",
  ]);
  assert.ok(blocks.find((b) => b.startsWith("=== F-1 ")).startsWith("=== F-1 | impl · Phase 2 (edits) | found 2026-06-01 | sightings 0 (last ) | age 34\n"));
  const json = run(repo, ["digest", "--json", "--today", "2026-09-04"]);
  assert.equal(json.status, 0, JSON.stringify(json.err));
  assert.equal(json.out.head, git(repo, "rev-parse", "--short", "HEAD"));
  assert.equal(json.out.openCount, 3);
  assert.equal(json.out.digest.trimEnd(), r.out.trimEnd());
});

test("digest truncates WHAT at the configured length and reads REC within the entry's own span", () => {
  const repo = fixture("digest-trunc");
  write(repo, "skills/sdd.config.json", JSON.stringify(makeConfig({ harvest: { digestWhatChars: 20 } })));
  write(repo, "docs/logs/friction-log.md", LEDGER("\r\n").replace(
    "**What happened:** old and scanned.",
    "**What happened:** the first   line runs long\r\nand **wraps** onto a second line.\r\n**Recommendation:** do\r\n  the thing.",
  ));
  const r = runText(repo, ["digest", "--today", "2026-09-04"]);
  assert.equal(r.status, 0, JSON.stringify(r.err));
  const blocks = r.out.trimEnd().split(/\r?\n\r?\n/);
  const f1 = blocks.find((b) => b.startsWith("=== F-1 ")).split("\n");
  assert.equal(f1[2], "WHAT: " + "the first line runs long and **wraps** onto a second line.".slice(0, 20));
  assert.equal(f1[3], "REC: do the thing.");
  assert.equal(blocks.find((b) => b.startsWith("=== F-2 ")).split("\n")[3], "REC: ", "F-1's Recommendation does not leak into F-2");
});

test("scan --id restricts entries to the named ids and fails on an id that is not open", () => {
  const repo = fixture("scan-id");
  const r = run(repo, ["scan", "--today", "2026-09-04", "--id", "F-3,F-1"]);
  assert.equal(r.status, 0, JSON.stringify(r.err));
  assert.deepEqual(r.out.entries.map((e) => e.id).sort(), ["F-1", "F-3"]);
  assert.ok(r.out.entries[0].text.includes("**What happened:**"), "full text");
  assert.equal(r.out.openCount, 3, "every other field is computed over the full open set");
  assert.deepEqual(r.out.expired.map((e) => e.id), ["F-1", "F-2"]);
  const resolved = run(repo, ["scan", "--id", "F-4"]);
  assert.equal(resolved.status, 1);
  assert.match(resolved.err.message, /F-4/);
  const unknown = run(repo, ["scan", "--id", "F-1,F-9999"]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.err.message, /F-9999/);
  assert.doesNotMatch(unknown.err.message, /F-1\b/);
});

test("slug takes the lowest unused letter across branches, plan dirs and git history, in the configured branch shape", () => {
  const repo = fixture("slug");
  const r = run(repo, ["slug", "--date", "260904"]);
  assert.deepEqual(r.out.used, ["a"]);
  assert.equal(r.out.letter, "b");
  assert.equal(r.out.branch, "feature/sdd-skill-improve-260904b");
  const other = run(repo, ["slug", "--date", "260904", "--skill", "test-improve"]);
  assert.equal(other.out.branch, "feature/test-improve-260904b");
  write(repo, "skills/sdd.config.json", JSON.stringify(makeConfig({ repo: { branches: { feature: "work/{slug}" } } })));
  assert.equal(run(repo, ["slug", "--date", "260904"]).out.branch, "work/sdd-skill-improve-260904b");
});

test("--help, an unknown subcommand and a missing root are reported", () => {
  const help = runScript("harvest.mjs", ["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usage: harvest\.mjs/);
  const bad = runScript("harvest.mjs", ["nope"]);
  assert.equal(bad.status, 1);
  assert.equal(bad.err.error, "SDD_HARVEST_ERROR");
  const noRoot = runScript("harvest.mjs", ["scan", "--root", fixtureHome("harvest no root")]);
  assert.equal(noRoot.status, 1);
  assert.match(noRoot.err.message, /sdd\.config\.json/);
});
