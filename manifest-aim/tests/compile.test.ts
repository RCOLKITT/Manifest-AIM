import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import yaml from "js-yaml";
import { compile } from "../src/compile/compiler.js";
import {
  resolveInheritanceChain,
  loadRawManifest,
  resolveManifestPath,
} from "../src/compile/resolver.js";
import { mergeManifests } from "../src/compile/merge.js";
import { enforce } from "../src/enforce/engine.js";
import type { RawManifest, RawRule, Conflict } from "../src/compile/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COMPILE_FIXTURES = join(__dirname, "fixtures", "compile");
const CLI = join(__dirname, "..", "dist", "cli", "index.js");

// ── Unit Tests: Resolver ──

describe("compile: resolver", () => {
  it("should load a raw manifest", () => {
    const manifest = loadRawManifest(join(COMPILE_FIXTURES, "base-standards.aim.yaml"));
    expect(manifest.aim).toBe("1.0");
    expect(manifest.metadata.name).toBe("base-standards");
    expect(manifest.governance?.rules?.length).toBeGreaterThan(0);
  });

  it("should resolve manifest path by direct file reference", () => {
    const result = resolveManifestPath("./base-standards.aim.yaml", COMPILE_FIXTURES);
    expect(result).toBeTruthy();
    expect(result).toContain("base-standards.aim.yaml");
  });

  it("should return null for non-existent manifest", () => {
    const result = resolveManifestPath("nonexistent", COMPILE_FIXTURES);
    expect(result).toBeNull();
  });

  it("should resolve inheritance chain", () => {
    const chain = resolveInheritanceChain(
      join(COMPILE_FIXTURES, "team-frontend.aim.yaml"),
    );

    expect(chain.length).toBe(2);
    expect(chain[0].manifest.metadata.name).toBe("base-standards");
    expect(chain[1].manifest.metadata.name).toBe("team-frontend");
  });

  it("should detect circular inheritance", () => {
    expect(() => {
      resolveInheritanceChain(join(COMPILE_FIXTURES, "circular-a.aim.yaml"));
    }).toThrow("Circular inheritance");
  });

  it("should throw on unresolvable inherit reference", () => {
    expect(() => {
      resolveInheritanceChain(join(COMPILE_FIXTURES, "nonexistent.aim.yaml"));
    }).toThrow();
  });
});

// ── Unit Tests: Merge ──

describe("compile: merge", () => {
  const makeManifest = (name: string, rules: RawRule[], qualityGates?: Record<string, unknown>): RawManifest => ({
    aim: "1.0",
    metadata: { name, version: "1.0.0", description: `${name} manifest` },
    governance: {
      rules,
      ...(qualityGates ? { quality_gates: qualityGates } : {}),
    },
  });

  it("should merge non-conflicting rules", () => {
    const base = makeManifest("base", [
      { name: "rule-a", action: "block", severity: "error" },
    ]);
    const child = makeManifest("child", [
      { name: "rule-b", action: "warn", severity: "warning" },
    ]);

    const conflicts: Conflict[] = [];
    const merged = mergeManifests(base, child, "most_restrictive", "base", "child", conflicts);

    expect(merged.governance?.rules?.length).toBe(2);
    expect(merged.governance?.rules?.find(r => r.name === "rule-a")).toBeTruthy();
    expect(merged.governance?.rules?.find(r => r.name === "rule-b")).toBeTruthy();
    expect(conflicts.length).toBe(0);
  });

  it("should resolve action conflicts with most_restrictive", () => {
    const base = makeManifest("base", [
      { name: "shared-rule", action: "warn", severity: "warning" },
    ]);
    const child = makeManifest("child", [
      { name: "shared-rule", action: "block", severity: "error" },
    ]);

    const conflicts: Conflict[] = [];
    const merged = mergeManifests(base, child, "most_restrictive", "base", "child", conflicts);

    const rule = merged.governance?.rules?.find(r => r.name === "shared-rule");
    expect(rule?.action).toBe("block");
    expect(rule?.severity).toBe("error");
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it("should resolve action conflicts with last_wins", () => {
    const base = makeManifest("base", [
      { name: "shared-rule", action: "block", severity: "critical" },
    ]);
    const child = makeManifest("child", [
      { name: "shared-rule", action: "warn", severity: "warning" },
    ]);

    const conflicts: Conflict[] = [];
    const merged = mergeManifests(base, child, "last_wins", "base", "child", conflicts);

    const rule = merged.governance?.rules?.find(r => r.name === "shared-rule");
    expect(rule?.action).toBe("warn"); // child wins even though less strict
    expect(rule?.severity).toBe("warning");
  });

  it("should resolve with priority_weighted", () => {
    const base = makeManifest("base", [
      { name: "shared-rule", action: "warn", severity: "warning", priority: 90 },
    ]);
    const child = makeManifest("child", [
      { name: "shared-rule", action: "block", severity: "error", priority: 50 },
    ]);

    const conflicts: Conflict[] = [];
    const merged = mergeManifests(base, child, "priority_weighted", "base", "child", conflicts);

    const rule = merged.governance?.rules?.find(r => r.name === "shared-rule");
    expect(rule?.action).toBe("warn"); // base has higher priority
  });

  it("should throw on strict_fail with conflicts", () => {
    const base = makeManifest("base", [
      { name: "shared-rule", action: "warn", severity: "warning" },
    ]);
    const child = makeManifest("child", [
      { name: "shared-rule", action: "block", severity: "error" },
    ]);

    const conflicts: Conflict[] = [];
    expect(() => {
      mergeManifests(base, child, "strict_fail", "base", "child", conflicts);
    }).toThrow("CONFLICT [strict_fail]");
  });

  it("should merge quality gates with most_restrictive", () => {
    const base = makeManifest("base", [], {
      code: { test_coverage_minimum: 70, max_complexity: 15, max_file_length: 500 },
    });
    const child = makeManifest("child", [], {
      code: { test_coverage_minimum: 80, max_complexity: 10, max_file_length: 300 },
    });

    const conflicts: Conflict[] = [];
    const merged = mergeManifests(base, child, "most_restrictive", "base", "child", conflicts);

    const gates = merged.governance?.quality_gates as Record<string, Record<string, unknown>>;
    expect(gates.code.test_coverage_minimum).toBe(80); // higher = stricter
    expect(gates.code.max_complexity).toBe(10); // lower = stricter
    expect(gates.code.max_file_length).toBe(300); // lower = stricter
  });

  it("should merge capabilities by name", () => {
    const base: RawManifest = {
      aim: "1.0",
      metadata: { name: "base", version: "1.0.0", description: "base" },
      capabilities: [
        { name: "deploy", index: "Deploy services" },
        { name: "review", index: "Code review" },
      ],
    };
    const child: RawManifest = {
      aim: "1.0",
      metadata: { name: "child", version: "1.0.0", description: "child" },
      capabilities: [
        { name: "review", index: "Enhanced code review with security focus" },
        { name: "test", index: "Run test suites" },
      ],
    };

    const conflicts: Conflict[] = [];
    const merged = mergeManifests(base, child, "last_wins", "base", "child", conflicts);

    expect(merged.capabilities?.length).toBe(3);
    const review = merged.capabilities?.find(c => c.name === "review");
    expect(review?.index).toBe("Enhanced code review with security focus");
  });

  it("should merge knowledge units", () => {
    const base: RawManifest = {
      aim: "1.0",
      metadata: { name: "base", version: "1.0.0", description: "base" },
      knowledge: [{ name: "standards", content: "base standards" }],
    };
    const child: RawManifest = {
      aim: "1.0",
      metadata: { name: "child", version: "1.0.0", description: "child" },
      knowledge: [{ name: "extra", content: "extra knowledge" }],
    };

    const conflicts: Conflict[] = [];
    const merged = mergeManifests(base, child, "most_restrictive", "base", "child", conflicts);

    expect(merged.knowledge?.length).toBe(2);
  });

  it("should use child's metadata identity", () => {
    const base: RawManifest = {
      aim: "1.0",
      metadata: { name: "base", version: "1.0.0", description: "base" },
    };
    const child: RawManifest = {
      aim: "1.0",
      metadata: { name: "child", version: "2.0.0", description: "child" },
    };

    const conflicts: Conflict[] = [];
    const merged = mergeManifests(base, child, "most_restrictive", "base", "child", conflicts);

    expect(merged.metadata.name).toBe("child");
    expect(merged.metadata.version).toBe("2.0.0");
  });

  it("should merge context with child overriding", () => {
    const base: RawManifest = {
      aim: "1.0",
      metadata: { name: "base", version: "1.0.0", description: "base" },
      context: { persona: "Base engineer", domain: "software-engineering", environment: "production" },
    };
    const child: RawManifest = {
      aim: "1.0",
      metadata: { name: "child", version: "1.0.0", description: "child" },
      context: { domain: "frontend-engineering" },
    };

    const conflicts: Conflict[] = [];
    const merged = mergeManifests(base, child, "most_restrictive", "base", "child", conflicts);

    expect((merged.context as Record<string, unknown>).persona).toBe("Base engineer"); // inherited
    expect((merged.context as Record<string, unknown>).domain).toBe("frontend-engineering"); // overridden
    expect((merged.context as Record<string, unknown>).environment).toBe("production"); // inherited
  });
});

// ── Integration Tests: Compiler ──

describe("compile: compiler", () => {
  it("should compile a manifest with inheritance", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "manifest-compile-"));
    const outputPath = join(tmpDir, "compiled.yaml");

    const result = compile({
      manifestPath: join(COMPILE_FIXTURES, "team-frontend.aim.yaml"),
      outputPath,
    });

    // Should have resolved 2 sources
    expect(result.sourcesResolved.length).toBe(2);

    // Should have conflicts (no-console action differs)
    expect(result.conflicts.length).toBeGreaterThan(0);

    // Compiled manifest should have all rules from both
    const rules = result.compiled.governance?.rules ?? [];
    const ruleNames = rules.map(r => r.name);
    expect(ruleNames).toContain("no-eval"); // from base
    expect(ruleNames).toContain("no-console"); // merged
    expect(ruleNames).toContain("no-inline-styles"); // from frontend
    expect(ruleNames).toContain("max-complexity"); // from base

    // no-console should be resolved to block (most_restrictive)
    const noConsole = rules.find(r => r.name === "no-console");
    expect(noConsole?.action).toBe("block");

    // Quality gates should be merged (most restrictive)
    const gates = result.compiled.governance?.quality_gates as Record<string, Record<string, unknown>>;
    expect(gates.code.test_coverage_minimum).toBe(80); // 80 > 70
    expect(gates.code.max_complexity).toBe(10); // 10 < 15
    expect(gates.code.max_file_length).toBe(300); // 300 < 500

    // Should have written output
    expect(existsSync(outputPath)).toBe(true);

    // Output should be valid YAML
    const outputContent = readFileSync(outputPath, "utf-8");
    const parsed = yaml.load(outputContent) as Record<string, unknown>;
    expect(parsed.aim).toBe("1.0");
  });

  it("should compile a manifest with dependencies", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "manifest-compile-"));

    const result = compile({
      manifestPath: join(COMPILE_FIXTURES, "with-dependency.aim.yaml"),
      outputPath: join(tmpDir, "compiled.yaml"),
    });

    // Should have the dependency's rules merged in
    const rules = result.compiled.governance?.rules ?? [];
    const ruleNames = rules.map(r => r.name);
    expect(ruleNames).toContain("no-any-type"); // from main manifest
    expect(ruleNames).toContain("no-eval"); // from security-baseline dependency
    expect(ruleNames).toContain("no-hardcoded-secrets"); // from security-baseline

    // Identity should be the main manifest's
    expect(result.compiled.metadata.name).toBe("with-dependency");
  });

  it("should fail on strict_fail with conflicts", () => {
    expect(() => {
      compile({
        manifestPath: join(COMPILE_FIXTURES, "strict-fail.aim.yaml"),
      });
    }).toThrow("CONFLICT [strict_fail]");
  });

  it("should fail on circular inheritance", () => {
    expect(() => {
      compile({
        manifestPath: join(COMPILE_FIXTURES, "circular-a.aim.yaml"),
      });
    }).toThrow("Circular inheritance");
  });

  it("should compile a standalone manifest (no inherits/deps)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "manifest-compile-"));

    const result = compile({
      manifestPath: join(COMPILE_FIXTURES, "base-standards.aim.yaml"),
      outputPath: join(tmpDir, "compiled.yaml"),
    });

    expect(result.sourcesResolved.length).toBe(1);
    expect(result.conflicts.length).toBe(0);
    expect(result.compiled.metadata.name).toBe("base-standards");
  });

  it("should create output directory if needed", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "manifest-compile-"));
    const outputPath = join(tmpDir, "nested", "deep", "compiled.yaml");

    compile({
      manifestPath: join(COMPILE_FIXTURES, "base-standards.aim.yaml"),
      outputPath,
    });

    expect(existsSync(outputPath)).toBe(true);
  });
});

// ── Integration: Compile then Enforce ──

describe("compile + enforce integration", () => {
  it("should enforce using a compiled manifest", async () => {
    // First compile team-frontend (which inherits base-standards)
    const tmpDir = mkdtempSync(join(tmpdir(), "manifest-compile-"));
    const compiledPath = join(tmpDir, "compiled.yaml");

    const compileResult = compile({
      manifestPath: join(COMPILE_FIXTURES, "team-frontend.aim.yaml"),
      outputPath: compiledPath,
    });

    // The compiled manifest should have both base + frontend rules
    const ruleNames = (compileResult.compiled.governance?.rules ?? []).map(r => r.name);
    expect(ruleNames).toContain("no-eval");
    expect(ruleNames).toContain("no-console");

    // Now enforce the compiled manifest against our violation fixture
    const ENFORCE_TARGET = join(__dirname, "fixtures", "enforce-target");

    const enforceResult = await enforce({
      manifestPath: compiledPath,
      targetPath: join(ENFORCE_TARGET, "violations.ts"),
    });

    // Should catch eval violations (from base, through compiled)
    const evalViolations = enforceResult.results
      .flatMap(r => r.violations)
      .filter(v => v.rule === "no-eval");
    expect(evalViolations.length).toBeGreaterThan(0);

    // Should catch console violations with BLOCK action (escalated from warn in base to block in frontend)
    const consoleViolations = enforceResult.results
      .flatMap(r => r.violations)
      .filter(v => v.rule === "no-console");
    expect(consoleViolations.length).toBeGreaterThan(0);
    expect(consoleViolations[0].action).toBe("block"); // Was warn in base, escalated
  });
});

// ── CLI Integration Tests ──

describe("CLI: manifest compile", () => {
  function run(args: string): { stdout: string; exitCode: number } {
    try {
      const stdout = execSync(`node ${CLI} ${args}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { stdout, exitCode: 0 };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; status?: number };
      // Combine stdout and stderr so we can match against error messages
      const output = [error.stdout ?? "", error.stderr ?? ""].join("\n");
      return { stdout: output, exitCode: error.status || 1 };
    }
  }

  it("should compile with inheritance and show conflicts", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "manifest-compile-"));
    const { exitCode, stdout } = run(
      `compile ${join(COMPILE_FIXTURES, "team-frontend.aim.yaml")} -o ${join(tmpDir, "out.yaml")}`,
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("team-frontend@1.0.0");
    expect(stdout).toContain("conflicts resolved");
    expect(stdout).toContain("Sources resolved");
  });

  it("should compile standalone manifest", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "manifest-compile-"));
    const { exitCode, stdout } = run(
      `compile ${join(COMPILE_FIXTURES, "base-standards.aim.yaml")} -o ${join(tmpDir, "out.yaml")}`,
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("base-standards@1.0.0");
  });

  it("should fail on strict_fail conflicts", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "manifest-compile-"));
    const { exitCode, stdout } = run(
      `compile ${join(COMPILE_FIXTURES, "strict-fail.aim.yaml")} -o ${join(tmpDir, "out.yaml")}`,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toContain("CONFLICT");
  });

  it("should fail on circular inheritance", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "manifest-compile-"));
    const { exitCode, stdout } = run(
      `compile ${join(COMPILE_FIXTURES, "circular-a.aim.yaml")} -o ${join(tmpDir, "out.yaml")}`,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toContain("Circular inheritance");
  });

  it("should fail on missing manifest", () => {
    const { exitCode, stdout } = run("compile nonexistent.yaml");
    expect(exitCode).toBe(1);
    expect(stdout).toContain("Manifest not found");
  });
});
