/**
 * Benchmark suite — measures enforcement performance, tier loading speed,
 * and token efficiency to validate AIM's performance claims.
 */

import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { enforce } from "../src/enforce/engine.js";
import { loadCapabilitiesAtTier } from "../src/tier/loader.js";
import { extractManifestContext, generateContextText } from "../src/wrap/context-generator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES = join(__dirname, "fixtures");
const ENFORCE_MANIFEST = join(FIXTURES, "enforce-manifest.aim.yaml");
const TIER_MANIFEST = join(FIXTURES, "tier-manifest.aim.yaml");
const REFERENCE_DIR = join(__dirname, "..", "manifests", "reference");

// ── Enforcement Performance Benchmarks ──

describe("benchmark: enforcement engine", () => {
  it("should enforce a single file in under 50ms", async () => {
    const start = performance.now();
    await enforce({
      manifestPath: ENFORCE_MANIFEST,
      targetPath: join(FIXTURES, "enforce-target", "violations.ts"),
    });
    const duration = performance.now() - start;

    console.log(`  Single file enforcement: ${duration.toFixed(1)}ms`);
    expect(duration).toBeLessThan(50);
  });

  it("should enforce a clean file in under 20ms", async () => {
    const start = performance.now();
    await enforce({
      manifestPath: ENFORCE_MANIFEST,
      targetPath: join(FIXTURES, "enforce-target", "clean.ts"),
    });
    const duration = performance.now() - start;

    console.log(`  Clean file enforcement: ${duration.toFixed(1)}ms`);
    expect(duration).toBeLessThan(20);
  });

  it("should enforce a directory of files in under 200ms", async () => {
    const start = performance.now();
    await enforce({
      manifestPath: ENFORCE_MANIFEST,
      targetPath: join(FIXTURES, "enforce-target"),
    });
    const duration = performance.now() - start;

    console.log(`  Directory enforcement: ${duration.toFixed(1)}ms`);
    expect(duration).toBeLessThan(200);
  });

  it("should handle large manifests (12+ rules) efficiently", { timeout: 20000 }, async () => {
    const start = performance.now();
    const summary = await enforce({
      manifestPath: join(REFERENCE_DIR, "enterprise-typescript.aim.yaml"),
      targetPath: join(FIXTURES, "enforce-target"),
    });
    const duration = performance.now() - start;

    // Note: semantic rules may involve network calls (LLM-as-judge),
    // so we allow generous time. Static-only enforcement is <50ms.
    const hasSemanticRules = Object.keys(summary.skippedRules).length > 0;
    const threshold = hasSemanticRules ? 15000 : 500;

    console.log(`  Enterprise manifest (12 rules): ${duration.toFixed(1)}ms (semantic rules: ${hasSemanticRules})`);
    expect(duration).toBeLessThan(threshold);
  });

  it("should enforce 100 synthetic files in under 2 seconds", async () => {
    // Generate synthetic files
    const tmpDir = join(__dirname, ".tmp-bench");
    mkdirSync(tmpDir, { recursive: true });

    try {
      for (let i = 0; i < 100; i++) {
        const hasViolation = i % 3 === 0;
        const content = hasViolation
          ? `// File ${i}\nconst x = eval("test");\nconsole.log(x);\nexport const val${i} = ${i};\n`
          : `// File ${i}\nexport function fn${i}(): number { return ${i}; }\n`;
        writeFileSync(join(tmpDir, `file${i}.ts`), content);
      }

      const start = performance.now();
      const summary = await enforce({
        manifestPath: ENFORCE_MANIFEST,
        targetPath: tmpDir,
      });
      const duration = performance.now() - start;

      console.log(`  100 files enforcement: ${duration.toFixed(1)}ms (${summary.totalViolations} violations)`);
      expect(duration).toBeLessThan(2000);
      expect(summary.files).toBe(100);
      expect(summary.totalViolations).toBeGreaterThan(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── Tier Loading Performance Benchmarks ──

describe("benchmark: tier loading", () => {
  it("should load Tier 0 in under 10ms", () => {
    const start = performance.now();
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 0);
    const duration = performance.now() - start;

    console.log(`  Tier 0 load: ${duration.toFixed(1)}ms (${result.capabilities.length} capabilities, ~${result.tokenEstimate} tokens)`);
    expect(duration).toBeLessThan(10);
  });

  it("should load Tier 1 in under 15ms", () => {
    const start = performance.now();
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 1);
    const duration = performance.now() - start;

    console.log(`  Tier 1 load: ${duration.toFixed(1)}ms (~${result.tokenEstimate} tokens)`);
    expect(duration).toBeLessThan(15);
  });

  it("should load Tier 2 in under 15ms", () => {
    const start = performance.now();
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 2);
    const duration = performance.now() - start;

    console.log(`  Tier 2 load: ${duration.toFixed(1)}ms (~${result.tokenEstimate} tokens)`);
    expect(duration).toBeLessThan(15);
  });

  it("should load Tier 3 in under 15ms", () => {
    const start = performance.now();
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 3);
    const duration = performance.now() - start;

    console.log(`  Tier 3 load: ${duration.toFixed(1)}ms (~${result.tokenEstimate} tokens)`);
    expect(duration).toBeLessThan(15);
  });

  it("should demonstrate ≥90% token savings at Tier 0 vs Tier 2", () => {
    const t0 = loadCapabilitiesAtTier(TIER_MANIFEST, 0);
    const t2 = loadCapabilitiesAtTier(TIER_MANIFEST, 2);

    const savings = 1 - t0.tokenEstimate / t2.tokenEstimate;
    console.log(`  Token savings Tier 0 vs Tier 2: ${(savings * 100).toFixed(1)}% (${t0.tokenEstimate} vs ${t2.tokenEstimate} tokens)`);
    expect(savings).toBeGreaterThanOrEqual(0.9);
  });
});

// ── Wrap/Context Generation Performance ──

describe("benchmark: context generation", () => {
  it("should extract and generate context in under 20ms", () => {
    const start = performance.now();
    const ctx = extractManifestContext(join(REFERENCE_DIR, "enterprise-typescript.aim.yaml"));
    const { text, sections } = generateContextText(ctx);
    const duration = performance.now() - start;

    const lines = text.split("\n").length;
    const estimatedTokens = Math.ceil(text.length / 4);

    console.log(`  Context generation: ${duration.toFixed(1)}ms`);
    console.log(`  Output: ${lines} lines, ~${estimatedTokens} tokens, ${sections.length} sections`);
    expect(duration).toBeLessThan(20);
  });

  it("should generate context for all reference manifests in under 50ms total", () => {
    const manifests = [
      "enterprise-typescript.aim.yaml",
      "react-best-practices.aim.yaml",
      "python-production.aim.yaml",
      "devops-safety.aim.yaml",
    ];

    const start = performance.now();
    const results: Array<{ name: string; tokens: number }> = [];

    for (const m of manifests) {
      const ctx = extractManifestContext(join(REFERENCE_DIR, m));
      const { text } = generateContextText(ctx);
      results.push({
        name: ctx.metadata.name,
        tokens: Math.ceil(text.length / 4),
      });
    }

    const duration = performance.now() - start;
    console.log(`  All 4 manifests: ${duration.toFixed(1)}ms`);
    for (const r of results) {
      console.log(`    ${r.name}: ~${r.tokens} tokens`);
    }
    expect(duration).toBeLessThan(50);
  });
});

// ── Token Efficiency Benchmarks ──

describe("benchmark: token efficiency", () => {
  it("should produce context under 2000 tokens for enterprise manifest", () => {
    const ctx = extractManifestContext(join(REFERENCE_DIR, "enterprise-typescript.aim.yaml"));
    const { text } = generateContextText(ctx);
    const tokens = Math.ceil(text.length / 4);

    console.log(`  Enterprise context: ~${tokens} tokens`);
    expect(tokens).toBeLessThan(2000);
  });

  it("should scale linearly with rule count", () => {
    const manifests = [
      { path: join(REFERENCE_DIR, "devops-safety.aim.yaml"), expectedRules: 8 },
      { path: join(REFERENCE_DIR, "react-best-practices.aim.yaml"), expectedRules: 9 },
      { path: join(REFERENCE_DIR, "python-production.aim.yaml"), expectedRules: 9 },
      { path: join(REFERENCE_DIR, "enterprise-typescript.aim.yaml"), expectedRules: 12 },
    ];

    const results = manifests.map((m) => {
      const ctx = extractManifestContext(m.path);
      const { text } = generateContextText(ctx);
      return {
        name: ctx.metadata.name,
        rules: ctx.governanceRules.length,
        tokens: Math.ceil(text.length / 4),
        tokensPerRule: Math.ceil(text.length / 4 / ctx.governanceRules.length),
      };
    });

    for (const r of results) {
      console.log(`  ${r.name}: ${r.rules} rules, ~${r.tokens} tokens (~${r.tokensPerRule}/rule)`);
    }

    // Tokens per rule should be roughly consistent (within 3x of each other)
    const perRule = results.map((r) => r.tokensPerRule);
    const maxPerRule = Math.max(...perRule);
    const minPerRule = Math.min(...perRule);
    expect(maxPerRule / minPerRule).toBeLessThan(3);
  });
});
