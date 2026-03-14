/**
 * Types for the AIM wrap engine — context injection for agent platforms.
 */

export type AgentPlatform = "claude-code" | "cursor" | "windsurf" | "generic";

export interface WrapOptions {
  /** Path to aim.yaml manifest. */
  manifestPath: string;
  /** Target agent platform. */
  platform: AgentPlatform;
  /** Output directory for generated files. Defaults to ".aim/". */
  outputDir?: string;
  /** Environment override (e.g., "production"). */
  environment?: string;
  /** If true, output to stdout instead of writing files. */
  dryRun?: boolean;
}

export interface WrapResult {
  /** The generated context text. */
  context: string;
  /** Path to the output file (null if dry-run). */
  outputPath: string | null;
  /** Sections included in the generated context. */
  sections: WrapSection[];
  /** Manifest metadata. */
  manifest: { name: string; version: string };
}

export interface WrapSection {
  name: string;
  lineCount: number;
}

/** Parsed manifest data ready for context generation. */
export interface ManifestContext {
  metadata: { name: string; version: string; description: string };
  persona?: string;
  domain?: string;
  environment?: string;
  injectedRules: InjectedRule[];
  knowledgeUnits: KnowledgeUnit[];
  qualityGates: Record<string, unknown>;
  capabilities: CapabilityIndex[];
  governanceRules: GovernanceRuleSummary[];
}

export interface InjectedRule {
  name: string;
  instruction: string;
  severity: string;
}

export interface KnowledgeUnit {
  name: string;
  trigger: string;
  content: string;
  priority: number;
}

export interface CapabilityIndex {
  name: string;
  description?: string;
  tags?: string[];
}

export interface GovernanceRuleSummary {
  name: string;
  action: string;
  severity: string;
  enforcement: string;
  message?: string;
}
