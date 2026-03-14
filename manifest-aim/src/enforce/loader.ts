/**
 * Manifest loader — reads and extracts enforceable rules from aim.yaml.
 */

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import yaml from "js-yaml";
import type { GovernanceRule, EnforceContext } from "./types.js";

export interface LoadedManifest {
  rules: GovernanceRule[];
  context: EnforceContext;
  metadata: { name: string; version: string };
}

export function loadManifestForEnforcement(filePath: string): LoadedManifest {
  const ext = extname(filePath).toLowerCase();
  const content = readFileSync(filePath, "utf-8");

  let manifest: Record<string, unknown>;
  if (ext === ".yaml" || ext === ".yml") {
    manifest = yaml.load(content) as Record<string, unknown>;
  } else if (ext === ".json") {
    manifest = JSON.parse(content);
  } else {
    try {
      manifest = yaml.load(content) as Record<string, unknown>;
    } catch {
      manifest = JSON.parse(content);
    }
  }

  const metadata = manifest.metadata as Record<string, unknown> | undefined;
  const governance = manifest.governance as Record<string, unknown> | undefined;
  const context = manifest.context as Record<string, unknown> | undefined;

  const rules = (governance?.rules as GovernanceRule[] | undefined) ?? [];
  const enforceContext: EnforceContext = {
    environment: context?.environment as string | undefined,
    variables: context?.variables as Record<string, unknown> | undefined,
  };

  return {
    rules,
    context: enforceContext,
    metadata: {
      name: (metadata?.name as string) ?? "unknown",
      version: (metadata?.version as string) ?? "0.0.0",
    },
  };
}

/**
 * Filter rules to only those that are enforceable via detection
 * (pattern, tool, or semantic). Skip injected and rules without detect config.
 */
export function getEnforceableRules(manifest: LoadedManifest): GovernanceRule[] {
  return manifest.rules.filter((rule) => {
    // Skip injected-only rules (they're context injection, not file checks)
    if (rule.enforcement === "injected") return false;

    // Must have a detect config with a supported type
    if (!rule.detect) return false;
    if (
      rule.detect.type !== "pattern" &&
      rule.detect.type !== "tool" &&
      rule.detect.type !== "semantic"
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Evaluate simple `when` conditions against context.
 * Supports: "environment == 'production'" style checks.
 * Returns true if the rule should be active.
 */
export function evaluateCondition(
  condition: string | undefined,
  context: EnforceContext,
): boolean {
  if (!condition) return true;

  // Simple equality check: "field == 'value'" or "field != 'value'"
  const eqMatch = condition.match(/^(\w+)\s*==\s*'([^']*)'$/);
  if (eqMatch) {
    const [, field, value] = eqMatch;
    if (field === "environment") return context.environment === value;
    const variables = context.variables ?? {};
    return String(variables[field] ?? "") === value;
  }

  const neqMatch = condition.match(/^(\w+)\s*!=\s*'([^']*)'$/);
  if (neqMatch) {
    const [, field, value] = neqMatch;
    if (field === "environment") return context.environment !== value;
    const variables = context.variables ?? {};
    return String(variables[field] ?? "") !== value;
  }

  // If we can't parse the condition, default to active (fail-open for now)
  return true;
}
