// Keeps the two agent entry points — CLAUDE.md and .github/copilot-instructions.md, the entries of config
// repo.agentSurfaces with those basenames — bootstrap stubs. Each is loaded into every session, so every byte
// is paid on every turn, and each has regrown a command reference before. Two assertions, deliberately: a size
// ceiling alone permits swapping the working agreement for reference under the cap, a shape check alone permits
// unbounded prose. The shape: the three-stage sentence (pre-impl → impl → post-impl) with a pointer at tracked
// skills, no `## Phase` content, no command listing, no trigger-term list, none of the sections that duplicated
// an authoritative home. A surface the config does not list is skipped; one it lists but that is missing fails.
//
// Paths: config repo.agentSurfaces (only the CLAUDE.md and copilot-instructions.md entries).

import { test } from "node:test";
import assert from "node:assert/strict";
import { sizeOf } from "../lib/config.mjs";
import { fencedLines, openRepo, warn } from "./lib/docs-fixture.mjs";

const repo = openRepo(import.meta.url);
const MAX_BYTES = 12_000;
const THREE_STAGES = /pre-impl\s*(→|->)\s*impl\s*(→|->)\s*post-impl/;
const BANNED_HEADINGS = [
  [/^#{1,6}\s+.*\bInstallation\b/im, "install steps live in the README"],
  [/^#{1,6}\s+.*\bQuick usage\b/im, "the command listing is what regrew last time"],
  [/^#{1,6}\s+.*\bCommand reference\b/im, "a command reference belongs in the product's own agent guide"],
  [/^#{1,6}\s+.*\bDiagnostics\b/im, "diagnostics live in the agent guide"],
  [/^#{1,6}\s+.*\bWhen to use\b/im, "trigger terms ship in a skill's frontmatter description, which is always in the skill list"],
];
const HOMES = "A stub keeps only the working agreement: the three stages, where the docs live, harness gotchas. " +
  "Agent instruction (commands, flags, workflows) belongs in the product's own agent guide or README; obligations to keep surfaces in sync belong in the SDD docs.";

/** The largest group of fenced lines sharing a first token — a command listing is many invocations of one tool. */
function largestInvocationGroup(text) {
  const groups = new Map();
  for (const line of fencedLines(text)) {
    const m = /^\s*([A-Za-z][\w./-]*)\s+\S/.exec(line);
    if (!m) continue;
    groups.set(m[1], (groups.get(m[1]) ?? 0) + 1);
  }
  let best = { token: null, count: 0 };
  for (const [token, count] of groups) if (count > best.count) best = { token, count };
  return best;
}

for (const name of ["CLAUDE.md", "copilot-instructions.md"]) {
  const surface = repo.agentSurface(name);

  test(`${name} stays a bootstrap stub`, (t) => {
    if (!surface) { warn(t, `${name} is not listed in config repo.agentSurfaces — stub checks skipped`); return; }
    assert.ok(surface.exists, `${surface.rel} (config repo.agentSurfaces) does not exist — deploy creates the stub or appends the SDD section to an existing file`);
    const text = surface.text;

    const bytes = sizeOf(text);
    assert.ok(bytes <= MAX_BYTES, `${surface.rel} is ${bytes} bytes, over the ${MAX_BYTES} ceiling. It is loaded into every session, so every byte is paid on every turn. ${HOMES}`);

    assert.match(text, THREE_STAGES, `${surface.rel} must carry the three-stage agreement 'pre-impl → impl → post-impl' — that sentence is the reason the stub exists.`);
    assert.ok(/\bskills\b/.test(text), `${surface.rel} must point at the tracked skills as the canonical workflow instructions.`);
    assert.ok(!/^#{1,6}\s+Phase\s/m.test(text), `${surface.rel} carries phase content ('## Phase …') — the phases live in the skills, the stub only points at them.`);

    for (const [re, why] of BANNED_HEADINGS) {
      assert.ok(!re.test(text), `${surface.rel} reintroduces a duplicated section (${re}): ${why}. ${HOMES}`);
    }
    assert.ok(!/^\s*\**\s*trigger terms?\s*\**\s*:/im.test(text), `${surface.rel} carries a trigger-term list — trigger terms ship in each skill's frontmatter description. ${HOMES}`);

    const group = largestInvocationGroup(text);
    assert.ok(group.count <= 4, `${surface.rel} lists ${group.count} fenced \`${group.token} …\` invocations — that is a command reference, not a pointer. ${HOMES}`);
  });
}
