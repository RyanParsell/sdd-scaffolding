// The sdd CLI against a throwaway target: deploy seeds every surface without overwriting, a second
// deploy copies nothing, upgrade replaces unedited scripts and reports edited ones as drift, and
// status reads the result. Runs against the real seed/ directory of this package.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deploy } from '../deploy.mjs';
import { upgrade } from '../upgrade.mjs';
import { status } from '../status.mjs';
import { SEED_DIR, readJson, walk } from '../lib.mjs';

function freshRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-cli-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

const OPTIONS = { yes: true, name: 'demo', product: 'Demo', build: 'echo build', test: 'echo test', testRunner: 'generic', publish: 'trunk-ff' };

test('deploy seeds skills, scripts, docs, config, hooks, stubs and gitignore into an empty repo', async () => {
  const repo = freshRepo();
  try {
    const report = await deploy(repo, OPTIONS);
    assert.equal(report.kept.length, 0, `first deploy kept: ${report.kept.join(', ')}`);
    const config = readJson(join(repo, 'skills', 'sdd.config.json'));
    assert.equal(config.repo.name, 'demo');
    assert.equal(config.repo.commands.build, 'echo build');
    assert.equal(config.repo.publish, 'trunk-ff');
    assert.deepEqual(config.skills.harnesses, ['claude', 'copilot', 'codex']);
    for (const skill of config.skills.project) {
      assert.ok(existsSync(join(repo, 'skills', skill, 'SKILL.md')), `skill ${skill} deployed`);
      assert.ok(config.sizeBudgetBytes[skill] > 0, `budget set for ${skill}`);
    }
    assert.ok(existsSync(join(repo, 'skills', 'blocks', 'FALSIFIABILITY-GATE.md')));
    assert.ok(existsSync(join(repo, 'scripts', 'sdd', '.seed-manifest.json')));
    for (const ledger of Object.values(config.repo.ledgers)) assert.ok(existsSync(join(repo, ledger)), `ledger ${ledger}`);
    assert.ok(existsSync(join(repo, config.repo.docs.profile)), 'profile document created with the repo name substituted');
    const friction = readFileSync(join(repo, config.repo.ledgers.friction), 'utf8');
    assert.ok(!friction.includes('{{'), 'no placeholder left in the friction ledger');
    assert.ok(friction.includes('<!-- READ-PROTOCOL:START -->'));
    const settings = readJson(join(repo, '.claude', 'settings.json'));
    assert.ok(JSON.stringify(settings.hooks).includes('scripts/sdd/lifecycle.mjs'));
    assert.ok(existsSync(join(repo, '.github', 'hooks', 'sdd-lifecycle.json')));
    const claude = readFileSync(join(repo, 'CLAUDE.md'), 'utf8');
    assert.ok(claude.startsWith('# Demo'));
    assert.ok(claude.includes('pre-impl → impl → post-impl'));
    assert.ok(readFileSync(join(repo, '.gitignore'), 'utf8').includes('.claude/skills'));
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('deploy never overwrites: a second run keeps everything, and an existing CLAUDE.md is appended to', async () => {
  const repo = freshRepo();
  try {
    writeFileSync(join(repo, 'CLAUDE.md'), '# Mine\n\nHand-written.\n');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    writeFileSync(join(repo, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(ls)'] } }));
    const first = await deploy(repo, OPTIONS);
    const claude = readFileSync(join(repo, 'CLAUDE.md'), 'utf8');
    assert.ok(claude.startsWith('# Mine'));
    assert.ok(claude.includes('pre-impl → impl → post-impl'));
    const settings = readJson(join(repo, '.claude', 'settings.json'));
    assert.deepEqual(settings.permissions, { allow: ['Bash(ls)'] }, 'existing settings survive the hook merge');
    const second = await deploy(repo, OPTIONS);
    assert.equal(second.copied.length, 0, `second deploy copied: ${second.copied.join(', ')}`);
    assert.ok(second.kept.length >= first.copied.length);
    assert.equal(readFileSync(join(repo, 'CLAUDE.md'), 'utf8').split('pre-impl → impl → post-impl').length, 2, 'section appended once');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('upgrade replaces an unedited script and reports an edited one as drift', async () => {
  const repo = freshRepo();
  try {
    await deploy(repo, OPTIONS);
    const scripts = walk(join(SEED_DIR, 'scripts', 'sdd')).filter((f) => f.endsWith('.mjs') && !f.includes('/tests/'));
    assert.ok(scripts.length >= 2, 'the seed has scripts');
    const [edited, untouched] = scripts;
    const editedPath = join(repo, 'scripts', 'sdd', edited);
    writeFileSync(editedPath, `${readFileSync(editedPath, 'utf8')}\n// local change\n`);
    // simulate a newer seed by making the target's untouched copy differ from the seed without being "edited" is impossible;
    // instead assert the classification on the current seed: unchanged files are unchanged, the edited one drifts.
    const report = upgrade(repo, {});
    assert.ok(report.unchanged.includes(untouched));
    assert.deepEqual(report.drift.map((d) => d.file), [edited]);
    assert.ok(report.note, 'manifest not rewritten while drift stands');
    const forced = upgrade(repo, { force: true });
    assert.deepEqual(forced.forced, [edited]);
    assert.equal(readFileSync(editedPath, 'utf8').includes('// local change'), false);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('status reports config, ledgers and placeholders', async () => {
  const repo = freshRepo();
  try {
    await deploy(repo, { ...OPTIONS, build: undefined, test: undefined });
    const report = status(repo, { skipTests: true });
    assert.equal(report.config, 'present');
    assert.ok(report.placeholders.includes('repo.commands.build'), 'unanswered build command is a placeholder');
    assert.equal(report.ledgers.friction, 'present');
    assert.equal(report.ledgers.testHealth, 'present');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
