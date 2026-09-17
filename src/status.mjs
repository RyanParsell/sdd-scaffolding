// `sdd status <repo>`: what state a deployed target is in — config validity, TODO placeholders,
// ledger header blocks, mirror status (from the target's own skills.mjs), the seed version it was
// deployed from, and the doc meta-test result. Read-only.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MANIFEST_NAME, packageVersion, readJson, isDirectory } from './lib.mjs';

const FRICTION_BLOCKS = ['SMALL-FIX-RULE', 'READ-PROTOCOL', 'EXPIRY-GATE', 'SCAN-WATERMARK'];
const TEST_HEALTH_BLOCKS = ['ANTIPATTERN-GATE'];

export function status(targetArg, options = {}) {
  const target = resolve(targetArg ?? '.');
  const configPath = join(target, 'skills', 'sdd.config.json');
  const report = { target, seedVersion: packageVersion(), deployedFrom: null, config: null, placeholders: [], ledgers: {}, mirrors: null, docTests: null };
  if (!existsSync(configPath)) { report.config = 'missing (not deployed)'; return report; }

  const config = readJson(configPath);
  report.config = 'present';
  report.deployedFrom = config.sddVersion ?? null;
  const manifest = join(target, 'scripts', 'sdd', MANIFEST_NAME);
  if (existsSync(manifest)) report.deployedFrom = readJson(manifest).sddVersion ?? report.deployedFrom;
  report.placeholders = findPlaceholders(config);

  for (const [key, blocks] of [['friction', FRICTION_BLOCKS], ['testHealth', TEST_HEALTH_BLOCKS], ['runLog', []], ['testRoi', []]]) {
    const rel = config.repo?.ledgers?.[key];
    const path = rel ? join(target, rel) : null;
    if (!path || !existsSync(path)) { report.ledgers[key] = 'missing'; continue; }
    const text = readFileSync(path, 'utf8');
    const missing = blocks.filter((b) => !text.includes(`<!-- ${b}:START -->`) || !text.includes(`<!-- ${b}:END -->`));
    report.ledgers[key] = missing.length ? `present, missing blocks: ${missing.join(', ')}` : 'present';
  }

  const skillsScript = join(target, 'scripts', 'sdd', 'skills.mjs');
  if (existsSync(skillsScript)) {
    try {
      report.mirrors = JSON.parse(execFileSync(process.execPath, [skillsScript, 'status', '--json'], { cwd: target, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch (error) {
      report.mirrors = `could not determine: ${String(error.stderr || error.message).trim().split('\n')[0]}`;
    }
  } else report.mirrors = 'scripts/sdd/skills.mjs missing';

  if (!options.skipTests && isDirectory(join(target, 'scripts', 'sdd', 'tests'))) {
    try {
      const out = execFileSync(process.execPath, ['--test', 'scripts/sdd/tests/*.test.mjs'], { cwd: target, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      report.docTests = summarize(out);
    } catch (error) {
      report.docTests = `failed: ${summarize(String(error.stdout || '') + String(error.stderr || ''))}`;
    }
  }
  return report;
}

function findPlaceholders(value, path = '', out = []) {
  if (typeof value === 'string') { if (value.includes('{{')) out.push(path); }
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) findPlaceholders(v, path ? `${path}.${k}` : k, out);
  return out;
}

function summarize(output) {
  const pass = /# pass (\d+)/.exec(output)?.[1];
  const fail = /# fail (\d+)/.exec(output)?.[1];
  return pass !== undefined ? `pass ${pass}, fail ${fail ?? '?'}` : output.trim().split('\n').slice(-3).join(' | ');
}
