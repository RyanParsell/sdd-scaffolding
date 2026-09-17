#!/usr/bin/env node
// The SDD lifecycle observer for SessionStart / first-mutation hooks (Claude and Copilot adapters).
//   node scripts/sdd/lifecycle.mjs [--repo <dir>] [--branch <name>] [--json]
//   node scripts/sdd/lifecycle.mjs --harness claude|copilot --event session-start|pre-tool-use [--no-session-cache]
// Plan dirs (config repo.docs.plans / repo.docs.artifacts) and the run log (config repo.ledgers.runLog) are
// read from skills/sdd.config.json; the mirror advisory comes from `node scripts/sdd/skills.mjs status --json`.
// Hook mode always exits 0 and falls back to a static notice on any failure (fail open); plain mode prints
// text, or one JSON object with --json, and reports errors as JSON on stderr with exit 1.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRoot, loadConfig, runSkillsStatus } from "./lib/config.mjs";

const STATIC_NOTICE =
  "This repo uses pre-impl -> impl -> post-impl. Start repository changes with the pre-impl skill.";

const HELP = `usage: lifecycle.mjs [--repo <dir>] [--branch <name>] [--json]
       lifecycle.mjs --harness <claude|copilot> --event <session-start|pre-tool-use> [--no-session-cache]
  Reads the hook input JSON from stdin in --harness mode and always exits 0 (advisory, fail-open).
  --repo <dir>          a directory inside the repo (default: cwd, or the hook input's cwd)
  --branch <name>       evaluate as if on this branch (default: the checked-out branch)
  --no-session-cache    do not record the once-per-session pre-tool marker
  --simulate-error      force the evaluator to fail (exercises the fallback)
  --json                print one JSON object on stdout
  --help                this text`;

const STATE_TEXT = {
  READY_TO_PLAN: [
    "This repo uses pre-impl -> impl -> post-impl.",
    "Start change work with the pre-impl skill; read-only investigation may continue.",
  ],
  UNPLANNED: [
    "No plan claims this branch.",
    "Use the pre-impl skill before changing repository files.",
  ],
  PLAN_UNACCOUNTED: [
    "Plan found, but pre-impl is not recorded.",
    "Reconcile the plan/run accounting before implementation.",
  ],
  PLANNED: ["Plan found.", "Use the impl skill."],
  IMPLEMENTING: [
    "Implementation is in progress under the branch plan.",
    "Continue through the impl skill.",
  ],
  IMPLEMENTED_NOT_PUBLISHED: [
    "Implementation is recorded but not published.",
    "Use the post-impl skill.",
  ],
  MID_PLAN_PUBLISHED: [
    "The previous phase was published; the plan remains active.",
    "Review the remaining phase, then use the impl skill.",
  ],
  COMPLETE: ["The recorded lifecycle is complete.", "No lifecycle action is required."],
  UNACCOUNTED_WORK: [
    "Repository evidence conflicts with the recorded SDD lifecycle.",
    "Reconcile the evidence through the appropriate trio stage.",
  ],
  UNKNOWN: [
    "The SDD lifecycle checker could not parse repository evidence.",
    STATIC_NOTICE,
  ],
};

function runGit(repo, args, options = {}) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function normalizeRepoPath(repo, path) {
  return relative(repo, path).replaceAll("\\", "/");
}

function markdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(directory, entry.name));
}

// ---------------------------------------------------------------- repo facts from config

/** The repo-specific facts the evaluator needs, with defaults so a thin config still evaluates. */
function repoFacts(root) {
  const { config } = loadConfig(root);
  const docs = config.repo?.docs ?? {};
  const plansDir = docs.plans ?? "docs/plans";
  const artifactsDir = docs.artifacts ?? "docs/artifacts";
  const runLog = config.repo?.ledgers?.runLog ?? "docs/logs/sdd-run-log.md";
  const branches = config.repo?.branches ?? { feature: "feature/{slug}", bug: "bug/{slug}" };
  const prefixes = Object.values(branches)
    .filter((pattern) => typeof pattern === "string" && pattern.includes("{slug}"))
    .map((pattern) => pattern.slice(0, pattern.indexOf("{slug}")))
    .filter(Boolean);
  // documentation lives under the first segment of every configured doc path and in any .md file
  const docRoots = new Set();
  for (const value of [...Object.values(docs), ...Object.values(config.repo?.ledgers ?? {})]) {
    if (typeof value !== "string") continue;
    const first = value.replaceAll("\\", "/").split("/")[0];
    if (first && first !== "." && !first.includes(".")) docRoots.add(first);
  }
  if (docRoots.size === 0) docRoots.add("docs");
  return { plansDir, artifactsDir, runLog, workBranchPrefixes: prefixes.length ? prefixes : ["feature/", "bug/"], docRoots: [...docRoots] };
}

function isDocumentation(path, facts) {
  const normalized = path.replaceAll("\\", "/");
  return normalized.endsWith(".md") || facts.docRoots.some((root) => normalized.startsWith(`${root}/`));
}

// ---------------------------------------------------------------- evidence

function parsePlans(repo, facts) {
  const plans = [];
  const errors = [];
  for (const [location, directory] of [
    ["plans", resolve(repo, facts.plansDir)],
    ["artifacts", resolve(repo, facts.artifactsDir)],
  ]) {
    for (const path of markdownFiles(directory)) {
      const text = readFileSync(path, "utf8");
      const lines = text.split(/\r?\n/);
      const firstSection = lines.findIndex((line) => /^##\s/.test(line));
      const headerLines = firstSection < 0 ? lines : lines.slice(0, firstSection);
      const branchLikeLines = headerLines.filter((line) => /^\s*\*\*Branch/i.test(line));
      if (branchLikeLines.length === 0) continue;
      if (branchLikeLines.length !== 1) {
        errors.push(`${normalizeRepoPath(repo, path)} has ${branchLikeLines.length} Branch headers`);
        continue;
      }
      const match = branchLikeLines[0].match(/^\s*\*\*Branch:\*\*\s*(.+?)\s*$/);
      if (!match) {
        errors.push(`${normalizeRepoPath(repo, path)} has a malformed Branch header`);
        continue;
      }
      let branch = match[1].trim();
      if (branch.startsWith("`") && branch.endsWith("`") && branch.length > 1) {
        branch = branch.slice(1, -1).trim();
      }
      if (!branch) {
        errors.push(`${normalizeRepoPath(repo, path)} has an empty Branch header`);
        continue;
      }
      plans.push({
        branch,
        location,
        path: normalizeRepoPath(repo, path),
        hasOpenPhases: /(?:^|\n)\s*-\s*\[\s\]/.test(text),
      });
    }
  }
  return { plans, errors };
}

function parseRunLog(repo, facts) {
  const path = resolve(repo, facts.runLog);
  const shown = normalizeRepoPath(repo, path);
  if (!existsSync(path)) {
    return { rows: [], errors: [`${shown} is missing`] };
  }
  const rows = [];
  const errors = [];
  for (const [index, line] of readFileSync(path, "utf8").split(/\r?\n/).entries()) {
    if (!/^\|\s*\d{4}-\d{2}-\d{2}/.test(line)) continue;
    const cells = line
      .slice(1, line.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((cell) => cell.trim());
    if (
      cells.length !== 6 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(cells[0]) ||
      !["pre-impl", "impl", "post-impl"].includes(cells[1]) ||
      !cells.slice(2).every(Boolean)
    ) {
      errors.push(`${shown} line ${index + 1} is malformed`);
      continue;
    }
    rows.push({
      timestamp: cells[0],
      skill: cells[1],
      user: cells[2],
      planPath: cells[3].replaceAll("\\", "/"),
      branch: cells[4],
      outcome: cells[5],
      index,
    });
  }
  return { rows, errors };
}

function workingTree(repo, facts) {
  const output = runGit(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const paths = output
    ? output
        .split("\0")
        .filter(Boolean)
        .map((entry) => entry.slice(3))
        .filter(Boolean)
    : [];
  const documentation = paths.filter((path) => isDocumentation(path, facts));
  return {
    implementationChanges: paths.length - documentation.length,
    documentationChanges: documentation.length,
    paths: paths.map((path) => path.replaceAll("\\", "/")).sort(),
  };
}

function committedImplementationAfter(repo, planPath, facts) {
  let planCommit;
  try {
    planCommit = runGit(repo, ["log", "-1", "--format=%H", "--", planPath]);
  } catch {
    return [];
  }
  if (!planCommit) return [];
  const output = runGit(repo, ["diff", "--name-only", `${planCommit}..HEAD`]);
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => !isDocumentation(path, facts))
    .sort();
}

function summarizeRows(rows) {
  const count = (skill) => rows.filter((row) => row.skill === skill).length;
  const latest = rows.at(-1);
  return {
    preImpl: count("pre-impl"),
    impl: count("impl"),
    postImpl: count("post-impl"),
    latestSkill: latest?.skill ?? null,
    latestOutcome: latest?.outcome ?? null,
  };
}

function validateRowOrder(rows) {
  let planned = false;
  let implemented = false;
  for (const row of rows) {
    if (row.skill === "pre-impl") {
      planned = true;
      implemented = false;
    } else if (row.skill === "impl") {
      if (!planned) return false;
      implemented = true;
    } else {
      if (!planned || !implemented) return false;
      implemented = false;
    }
  }
  return true;
}

function severityFor(state) {
  if (state === "UNKNOWN") return "error";
  if (["READY_TO_PLAN", "PLANNED", "IMPLEMENTING", "MID_PLAN_PUBLISHED", "COMPLETE"].includes(state)) {
    return "info";
  }
  return "warning";
}

function classify({ branch, matchingPlans, rows, tree, errors, archivedNewerImplementation, facts }) {
  const evidence = [...errors];
  if (errors.length > 0) return { state: "UNKNOWN", evidence };
  if (matchingPlans.length > 1) {
    evidence.push(`${matchingPlans.length} plans claim branch ${branch}`);
    return { state: "UNACCOUNTED_WORK", evidence };
  }
  const isWorkBranch = facts.workBranchPrefixes.some((prefix) => branch.startsWith(prefix));
  const plan = matchingPlans[0] ?? null;
  if (!plan) {
    if (rows.length > 0) {
      evidence.push(`${rows.length} lifecycle rows exist without a branch-owned plan`);
      return { state: "UNACCOUNTED_WORK", evidence };
    }
    if (!isWorkBranch && tree.implementationChanges + tree.documentationChanges > 0) {
      evidence.push("a non-work branch has uncommitted repository changes");
      return { state: "UNACCOUNTED_WORK", evidence };
    }
    return { state: isWorkBranch ? "UNPLANNED" : "READY_TO_PLAN", evidence };
  }
  if (!validateRowOrder(rows)) {
    evidence.push("lifecycle row order is inconsistent");
    return { state: "UNACCOUNTED_WORK", evidence };
  }
  const summary = summarizeRows(rows);
  if (summary.preImpl === 0) {
    if (summary.impl > 0 || summary.postImpl > 0) {
      evidence.push("impl/post-impl accounting exists without pre-impl");
      return { state: "UNACCOUNTED_WORK", evidence };
    }
    return { state: "PLAN_UNACCOUNTED", evidence };
  }
  if (plan.location === "artifacts" && tree.implementationChanges > 0) {
    evidence.push("archived plan has newer uncommitted implementation changes");
    return { state: "UNACCOUNTED_WORK", evidence };
  }
  if (plan.location === "artifacts" && archivedNewerImplementation.length > 0) {
    evidence.push(
      `archived plan has newer committed implementation paths: ${archivedNewerImplementation.join(", ")}`,
    );
    return { state: "UNACCOUNTED_WORK", evidence };
  }
  if (summary.latestSkill === "pre-impl") {
    return {
      state: tree.implementationChanges > 0 ? "IMPLEMENTING" : "PLANNED",
      evidence,
    };
  }
  if (summary.latestSkill === "impl") {
    if (plan.location === "artifacts") {
      evidence.push("plan is archived before post-impl accounting");
      return { state: "UNACCOUNTED_WORK", evidence };
    }
    return { state: "IMPLEMENTED_NOT_PUBLISHED", evidence };
  }
  if (plan.location === "artifacts") return { state: "COMPLETE", evidence };
  if (plan.hasOpenPhases) return { state: "MID_PLAN_PUBLISHED", evidence };
  evidence.push(`post-impl is recorded but the completed plan remains in ${facts.plansDir.replaceAll("\\", "/")}/`);
  return { state: "UNACCOUNTED_WORK", evidence };
}

// ---------------------------------------------------------------- mirror advisory

/**
 * Turns `skills.mjs status --json` rows into a one-line advisory, or null when nothing needs
 * attention. Pure and exported so it can be tested without running the installer — the exec lives in
 * {@link readMirrorStatus}.
 *
 * `rows === null` means the status could not be read at all, which is NOT the same as "all clear" and
 * must never render as silence.
 */
export function formatMirrorAdvisory(rows, unreadableReason = null) {
  if (rows === null) {
    return `Skill mirrors: could not determine — ${unreadableReason ?? "status unavailable"}. Mirror staleness is unchecked this session.`;
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const actionable = rows.filter((r) => r?.needsAttention);
  if (actionable.length === 0) return null;

  const byState = new Map();
  for (const row of actionable) {
    const state = row.state ?? "unknown";
    if (!byState.has(state)) byState.set(state, []);
    byState.get(state).push(`${row.name} (${row.harness}/${row.scope})`);
  }

  const parts = [...byState].map(([state, names]) => `${state}: ${names.join(", ")}`);
  let advisory = `Skill mirrors need attention — ${parts.join(" · ")}.`;
  if (byState.has("misplaced")) {
    advisory +=
      " A misplaced mirror is NOT repaired by reinstalling — the installer never writes that path;" +
      " delete the stray directory so resolution falls through to the project copy.";
  }
  if (byState.has("stale") || byState.has("orphaned")) {
    advisory += " Run `node scripts/sdd/skills.mjs install --yes` to refresh and prune.";
  }
  advisory +=
    " Until then the tracked skills/<name>/SKILL.md is authoritative for this run — read it directly and say which text you followed.";
  return advisory;
}

/**
 * Measures the deployed skill mirrors against tracked source, unconditionally, once per session.
 *
 * Every *other* guard in the trio is conditional — "whenever the sync pulled changes under skills/" —
 * and that condition stays false through a drift whose cause is an installer defect rather than a
 * sync. This is also the only mechanism that reaches a mirror that is missing or shadowed entirely:
 * when the skill itself is wrong or absent, no text inside that skill can run.
 *
 * Silence is never success here. If the status cannot be read the advisory says so, because "no
 * output" and "everything is current" must not look identical.
 */
function readMirrorStatus(repo) {
  try {
    return runSkillsStatus(repo);
  } catch (error) {
    return { rows: null, reason: `status failed: ${error.message}` };
  }
}

function mirrorAdvisory(repo) {
  const { rows, reason } = readMirrorStatus(repo);
  return formatMirrorAdvisory(rows, reason);
}

// ---------------------------------------------------------------- evaluator

export function evaluateLifecycle({ repo: requestedRepo, branch: requestedBranch } = {}) {
  const repo = findRoot(requestedRepo || process.cwd());
  const facts = repoFacts(repo);
  const branch =
    requestedBranch || runGit(repo, ["branch", "--show-current"]) || "(detached HEAD)";
  const planData = parsePlans(repo, facts);
  const logData = parseRunLog(repo, facts);
  const tree = workingTree(repo, facts);
  const branchRows = logData.rows.filter((row) => row.branch === branch);
  const matchingPlans = planData.plans.filter((plan) => plan.branch === branch);
  const archivedNewerImplementation =
    matchingPlans.length === 1 && matchingPlans[0].location === "artifacts"
      ? committedImplementationAfter(repo, matchingPlans[0].path, facts)
      : [];
  const { state, evidence } = classify({
    branch,
    matchingPlans,
    rows: branchRows,
    tree,
    errors: [...planData.errors, ...logData.errors],
    archivedNewerImplementation,
    facts,
  });
  const plan = matchingPlans.length === 1 ? matchingPlans[0] : null;
  const [message, nextAction] = STATE_TEXT[state];
  const mirrors = mirrorAdvisory(repo);
  return {
    schemaVersion: 1,
    state,
    severity: severityFor(state),
    repo,
    branch,
    planPath: plan?.path ?? null,
    planLocation: plan?.location ?? null,
    rows: summarizeRows(branchRows),
    workingTree: {
      implementationChanges: tree.implementationChanges,
      documentationChanges: tree.documentationChanges,
    },
    message: mirrors ? `${message} ${mirrors}` : message,
    mirrors,
    nextAction,
    evidence,
  };
}

export function renderText(result) {
  const lines = [
    `SDD lifecycle: ${result.state}`,
    `Branch: ${result.branch}`,
    `Plan: ${result.planPath ?? "(none)"}`,
    `Rows: pre-impl=${result.rows.preImpl}, impl=${result.rows.impl}, post-impl=${result.rows.postImpl}`,
  ];
  if (result.evidence.length > 0) lines.push(`Evidence: ${result.evidence.join("; ")}`);
  if (result.mirrors) lines.push(`Mirrors: ${result.mirrors}`);
  lines.push(`Next: ${result.nextAction}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- hook adapters

function parseArgs(argv) {
  const options = {
    json: false,
    help: false,
    noSessionCache: false,
    simulateError: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--help") options.help = true;
    else if (argument === "--no-session-cache") options.noSessionCache = true;
    else if (argument === "--simulate-error") options.simulateError = true;
    else if (["--repo", "--branch", "--harness", "--event"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] =
        value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function readHookInput() {
  const text = readFileSync(0, "utf8").trim();
  if (!text) return {};
  return JSON.parse(text);
}

function hookSessionId(input) {
  return input.sessionId || input.session_id || "unknown-session";
}

function gitDirectory(repo) {
  const value = runGit(repo, ["rev-parse", "--git-dir"]);
  return isAbsolute(value) ? value : resolve(repo, value);
}

/** The once-per-session marker lives under `<git-dir>/sdd/lifecycle/`, never in the working tree. */
function markerPath(repo, harness, sessionId) {
  const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(gitDirectory(repo), "sdd", "lifecycle", `${harness}-${safeSessionId}-pre-tool`);
}

function isLikelyMutation(input) {
  const toolName = String(input.toolName || input.tool_name || "").toLowerCase();
  if (["edit", "create", "write", "apply_patch", "multiedit", "notebookedit"].includes(toolName)) return true;
  if (!["bash", "powershell"].includes(toolName)) return false;
  const toolInput = input.toolArgs || input.tool_input || {};
  const command = String(toolInput.command || "");
  return /\b(git\s+(add|commit|mv|rm)|dotnet\s+(format|new)|npm\s+(install|update)|remove-item|set-content|add-content|new-item|move-item|copy-item|sed\s+-i|tee\b|>\s*[^&])\b/i.test(
    command,
  );
}

function shouldAdviseBeforeMutation(state) {
  return !["PLANNED", "IMPLEMENTING", "MID_PLAN_PUBLISHED"].includes(state);
}

function claudeOutput(event, message) {
  const hookEventName = event === "session-start" ? "SessionStart" : "PreToolUse";
  return {
    systemMessage: message,
    hookSpecificOutput: {
      hookEventName,
      additionalContext: message,
    },
  };
}

function writeCopilotOutput(message, includeContext) {
  if (message) {
    process.stdout.write(`${JSON.stringify({ type: "progress", message })}\n`);
  }
  process.stdout.write(
    `${JSON.stringify(includeContext && message ? { additionalContext: message } : {})}\n`,
  );
}

function staticHookFallback(options) {
  if (options.harness === "claude") {
    process.stdout.write(`${JSON.stringify(claudeOutput(options.event, STATIC_NOTICE))}\n`);
  } else {
    writeCopilotOutput(STATIC_NOTICE, options.event === "session-start");
  }
}

export function runCli(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(`${HELP}\n`);
      return 0;
    }
    if (options.harness && !["claude", "copilot"].includes(options.harness)) {
      throw new Error(`Unsupported harness: ${options.harness}`);
    }
    if (options.event && !["session-start", "pre-tool-use"].includes(options.event)) {
      throw new Error(`Unsupported event: ${options.event}`);
    }
    if (options.simulateError) throw new Error("simulated evaluator failure");
    const input = options.harness ? readHookInput() : {};
    const repo = findRoot(resolve(options.repo || input.cwd || process.cwd()));
    const result = evaluateLifecycle({ repo, branch: options.branch });

    if (!options.harness) {
      process.stdout.write(
        options.json ? `${JSON.stringify(result)}\n` : `${renderText(result)}\n`,
      );
      return 0;
    }

    if (options.event === "pre-tool-use") {
      if (!isLikelyMutation(input) || !shouldAdviseBeforeMutation(result.state)) {
        process.stdout.write("{}\n");
        return 0;
      }
      if (!options.noSessionCache) {
        const path = markerPath(repo, options.harness, hookSessionId(input));
        if (existsSync(path)) {
          process.stdout.write("{}\n");
          return 0;
        }
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, new Date().toISOString());
      }
    }

    if (options.harness === "claude") {
      process.stdout.write(`${JSON.stringify(claudeOutput(options.event, result.message))}\n`);
    } else {
      writeCopilotOutput(result.message, options.event === "session-start");
    }
    return 0;
  } catch (error) {
    if (options?.harness) {
      staticHookFallback(options);
      return 0;
    }
    process.stderr.write(`${JSON.stringify({ error: "SDD_LIFECYCLE_ERROR", message: error.message })}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}
