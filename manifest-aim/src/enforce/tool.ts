/**
 * Tool detection engine — shells out to external tools and interprets results.
 */

import { execSync } from "node:child_process";
import type { ToolDetect, Violation, GovernanceRule } from "./types.js";

/**
 * Check if a tool command is available on the system.
 */
function isToolAvailable(command: string): boolean {
  const toolName = command.split(/\s+/)[0];
  // Handle npx-prefixed commands — npx is always available if node is
  if (toolName === "npx") return true;

  try {
    execSync(`which ${toolName}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export interface ToolResult {
  violations: Violation[];
  skipped: boolean;
  skipReason?: string;
}

export function runToolDetection(
  rule: GovernanceRule,
  detect: ToolDetect,
  filePath: string,
): ToolResult {
  const violations: Violation[] = [];

  // Interpolate {{file}} in command
  const command = detect.command.replace(/\{\{file\}\}/g, filePath);

  // Check if the tool exists
  const toolName = command.split(/\s+/)[0];
  if (!isToolAvailable(toolName)) {
    return {
      violations: [],
      skipped: true,
      skipReason: detect.install
        ? `Tool "${toolName}" not found. Install with: ${detect.install}`
        : `Tool "${toolName}" not found`,
    };
  }

  const exitCodeFail = detect.exit_code_fail ?? "non-zero";

  try {
    const stdout = execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
    });

    // Command succeeded (exit 0)
    if (exitCodeFail === "zero") {
      // exit 0 means failure for this rule
      violations.push({
        rule: rule.name,
        file: filePath,
        message: rule.message ?? `Tool check failed: ${rule.name}`,
        severity: rule.severity,
        action: rule.action,
        fix_hint: rule.fix_hint,
      });
    }
    // else: exit 0 with "non-zero" fail mode means pass — no violations

    // If there's a match_condition, try to evaluate it on the output
    if (exitCodeFail === "non-zero" && detect.match_condition && stdout) {
      if (evaluateMatchCondition(detect.match_condition, stdout)) {
        violations.push({
          rule: rule.name,
          file: filePath,
          message: rule.message ?? `Tool check failed: ${rule.name}`,
          severity: rule.severity,
          action: rule.action,
          fix_hint: rule.fix_hint,
        });
      }
    }
  } catch (err: unknown) {
    const error = err as { status?: number; stdout?: string; stderr?: string };
    const exitCode = error.status ?? 1;

    if (exitCodeFail === "non-zero" && exitCode !== 0) {
      // Non-zero exit = failure (the standard case)
      const detail = error.stderr || error.stdout || "";
      violations.push({
        rule: rule.name,
        file: filePath,
        message: rule.message ?? `Tool check failed: ${rule.name}`,
        severity: rule.severity,
        action: rule.action,
        fix_hint: rule.fix_hint,
        match: detail.trim().split("\n").slice(0, 5).join("\n"),
      });
    }
    // else: non-zero exit with "zero" fail mode means pass
  }

  return { violations, skipped: false };
}

/**
 * Simple match_condition evaluation.
 * Supports: "results.length > 0" style checks on JSON output.
 */
function evaluateMatchCondition(condition: string, output: string): boolean {
  try {
    const parsed = JSON.parse(output);

    // Handle "results.length > 0" pattern
    const lengthMatch = condition.match(/^(\w+)\.length\s*>\s*(\d+)$/);
    if (lengthMatch) {
      const [, field, threshold] = lengthMatch;
      const arr = parsed[field];
      if (Array.isArray(arr)) {
        return arr.length > Number(threshold);
      }
    }

    return false;
  } catch {
    // Output isn't JSON — can't evaluate match condition
    return false;
  }
}
