// `sdd upgrade <repo>`: bring a target's scripts/sdd/ up to the current seed. Only scripts — skills,
// docs and ledgers belong to the target once deployed. A file the target never edited (its hash
// still matches the manifest written at deploy/upgrade time) is replaced when the seed changed; a
// file the target edited is left alone and reported as drift, unless --force.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { SEED_DIR, MANIFEST_NAME, packageVersion, walk, sha256, readJson, isDirectory } from './lib.mjs';
import { writeManifest } from './deploy.mjs';

export function upgrade(targetArg, options = {}) {
  const target = resolve(targetArg ?? '.');
  if (!isDirectory(join(target, 'scripts', 'sdd'))) throw new Error(`no scripts/sdd in ${target}: deploy first`);
  const manifestPath = join(target, 'scripts', 'sdd', MANIFEST_NAME);
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : { sddVersion: 'unknown', files: {} };
  const seedDir = join(SEED_DIR, 'scripts', 'sdd');
  const report = { target, from: manifest.sddVersion, to: packageVersion(), added: [], replaced: [], unchanged: [], drift: [], forced: [], removedFromSeed: [] };

  for (const rel of walk(seedDir, { skip: (r) => r === MANIFEST_NAME })) {
    const seedBytes = readFileSync(join(seedDir, rel));
    const seedHash = sha256(seedBytes, rel);
    const targetPath = join(target, 'scripts', 'sdd', rel);
    if (!existsSync(targetPath)) { write(targetPath, seedBytes); report.added.push(rel); continue; }
    const targetHash = sha256(readFileSync(targetPath), rel);
    if (targetHash === seedHash) { report.unchanged.push(rel); continue; }
    const deployedHash = manifest.files?.[rel];
    if (deployedHash === targetHash || options.force) {
      write(targetPath, seedBytes);
      (deployedHash === targetHash ? report.replaced : report.forced).push(rel);
    } else {
      report.drift.push({ file: rel, reason: deployedHash ? 'edited in target since deploy' : 'not in the deploy manifest' });
    }
  }
  for (const rel of Object.keys(manifest.files ?? {})) {
    if (!existsSync(join(seedDir, rel))) report.removedFromSeed.push(rel);   // reported, never deleted
  }
  if (report.drift.length === 0 || options.force) writeManifest(target, report.to);
  else report.note = 'manifest left as is because drift was found; resolve it (or --force) and run upgrade again';
  return report;
}

function write(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}
