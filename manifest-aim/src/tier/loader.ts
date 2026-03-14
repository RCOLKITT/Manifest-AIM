/**
 * Tier loader — progressive capability loading at Tier 0/1/2/3.
 *
 * AIM's core innovation: instead of dumping all capability details upfront
 * (burning thousands of tokens), we load capabilities progressively:
 *
 * - Tier 0 (Index):       ~5 tokens per capability — name, tags, one-line description
 * - Tier 1 (Schema):      ~50-200 tokens — typed inputs/outputs, preconditions
 * - Tier 2 (Instructions): Variable — full how-to, examples, anti-patterns
 * - Tier 3 (Dispatch):     0 tokens — execution config, never enters context window
 */

import { readFileSync, existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import yaml from "js-yaml";

export type TierLevel = 0 | 1 | 2 | 3;

/** Base capability fields shared across all tiers. */
interface CapabilityBase {
  name: string;
  tags: string[];
  index: string;
}

/** Tier 0: Index — bare minimum for discovery. */
export interface Tier0 extends CapabilityBase {
  tier: 0;
}

/** Tier 1: Schema — typed interface for planning. */
export interface Tier1 extends CapabilityBase {
  tier: 1;
  schema: {
    inputs?: Record<string, SchemaField>;
    outputs?: Record<string, SchemaField>;
    preconditions?: string[];
    side_effects?: string[];
    idempotent?: boolean;
    timeout?: string;
    rate_limit?: string;
  };
}

/** Tier 2: Instructions — full how-to with examples. */
export interface Tier2 extends CapabilityBase {
  tier: 2;
  schema: Tier1["schema"];
  instructions: string;
  examples: CapabilityExample[];
  anti_patterns: AntiPattern[];
}

/** Tier 3: Dispatch — execution config (never enters context window). */
export interface Tier3 extends CapabilityBase {
  tier: 3;
  schema: Tier1["schema"];
  instructions: string;
  examples: CapabilityExample[];
  anti_patterns: AntiPattern[];
  dispatch: {
    type: string;
    config: Record<string, unknown>;
  };
}

export interface SchemaField {
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
}

export interface CapabilityExample {
  description: string;
  input?: Record<string, unknown>;
  expected_output?: unknown;
}

export interface AntiPattern {
  description: string;
  example?: string;
}

export type TierData = Tier0 | Tier1 | Tier2 | Tier3;

/** Result of loading capabilities at a given tier. */
export interface TierLoadResult {
  manifestName: string;
  manifestVersion: string;
  tier: TierLevel;
  capabilities: TierData[];
  tokenEstimate: number;
}

/**
 * Load all capabilities from a manifest at the specified tier level.
 */
export function loadCapabilitiesAtTier(
  manifestPath: string,
  tier: TierLevel,
  filter?: string,
): TierLoadResult {
  const resolvedPath = resolve(manifestPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Manifest not found: ${resolvedPath}`);
  }

  const content = readFileSync(resolvedPath, "utf-8");
  const ext = extname(resolvedPath).toLowerCase();

  let manifest: Record<string, unknown>;
  if (ext === ".json") {
    manifest = JSON.parse(content);
  } else {
    manifest = yaml.load(content) as Record<string, unknown>;
  }

  const metadata = (manifest.metadata ?? {}) as Record<string, unknown>;
  const capabilities = (manifest.capabilities ?? []) as Array<Record<string, unknown>>;

  // Apply filter if provided
  let filtered = capabilities;
  if (filter) {
    const lowerFilter = filter.toLowerCase();
    filtered = capabilities.filter((c) => {
      const name = (c.name as string ?? "").toLowerCase();
      const tags = (c.tags as string[] ?? []).map((t) => t.toLowerCase());
      const desc = (c.index as string ?? c.description as string ?? "").toLowerCase();
      return (
        name.includes(lowerFilter) ||
        tags.some((t) => t.includes(lowerFilter)) ||
        desc.includes(lowerFilter)
      );
    });
  }

  const result: TierData[] = filtered.map((c) => extractAtTier(c, tier));
  const tokenEstimate = estimateTokens(result, tier);

  return {
    manifestName: (metadata.name as string) ?? "unknown",
    manifestVersion: (metadata.version as string) ?? "0.0.0",
    tier,
    capabilities: result,
    tokenEstimate,
  };
}

/**
 * Extract a single capability at the specified tier level.
 * Higher tiers include all lower tier data.
 */
function extractAtTier(raw: Record<string, unknown>, tier: TierLevel): TierData {
  // Tier 0: Index
  const tier0: Tier0 = {
    tier: 0,
    name: (raw.name as string) ?? "unnamed",
    tags: (raw.tags as string[]) ?? [],
    index: (raw.index as string) ?? (raw.description as string) ?? "",
  };

  if (tier === 0) return tier0;

  // Tier 1: Schema
  const rawSchema = (raw.schema ?? {}) as Record<string, unknown>;
  const tier1: Tier1 = {
    ...tier0,
    tier: 1,
    schema: {
      inputs: rawSchema.inputs as Record<string, SchemaField> | undefined,
      outputs: rawSchema.outputs as Record<string, SchemaField> | undefined,
      preconditions: rawSchema.preconditions as string[] | undefined,
      side_effects: rawSchema.side_effects as string[] | undefined,
      idempotent: rawSchema.idempotent as boolean | undefined,
      timeout: rawSchema.timeout as string | undefined,
      rate_limit: rawSchema.rate_limit as string | undefined,
    },
  };

  if (tier === 1) return tier1;

  // Tier 2: Instructions
  const rawExamples = (raw.examples ?? []) as Array<Record<string, unknown>>;
  const rawAntiPatterns = (raw.anti_patterns ?? []) as Array<Record<string, unknown>>;

  const tier2: Tier2 = {
    ...tier1,
    tier: 2,
    instructions: (raw.instructions as string) ?? "",
    examples: rawExamples.map((e) => ({
      description: (e.description as string) ?? "",
      input: e.input as Record<string, unknown> | undefined,
      expected_output: e.expected_output,
    })),
    anti_patterns: rawAntiPatterns.map((a) => ({
      description: (a.description as string) ?? "",
      example: a.example as string | undefined,
    })),
  };

  if (tier === 2) return tier2;

  // Tier 3: Dispatch
  const rawDispatch = (raw.dispatch ?? {}) as Record<string, unknown>;
  const tier3: Tier3 = {
    ...tier2,
    tier: 3,
    dispatch: {
      type: (rawDispatch.type as string) ?? "unknown",
      config: (rawDispatch.config as Record<string, unknown>) ?? {},
    },
  };

  return tier3;
}

/**
 * Estimate token count for capabilities at a given tier.
 * Uses rough heuristic: ~4 characters per token.
 */
function estimateTokens(capabilities: TierData[], tier: TierLevel): number {
  let chars = 0;

  for (const cap of capabilities) {
    // Tier 0 cost
    chars += cap.name.length + cap.index.length + cap.tags.join(",").length;

    if (tier >= 1 && "schema" in cap) {
      chars += JSON.stringify(cap.schema).length;
    }
    if (tier >= 2 && "instructions" in cap) {
      chars += cap.instructions.length;
      chars += JSON.stringify(cap.examples).length;
      chars += JSON.stringify(cap.anti_patterns).length;
    }
    // Tier 3 doesn't count — never enters context window
  }

  return Math.ceil(chars / 4);
}

/**
 * Format tier data as human-readable text (for CLI output).
 */
export function formatTierOutput(result: TierLoadResult): string {
  const lines: string[] = [];

  lines.push(`Manifest: ${result.manifestName} v${result.manifestVersion}`);
  lines.push(`Tier: ${result.tier} | Capabilities: ${result.capabilities.length} | ~${result.tokenEstimate} tokens`);
  lines.push("");

  for (const cap of result.capabilities) {
    lines.push(`── ${cap.name} ──`);

    if (cap.tags.length > 0) {
      lines.push(`  Tags: ${cap.tags.join(", ")}`);
    }
    lines.push(`  ${cap.index}`);

    if (result.tier >= 1 && "schema" in cap) {
      const s = cap.schema;
      if (s.inputs && Object.keys(s.inputs).length > 0) {
        lines.push("  Inputs:");
        for (const [name, field] of Object.entries(s.inputs)) {
          const req = field.required ? " (required)" : "";
          lines.push(`    ${name}: ${field.type}${req}${field.description ? ` — ${field.description}` : ""}`);
        }
      }
      if (s.outputs && Object.keys(s.outputs).length > 0) {
        lines.push("  Outputs:");
        for (const [name, field] of Object.entries(s.outputs)) {
          lines.push(`    ${name}: ${field.type}${field.description ? ` — ${field.description}` : ""}`);
        }
      }
      if (s.preconditions && s.preconditions.length > 0) {
        lines.push(`  Preconditions: ${s.preconditions.join("; ")}`);
      }
      if (s.side_effects && s.side_effects.length > 0) {
        lines.push(`  Side effects: ${s.side_effects.join("; ")}`);
      }
      if (s.idempotent !== undefined) {
        lines.push(`  Idempotent: ${s.idempotent}`);
      }
    }

    if (result.tier >= 2 && "instructions" in cap) {
      if (cap.instructions) {
        lines.push("  Instructions:");
        for (const line of cap.instructions.split("\n")) {
          lines.push(`    ${line}`);
        }
      }
      if (cap.examples.length > 0) {
        lines.push("  Examples:");
        for (const ex of cap.examples) {
          lines.push(`    • ${ex.description}`);
        }
      }
      if (cap.anti_patterns.length > 0) {
        lines.push("  Anti-patterns:");
        for (const ap of cap.anti_patterns) {
          lines.push(`    ✗ ${ap.description}`);
        }
      }
    }

    if (result.tier >= 3 && "dispatch" in cap) {
      lines.push(`  Dispatch: ${cap.dispatch.type}`);
      if (Object.keys(cap.dispatch.config).length > 0) {
        lines.push(`  Config: ${JSON.stringify(cap.dispatch.config)}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate the progressive loading protocol block for wrap output.
 * This teaches the agent how the tiered system works.
 */
export function generateProgressiveLoadingProtocol(
  capabilities: Array<Record<string, unknown>>,
): string {
  if (capabilities.length === 0) return "";

  const lines: string[] = [
    "## Progressive Loading Protocol",
    "",
    "Capabilities are loaded progressively to minimize context cost:",
    "",
    "| Tier | Name | What You See | When |",
    "|------|------|-------------|------|",
    "| 0 | Index | Name, tags, one-line description | Always (below) |",
    "| 1 | Schema | Typed inputs/outputs, preconditions | When you identify a relevant capability |",
    "| 2 | Instructions | Full how-to, examples, anti-patterns | When you commit to using it |",
    "| 3 | Dispatch | Execution config | At execution time (never in context) |",
    "",
    "**How to use:** Review the Tier 0 index below. When a capability matches your task,",
    "run `manifest tier <capability-name> --tier 1` to load its schema, then `--tier 2` for full instructions.",
    "",
    `### Capability Index (Tier 0) — ${capabilities.length} available`,
    "",
  ];

  for (const c of capabilities) {
    const name = (c.name as string) ?? "unnamed";
    const index = (c.index as string) ?? (c.description as string) ?? "";
    const tags = (c.tags as string[]) ?? [];
    let line = `- **${name}**`;
    if (index) line += `: ${index}`;
    if (tags.length > 0) line += ` [${tags.join(", ")}]`;
    lines.push(line);
  }

  lines.push("");

  // Token savings estimate
  const tier0Tokens = capabilities.length * 5;
  const fullTokens = capabilities.length * 500; // rough estimate for full capability
  lines.push(
    `*Progressive loading: ~${tier0Tokens} tokens loaded vs ~${fullTokens} if all capabilities expanded. ` +
    `${Math.round((1 - tier0Tokens / fullTokens) * 100)}% context savings.*`,
  );

  return lines.join("\n");
}
