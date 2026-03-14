/**
 * AIM (Agent Instruction Manifest) Generator
 *
 * Converts project analysis into an aim.yaml manifest file.
 * Generates governance rules, quality gates, and knowledge units
 * based on the detected tech stack and configuration.
 *
 * Adapted from Rebar MCP for use in Manifest CLI.
 */
import type { ProjectAnalysis } from "./project-analyzer.js";

export interface AIMGeneratorOptions {
  /** Strictness profile affects which rules are generated */
  strictness: "standard" | "strict" | "paranoid";
  /** Compliance standards to include */
  compliance: string[];
  /** Include knowledge units */
  includeKnowledge: boolean;
}

/**
 * Generates an AIM manifest from project analysis.
 */
export function generateAIM(
  analysis: ProjectAnalysis,
  options: AIMGeneratorOptions
): string {
  const lines: string[] = [];

  // Header
  lines.push('aim: "1.0"');
  lines.push("");

  // Metadata
  lines.push("metadata:");
  lines.push(`  name: ${analysis.name}`);
  lines.push("  version: 0.1.0");
  if (analysis.description) {
    lines.push(`  description: "${escapeYaml(analysis.description)}"`);
  } else {
    lines.push(`  description: "AIM governance manifest for ${analysis.name}"`);
  }
  lines.push(`  tags: [${analysis.stacks.map((s) => s).join(", ")}]`);
  lines.push("");

  // Context
  lines.push("context:");
  lines.push(`  persona: "Senior ${getPersonaLanguage(analysis.language)} engineer following production best practices"`);
  lines.push("  domain: software-engineering");
  lines.push(`  environment: production`);
  if (options.compliance.length > 0) {
    lines.push(`  compliance: [${options.compliance.join(", ")}]`);
  }
  lines.push("");

  // Governance
  lines.push("governance:");
  lines.push("  rules:");
  lines.push("");

  // Security rules (always included)
  lines.push("    # ── Security ──");
  lines.push("");
  lines.push(...indent(generateSecurityRules(analysis), 4));
  lines.push("");

  // Quality rules (based on strictness)
  lines.push("    # ── Code Quality ──");
  lines.push("");
  lines.push(...indent(generateQualityRules(analysis, options.strictness), 4));
  lines.push("");

  // Language-specific rules
  if (analysis.usesTypeScript || analysis.language === "typescript") {
    lines.push("    # ── TypeScript ──");
    lines.push("");
    lines.push(...indent(generateTypeScriptRules(options.strictness), 4));
    lines.push("");
  }

  if (analysis.language === "python") {
    lines.push("    # ── Python ──");
    lines.push("");
    lines.push(...indent(generatePythonRules(), 4));
    lines.push("");
  }

  // Compliance rules
  if (options.compliance.length > 0) {
    lines.push("    # ── Compliance ──");
    lines.push("");
    for (const standard of options.compliance) {
      lines.push(...indent(generateComplianceRules(standard), 4));
    }
    lines.push("");
  }

  // Injected guidelines (platform standards)
  lines.push("    # ── Guidelines (Injected) ──");
  lines.push("");
  lines.push(...indent(generatePlatformGuidelines(analysis), 4));
  lines.push("");

  // Quality gates
  lines.push("  quality_gates:");
  lines.push("    code:");
  lines.push(`      require_types: ${analysis.usesTypeScript ? "strict" : "false"}`);
  lines.push("      max_complexity: 15");
  lines.push("      max_file_length: 400");
  lines.push("      require_error_handling: true");
  if (options.strictness === "paranoid") {
    lines.push("      test_coverage_minimum: 80");
  }
  lines.push("");

  // Knowledge units
  if (options.includeKnowledge) {
    lines.push("knowledge:");
    lines.push(...indent(generateKnowledgeUnits(analysis), 2));
    lines.push("");
  }

  return lines.join("\n");
}

function getPersonaLanguage(lang: string): string {
  const map: Record<string, string> = {
    typescript: "TypeScript",
    javascript: "JavaScript",
    python: "Python",
    go: "Go",
    rust: "Rust",
    java: "Java",
    csharp: "C#",
    ruby: "Ruby",
    php: "PHP",
  };
  return map[lang] || "software";
}

function generateSecurityRules(analysis: ProjectAnalysis): string[] {
  const rules: string[] = [];

  // No eval
  rules.push("- name: no-eval");
  rules.push('  description: "Prevent eval() and similar dynamic execution"');
  rules.push("  category: security");
  rules.push("  enforcement: static");
  rules.push("  detect:");
  rules.push("    type: pattern");
  rules.push('    match: "\\\\beval\\\\s*\\\\("');
  if (analysis.usesTypeScript || analysis.language === "javascript") {
    rules.push("    file_types: [ts, js, tsx, jsx]");
  } else if (analysis.language === "python") {
    rules.push("    file_types: [py]");
  }
  rules.push("  action: block");
  rules.push("  severity: critical");
  rules.push('  message: "eval() is forbidden. Use safe alternatives."');
  rules.push('  fix_hint: "Use JSON.parse() for data, or restructure to avoid dynamic execution"');
  rules.push("");

  // No hardcoded secrets
  rules.push("- name: no-hardcoded-secrets");
  rules.push('  description: "Prevent hardcoded API keys and secrets"');
  rules.push("  category: security");
  rules.push("  enforcement: static");
  rules.push("  detect:");
  rules.push("    type: pattern");
  rules.push("    match: \"(api_key|secret|password|token|private_key)\\\\s*[=:]\\\\s*['\\\"][^'\\\"]{8,}['\\\"]\"");
  rules.push("  action: block");
  rules.push("  severity: critical");
  rules.push('  message: "Hardcoded secrets detected."');
  rules.push('  fix_hint: "Use environment variables or a secrets manager"');

  return rules;
}

function generateQualityRules(analysis: ProjectAnalysis, strictness: string): string[] {
  const rules: string[] = [];
  const action = strictness === "standard" ? "warn" : "block";

  // No console.log in production
  rules.push("- name: no-console-in-src");
  rules.push('  description: "Prevent console.log in production code"');
  rules.push("  category: quality");
  rules.push("  enforcement: static");
  if (analysis.sourceDirs.length > 0) {
    rules.push('  exclude_paths: ["**/tests/**", "**/__tests__/**", "**/test/**"]');
  }
  rules.push("  detect:");
  rules.push("    type: pattern");
  rules.push('    match: "console\\\\.log\\\\("');
  rules.push(`  action: ${action}`);
  rules.push("  severity: warning");
  rules.push('  message: "console.log detected in production code."');
  rules.push("");

  // No empty catch blocks
  rules.push("- name: no-empty-catch");
  rules.push('  description: "Prevent swallowing errors silently"');
  rules.push("  category: quality");
  rules.push("  enforcement: static");
  rules.push("  detect:");
  rules.push("    type: pattern");
  rules.push('    match: "catch\\\\s*\\\\([^)]*\\\\)\\\\s*\\\\{\\\\s*\\\\}"');
  rules.push(`  action: ${action}`);
  rules.push("  severity: warning");
  rules.push('  message: "Empty catch block swallows errors."');
  rules.push('  fix_hint: "Log the error or add a comment explaining why it\'s intentional"');

  if (strictness === "paranoid") {
    rules.push("");
    rules.push("- name: no-todo-in-production");
    rules.push('  description: "Track unfinished work"');
    rules.push("  category: quality");
    rules.push("  enforcement: static");
    rules.push("  detect:");
    rules.push("    type: pattern");
    rules.push('    match: "\\\\bTODO\\\\b|\\\\bFIXME\\\\b|\\\\bHACK\\\\b"');
    rules.push("  action: warn");
    rules.push("  severity: warning");
    rules.push('  message: "Unresolved TODO/FIXME found."');
  }

  return rules;
}

function generateTypeScriptRules(strictness: string): string[] {
  const rules: string[] = [];
  const action = strictness === "paranoid" ? "block" : "warn";

  rules.push("- name: no-any-type");
  rules.push('  description: "Minimize use of \'any\' type"');
  rules.push("  category: quality");
  rules.push("  enforcement: static");
  rules.push("  detect:");
  rules.push("    type: pattern");
  rules.push('    match: ":\\\\s*any\\\\b"');
  rules.push("    file_types: [ts, tsx]");
  rules.push(`  action: ${action}`);
  rules.push("  severity: warning");
  rules.push('  message: "Avoid \'any\' type — use specific types or \'unknown\'."');
  rules.push('  fix_hint: "Replace with a proper type, Record<string, unknown>, or unknown"');
  rules.push("");

  rules.push("- name: no-ts-ignore");
  rules.push('  description: "Prevent @ts-ignore without explanation"');
  rules.push("  category: quality");
  rules.push("  enforcement: static");
  rules.push("  detect:");
  rules.push("    type: pattern");
  rules.push('    match: "@ts-ignore"');
  rules.push("    file_types: [ts, tsx]");
  rules.push("  action: warn");
  rules.push("  severity: warning");
  rules.push('  message: "Use @ts-expect-error with explanation instead."');

  return rules;
}

function generatePythonRules(): string[] {
  const rules: string[] = [];

  rules.push("- name: no-bare-except");
  rules.push('  description: "Prevent bare except clauses"');
  rules.push("  category: quality");
  rules.push("  enforcement: static");
  rules.push("  detect:");
  rules.push("    type: pattern");
  rules.push('    match: "except:\\\\s*$"');
  rules.push("    file_types: [py]");
  rules.push("  action: warn");
  rules.push("  severity: warning");
  rules.push('  message: "Use specific exception types instead of bare except."');

  return rules;
}

function generateComplianceRules(standard: string): string[] {
  const rules: string[] = [];

  switch (standard.toLowerCase()) {
    case "hipaa":
      rules.push("- name: hipaa-phi-logging");
      rules.push('  description: "Prevent PHI in logs"');
      rules.push("  category: compliance");
      rules.push("  enforcement: semantic");
      rules.push("  detect:");
      rules.push("    type: semantic");
      rules.push("    criteria: |");
      rules.push("      Check if this code logs or exposes Protected Health Information (PHI):");
      rules.push("      - Patient names, addresses, dates, SSN");
      rules.push("      - Medical record numbers");
      rules.push("      - Health conditions or treatments");
      rules.push("    model: fast");
      rules.push("    threshold: 0.8");
      rules.push("  action: block");
      rules.push("  severity: critical");
      rules.push('  message: "Potential PHI exposure detected."');
      break;

    case "soc2":
      rules.push("- name: soc2-audit-logging");
      rules.push('  description: "Require audit logging for sensitive operations"');
      rules.push("  category: compliance");
      rules.push("  enforcement: injected");
      rules.push("  instruction: |");
      rules.push("    All authentication, authorization, and data access operations must include");
      rules.push("    structured audit logging with: timestamp, user_id, action, resource, result.");
      rules.push("  action: log");
      rules.push("  severity: warning");
      break;

    case "pci-dss":
      rules.push("- name: pci-no-card-numbers");
      rules.push('  description: "Block card number patterns in code"');
      rules.push("  category: compliance");
      rules.push("  enforcement: static");
      rules.push("  detect:");
      rules.push("    type: pattern");
      rules.push('    match: "\\\\b[0-9]{13,16}\\\\b"');
      rules.push("  action: block");
      rules.push("  severity: critical");
      rules.push('  message: "Potential card number detected in code."');
      break;

    case "gdpr":
      rules.push("- name: gdpr-pii-handling");
      rules.push('  description: "Ensure PII is handled correctly"');
      rules.push("  category: compliance");
      rules.push("  enforcement: injected");
      rules.push("  instruction: |");
      rules.push("    When handling personal data (names, emails, addresses, IP addresses):");
      rules.push("    - Implement data minimization");
      rules.push("    - Add consent tracking");
      rules.push("    - Support right to deletion");
      rules.push("    - Log all data processing activities");
      rules.push("  action: log");
      rules.push("  severity: info");
      break;
  }

  return rules;
}

function generatePlatformGuidelines(analysis: ProjectAnalysis): string[] {
  const lines: string[] = [];

  lines.push("- name: platform-standards");
  lines.push("  enforcement: injected");
  lines.push("  action: log");
  lines.push("  instruction: |");
  lines.push(`    ${analysis.name} Development Standards:`);

  // Language-specific
  if (analysis.usesTypeScript) {
    lines.push("    - All code must be TypeScript with strict mode");
    lines.push("    - No 'any' types without explicit justification");
  }

  // Testing
  if (analysis.testFramework) {
    lines.push(`    - Write tests using ${analysis.testFramework}`);
    lines.push("    - Test both success and failure paths");
  }

  // Framework-specific
  if (analysis.stacks.includes("nextjs")) {
    lines.push("    - Use App Router conventions (app/ directory)");
    lines.push("    - Server components by default, 'use client' only when needed");
  }
  if (analysis.stacks.includes("react")) {
    lines.push("    - Prefer functional components with hooks");
    lines.push("    - Use proper dependency arrays in useEffect");
  }

  // Database
  if (analysis.database) {
    lines.push(`    - Use ${analysis.database} for database operations`);
    lines.push("    - Never use raw SQL queries — use the ORM's query builder");
  }

  // General
  lines.push("    - Keep functions under 50 lines, files under 400 lines");
  lines.push("    - Error messages must be actionable");
  lines.push("  severity: info");

  return lines;
}

function generateKnowledgeUnits(analysis: ProjectAnalysis): string[] {
  const lines: string[] = [];

  // Architecture knowledge
  lines.push("- name: architecture");
  lines.push('  trigger: "creating new modules, services, or components"');
  lines.push("  priority: 100");
  lines.push("  content: |");
  lines.push(`    ## ${analysis.name} Architecture`);
  lines.push("");
  if (analysis.sourceDirs.length > 0) {
    lines.push("    Directory structure:");
    for (const dir of analysis.sourceDirs) {
      lines.push(`    - ${dir}/`);
    }
  }
  if (analysis.stacks.length > 0) {
    lines.push("");
    lines.push(`    Tech stack: ${analysis.stacks.join(", ")}`);
  }
  if (analysis.database) {
    lines.push(`    Database: ${analysis.database}`);
  }
  if (analysis.apiStyle) {
    lines.push(`    API style: ${analysis.apiStyle}`);
  }
  lines.push("");

  // Build/test knowledge
  if (Object.keys(analysis.buildCommands).length > 0 || Object.keys(analysis.testCommands).length > 0) {
    lines.push("- name: build-and-test");
    lines.push('  trigger: "building, testing, or running the project"');
    lines.push("  priority: 90");
    lines.push("  content: |");
    lines.push("    ## Build & Test Commands");
    lines.push("");
    for (const [cmd, value] of Object.entries(analysis.buildCommands)) {
      lines.push(`    ${cmd}: ${value}`);
    }
    for (const [cmd, value] of Object.entries(analysis.testCommands)) {
      lines.push(`    ${cmd}: ${value}`);
    }
  }

  return lines;
}

function indent(lines: string[], spaces: number): string[] {
  const prefix = " ".repeat(spaces);
  return lines.map((line) => (line.trim() ? prefix + line : ""));
}

function escapeYaml(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
