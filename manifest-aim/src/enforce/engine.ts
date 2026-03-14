/**
 * Enforcement engine — orchestrates rule evaluation against target files.
 */

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import {
  loadManifestForEnforcement,
  getEnforceableRules,
  evaluateCondition,
} from "./loader.js";
import { runPatternDetection } from "./pattern.js";
import { runToolDetection } from "./tool.js";
import { runSemanticDetection } from "./semantic.js";
import type {
  GovernanceRule,
  PatternDetect,
  ToolDetect,
  SemanticDetect,
  Violation,
  EnforceResult,
  EnforceSummary,
  EnforceContext,
} from "./types.js";

export interface EnforceOptions {
  manifestPath: string;
  targetPath: string;
  /** Override environment context (e.g., force "production" mode). */
  environment?: string;
}

/**
 * Collect all files recursively from a path.
 * Skips node_modules, .git, dist, .aim, and other non-source directories.
 */
function collectFiles(targetPath: string): string[] {
  const resolved = resolve(targetPath);
  const stat = statSync(resolved);

  if (stat.isFile()) {
    return [resolved];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    ".aim",
    "coverage",
    ".next",
    ".nuxt",
    "__pycache__",
  ]);

  const files: string[] = [];
  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          walk(join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        files.push(join(dir, entry.name));
      }
    }
  }

  walk(resolved);
  return files;
}

/**
 * Run enforcement for a single file against all applicable rules.
 */
async function enforceFile(
  filePath: string,
  rules: GovernanceRule[],
  context: EnforceContext,
  basePath: string,
  skippedTools: Map<string, string>,
): Promise<EnforceResult> {
  const start = performance.now();
  const violations: Violation[] = [];
  const relPath = relative(basePath, filePath);
  let rulesChecked = 0;

  // Read file content once for pattern and semantic checks
  let fileContent: string | null = null;
  function getContent(): string {
    if (fileContent === null) {
      fileContent = readFileSync(filePath, "utf-8");
    }
    return fileContent;
  }

  for (const rule of rules) {
    // Evaluate when/unless conditions
    if (!evaluateCondition(rule.when, context)) continue;
    if (rule.unless && evaluateCondition(rule.unless, context)) continue;

    const detect = rule.detect;
    if (!detect) continue;

    rulesChecked++;

    if (detect.type === "pattern") {
      const patternViolations = runPatternDetection(
        rule,
        detect as PatternDetect,
        relPath,
        getContent(),
      );
      violations.push(...patternViolations);
    } else if (detect.type === "tool") {
      const result = runToolDetection(rule, detect as ToolDetect, filePath);
      if (result.skipped) {
        skippedTools.set(rule.name, result.skipReason ?? "Tool not available");
      } else {
        for (const v of result.violations) {
          v.file = relPath;
        }
        violations.push(...result.violations);
      }
    } else if (detect.type === "semantic") {
      const result = await runSemanticDetection(
        rule,
        detect as SemanticDetect,
        relPath,
        getContent(),
      );
      if (result.skipped) {
        skippedTools.set(rule.name, result.skipReason ?? "Semantic enforcement unavailable");
      } else {
        violations.push(...result.violations);
      }
    }
  }

  return {
    file: relPath,
    violations,
    rulesChecked,
    duration: performance.now() - start,
  };
}

/**
 * Main enforcement entry point.
 */
export async function enforce(options: EnforceOptions): Promise<EnforceSummary> {
  const start = performance.now();

  // Load manifest
  const manifest = loadManifestForEnforcement(resolve(options.manifestPath));

  // Override environment if specified
  if (options.environment) {
    manifest.context.environment = options.environment;
  }

  // Get enforceable rules (pattern + tool + semantic)
  const rules = getEnforceableRules(manifest);

  // Collect target files
  const resolvedTarget = resolve(options.targetPath);
  const files = collectFiles(resolvedTarget);

  // Base path for relative display: use parent dir if targeting a single file
  const targetStat = statSync(resolvedTarget);
  const basePath = targetStat.isFile() ? dirname(resolvedTarget) : resolvedTarget;

  // Track skipped tools globally
  const skippedTools = new Map<string, string>();

  // Run enforcement on each file
  const results: EnforceResult[] = [];
  for (const file of files) {
    const result = await enforceFile(file, rules, manifest.context, basePath, skippedTools);
    if (result.violations.length > 0 || result.rulesChecked > 0) {
      results.push(result);
    }
  }

  // Aggregate results
  const allViolations = results.flatMap((r) => r.violations);
  const byAction: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const v of allViolations) {
    byAction[v.action] = (byAction[v.action] ?? 0) + 1;
    bySeverity[v.severity] = (bySeverity[v.severity] ?? 0) + 1;
  }

  const blocked = (byAction["block"] ?? 0) > 0;

  return {
    files: files.length,
    filesWithViolations: results.filter((r) => r.violations.length > 0).length,
    totalViolations: allViolations.length,
    byAction,
    bySeverity,
    results,
    blocked,
    duration: performance.now() - start,
    skippedRules: Object.fromEntries(skippedTools),
  };
}

export { loadManifestForEnforcement, getEnforceableRules };
