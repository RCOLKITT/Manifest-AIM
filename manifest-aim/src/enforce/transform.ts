/**
 * Transform engine — modifies output to fix issues automatically.
 *
 * Transforms enable AIM to be an active quality improver, not just a gatekeeper.
 * They can:
 * - remove_match: Remove the matched pattern
 * - replace: Replace matched pattern with a replacement string
 * - inject: Inject content at top/bottom/before_match/after_match
 */

import type { TransformRule, TransformSummary } from "./types.js";

export interface TransformResult {
  transformed: boolean;
  content: string;
  changes: TransformSummary[];
}

/**
 * Apply a transform rule to content.
 */
export function applyTransform(
  rule: TransformRule,
  content: string,
  filePath: string,
  matches: Array<{ match: string; line: number; index: number }>,
): TransformResult {
  const changes: TransformSummary[] = [];
  let transformed = content;

  const config = rule.transform;

  switch (config.type) {
    case "remove_match":
      // Remove all matched patterns
      for (const m of matches.reverse()) {
        // Process in reverse order to preserve indices
        transformed =
          transformed.slice(0, m.index) +
          transformed.slice(m.index + m.match.length);
        changes.push({
          rule: rule.name,
          file: filePath,
          type: "remove",
          line: m.line,
          original: m.match,
        });
      }
      break;

    case "replace":
      // Replace all matched patterns
      if (config.replacement !== undefined) {
        for (const m of matches.reverse()) {
          transformed =
            transformed.slice(0, m.index) +
            config.replacement +
            transformed.slice(m.index + m.match.length);
          changes.push({
            rule: rule.name,
            file: filePath,
            type: "replace",
            line: m.line,
            original: m.match,
            replacement: config.replacement,
          });
        }
      }
      break;

    case "inject":
      // Inject content at specified position
      if (config.template) {
        const position = config.position ?? "top";

        if (position === "top") {
          transformed = config.template + "\n" + transformed;
          changes.push({
            rule: rule.name,
            file: filePath,
            type: "inject-top",
            replacement: config.template,
          });
        } else if (position === "bottom") {
          transformed = transformed + "\n" + config.template;
          changes.push({
            rule: rule.name,
            file: filePath,
            type: "inject-bottom",
            replacement: config.template,
          });
        } else if (position === "before_match" || position === "after_match") {
          for (const m of matches.reverse()) {
            const insertIndex =
              position === "before_match" ? m.index : m.index + m.match.length;
            transformed =
              transformed.slice(0, insertIndex) +
              config.template +
              transformed.slice(insertIndex);
            changes.push({
              rule: rule.name,
              file: filePath,
              type: `inject-${position}`,
              line: m.line,
              replacement: config.template,
            });
          }
        }
      }
      break;
  }

  return {
    transformed: changes.length > 0,
    content: transformed,
    changes,
  };
}

/**
 * Find all matches of a pattern in content with their positions.
 */
export function findMatches(
  pattern: string,
  content: string,
): Array<{ match: string; line: number; index: number }> {
  const matches: Array<{ match: string; line: number; index: number }> = [];

  try {
    const regex = new RegExp(pattern, "g");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      // Calculate line number
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split("\n").length;

      matches.push({
        match: match[0],
        line,
        index: match.index,
      });
    }
  } catch {
    // Invalid regex — return empty
  }

  return matches;
}

/**
 * Apply all transform rules to content.
 */
export function applyTransforms(
  rules: TransformRule[],
  content: string,
  filePath: string,
): TransformResult {
  let current = content;
  const allChanges: TransformSummary[] = [];

  for (const rule of rules) {
    if (!rule.detect || rule.detect.type !== "pattern") {
      continue;
    }

    const matches = findMatches(rule.detect.match, current);
    if (matches.length === 0) {
      continue;
    }

    const result = applyTransform(rule, current, filePath, matches);
    if (result.transformed) {
      current = result.content;
      allChanges.push(...result.changes);
    }
  }

  return {
    transformed: allChanges.length > 0,
    content: current,
    changes: allChanges,
  };
}
