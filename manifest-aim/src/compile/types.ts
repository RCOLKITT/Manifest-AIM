/**
 * Types for the AIM manifest compiler.
 */

export interface RawManifest {
  aim: string;
  metadata: {
    name: string;
    version: string;
    description: string;
    authors?: string[];
    tags?: string[];
    license?: string;
    [key: string]: unknown;
  };
  context?: Record<string, unknown>;
  capabilities?: RawCapability[];
  knowledge?: RawKnowledgeUnit[];
  governance?: RawGovernance;
  dependencies?: RawDependency[];
  inherits?: string[];
  composition?: { strategy?: CompositionStrategy };
  overrides?: Record<string, unknown>;
  lifecycle?: Record<string, unknown>;
  runtime?: Record<string, unknown>;
}

export interface RawCapability {
  name: string;
  [key: string]: unknown;
}

export interface RawKnowledgeUnit {
  name: string;
  [key: string]: unknown;
}

export interface RawGovernance {
  rules?: RawRule[];
  transforms?: Record<string, unknown>[];
  guardrails?: Record<string, unknown>;
  quality_gates?: Record<string, unknown>;
  audit?: Record<string, unknown>;
  retry_policy?: Record<string, unknown>;
}

export interface RawRule {
  name: string;
  action: string;
  severity: string;
  priority?: number;
  [key: string]: unknown;
}

export interface RawDependency {
  aim: string;
  version?: string;
  registry?: string;
  override?: Record<string, unknown>;
}

export type CompositionStrategy =
  | "most_restrictive"
  | "last_wins"
  | "priority_weighted"
  | "strict_fail";

export interface Conflict {
  field: string;
  sources: Array<{ manifest: string; value: unknown }>;
  resolution: string;
  resolvedValue: unknown;
}

export interface CompileResult {
  compiled: RawManifest;
  conflicts: Conflict[];
  warnings: string[];
  errors: string[];
  sourcesResolved: string[];
}
