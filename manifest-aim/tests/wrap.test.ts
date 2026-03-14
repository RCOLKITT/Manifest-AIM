import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  extractManifestContext,
  generateContextText,
} from "../src/wrap/context-generator.js";
import { wrap } from "../src/wrap/wrap.js";
import { getPlatformConfig, getSupportedPlatforms } from "../src/wrap/platforms.js";
import type { AgentPlatform } from "../src/wrap/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES = join(__dirname, "fixtures");
const ENTERPRISE_MANIFEST = join(
  __dirname,
  "..",
  "manifests",
  "reference",
  "enterprise-typescript.aim.yaml",
);
const ENFORCE_MANIFEST = join(FIXTURES, "enforce-manifest.aim.yaml");
const SEMANTIC_MANIFEST = join(FIXTURES, "enforce-semantic-manifest.aim.yaml");
const CLI = join(__dirname, "..", "dist", "cli", "index.js");
const TEMP_DIR = join(__dirname, "..", ".test-wrap-output");

// ── Unit Tests: Context Extraction ──

describe("wrap: context extraction", () => {
  it("should extract metadata from manifest", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    expect(ctx.metadata.name).toBe("enterprise-typescript");
    expect(ctx.metadata.version).toBe("1.0.0");
    expect(ctx.metadata.description).toContain("Enterprise-grade");
  });

  it("should extract persona and context", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    expect(ctx.persona).toContain("Senior TypeScript engineer");
    expect(ctx.domain).toBe("software-engineering");
    expect(ctx.environment).toBe("production");
  });

  it("should allow environment override", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST, "staging");
    expect(ctx.environment).toBe("staging");
  });

  it("should extract injected rules", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    const injectedNames = ctx.injectedRules.map((r) => r.name);
    expect(injectedNames).toContain("prefer-composition");
    expect(injectedNames).toContain("meaningful-names");
    expect(injectedNames).toContain("structured-error-handling");
    // Static/semantic rules should NOT be in injected list
    expect(injectedNames).not.toContain("no-eval");
    expect(injectedNames).not.toContain("clean-architecture");
  });

  it("should include instructions for injected rules", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    const compRule = ctx.injectedRules.find((r) => r.name === "prefer-composition");
    expect(compRule).toBeDefined();
    expect(compRule!.instruction).toContain("composition over inheritance");
  });

  it("should extract knowledge units sorted by priority", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    expect(ctx.knowledgeUnits.length).toBe(3);
    // Highest priority first
    expect(ctx.knowledgeUnits[0].name).toBe("security-checklist");
    expect(ctx.knowledgeUnits[0].priority).toBe(100);
    expect(ctx.knowledgeUnits[1].name).toBe("project-structure");
    expect(ctx.knowledgeUnits[2].name).toBe("testing-standards");
  });

  it("should extract knowledge triggers and content", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    const security = ctx.knowledgeUnits.find((k) => k.name === "security-checklist");
    expect(security!.trigger).toContain("API endpoints");
    expect(security!.content).toContain("Input Validation");
  });

  it("should extract governance rule summaries", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    expect(ctx.governanceRules.length).toBe(12);

    const noEval = ctx.governanceRules.find((r) => r.name === "no-eval");
    expect(noEval!.action).toBe("block");
    expect(noEval!.severity).toBe("critical");
    expect(noEval!.enforcement).toBe("static");

    const cleanArch = ctx.governanceRules.find((r) => r.name === "clean-architecture");
    expect(cleanArch!.enforcement).toBe("semantic");
  });

  it("should extract quality gates", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    const codeGates = ctx.qualityGates.code as Record<string, unknown>;
    expect(codeGates.test_coverage_minimum).toBe(80);
    expect(codeGates.max_complexity).toBe(10);
    expect(codeGates.require_types).toBe("strict");
  });

  it("should handle manifest without optional sections", () => {
    const ctx = extractManifestContext(ENFORCE_MANIFEST);
    // This manifest has rules but minimal other sections
    expect(ctx.governanceRules.length).toBeGreaterThan(0);
    expect(ctx.metadata.name).toBe("enforce-test");
  });

  it("should throw on missing manifest", () => {
    expect(() => extractManifestContext("/nonexistent/path.yaml")).toThrow(
      "Manifest not found",
    );
  });
});

// ── Unit Tests: Context Generation ──

describe("wrap: context generation", () => {
  it("should produce markdown with all sections", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    const { text, sections } = generateContextText(ctx);

    expect(text).toContain("# AIM Governance: enterprise-typescript");
    expect(text).toContain("## Context");
    expect(text).toContain("## Active Governance Rules");
    expect(text).toContain("## Instructions");
    expect(text).toContain("## Quality Gates");
    expect(text).toContain("## Knowledge");
    expect(sections.length).toBeGreaterThan(0);
  });

  it("should group rules by enforcement type", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    const { text } = generateContextText(ctx);

    expect(text).toContain("### Static (enforced post-output");
    expect(text).toContain("### Semantic (LLM-as-judge");
    expect(text).toContain("### Guidelines");
  });

  it("should include BLOCKS badge for blocking rules", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    const { text } = generateContextText(ctx);

    expect(text).toContain("[BLOCKS]");
  });

  it("should include injected rule instructions", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    const { text } = generateContextText(ctx);

    expect(text).toContain("### prefer-composition");
    expect(text).toContain("composition over inheritance");
  });

  it("should include knowledge with triggers", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    const { text } = generateContextText(ctx);

    expect(text).toContain("### security-checklist");
    expect(text).toContain("**When:** creating API endpoints");
  });

  it("should include quality gate details", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    const { text } = generateContextText(ctx);

    expect(text).toContain("**test coverage minimum**: 80");
    expect(text).toContain("**max complexity**: 10");
  });

  it("should track sections with line counts", () => {
    const ctx = extractManifestContext(ENTERPRISE_MANIFEST);
    const { sections } = generateContextText(ctx);

    const sectionNames = sections.map((s) => s.name);
    expect(sectionNames).toContain("header");
    expect(sectionNames).toContain("context");
    expect(sectionNames).toContain("governance-awareness");
    expect(sectionNames).toContain("injected-instructions");
    expect(sectionNames).toContain("knowledge");
    expect(sectionNames).toContain("footer");

    for (const section of sections) {
      expect(section.lineCount).toBeGreaterThan(0);
    }
  });
});

// ── Unit Tests: Platforms ──

describe("wrap: platforms", () => {
  it("should list supported platforms", () => {
    const platforms = getSupportedPlatforms();
    expect(platforms).toContain("claude-code");
    expect(platforms).toContain("cursor");
    expect(platforms).toContain("windsurf");
    expect(platforms).toContain("generic");
  });

  it("should provide config for each platform", () => {
    const claudeConfig = getPlatformConfig("claude-code");
    expect(claudeConfig.fileName).toBe("CLAUDE.md");
    expect(claudeConfig.description).toContain("Claude Code");

    const cursorConfig = getPlatformConfig("cursor");
    expect(cursorConfig.fileName).toBe(".cursorrules");

    const windsurfConfig = getPlatformConfig("windsurf");
    expect(windsurfConfig.fileName).toBe(".windsurfrules");
  });
});

// ── Integration Tests: wrap() ──

describe("wrap: integration", () => {
  beforeEach(() => {
    if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true });
    mkdirSync(TEMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true });
  });

  it("should generate CLAUDE.md for claude-code", () => {
    const result = wrap({
      manifestPath: ENTERPRISE_MANIFEST,
      platform: "claude-code",
      outputDir: TEMP_DIR,
    });

    expect(result.outputPath).toBe(join(TEMP_DIR, "CLAUDE.md"));
    expect(existsSync(result.outputPath!)).toBe(true);
    expect(result.manifest.name).toBe("enterprise-typescript");
    expect(result.sections.length).toBeGreaterThan(0);

    const content = readFileSync(result.outputPath!, "utf-8");
    expect(content).toContain("# AIM Governance");
    expect(content).toContain("## Instructions");
  });

  it("should generate .cursorrules for cursor", () => {
    const result = wrap({
      manifestPath: ENTERPRISE_MANIFEST,
      platform: "cursor",
      outputDir: TEMP_DIR,
    });

    expect(result.outputPath).toBe(join(TEMP_DIR, ".cursorrules"));
    expect(existsSync(result.outputPath!)).toBe(true);
  });

  it("should generate .windsurfrules for windsurf", () => {
    const result = wrap({
      manifestPath: ENTERPRISE_MANIFEST,
      platform: "windsurf",
      outputDir: TEMP_DIR,
    });

    expect(result.outputPath).toBe(join(TEMP_DIR, ".windsurfrules"));
    expect(existsSync(result.outputPath!)).toBe(true);
  });

  it("should support dry-run mode (no file written)", () => {
    const result = wrap({
      manifestPath: ENTERPRISE_MANIFEST,
      platform: "claude-code",
      dryRun: true,
    });

    expect(result.outputPath).toBeNull();
    expect(result.context).toContain("# AIM Governance");
    expect(result.context.length).toBeGreaterThan(100);
  });

  it("should include all governance types in output", () => {
    const result = wrap({
      manifestPath: ENTERPRISE_MANIFEST,
      platform: "generic",
      dryRun: true,
    });

    // Static rules present
    expect(result.context).toContain("no-eval");
    expect(result.context).toContain("[BLOCKS]");

    // Semantic rules present
    expect(result.context).toContain("clean-architecture");
    expect(result.context).toContain("LLM-as-judge");

    // Injected instructions present
    expect(result.context).toContain("prefer-composition");
    expect(result.context).toContain("composition over inheritance");

    // Knowledge present
    expect(result.context).toContain("Security Checklist");

    // Quality gates present
    expect(result.context).toContain("test coverage minimum");
  });

  it("should work with a minimal enforcement-only manifest", () => {
    const result = wrap({
      manifestPath: ENFORCE_MANIFEST,
      platform: "generic",
      dryRun: true,
    });

    expect(result.context).toContain("# AIM Governance");
    expect(result.manifest.name).toBe("enforce-test");
  });

  it("should work with semantic enforcement manifest", () => {
    const result = wrap({
      manifestPath: SEMANTIC_MANIFEST,
      platform: "claude-code",
      dryRun: true,
    });

    expect(result.context).toContain("clean-architecture");
    expect(result.context).toContain("Semantic");
  });
});

// ── CLI Integration Tests ──

describe("CLI: manifest wrap", () => {
  function run(args: string): { stdout: string; exitCode: number } {
    try {
      const stdout = execSync(`node ${CLI} ${args}`, {
        encoding: "utf-8",
        timeout: 15000,
      });
      return { stdout, exitCode: 0 };
    } catch (error) {
      const err = error as { status: number; stdout?: string; stderr?: string };
      return {
        stdout: [err.stdout ?? "", err.stderr ?? ""].join("\n"),
        exitCode: err.status ?? 1,
      };
    }
  }

  it("should show dry-run output for claude-code", () => {
    const { stdout, exitCode } = run(
      `wrap claude-code -m ${ENTERPRISE_MANIFEST} --dry-run`,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("# AIM Governance: enterprise-typescript");
    expect(stdout).toContain("dry run");
  });

  it("should reject unknown platforms", () => {
    const { exitCode, stdout } = run(
      `wrap unknown-agent -m ${ENTERPRISE_MANIFEST}`,
    );
    expect(exitCode).toBe(1);
    expect(stdout).toContain("Unknown platform");
    expect(stdout).toContain("Supported");
  });

  it("should error on missing manifest", () => {
    const { exitCode, stdout } = run("wrap claude-code -m /nonexistent.yaml");
    expect(exitCode).toBe(1);
    expect(stdout).toContain("not found");
  });

  it("should show section summary in output", () => {
    const { stdout, exitCode } = run(
      `wrap cursor -m ${ENTERPRISE_MANIFEST} --dry-run`,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Sections:");
    expect(stdout).toContain("header");
    expect(stdout).toContain("governance-awareness");
  });

  it("should generate file to specified output directory", () => {
    const tempDir = join(TEMP_DIR, "cli-test");
    mkdirSync(tempDir, { recursive: true });

    const { stdout, exitCode } = run(
      `wrap claude-code -m ${ENTERPRISE_MANIFEST} -o ${tempDir}`,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Generated");
    expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);

    rmSync(tempDir, { recursive: true });
  });

  beforeEach(() => {
    if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true });
  });
});
