// Shared helpers for the sdd CLI: seed location, file copying that never overwrites, placeholder
// substitution, hashing for the upgrade manifest, JSON round-trips that keep the file's shape, and
// a minimal prompt. Built-in modules only.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SEED_DIR = join(PACKAGE_ROOT, 'seed');
export const MANIFEST_NAME = '.seed-manifest.json';

export function packageVersion() {
  return JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
}

/** Every file under `dir`, as paths relative to it with forward slashes. */
export function walk(dir, { skip = () => false } = {}) {
  const out = [];
  if (!existsSync(dir)) return out;
  const visit = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      const rel = relative(dir, full).split(sep).join('/');
      if (skip(rel, entry)) continue;
      if (entry.isDirectory()) visit(full);
      else out.push(rel);
    }
  };
  visit(dir);
  return out.sort();
}

/** Content hash for the upgrade manifest. Text files are hashed with CR stripped, so a line-ending flip on checkout is not drift. */
export function sha256(buffer, path = '') {
  const bytes = path && isText(path) ? Buffer.from(buffer.toString('utf8').replace(/\r/g, ''), 'utf8') : buffer;
  return createHash('sha256').update(bytes).digest('hex');
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Replace `{{KEY}}` placeholders in a string from a map; unknown keys are left in place. */
export function substitute(text, values) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => (key in values ? values[key] : m));
}

/**
 * Copy one file, never overwriting. Returns 'copied' | 'kept' (existed) | 'skipped' (filtered).
 * `transform` may rewrite text content; binary files are copied as bytes.
 */
export function placeFile(src, dest, { transform = null } = {}) {
  if (existsSync(dest)) return 'kept';
  mkdirSync(dirname(dest), { recursive: true });
  const bytes = readFileSync(src);
  if (transform && isText(src)) writeFileSync(dest, transform(bytes.toString('utf8')));
  else writeFileSync(dest, bytes);
  return 'copied';
}

export function isText(path) {
  return /\.(md|json|mjs|js|ts|txt|yml|yaml|ps1|sh|fragment)$/i.test(path);
}

/** Copy a tree without overwriting; returns { copied: [], kept: [] } with target-relative paths. */
export function placeTree(srcDir, destDir, { transform = null, renamePath = (p) => p, skip = () => false } = {}) {
  const result = { copied: [], kept: [] };
  for (const rel of walk(srcDir, { skip })) {
    const target = renamePath(rel);
    const outcome = placeFile(join(srcDir, rel), join(destDir, target), { transform });
    if (outcome === 'copied') result.copied.push(target);
    else if (outcome === 'kept') result.kept.push(target);
  }
  return result;
}

/** Append lines to a text file, only those not already present; creates the file if absent. */
export function appendMissingLines(path, lines, { header = null } = {}) {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const present = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const missing = lines.filter((l) => l.trim() === '' || !present.has(l.trim()));
  if (missing.every((l) => l.trim() === '')) return { added: [] };
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const block = [header, ...missing].filter((l) => l !== null).join(eol);
  const sepLine = existing.length === 0 || existing.endsWith('\n') ? '' : eol;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${existing}${sepLine}${existing.length ? eol : ''}${block}${eol}`);
  return { added: missing.filter((l) => l.trim() !== '') };
}

export async function ask(question, fallback, { yes = false } = {}) {
  if (yes || !process.stdin.isTTY) return fallback;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question}${fallback !== undefined ? ` [${fallback}]` : ''}: `)).trim();
    return answer === '' ? fallback : answer;
  } finally {
    rl.close();
  }
}

export function fileSizeStrippingCr(path) {
  return Buffer.byteLength(readFileSync(path, 'utf8').replace(/\r/g, ''), 'utf8');
}

export function isDirectory(path) {
  return existsSync(path) && statSync(path).isDirectory();
}
