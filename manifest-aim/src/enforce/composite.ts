/**
 * Composite detection engine — chains multiple detection modes.
 *
 * Composite detection enables high-confidence enforcement by combining
 * pattern, tool, and semantic checks with configurable strategies:
 *
 * - all_must_pass: Every check must trigger for the rule to fire (AND logic)
 * - any_must_pass: Any single check triggering fires the rule (OR logic)
 * - weighted: Each check has a weight; combined score must exceed threshold
 */

import type {
  GovernanceRule,
  CompositeDetect,
  PatternDetect,
  ToolDetect,
  SemanticDetect,
  Violation,
} from "./types.js";
import { runPatternDetection } from "./pattern.js";
import { runToolDetection } from "./tool.js";
import { runSemanticDetection } from "./semantic.js";

export interface CompositeResult {
  violations: Violation[];
  skipped: boolean;
  skipReason?: string;
  /** Per-check results for debugging/audit. */
  checkResults: CheckResult[];
}

interface CheckResult {
  type: string;
  triggered: boolean;
  skipped: boolean;
  weight: number;
  violations: Violation[];
}

/**
 * Run composite detection — evaluate all sub-checks and apply strategy.
 */
export async function runCompositeDetection(
  rule: GovernanceRule,
  detect: CompositeDetect,
  filePath: string,
  content: string,
  absolutePath: string,
  skippedTools: Map<string, string>,
): Promise<CompositeResult> {
  const checks = detect.checks;
  if (!checks || checks.length === 0) {
    return { violations: [], skipped: true, skipReason: "No checks defined", checkResults: [] };
  }

  const strategy = detect.strategy ?? "all_must_pass";
  const threshold = detect.threshold ?? 0.5;

  // Run all sub-checks
  const checkResults: CheckResult[] = [];

  for (const check of checks) {
    const weight = (check as unknown as Record<string, unknown>).weight as number | undefined ?? 1;

    if (check.type === "pattern") {
      const violations = runPatternDetection(rule, check as PatternDetect, filePath, content);
      checkResults.push({
        type: "pattern",
        triggered: violations.length > 0,
        skipped: false,
        weight,
        violations,
      });
    } else if (check.type === "tool") {
      const result = runToolDetection(rule, check as ToolDetect, absolutePath);
      if (result.skipped) {
        checkResults.push({
          type: "tool",
          triggered: false,
          skipped: true,
          weight,
          violations: [],
        });
      } else {
        for (const v of result.violations) {
          v.file = filePath;
        }
        checkResults.push({
          type: "tool",
          triggered: result.violations.length > 0,
          skipped: false,
          weight,
          violations: result.violations,
        });
      }
    } else if (check.type === "semantic") {
      const result = await runSemanticDetection(rule, check as SemanticDetect, filePath, content);
      if (result.skipped) {
        checkResults.push({
          type: "semantic",
          triggered: false,
          skipped: true,
          weight,
          violations: [],
        });
      } else {
        checkResults.push({
          type: "semantic",
          triggered: result.violations.length > 0,
          skipped: false,
          weight,
          violations: result.violations,
        });
      }
    }
  }

  // Track skipped sub-checks
  const skippedChecks = checkResults.filter((c) => c.skipped);
  const activeChecks = checkResults.filter((c) => !c.skipped);

  // If all checks were skipped, skip the whole rule
  if (activeChecks.length === 0) {
    return {
      violations: [],
      skipped: true,
      skipReason: "All sub-checks were skipped",
      checkResults,
    };
  }

  // Apply strategy
  let triggered = false;
  const allViolations: Violation[] = [];

  if (strategy === "all_must_pass") {
    // All active checks must trigger
    triggered = activeChecks.every((c) => c.triggered);
    if (triggered) {
      for (const c of activeChecks) {
        allViolations.push(...c.violations);
      }
    }
  } else if (strategy === "any_must_pass") {
    // Any active check triggering fires the rule
    triggered = activeChecks.some((c) => c.triggered);
    if (triggered) {
      for (const c of activeChecks.filter((c) => c.triggered)) {
        allViolations.push(...c.violations);
      }
    }
  } else if (strategy === "weighted") {
    // Calculate weighted score from triggered checks
    const totalWeight = activeChecks.reduce((sum, c) => sum + c.weight, 0);
    const triggeredWeight = activeChecks
      .filter((c) => c.triggered)
      .reduce((sum, c) => sum + c.weight, 0);
    const score = totalWeight > 0 ? triggeredWeight / totalWeight : 0;

    triggered = score >= threshold;
    if (triggered) {
      // Create a single composite violation with the score
      allViolations.push({
        rule: rule.name,
        file: filePath,
        message: rule.message ?? `Composite check failed: ${rule.name}`,
        severity: rule.severity,
        action: rule.action,
        fix_hint: rule.fix_hint,
        match: `[composite:${strategy}] score=${score.toFixed(2)} threshold=${threshold} (${activeChecks.filter((c) => c.triggered).length}/${activeChecks.length} checks triggered)`,
      });
    }
  }

  // For all_must_pass and any_must_pass, if triggered but no violations collected
  // (shouldn't happen, but defensive), create a summary violation
  if (triggered && allViolations.length === 0) {
    allViolations.push({
      rule: rule.name,
      file: filePath,
      message: rule.message ?? `Composite check failed: ${rule.name}`,
      severity: rule.severity,
      action: rule.action,
      fix_hint: rule.fix_hint,
      match: `[composite:${strategy}]`,
    });
  }

  // Note skipped sub-checks in the skippedTools map
  if (skippedChecks.length > 0) {
    skippedTools.set(
      `${rule.name}:sub-checks`,
      `${skippedChecks.length}/${checkResults.length} sub-checks skipped`,
    );
  }

  return {
    violations: allViolations,
    skipped: false,
    checkResults,
  };
}
