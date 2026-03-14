/**
 * Types for the AIM enforcement engine.
 */

export interface GovernanceRule {
  name: string;
  description?: string;
  category?: string;
  enforcement?: string | { primary: string; fallback?: string };
  detect?: DetectConfig;
  instruction?: string;
  when?: string;
  unless?: string;
  /** Glob patterns — only enforce this rule on matching paths. */
  paths?: string[];
  /** Glob patterns — skip this rule for matching paths. */
  exclude_paths?: string[];
  action: "block" | "warn" | "require_approval" | "escalate" | "transform" | "log" | "retry";
  severity: "info" | "warning" | "error" | "critical";
  message?: string;
  fix_hint?: string;
}

export type DetectConfig = PatternDetect | ToolDetect | SemanticDetect | CompositeDetect;

export interface PatternDetect {
  type: "pattern";
  match: string;
  file_types?: string[];
  scope?: "output" | "input" | "both";
}

export interface ToolDetect {
  type: "tool";
  command: string;
  match_condition?: string;
  exit_code_fail?: "non-zero" | "zero";
  timeout?: string;
  install?: string;
}

export interface SemanticDetect {
  type: "semantic";
  criteria: string;
  model?: "fast" | "standard" | "thorough";
  threshold?: number;
  examples?: Array<{ input: string; verdict: string; reason?: string }>;
}

export interface CompositeDetect {
  type: "composite";
  strategy?: "all_must_pass" | "any_must_pass" | "weighted";
  checks: DetectConfig[];
  threshold?: number;
}

export interface EnforceContext {
  environment?: string;
  variables?: Record<string, unknown>;
}

export interface Violation {
  rule: string;
  file: string;
  line?: number;
  column?: number;
  message: string;
  severity: "info" | "warning" | "error" | "critical";
  action: string;
  fix_hint?: string;
  match?: string;
}

export interface EnforceResult {
  file: string;
  violations: Violation[];
  rulesChecked: number;
  duration: number;
}

export interface EnforceSummary {
  files: number;
  filesWithViolations: number;
  totalViolations: number;
  byAction: Record<string, number>;
  bySeverity: Record<string, number>;
  results: EnforceResult[];
  blocked: boolean;
  duration: number;
  /** Rules that were skipped (e.g., no API key for semantic, tool not found). */
  skippedRules: Record<string, string>;
}
