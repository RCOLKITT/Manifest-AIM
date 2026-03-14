/**
 * Pattern detection engine — runs regex matches against file contents.
 */

import type { PatternDetect, Violation, GovernanceRule } from "./types.js";

export function runPatternDetection(
  rule: GovernanceRule,
  detect: PatternDetect,
  filePath: string,
  content: string,
): Violation[] {
  const violations: Violation[] = [];

  // Check file type filter
  if (detect.file_types && detect.file_types.length > 0) {
    const ext = filePath.split(".").pop() ?? "";
    if (!detect.file_types.includes(ext)) {
      return violations;
    }
  }

  let regex: RegExp;
  try {
    regex = new RegExp(detect.match, "gm");
  } catch {
    // Invalid regex in manifest — report as a single violation
    violations.push({
      rule: rule.name,
      file: filePath,
      message: `Invalid regex in rule "${rule.name}": ${detect.match}`,
      severity: rule.severity,
      action: rule.action,
    });
    return violations;
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // Reset regex state for each line
    regex.lastIndex = 0;
    let match = regex.exec(lines[i]);
    while (match !== null) {
      violations.push({
        rule: rule.name,
        file: filePath,
        line: i + 1,
        column: match.index + 1,
        message: rule.message ?? `Pattern matched: ${rule.name}`,
        severity: rule.severity,
        action: rule.action,
        fix_hint: rule.fix_hint,
        match: match[0],
      });
      match = regex.exec(lines[i]);
    }
  }

  return violations;
}
