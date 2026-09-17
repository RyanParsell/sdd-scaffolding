import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { makeConfig, script } from "./fixture.mjs";

const { findRoot, loadConfig, validateConfig, readText, writeText, stripCr, sizeOf } = await import(pathToFileURL(script("lib/config.mjs")).href);

test("findRoot walks up to the directory holding skills/sdd.config.json and throws below none", () => {
  const root = mkdtempSync(join(tmpdir(), "sdd config root "));
  mkdirSync(join(root, "skills"), { recursive: true });
  writeFileSync(join(root, "skills", "sdd.config.json"), JSON.stringify(makeConfig()));
  mkdirSync(join(root, "a", "b"), { recursive: true });
  assert.equal(findRoot(join(root, "a", "b")), root);
  const bare = mkdtempSync(join(tmpdir(), "sdd config none "));
  assert.throws(() => findRoot(bare), /skills\/sdd\.config\.json/);
});

test("loadConfig resolves dotted keys to absolute paths and null for optional keys", () => {
  const root = mkdtempSync(join(tmpdir(), "sdd config load "));
  mkdirSync(join(root, "skills"), { recursive: true });
  writeFileSync(join(root, "skills", "sdd.config.json"), "﻿" + JSON.stringify(makeConfig()));
  const cfg = loadConfig(root);
  assert.equal(cfg.root, root);
  assert.equal(cfg.path("repo.docs.prd"), join(root, "docs", "sdd", "fixture-prd.md"));
  assert.equal(cfg.path("repo.docs.agentGuide"), null);
  assert.equal(cfg.get("repo.testRunner"), "generic");
  assert.throws(() => cfg.path("repo.sourceGlobs"), /not a path/);
});

test("validateConfig accepts the fixture config and names each missing, wrong or placeholder value", () => {
  assert.deepEqual(validateConfig(makeConfig()), []);
  const broken = makeConfig({ repo: { name: "{{REPO_NAME}}", publish: "rebase", testRunner: "jest", commands: { build: null } }, skills: { harnesses: ["claude", "cursor"], project: [] } });
  delete broken.repo.ledgers.runLog;
  const problems = validateConfig(broken);
  const text = problems.join("\n");
  assert.match(text, /repo\.name: TODO placeholder/);
  assert.match(text, /repo\.publish: must be one of trunk-ff, pr/);
  assert.match(text, /repo\.testRunner: must be one of dotnet, vitest, generic/);
  assert.match(text, /repo\.ledgers\.runLog: required/);
  assert.match(text, /skills\.harnesses: unknown harness "cursor"/);
  assert.match(text, /skills\.project: required/);
});

test("readText/writeText preserve a file's own EOL and BOM; sizeOf ignores CR", () => {
  const dir = mkdtempSync(join(tmpdir(), "sdd config text "));
  const crlf = join(dir, "crlf.md");
  writeFileSync(crlf, "﻿line one\r\nline two\r\n");
  const file = readText(crlf);
  assert.deepEqual(file, { text: "line one\nline two\n", eol: "\r\n", bom: true });
  writeText(crlf, { ...file, text: file.text + "line three\n" });
  assert.equal(readFileSync(crlf, "utf8"), "﻿line one\r\nline two\r\nline three\r\n");
  const lf = join(dir, "lf.md");
  writeFileSync(lf, "a\nb\n");
  assert.deepEqual(readText(lf), { text: "a\nb\n", eol: "\n", bom: false });
  assert.equal(stripCr("a\r\nb\r"), "a\nb");
  assert.equal(sizeOf("a\r\nb\r\n"), sizeOf("a\nb\n"));
  assert.equal(sizeOf("é\n"), 3);
});
