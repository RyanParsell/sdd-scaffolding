// Pins that every self-minting story id (`S-YYMMDD.HHMMSSx`) cited in the architecture doc (config
// repo.docs.architecture) resolves to a heading in the stories doc (config repo.docs.stories). post-impl
// writes architecture bullets before the id is minted, so a plausible-looking placeholder that is never
// reconciled is indistinguishable from a real id — this test is what catches it. Story headings are matched
// on any heading line carrying the id, so both `### Story S-…: <title>` and `### S-… — <title>` count.
// On a fresh target, either document may not exist yet; the check then passes with a warning naming it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { openRepo, warn } from "./lib/docs-fixture.mjs";

const repo = openRepo(import.meta.url);
const STORY_ID = /S-\d{6}\.\d{6}[a-z]+/g;

/** Every story id that appears on a heading line. */
function declaredStoryIds(storiesText) {
  const declared = new Set();
  for (const raw of storiesText.split("\n")) {
    const line = raw.trimStart();
    if (!line.startsWith("#")) continue;
    for (const m of line.matchAll(STORY_ID)) declared.add(m[0]);
  }
  return declared;
}

/** Every story id cited anywhere in the text. */
function citedStoryIds(text) {
  return new Set([...text.matchAll(STORY_ID)].map((m) => m[0]));
}

test("every story id cited in the architecture doc resolves to a stories heading", (t) => {
  const architecture = repo.doc("architecture");
  if (!architecture) { warn(t, repo.docMissing("architecture")); return; }
  const cited = citedStoryIds(architecture.text);
  if (cited.size === 0) { t.diagnostic(`${architecture.rel} cites no timestamp story ids yet`); return; }
  const stories = repo.doc("stories");
  if (!stories) { warn(t, `${repo.docMissing("stories")} — ${cited.size} cited id(s) unresolved until it exists`); return; }
  const declared = declaredStoryIds(stories.text);
  assert.ok(declared.size > 0,
    `${architecture.rel} cites ${cited.size} story id(s) but ${stories.rel} (config ${stories.key}) declares no timestamp story headings — the heading shape has changed, which would make this check vacuous.`);
  const dangling = [...cited].filter((id) => !declared.has(id)).sort();
  assert.equal(dangling.length, 0,
    `${architecture.rel} (config ${architecture.key}) cites ${dangling.length} story id(s) with no matching heading in ${stories.rel} (config ${stories.key}): ${dangling.join(", ")}. ` +
    "A cited id that resolves to nothing is usually a placeholder minted before the story was written — mint the id first and cite the real one.");
});

test("a dangling reference is detected (guards the guard)", () => {
  const synthetic = "S-999999.999999z";
  const stories = repo.doc("stories");
  if (stories) assert.ok(!declaredStoryIds(stories.text).has(synthetic), "the synthetic id must not exist in the stories doc");
  assert.match(synthetic, new RegExp(STORY_ID.source));
  assert.ok(citedStoryIds(`a bullet attributed to (${synthetic}) in prose`).has(synthetic));
  assert.ok(declaredStoryIds(`### ${synthetic} — a heading`).has(synthetic));
  assert.ok(!declaredStoryIds(`prose mentioning ${synthetic} is not a heading`).has(synthetic));
});
