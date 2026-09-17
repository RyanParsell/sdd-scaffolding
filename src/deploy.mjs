// `sdd deploy <repo>`: seed a repository with the SDD skills, scripts, docs taxonomy, ledgers, hooks
// and agent stubs. Never overwrites an existing file; everything it kept is reported so the operator
// can compare by hand. Idempotent: a second deploy copies nothing and reports everything as kept.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join, resolve, dirname } from 'node:path';
import {
  SEED_DIR, MANIFEST_NAME, packageVersion, walk, sha256, readJson, writeJson, substitute,
  placeTree, placeFile, appendMissingLines, ask, fileSizeStrippingCr, isDirectory,
} from './lib.mjs';

const HARNESSES = ['claude', 'copilot', 'codex'];
const TODAY = () => new Date().toISOString().slice(0, 10);

export async function deploy(targetArg, options = {}) {
  const target = resolve(targetArg ?? '.');
  if (!isDirectory(target)) throw new Error(`target is not a directory: ${target}`);
  const report = { target, sddVersion: packageVersion(), copied: [], kept: [], created: [], notes: [] };
  const record = (r) => { report.copied.push(...r.copied); report.kept.push(...r.kept); };

  // ---- answers: the repo block ------------------------------------------------------------
  const yes = Boolean(options.yes);
  const name = options.name ?? (await ask('Repository short name', basename(target).toLowerCase().replace(/[^a-z0-9-]+/g, '-'), { yes }));
  const product = options.product ?? (await ask('Product name as prose should say it', name, { yes }));
  const build = options.build ?? (await ask('Build command', '{{BUILD_COMMAND}}', { yes }));
  const test = options.test ?? (await ask('Full test-suite command', '{{TEST_COMMAND}}', { yes }));
  const testRunner = options.testRunner ?? (await ask('Test runner adapter (dotnet | vitest | generic)', 'generic', { yes }));
  const publish = options.publish ?? (await ask('Publish mode (trunk-ff | pr)', 'trunk-ff', { yes }));
  const harnesses = (options.harness ?? HARNESSES.join(',')).split(',').map((h) => h.trim()).filter(Boolean);
  for (const h of harnesses) if (!HARNESSES.includes(h)) throw new Error(`unknown harness '${h}' (use ${HARNESSES.join(', ')})`);
  const values = { REPO_NAME: name, PRODUCT: product, DATE: TODAY(), BUILD_COMMAND: build, TEST_COMMAND: test };
  const sub = (text) => substitute(text, values);
  const renamePath = (p) => sub(p);

  // ---- skills: source of truth + canonical blocks + README ---------------------------------
  const template = readJson(join(SEED_DIR, 'skills', 'sdd.config.template.json'));
  const projectSkills = template.skills.project;
  record(placeTree(join(SEED_DIR, 'skills'), join(target, 'skills'), {
    transform: sub,
    // directories are always entered; files decide: the template stays behind, top-level files other
    // than the README and schema stay behind, and only the project skills and the blocks are copied
    skip: (rel, entry) => !entry.isDirectory() && (
      rel === 'sdd.config.template.json'
      || (!rel.includes('/') && rel !== 'README.md' && rel !== 'sdd.config.schema.json')
      || (rel.includes('/') && !rel.startsWith('blocks/') && !projectSkills.some((s) => rel.startsWith(`${s}/`)))),
  }));

  // ---- config --------------------------------------------------------------------------
  const configPath = join(target, 'skills', 'sdd.config.json');
  if (existsSync(configPath)) report.kept.push('skills/sdd.config.json');
  else {
    const config = substituteDeep(template, values);   // per value, so a command with quotes stays valid JSON
    config.sddVersion = report.sddVersion;
    config.repo.testRunner = testRunner;
    config.repo.publish = publish;
    if (options.deployTool) config.repo.commands.deployTool = options.deployTool;
    config.skills.harnesses = harnesses;
    writeJson(configPath, config);
    report.created.push('skills/sdd.config.json');
  }

  // ---- scripts + manifest ----------------------------------------------------------------
  const scriptsSeed = join(SEED_DIR, 'scripts', 'sdd');
  record(placeTree(scriptsSeed, join(target, 'scripts', 'sdd'), { skip: (rel) => rel === MANIFEST_NAME }));
  writeManifest(target, report.sddVersion);
  report.created.push(`scripts/sdd/${MANIFEST_NAME}`);

  // ---- docs taxonomy ---------------------------------------------------------------------
  record(placeTree(join(SEED_DIR, 'docs'), join(target, 'docs'), { transform: sub, renamePath }));

  // ---- hooks -----------------------------------------------------------------------------
  report.notes.push(...mergeClaudeSettings(target));
  const ghHook = placeFile(join(SEED_DIR, 'hooks', 'github-hooks.sdd-lifecycle.json'), join(target, '.github', 'hooks', 'sdd-lifecycle.json'));
  (ghHook === 'copied' ? report.copied : report.kept).push('.github/hooks/sdd-lifecycle.json');

  // ---- agent stubs -----------------------------------------------------------------------
  report.notes.push(ensureAgentStub(target, 'CLAUDE.md', join(SEED_DIR, 'agent', 'CLAUDE.section.md'), `# ${product}\n\n`, sub));
  report.notes.push(ensureAgentStub(target, join('.github', 'copilot-instructions.md'), join(SEED_DIR, 'agent', 'copilot-instructions.md'), '', sub));

  // ---- .gitignore ------------------------------------------------------------------------
  const fragment = readFileSync(join(SEED_DIR, 'gitignore.fragment'), 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  const ignored = appendMissingLines(join(target, '.gitignore'), fragment);
  if (ignored.added.length) report.notes.push(`.gitignore: added ${ignored.added.length} line(s)`);

  // ---- size budgets: measured at deploy, ratchet down afterwards --------------------------
  const config = readJson(configPath);
  let budgeted = 0;
  for (const skill of projectSkills) {
    const file = join(target, 'skills', skill, 'SKILL.md');
    if ((config.sizeBudgetBytes?.[skill] ?? 0) === 0 && existsSync(file)) {
      config.sizeBudgetBytes[skill] = fileSizeStrippingCr(file);
      budgeted++;
    }
  }
  if (budgeted) { writeJson(configPath, config); report.notes.push(`sizeBudgetBytes: set for ${budgeted} skill(s)`); }

  // ---- mirrors ---------------------------------------------------------------------------
  try {
    const out = execFileSync(process.execPath, [join(target, 'scripts', 'sdd', 'skills.mjs'), 'install', '--yes', '--json'], { cwd: target, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    report.notes.push(`skills installed: ${summarizeInstall(out)}`);
  } catch (error) {
    report.notes.push(`skills install did not run: ${String(error.stderr || error.message).trim().split('\n')[0]}`);
  }

  report.next = [
    'Fill in the TODOs in skills/sdd.config.json (build/test commands) and the profile document.',
    `Run: ${config.repo.commands.docTests}`,
    'Commit the seed, then start the first change with the pre-impl skill.',
  ];
  return report;
}

export function writeManifest(target, sddVersion) {
  const dir = join(target, 'scripts', 'sdd');
  const files = {};
  for (const rel of walk(dir, { skip: (r) => r === MANIFEST_NAME })) files[rel] = sha256(readFileSync(join(dir, rel)), rel);
  writeJson(join(dir, MANIFEST_NAME), { sddVersion, deployed: TODAY(), files });
}

function mergeClaudeSettings(target) {
  const notes = [];
  const fragment = readJson(join(SEED_DIR, 'hooks', 'claude-settings.fragment.json'));
  const path = join(target, '.claude', 'settings.json');
  const settings = existsSync(path) ? readJson(path) : {};
  if (settings.includeCoAuthoredBy === undefined && fragment.includeCoAuthoredBy !== undefined) {
    settings.includeCoAuthoredBy = fragment.includeCoAuthoredBy;
    notes.push('.claude/settings.json: includeCoAuthoredBy set');
  }
  settings.hooks ??= {};
  for (const [event, entries] of Object.entries(fragment.hooks ?? {})) {
    settings.hooks[event] ??= [];
    for (const entry of entries) {
      const marker = entry.hooks?.[0]?.command ?? '';
      const already = settings.hooks[event].some((e) => JSON.stringify(e).includes('scripts/sdd/lifecycle.mjs'));
      if (already) { notes.push(`.claude/settings.json: ${event} hook already present`); continue; }
      settings.hooks[event].push(entry);
      notes.push(`.claude/settings.json: ${event} hook added${marker ? '' : ' (no command)'}`);
    }
  }
  writeJson(path, settings);
  return notes;
}

function ensureAgentStub(target, relPath, sectionSource, title, sub) {
  const path = join(target, relPath);
  const section = sub(readFileSync(sectionSource, 'utf8'));
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${title}${section}`);
    return `${relPath}: created`;
  }
  const existing = readFileSync(path, 'utf8');
  if (existing.includes('pre-impl → impl → post-impl')) return `${relPath}: SDD section already present`;
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(path, `${existing}${existing.endsWith('\n') ? '' : eol}${eol}${section.replace(/\n/g, eol)}`);
  return `${relPath}: SDD section appended`;
}

function substituteDeep(value, values) {
  if (typeof value === 'string') return substitute(value, values);
  if (Array.isArray(value)) return value.map((v) => substituteDeep(v, values));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substituteDeep(v, values)]));
  return value;
}

function summarizeInstall(stdout) {
  try {
    const json = JSON.parse(stdout);
    if (json.installed) return `${json.installed.length ?? json.installed} entries`;
    return Object.keys(json).slice(0, 4).map((k) => `${k}=${JSON.stringify(json[k]).slice(0, 40)}`).join(' ');
  } catch {
    return stdout.trim().split('\n').slice(-1)[0] ?? 'ok';
  }
}
