// Enforces the SDD-anchored tag convention on the plan archive: the artifacts README (config
// repo.docs.artifacts + README.md) declares the tag vocabulary in a TAG-VOCAB block and every index row is
// tagged; every plan in config repo.docs.plans carries a `**Tags:**` header. Tags connect completed work back
// to the PRD (`prd:FR-N` / `prd:NFR-N` resolve to a requirement in config repo.docs.prd), the architecture
// (`arch:<slug>` from the curated list) and the stories areas (`area:<slug>`, 1:1 with `## Area:` sections in
// config repo.docs.stories). Deploy always creates the artifacts README, so a missing one fails; the PRD,
// stories doc and plans folder may not exist yet on a fresh target, and those checks pass with a warning.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openRepo, readLf, requireBlock, warn, headings as docHeadings } from "./lib/docs-fixture.mjs";

const repo = openRepo(import.meta.url);
const MAX_TAGS = 6;
const TAG_SHAPE = /^(prd:(FR|NFR)-\d+[a-z]?|arch:[a-z0-9][a-z0-9-]*|area:[a-z0-9][a-z0-9-]*)$/;
const INDEX_ROW = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|([^|]*)\|/;
const BACKTICKED = /`([^`]+)`/g;

function artifactsReadme() {
  const dir = repo.path("repo.docs.artifacts");
  assert.ok(dir, "config repo.docs.artifacts is not set");
  const file = join(dir, "README.md");
  assert.ok(existsSync(file), `${repo.rel(file)} (config repo.docs.artifacts) does not exist — deploy creates the artifacts README with its TAG-VOCAB block`);
  return { file, rel: repo.rel(file), text: readLf(file) };
}

/** The declared vocabulary: arch slugs, and area slug → stories heading. */
function vocabulary() {
  const readme = artifactsReadme();
  const body = requireBlock(readme.text, "TAG-VOCAB", readme.rel);
  const arch = new Set();
  const areas = new Map();
  let table = null;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) {
      if (/`arch:`/.test(line)) table = "arch";
      else if (/`area:`/.test(line)) table = "area";
      continue;
    }
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length < 2 || /^-+$/.test(cells[0].replace(/:/g, ""))) continue;
    if (/^slug$/i.test(cells[0])) { table = /area/i.test(cells[1]) ? "area" : /component|arch/i.test(cells[1]) ? "arch" : table; continue; }
    const slug = cells[0].replace(/`/g, "");
    if (!slug) continue;
    if (table === "arch") arch.add(slug);
    else if (table === "area") areas.set(slug, cells[1]);
  }
  return { readme, arch, areas };
}

function indexRowTags() {
  const readme = artifactsReadme();
  const rows = [];
  for (const line of readme.text.split("\n")) {
    const m = INDEX_ROW.exec(line);
    if (!m) continue;
    rows.push({ where: `${readme.rel} index row ${m[1]} [${m[2]}]`, tags: [...m[4].matchAll(BACKTICKED)].map((t) => t[1]) });
  }
  return rows;
}

function planHeaderTags() {
  const plans = repo.docDir("plans");
  if (!plans) return null;
  return plans.files.map((plan) => {
    const tagLine = plan.text.split("\n").find((l) => l.startsWith("**Tags:**"));
    assert.ok(tagLine !== undefined,
      `${plan.rel} has no **Tags:** header line — every plan in ${plans.rel} (config ${plans.key}) carries one (pre-impl stamps it; the vocabulary is in the artifacts README).`);
    return { where: plan.rel, tags: [...tagLine.matchAll(BACKTICKED)].map((t) => t[1]) };
  });
}

function assertValidTagSet({ where, tags }, { arch, areas }) {
  assert.ok(tags.length > 0, `${where}: no tags. Every entry needs at least one \`area:\` tag.`);
  assert.ok(tags.length <= MAX_TAGS, `${where}: ${tags.length} tags exceeds the cap of ${MAX_TAGS}.`);
  assert.ok(tags.some((t) => t.startsWith("area:")), `${where}: has no \`area:\` tag (tags: ${tags.join(" ")}). At least one area is mandatory.`);
  for (const tag of tags) {
    assert.ok(TAG_SHAPE.test(tag), `${where}: tag \`${tag}\` does not match the tag grammar ${TAG_SHAPE}.`);
    if (tag.startsWith("arch:")) assert.ok(arch.has(tag.slice(5)), `${where}: \`${tag}\` is not a declared arch slug — add it to the TAG-VOCAB block deliberately before using it.`);
    if (tag.startsWith("area:")) assert.ok(areas.has(tag.slice(5)), `${where}: \`${tag}\` is not a declared area slug — add the mapping to the TAG-VOCAB block.`);
  }
}

test("the artifacts README declares a parseable TAG-VOCAB block", (t) => {
  const { readme, arch, areas } = vocabulary();
  for (const slug of [...arch, ...areas.keys()]) assert.match(slug, /^[a-z0-9][a-z0-9-]*$/, `${readme.rel}: slug \`${slug}\` is not a lowercase kebab slug`);
  if (arch.size === 0) warn(t, `${readme.rel}'s TAG-VOCAB block declares no arch: slugs yet`);
  if (areas.size === 0) warn(t, `${readme.rel}'s TAG-VOCAB block declares no area: slugs yet`);
});

test("the area mapping is one-to-one with the stories doc's ## Area: sections", (t) => {
  const { readme, areas } = vocabulary();
  const stories = repo.doc("stories");
  if (!stories) { warn(t, repo.docMissing("stories")); return; }
  const headings = new Set(docHeadings(stories.text).filter((h) => h.level === 2 && h.title.startsWith("Area: ")).map((h) => h.title.slice(6).trim()));   // fence-aware: a template area inside a code fence is not an area
  for (const [slug, heading] of areas) {
    assert.ok(headings.has(heading), `area:${slug} maps to "${heading}", which is not a \`## Area:\` heading in ${stories.rel} (config ${stories.key}).`);
  }
  for (const heading of headings) {
    assert.ok([...areas.values()].includes(heading), `stories area "${heading}" (${stories.rel}) has no slug in ${readme.rel}'s TAG-VOCAB block — add the mapping.`);
  }
});

test("every index row carries a valid tag set", (t) => {
  const vocab = vocabulary();
  const rows = indexRowTags();
  if (rows.length === 0) { warn(t, `${vocab.readme.rel} has no index rows yet — post-impl writes the first when a plan is archived`); return; }
  for (const row of rows) assertValidTagSet(row, vocab);
});

test("every plan has a valid **Tags:** header", (t) => {
  const vocab = vocabulary();
  const plans = planHeaderTags();
  if (plans === null) { warn(t, repo.docMissing("plans")); return; }
  for (const plan of plans) assertValidTagSet(plan, vocab);
});

test("prd: tags point at real requirements in the PRD", (t) => {
  const prd = repo.doc("prd");
  const everywhere = [...indexRowTags(), ...(planHeaderTags() ?? [])];
  const prdTags = everywhere.flatMap(({ where, tags }) => tags.filter((x) => x.startsWith("prd:")).map((tag) => ({ where, tag })));
  if (prdTags.length === 0) { t.diagnostic("no prd: tags in use yet"); return; }
  if (!prd) { warn(t, `${repo.docMissing("prd")} — ${prdTags.length} prd: tag(s) unresolved until it exists`); return; }
  for (const { where, tag } of prdTags) {
    const req = tag.slice(4);
    const escaped = req.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = new RegExp(`^#{2,4}\\s+${escaped}\\b`, "m").test(prd.text) || prd.text.includes(`**${req}**`);
    assert.ok(found, `${where}: \`${tag}\` — ${req} is not a requirement heading ('### ${req}') or bold marker ('**${req}**') in ${prd.rel} (config ${prd.key}).`);
  }
});
