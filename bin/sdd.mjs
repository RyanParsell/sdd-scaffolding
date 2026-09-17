#!/usr/bin/env node
// sdd — seed spec-driven development into a repository.
//
//   sdd deploy <repo> [--yes] [--name X] [--product X] [--build "cmd"] [--test "cmd"]
//                     [--test-runner dotnet|vitest|generic] [--publish trunk-ff|pr]
//                     [--deploy-tool "cmd"] [--harness claude,copilot,codex] [--json]
//   sdd upgrade <repo> [--force] [--json]        scripts/sdd only; drift is reported, not overwritten
//   sdd status  <repo> [--skip-tests] [--json]
//
// Nothing here overwrites an existing file in a target; deploy reports what it kept.

import { deploy } from '../src/deploy.mjs';
import { upgrade } from '../src/upgrade.mjs';
import { status } from '../src/status.mjs';
import { packageVersion } from '../src/lib.mjs';

const HELP = `sdd ${packageVersion()} — seed spec-driven development into a repository

  sdd deploy <repo> [--yes] [--name X] [--product X] [--build "cmd"] [--test "cmd"]
                    [--test-runner dotnet|vitest|generic] [--publish trunk-ff|pr]
                    [--deploy-tool "cmd"] [--harness claude,copilot,codex] [--json]
  sdd upgrade <repo> [--force] [--json]
  sdd status  <repo> [--skip-tests] [--json]

deploy never overwrites a file the target already has; upgrade touches only scripts/sdd/.`;

function parse(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const key = arg.slice(2).replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) { options[key] = next; i++; } else options[key] = true;
  }
  return { command, target: positional[0], options };
}

function print(report, json) {
  if (json) { console.log(JSON.stringify(report, null, 2)); return; }
  for (const [key, value] of Object.entries(report)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      console.log(`${key} (${value.length}):`);
      for (const item of value) console.log(`  ${typeof item === 'string' ? item : JSON.stringify(item)}`);
    } else if (typeof value === 'object') {
      console.log(`${key}: ${JSON.stringify(value)}`);
    } else console.log(`${key}: ${value}`);
  }
}

async function main() {
  const { command, target, options } = parse(process.argv.slice(2));
  const json = Boolean(options.json);
  try {
    switch (command) {
      case 'deploy': print(await deploy(target, options), json); return 0;
      case 'upgrade': { const r = upgrade(target, options); print(r, json); return r.drift.length && !options.force ? 2 : 0; }
      case 'status': print(status(target, options), json); return 0;
      case '--version': case 'version': console.log(packageVersion()); return 0;
      case undefined: case '--help': case 'help': console.log(HELP); return 0;
      default: console.error(`unknown command '${command}'\n\n${HELP}`); return 1;
    }
  } catch (error) {
    if (json) console.error(JSON.stringify({ error: error.message }));
    else console.error(`error: ${error.message}`);
    return 1;
  }
}

process.exitCode = await main();
