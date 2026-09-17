// Shared helpers for the doc meta-tests (tests/docs-*.test.mjs).
//
// Every path a test touches comes from skills/sdd.config.json: skills from `<skills.source>/<name>/SKILL.md`,
// ledgers from `repo.ledgers.*`, documents from `repo.docs.*`, the agent stubs from `repo.agentSurfaces`.
// The root is found by walking up from the test file (config.mjs findRoot), so the same files run from the
// scaffold's self-hosted root or from any deployed target. `SDD_ROOT` overrides the walk (used to run the
// suite against a fixture tree without deploying).

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, loadConfig, stripCr } from "../../lib/config.mjs";

/** The trio and the two harvesters — the workflow skills every convention test reasons about. */
export const TRIO = ["pre-impl", "impl", "post-impl"];
export const HARVESTERS = ["sdd-skill-improve", "test-improve"];
export const WORKFLOW = [...TRIO, ...HARVESTERS];

/** File text as LF with any BOM removed — the form every comparison is made in. */
export function readLf(file) {
  const raw = readFileSync(file, "utf8");
  return stripCr(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
}

/**
 * Opens the repository the test file belongs to. Returns the loaded config plus accessors that resolve
 * every path through it and fail with the config key in the message.
 */
export function openRepo(importMetaUrl) {
  const here = dirname(fileURLToPath(importMetaUrl));
  const root = process.env.SDD_ROOT ? resolve(process.env.SDD_ROOT) : findRoot(here);
  const loaded = loadConfig(root);
  const { config } = loaded;
  const rel = (abs) => relative(root, abs).split(sep).join("/");
  const skillsSource = config.skills?.source ?? "skills";
  const skillFile = (name) => join(root, skillsSource, name, "SKILL.md");

  const repo = {
    root,
    config,
    rel,
    get: loaded.get,
    path: loaded.path,
    skillsSource,
    projectSkills: Array.isArray(config.skills?.project) ? config.skills.project : [],
    harnesses: Array.isArray(config.skills?.harnesses) ? config.skills.harnesses : [],
    skillFile,
    skillRel: (name) => `${skillsSource}/${name}/SKILL.md`,
    hasSkill: (name) => existsSync(skillFile(name)),

    /** The skill's text (LF). A missing skill is a failure named "skill not present". */
    skill(name) {
      const file = skillFile(name);
      assert.ok(existsSync(file), `skill not present: ${repo.skillRel(name)} (config skills.project, skills.source)`);
      return readLf(file);
    },

    /** The canonical block file `<skills.source>/blocks/<NAME>.md`, or null when the target has none. */
    blockFile(name) {
      const file = join(root, skillsSource, "blocks", `${name}.md`);
      return existsSync(file) ? readLf(file) : null;
    },

    /** A ledger from `repo.ledgers.<key>`. Deploy creates every ledger, so a missing one is a failure. */
    ledger(key) {
      const configKey = `repo.ledgers.${key}`;
      const file = loaded.path(configKey);
      assert.ok(file, `config ${configKey} is not set`);
      assert.ok(existsSync(file), `ledger not present: ${rel(file)} (config ${configKey}) — deploy creates every ledger`);
      return { file, rel: rel(file), key: configKey, text: readLf(file) };
    },

    /** A document from `repo.docs.<key>`, or null when it does not exist yet (a fresh target). */
    doc(key) {
      const configKey = `repo.docs.${key}`;
      const file = loaded.path(configKey);
      if (!file || !existsSync(file)) return null;
      return { file, rel: rel(file), key: configKey, text: readLf(file) };
    },

    /** The message a test warns with when an optional document is absent. */
    docMissing(key) {
      const configKey = `repo.docs.${key}`;
      const value = loaded.get(configKey);
      return value == null
        ? `config ${configKey} is not set — check skipped`
        : `${value} (config ${configKey}) does not exist yet — check skipped until the document is written`;
    },

    /** The markdown files of a docs folder from `repo.docs.<key>` (README.md excluded), or null when absent. */
    docDir(key, { excludeReadme = true } = {}) {
      const configKey = `repo.docs.${key}`;
      const dir = loaded.path(configKey);
      if (!dir || !existsSync(dir)) return null;
      const files = readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".md"))
        .filter((f) => !excludeReadme || f.toLowerCase() !== "readme.md")
        .sort()
        .map((f) => ({ name: f, file: join(dir, f), rel: rel(join(dir, f)), text: readLf(join(dir, f)) }));
      return { dir, rel: rel(dir), key: configKey, files };
    },

    /** An agent surface from `repo.agentSurfaces` by basename (CLAUDE.md, copilot-instructions.md), or null. */
    agentSurface(name) {
      const surfaces = Array.isArray(config.repo?.agentSurfaces) ? config.repo.agentSurfaces : [];
      const hit = surfaces.find((s) => basename(s) === name);
      if (!hit) return null;
      const file = resolve(root, hit);
      return { rel: hit, file, exists: existsSync(file), key: "repo.agentSurfaces", text: existsSync(file) ? readLf(file) : null };
    },

    /** True when a skill names a ledger either by its config key or by the configured path. */
    citesLedger(text, key) {
      const configKey = `repo.ledgers.${key}`;
      const value = loaded.get(configKey);
      return text.includes(configKey) || (typeof value === "string" && value.length > 0 && text.includes(value));
    },
  };
  return repo;
}

// ---------------------------------------------------------------- blocks and markers

export const startMarker = (name) => `<!-- ${name}:START -->`;
export const endMarker = (name) => `<!-- ${name}:END -->`;

/** Occurrences of a literal needle. */
export function count(text, needle) {
  return needle ? text.split(needle).length - 1 : 0;
}

/** The text between a block's markers, or null when the block is absent or unterminated. */
export function block(text, name) {
  const open = startMarker(name);
  const s = text.indexOf(open);
  if (s < 0) return null;
  const e = text.indexOf(endMarker(name), s + open.length);
  return e < 0 ? null : text.slice(s + open.length, e);
}

/** The text between a block's markers; fails naming the file when absent, unterminated or duplicated. */
export function requireBlock(text, name, where) {
  const open = startMarker(name);
  const s = text.indexOf(open);
  assert.ok(s >= 0, `${where} has no ${open} marker`);
  const e = text.indexOf(endMarker(name), s + open.length);
  assert.ok(e > s, `${where} has an unterminated ${open} block`);
  assert.equal(count(text, open), 1, `${where} carries ${count(text, open)} ${open} markers — a block is stated once per file`);
  return text.slice(s + open.length, e);
}

// ---------------------------------------------------------------- prose helpers

/** Reflow-tolerant form: blockquote markers dropped, whitespace collapsed. */
export function normalize(text) {
  return text.replace(/^\s*>\s?/gm, " ").replace(/\s+/g, " ").trim();
}

/** Case-insensitive containment on the normalized forms. */
export function has(text, phrase) {
  return normalize(text).toLowerCase().includes(normalize(phrase).toLowerCase());
}

/** Every clause must appear (normalized, case-insensitive) in the given text. */
export function assertClauses(subject, text, clauses) {
  const haystack = normalize(text).toLowerCase();
  for (const clause of clauses) {
    assert.ok(haystack.includes(normalize(clause).toLowerCase()),
      `${subject} must state '${clause}' in its owning section; prose elsewhere cannot define it.`);
  }
}

/** Every phrase must be absent (case-insensitive) from the text. */
export function assertAbsent(subject, text, phrases) {
  const haystack = normalize(text).toLowerCase();
  for (const phrase of phrases) {
    assert.ok(!haystack.includes(normalize(phrase).toLowerCase()), `${subject} must not state '${phrase}'.`);
  }
}

/** Markdown headings outside fenced code, with their character offsets. */
export function headings(text) {
  const out = [];
  let offset = 0;
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence) {
      const m = /^(#{1,6})[ \t]+(.*?)\s*$/.exec(line);
      if (m) out.push({ level: m[1].length, title: m[2], offset });
    }
    offset += line.length + 1;
  }
  return out;
}

/**
 * The text from the first heading whose title matches `startRe` up to the next heading matching `endRe`
 * (or, when `endRe` is omitted, the next heading of the same or a higher level).
 */
export function section(text, startRe, endRe) {
  const hs = headings(text);
  const i = hs.findIndex((h) => startRe.test(h.title));
  assert.ok(i >= 0, `missing section heading matching ${startRe}`);
  let j = -1;
  if (endRe) {
    j = hs.findIndex((h, k) => k > i && endRe.test(h.title));
    assert.ok(j > i, `section ${startRe} is not terminated by a heading matching ${endRe}`);
  } else {
    j = hs.findIndex((h, k) => k > i && h.level <= hs[i].level);
  }
  return text.slice(hs[i].offset, j >= 0 ? hs[j].offset : text.length);
}

/** Lines inside fenced code blocks — the invocations a skill tells the reader to run. */
export function fencedLines(text) {
  const out = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) out.push(line);
  }
  return out;
}

/** Position of the first match of `re` in `text`, or -1. */
export function indexOfRe(text, re, from = 0) {
  const m = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  m.lastIndex = from;
  const hit = m.exec(text);
  return hit ? hit.index : -1;
}

/** A warning that keeps the test green — for a document a fresh target has not written yet. */
export function warn(t, message) {
  t.diagnostic(`WARN: ${message}`);
}
