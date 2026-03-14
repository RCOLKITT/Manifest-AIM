import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  loadManifestForEnforcement,
  getEnforceableRules,
  evaluateCondition,
} from "../src/enforce/loader.js";
import { runPatternDetection } from "../src/enforce/pattern.js";
import { enforce } from "../src/enforce/engine.js";
import type { GovernanceRule, PatternDetect, EnforceContext } from "../src/enforce/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES = join(__dirname, "fixtures");
const ENFORCE_MANIFEST = join(FIXTURES, "enforce-manifest.aim.yaml");
const ENFORCE_TARGET = join(FIXTURES, "enforce-target");
const CLI = join(__dirname, "..", "dist", "cli", "index.js");

// ── Unit Tests: Loader ──

describe("enforce: loader", () => {
  it("should load manifest and extract governance rules", () => {
    const manifest = loadManifestForEnforcement(ENFORCE_MANIFEST);
    expect(manifest.metadata.name).toBe("enforce-test");
    expect(manifest.metadata.version).toBe("1.0.0");
    expect(manifest.rules.length).toBeGreaterThan(0);
    expect(manifest.context.environment).toBe("production");
  });

  it("should filter to enforceable rules (pattern + tool only)", () => {
    const manifest = loadManifestForEnforcement(ENFORCE_MANIFEST);
    const enforceable = getEnforceableRules(manifest);

    // Should include pattern rules, exclude injected and rules without detect
    const names = enforceable.map((r) => r.name);
    expect(names).toContain("no-eval");
    expect(names).toContain("no-any-type");
    expect(names).toContain("no-console-in-production");
    expect(names).toContain("no-empty-catch");
    expect(names).not.toContain("style-suggestion"); // injected
  });
});

// ── Unit Tests: Condition Evaluation ──

describe("enforce: condition evaluation", () => {
  it("should pass when no condition", () => {
    expect(evaluateCondition(undefined, {})).toBe(true);
  });

  it("should evaluate equality conditions", () => {
    const ctx: EnforceContext = { environment: "production" };
    expect(evaluateCondition("environment == 'production'", ctx)).toBe(true);
    expect(evaluateCondition("environment == 'development'", ctx)).toBe(false);
  });

  it("should evaluate inequality conditions", () => {
    const ctx: EnforceContext = { environment: "production" };
    expect(evaluateCondition("environment != 'development'", ctx)).toBe(true);
    expect(evaluateCondition("environment != 'production'", ctx)).toBe(false);
  });

  it("should check custom variables", () => {
    const ctx: EnforceContext = { variables: { team: "backend" } };
    expect(evaluateCondition("team == 'backend'", ctx)).toBe(true);
    expect(evaluateCondition("team == 'frontend'", ctx)).toBe(false);
  });

  it("should default to active for unparseable conditions", () => {
    expect(evaluateCondition("some.complex.expression()", {})).toBe(true);
  });
});

// ── Unit Tests: Pattern Detection ──

describe("enforce: pattern detection", () => {
  const makeRule = (name: string, match: string, opts?: Partial<GovernanceRule>): GovernanceRule => ({
    name,
    action: "block",
    severity: "error",
    message: `Violation: ${name}`,
    ...opts,
    detect: { type: "pattern" as const, match, file_types: ["ts", "js"] },
  });

  it("should detect eval() usage", () => {
    const rule = makeRule("no-eval", "\\b(eval|Function)\\s*\\(");
    const violations = runPatternDetection(
      rule,
      rule.detect as PatternDetect,
      "test.ts",
      'const x = eval("code");',
    );
    expect(violations.length).toBe(1);
    expect(violations[0].rule).toBe("no-eval");
    expect(violations[0].line).toBe(1);
    expect(violations[0].match).toContain("eval(");
  });

  it("should detect any type", () => {
    const rule = makeRule("no-any", ":\\s*any\\b|<any>|as\\s+any");
    const detect = { type: "pattern" as const, match: rule.detect!.match, file_types: ["ts"] } as PatternDetect;
    const violations = runPatternDetection(
      rule,
      detect,
      "test.ts",
      "function foo(x: any): any { return x as any; }",
    );
    expect(violations.length).toBe(3); // : any (param), : any (return), as any
  });

  it("should respect file type filter", () => {
    const rule = makeRule("no-eval", "\\beval\\(");
    const detect = rule.detect as PatternDetect;
    const violations = runPatternDetection(rule, detect, "test.md", 'eval("code")');
    expect(violations.length).toBe(0); // .md not in [ts, js]
  });

  it("should detect empty catch blocks", () => {
    const rule = makeRule("no-empty-catch", "catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}");
    const violations = runPatternDetection(
      rule,
      rule.detect as PatternDetect,
      "test.ts",
      "try { foo(); } catch (err) {}",
    );
    expect(violations.length).toBe(1);
  });

  it("should report line numbers correctly", () => {
    const rule = makeRule("no-eval", "\\beval\\(");
    const content = "line1\nline2\neval('bad')\nline4";
    const violations = runPatternDetection(
      rule,
      rule.detect as PatternDetect,
      "test.ts",
      content,
    );
    expect(violations.length).toBe(1);
    expect(violations[0].line).toBe(3);
  });

  it("should find multiple violations per file", () => {
    const rule = makeRule("no-console", "console\\.(log|warn)\\(");
    const content = 'console.log("a");\nconsole.warn("b");';
    const violations = runPatternDetection(
      rule,
      rule.detect as PatternDetect,
      "test.ts",
      content,
    );
    expect(violations.length).toBe(2);
  });

  it("should return empty for clean files", () => {
    const rule = makeRule("no-eval", "\\beval\\(");
    const violations = runPatternDetection(
      rule,
      rule.detect as PatternDetect,
      "test.ts",
      "const x = 1 + 2;",
    );
    expect(violations.length).toBe(0);
  });

  it("should handle invalid regex gracefully", () => {
    const rule = makeRule("bad-regex", "[invalid");
    const violations = runPatternDetection(
      rule,
      rule.detect as PatternDetect,
      "test.ts",
      "some content",
    );
    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain("Invalid regex");
  });
});

// ── Integration Tests: Engine ──

describe("enforce: engine", () => {
  it("should find violations in the violations fixture", async () => {
    const summary = await enforce({
      manifestPath: ENFORCE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "violations.ts"),
    });

    expect(summary.totalViolations).toBeGreaterThan(0);
    expect(summary.blocked).toBe(true);

    // Check specific rules fired
    const ruleNames = summary.results
      .flatMap((r) => r.violations)
      .map((v) => v.rule);
    expect(ruleNames).toContain("no-eval");
    expect(ruleNames).toContain("no-any-type");
    expect(ruleNames).toContain("no-empty-catch");
  });

  it("should detect console.log when environment is production", async () => {
    const summary = await enforce({
      manifestPath: ENFORCE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "violations.ts"),
    });

    const consoleViolations = summary.results
      .flatMap((r) => r.violations)
      .filter((v) => v.rule === "no-console-in-production");
    expect(consoleViolations.length).toBeGreaterThan(0);
    expect(consoleViolations[0].action).toBe("warn");
  });

  it("should skip console.log rule when environment is development", async () => {
    const summary = await enforce({
      manifestPath: ENFORCE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "violations.ts"),
      environment: "development",
    });

    const consoleViolations = summary.results
      .flatMap((r) => r.violations)
      .filter((v) => v.rule === "no-console-in-production");
    expect(consoleViolations.length).toBe(0);
  });

  it("should find no violations in the clean fixture", async () => {
    const summary = await enforce({
      manifestPath: ENFORCE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "clean.ts"),
    });

    expect(summary.totalViolations).toBe(0);
    expect(summary.blocked).toBe(false);
  });

  it("should skip non-matching file types", async () => {
    const summary = await enforce({
      manifestPath: ENFORCE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "not-typescript.md"),
    });

    expect(summary.totalViolations).toBe(0);
  });

  it("should scan directories recursively", async () => {
    const summary = await enforce({
      manifestPath: ENFORCE_MANIFEST,
      targetPath: ENFORCE_TARGET,
    });

    // Should have checked multiple files
    expect(summary.files).toBeGreaterThan(1);
    // violations.ts has issues, clean.ts doesn't
    expect(summary.filesWithViolations).toBe(1);
  });

  it("should report correct action types in summary", async () => {
    const summary = await enforce({
      manifestPath: ENFORCE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "violations.ts"),
    });

    // no-eval, no-any-type, no-empty-catch are "block"
    expect(summary.byAction["block"]).toBeGreaterThan(0);
    // no-console-in-production is "warn"
    expect(summary.byAction["warn"]).toBeGreaterThan(0);
  });

  it("should report correct severity levels in summary", async () => {
    const summary = await enforce({
      manifestPath: ENFORCE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "violations.ts"),
    });

    // no-eval is critical, no-any-type and no-empty-catch are error, console is warning
    expect(summary.bySeverity["critical"]).toBeGreaterThan(0);
    expect(summary.bySeverity["error"]).toBeGreaterThan(0);
    expect(summary.bySeverity["warning"]).toBeGreaterThan(0);
  });

  it("should include fix hints in violations", async () => {
    const summary = await enforce({
      manifestPath: ENFORCE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "violations.ts"),
    });

    const withHints = summary.results
      .flatMap((r) => r.violations)
      .filter((v) => v.fix_hint);
    expect(withHints.length).toBeGreaterThan(0);
  });

  it("should work with the enterprise-typescript reference manifest", async () => {
    const refManifest = join(__dirname, "..", "manifests", "reference", "enterprise-typescript.aim.yaml");
    const summary = await enforce({
      manifestPath: refManifest,
      targetPath: join(ENFORCE_TARGET, "violations.ts"),
    });

    // The reference manifest should also catch violations in our test fixture
    expect(summary.totalViolations).toBeGreaterThan(0);
  });
});

// ── Integration Tests: Semantic Enforcement ──

describe("enforce: semantic detection", () => {
  const SEMANTIC_MANIFEST = join(FIXTURES, "enforce-semantic-manifest.aim.yaml");

  it("should include semantic rules in enforceable rules", () => {
    const manifest = loadManifestForEnforcement(SEMANTIC_MANIFEST);
    const enforceable = getEnforceableRules(manifest);
    const names = enforceable.map((r) => r.name);

    expect(names).toContain("clean-architecture");
    expect(names).toContain("input-validation");
    expect(names).toContain("no-eval"); // pattern rule still included
  });

  it("should still enforce pattern rules alongside semantic rules", async () => {
    const summary = await enforce({
      manifestPath: SEMANTIC_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "violations.ts"),
    });

    // Pattern rule should still work even with semantic rules in manifest
    const evalViolations = summary.results
      .flatMap((r) => r.violations)
      .filter((v) => v.rule === "no-eval");
    expect(evalViolations.length).toBeGreaterThan(0);
  });

  it("should gracefully handle missing API key for semantic rules", async () => {
    // Save and clear API key + base URL
    const savedKey = process.env.ANTHROPIC_API_KEY;
    const savedBase = process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_BASE_URL;

    // Reset the cached client so getClient() re-checks env vars
    const semanticMod = await import("../src/enforce/semantic.js");
    (semanticMod as Record<string, unknown>).__resetClient?.();

    try {
      const summary = await enforce({
        manifestPath: SEMANTIC_MANIFEST,
        targetPath: join(ENFORCE_TARGET, "dirty-architecture.ts"),
      });

      // Should not crash — semantic rules just get skipped
      // Pattern rules should still work
      expect(summary.files).toBe(1);
      // Semantic rules should be listed as skipped
      expect(Object.keys(summary.skippedRules).length).toBeGreaterThan(0);
    } finally {
      // Restore env vars
      if (savedKey) process.env.ANTHROPIC_API_KEY = savedKey;
      if (savedBase) process.env.ANTHROPIC_BASE_URL = savedBase;
      (semanticMod as Record<string, unknown>).__resetClient?.();
    }
  });

  // Conditional test: only runs if ANTHROPIC_API_KEY is set
  const describeWithKey = process.env.ANTHROPIC_API_KEY ? describe : describe.skip;

  describeWithKey("with API key", () => {
    it("should detect clean architecture violations via LLM judge", async () => {
      const summary = await enforce({
        manifestPath: SEMANTIC_MANIFEST,
        targetPath: join(ENFORCE_TARGET, "dirty-architecture.ts"),
      });

      // The LLM should detect that dirty-architecture.ts violates clean architecture
      const archViolations = summary.results
        .flatMap((r) => r.violations)
        .filter((v) => v.rule === "clean-architecture");
      expect(archViolations.length).toBeGreaterThan(0);
      expect(archViolations[0].action).toBe("warn");
      // Should include the judge's reasoning
      expect(archViolations[0].match).toBeTruthy();
    });

    it("should detect missing input validation via LLM judge", async () => {
      const summary = await enforce({
        manifestPath: SEMANTIC_MANIFEST,
        targetPath: join(ENFORCE_TARGET, "dirty-architecture.ts"),
      });

      const validationViolations = summary.results
        .flatMap((r) => r.violations)
        .filter((v) => v.rule === "input-validation");
      expect(validationViolations.length).toBeGreaterThan(0);
    });

    it("should pass semantic checks on clean code", async () => {
      const summary = await enforce({
        manifestPath: SEMANTIC_MANIFEST,
        targetPath: join(ENFORCE_TARGET, "clean.ts"),
      });

      // Clean code should not trigger architecture or validation warnings
      const semanticViolations = summary.results
        .flatMap((r) => r.violations)
        .filter((v) => v.rule === "clean-architecture" || v.rule === "input-validation");
      expect(semanticViolations.length).toBe(0);
    });
  });
});

// ── Composite Detection Tests ──

describe("enforce: composite detection", () => {
  const COMPOSITE_MANIFEST = join(FIXTURES, "enforce-composite-manifest.aim.yaml");

  it("should include composite rules in enforceable rules", () => {
    const manifest = loadManifestForEnforcement(COMPOSITE_MANIFEST);
    const enforceable = getEnforceableRules(manifest);
    const names = enforceable.map((r) => r.name);

    expect(names).toContain("dangerous-eval-all");
    expect(names).toContain("unsafe-code-any");
    expect(names).toContain("code-quality-weighted");
    expect(names).toContain("no-eval-simple"); // regular pattern rule still included
  });

  it("all_must_pass should NOT fire when only some checks trigger", async () => {
    // violations.ts has eval() but NOT Function()
    const summary = await enforce({
      manifestPath: COMPOSITE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "violations.ts"),
    });

    const allMustPassViolations = summary.results
      .flatMap((r) => r.violations)
      .filter((v) => v.rule === "dangerous-eval-all");
    expect(allMustPassViolations.length).toBe(0);
  });

  it("any_must_pass should fire when any check triggers", async () => {
    const summary = await enforce({
      manifestPath: COMPOSITE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "violations.ts"),
    });

    const anyViolations = summary.results
      .flatMap((r) => r.violations)
      .filter((v) => v.rule === "unsafe-code-any");
    // Should fire for eval, console.log, and :any matches
    expect(anyViolations.length).toBeGreaterThan(0);
  });

  it("weighted should calculate score and compare to threshold", async () => {
    const summary = await enforce({
      manifestPath: COMPOSITE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "violations.ts"),
    });

    const weightedViolations = summary.results
      .flatMap((r) => r.violations)
      .filter((v) => v.rule === "code-quality-weighted");
    // eval (0.5) + console.log (0.3) = 0.8 score, threshold 0.4 → should fire
    expect(weightedViolations.length).toBe(1);
    expect(weightedViolations[0].match).toContain("composite:weighted");
    expect(weightedViolations[0].match).toContain("score=");
  });

  it("weighted should NOT fire when score is below threshold", async () => {
    // clean.ts should not trigger eval or console.log, so score = 0
    const summary = await enforce({
      manifestPath: COMPOSITE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "clean.ts"),
    });

    const weightedViolations = summary.results
      .flatMap((r) => r.violations)
      .filter((v) => v.rule === "code-quality-weighted");
    expect(weightedViolations.length).toBe(0);
  });

  it("should not break regular pattern rules alongside composite", async () => {
    const summary = await enforce({
      manifestPath: COMPOSITE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "violations.ts"),
    });

    const simpleViolations = summary.results
      .flatMap((r) => r.violations)
      .filter((v) => v.rule === "no-eval-simple");
    expect(simpleViolations.length).toBeGreaterThan(0);
  });

  it("should pass clean files through all composite checks", async () => {
    const summary = await enforce({
      manifestPath: COMPOSITE_MANIFEST,
      targetPath: join(ENFORCE_TARGET, "clean.ts"),
    });

    expect(summary.totalViolations).toBe(0);
  });
});

// ── CLI Integration Tests ──

describe("CLI: manifest enforce", () => {
  function run(args: string): { stdout: string; exitCode: number } {
    try {
      const stdout = execSync(`node ${CLI} ${args}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { stdout, exitCode: 0 };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; status?: number };
      return { stdout: error.stdout || error.stderr || "", exitCode: error.status || 1 };
    }
  }

  it("should exit 1 with blocking violations", () => {
    const { exitCode, stdout } = run(
      `enforce ${join(ENFORCE_TARGET, "violations.ts")} -m ${ENFORCE_MANIFEST}`,
    );
    expect(exitCode).toBe(1);
    expect(stdout).toContain("BLOCK");
    expect(stdout).toContain("blocking violation");
  });

  it("should exit 0 for clean files", () => {
    const { exitCode, stdout } = run(
      `enforce ${join(ENFORCE_TARGET, "clean.ts")} -m ${ENFORCE_MANIFEST}`,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No violations found");
  });

  it("should show rule names in output", () => {
    const { stdout } = run(
      `enforce ${join(ENFORCE_TARGET, "violations.ts")} -m ${ENFORCE_MANIFEST}`,
    );
    expect(stdout).toContain("eval()");
    expect(stdout).toContain("any");
  });

  it("should show fix hints", () => {
    const { stdout } = run(
      `enforce ${join(ENFORCE_TARGET, "violations.ts")} -m ${ENFORCE_MANIFEST}`,
    );
    expect(stdout).toContain("fix:");
  });

  it("should fail if manifest not found", () => {
    const { exitCode, stdout } = run("enforce ./src -m nonexistent.yaml");
    expect(exitCode).toBe(1);
    expect(stdout).toContain("Manifest not found");
  });

  it("should fail if target not found", () => {
    const { exitCode, stdout } = run(
      `enforce /nonexistent/path -m ${ENFORCE_MANIFEST}`,
    );
    expect(exitCode).toBe(1);
    expect(stdout).toContain("Target not found");
  });

  it("should support --environment flag", () => {
    const { exitCode } = run(
      `enforce ${join(ENFORCE_TARGET, "clean.ts")} -m ${ENFORCE_MANIFEST} -e development`,
    );
    expect(exitCode).toBe(0);
  });

  it("should scan directories", () => {
    const { stdout } = run(
      `enforce ${ENFORCE_TARGET} -m ${ENFORCE_MANIFEST}`,
    );
    expect(stdout).toContain("files checked");
  });
});

// ── Path Exclusion Tests ──

describe("enforce: path exclusions", () => {
  const PATHS_MANIFEST = join(FIXTURES, "enforce-paths-manifest.aim.yaml");
  const PATHS_TARGET = join(FIXTURES, "enforce-paths");

  it("exclude_paths should skip files matching glob patterns", async () => {
    const summary = await enforce({
      manifestPath: PATHS_MANIFEST,
      targetPath: PATHS_TARGET,
    });

    // no-console-log rule excludes cli/** — should only flag lib/utils.ts
    const consoleViolations = summary.results
      .flatMap((r) => r.violations)
      .filter((v) => v.rule === "no-console-log");
    expect(consoleViolations.length).toBe(1);
    expect(consoleViolations[0].file).toContain("lib/utils.ts");
  });

  it("paths should only check files matching glob patterns", async () => {
    const summary = await enforce({
      manifestPath: PATHS_MANIFEST,
      targetPath: PATHS_TARGET,
    });

    // no-console-log-paths-only only checks lib/** — should only flag lib/utils.ts
    const libOnlyViolations = summary.results
      .flatMap((r) => r.violations)
      .filter((v) => v.rule === "no-console-log-paths-only");
    expect(libOnlyViolations.length).toBe(1);
    expect(libOnlyViolations[0].file).toContain("lib/utils.ts");
  });

  it("paths + exclude_paths should combine correctly", async () => {
    const summary = await enforce({
      manifestPath: PATHS_MANIFEST,
      targetPath: PATHS_TARGET,
    });

    // no-console-log-both: paths=lib/**, exclude_paths=**/*.test.ts
    // Should flag lib/utils.ts (it's in lib/ and not a .test.ts)
    const bothViolations = summary.results
      .flatMap((r) => r.violations)
      .filter((v) => v.rule === "no-console-log-both");
    expect(bothViolations.length).toBe(1);
    expect(bothViolations[0].file).toContain("lib/utils.ts");
  });

  it("CLI commands in cli/ should not be flagged when excluded", async () => {
    const summary = await enforce({
      manifestPath: PATHS_MANIFEST,
      targetPath: PATHS_TARGET,
    });

    // No rule should flag the cli/commands/run.ts file for console.log
    const cliViolations = summary.results
      .flatMap((r) => r.violations)
      .filter((v) => v.file.includes("cli/commands"));

    // Only the no-console-log-paths-only won't match (paths=lib/**),
    // and no-console-log excludes cli/**, and no-console-log-both paths=lib/**
    // So cli/commands/run.ts should have 0 violations
    expect(cliViolations.length).toBe(0);
  });
});
