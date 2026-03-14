import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  loadCapabilitiesAtTier,
  formatTierOutput,
  generateProgressiveLoadingProtocol,
} from "../src/tier/loader.js";
import type { Tier0, Tier1, Tier2, Tier3 } from "../src/tier/loader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES = join(__dirname, "fixtures");
const TIER_MANIFEST = join(FIXTURES, "tier-manifest.aim.yaml");
const CLI = join(__dirname, "..", "dist", "cli", "index.js");

// ── Tier Loader Unit Tests ──

describe("tier: loader", () => {
  it("should load all capabilities at Tier 0", () => {
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 0);

    expect(result.manifestName).toBe("tier-test");
    expect(result.tier).toBe(0);
    expect(result.capabilities).toHaveLength(3);

    const cap = result.capabilities[0] as Tier0;
    expect(cap.tier).toBe(0);
    expect(cap.name).toBe("database-migrate");
    expect(cap.tags).toContain("database");
    expect(cap.index).toBe("Run database schema migrations with rollback support");

    // Tier 0 should NOT have schema/instructions/dispatch
    expect("schema" in cap).toBe(false);
    expect("instructions" in cap).toBe(false);
    expect("dispatch" in cap).toBe(false);
  });

  it("should load capabilities at Tier 1 with schema", () => {
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 1);

    expect(result.tier).toBe(1);
    const cap = result.capabilities[0] as Tier1;
    expect(cap.tier).toBe(1);
    expect(cap.name).toBe("database-migrate");
    expect(cap.schema).toBeDefined();
    expect(cap.schema.inputs).toBeDefined();
    expect(cap.schema.inputs!.direction).toBeDefined();
    expect(cap.schema.inputs!.direction.type).toBe("string");
    expect(cap.schema.inputs!.direction.required).toBe(true);
    expect(cap.schema.outputs).toBeDefined();
    expect(cap.schema.preconditions).toContain("Database connection must be available");
    expect(cap.schema.idempotent).toBe(false);

    // Tier 1 should NOT have instructions/dispatch
    expect("instructions" in cap).toBe(false);
    expect("dispatch" in cap).toBe(false);
  });

  it("should load capabilities at Tier 2 with instructions", () => {
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 2);

    expect(result.tier).toBe(2);
    const cap = result.capabilities[0] as Tier2;
    expect(cap.tier).toBe(2);
    expect(cap.schema).toBeDefined(); // includes Tier 1
    expect(cap.instructions).toContain("migration tool");
    expect(cap.examples).toHaveLength(2);
    expect(cap.examples[0].description).toBe("Apply next pending migration");
    expect(cap.anti_patterns).toHaveLength(2);

    // Tier 2 should NOT have dispatch
    expect("dispatch" in cap).toBe(false);
  });

  it("should load capabilities at Tier 3 with dispatch", () => {
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 3);

    expect(result.tier).toBe(3);
    const cap = result.capabilities[0] as Tier3;
    expect(cap.tier).toBe(3);
    expect(cap.schema).toBeDefined(); // includes Tier 1
    expect(cap.instructions).toContain("migration tool"); // includes Tier 2
    expect(cap.dispatch).toBeDefined();
    expect(cap.dispatch.type).toBe("cli");
    expect(cap.dispatch.config.command).toBe("npx prisma migrate");
  });

  it("should filter capabilities by name", () => {
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 0, "database");

    expect(result.capabilities).toHaveLength(1);
    expect(result.capabilities[0].name).toBe("database-migrate");
  });

  it("should filter capabilities by tag", () => {
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 0, "testing");

    expect(result.capabilities).toHaveLength(1);
    expect(result.capabilities[0].name).toBe("run-tests");
  });

  it("should return empty when filter matches nothing", () => {
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 0, "nonexistent");
    expect(result.capabilities).toHaveLength(0);
  });

  it("should show progressive token cost increase across tiers", () => {
    const t0 = loadCapabilitiesAtTier(TIER_MANIFEST, 0);
    const t1 = loadCapabilitiesAtTier(TIER_MANIFEST, 1);
    const t2 = loadCapabilitiesAtTier(TIER_MANIFEST, 2);
    const t3 = loadCapabilitiesAtTier(TIER_MANIFEST, 3);

    // Each tier should cost more tokens than the previous
    expect(t1.tokenEstimate).toBeGreaterThan(t0.tokenEstimate);
    expect(t2.tokenEstimate).toBeGreaterThan(t1.tokenEstimate);
    // Tier 3 dispatch doesn't count (never enters context), so ≥ Tier 2
    expect(t3.tokenEstimate).toBeGreaterThanOrEqual(t2.tokenEstimate);
  });

  it("should throw for missing manifest", () => {
    expect(() => loadCapabilitiesAtTier("/nonexistent.yaml", 0)).toThrow("Manifest not found");
  });
});

// ── Format Output Tests ──

describe("tier: formatTierOutput", () => {
  it("should format Tier 0 output", () => {
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 0);
    const output = formatTierOutput(result);

    expect(output).toContain("tier-test v1.0.0");
    expect(output).toContain("Tier: 0");
    expect(output).toContain("database-migrate");
    expect(output).toContain("run-tests");
    expect(output).toContain("deploy-preview");
    // Should NOT contain schema details
    expect(output).not.toContain("Inputs:");
  });

  it("should format Tier 1 output with schema", () => {
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 1);
    const output = formatTierOutput(result);

    expect(output).toContain("Inputs:");
    expect(output).toContain("direction: string (required)");
    expect(output).toContain("Outputs:");
    expect(output).toContain("Preconditions:");
  });

  it("should format Tier 2 output with instructions", () => {
    const result = loadCapabilitiesAtTier(TIER_MANIFEST, 2);
    const output = formatTierOutput(result);

    expect(output).toContain("Instructions:");
    expect(output).toContain("Examples:");
    expect(output).toContain("Anti-patterns:");
  });
});

// ── Progressive Loading Protocol Tests ──

describe("tier: generateProgressiveLoadingProtocol", () => {
  it("should generate protocol with capability index", () => {
    const caps = [
      { name: "test-cap", index: "A test capability", tags: ["test"] },
    ];
    const protocol = generateProgressiveLoadingProtocol(caps);

    expect(protocol).toContain("Progressive Loading Protocol");
    expect(protocol).toContain("Tier 0");
    expect(protocol).toContain("test-cap");
    expect(protocol).toContain("A test capability");
    expect(protocol).toContain("[test]");
    expect(protocol).toContain("context savings");
  });

  it("should return empty for no capabilities", () => {
    expect(generateProgressiveLoadingProtocol([])).toBe("");
  });
});

// ── CLI Integration Tests ──

describe("CLI: manifest tier", () => {
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

  it("should show Tier 0 index", () => {
    const { exitCode, stdout } = run(`tier -m ${TIER_MANIFEST}`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("database-migrate");
    expect(stdout).toContain("run-tests");
    expect(stdout).toContain("deploy-preview");
    expect(stdout).toContain("Tier: 0");
  });

  it("should show Tier 1 schema", () => {
    const { exitCode, stdout } = run(`tier -m ${TIER_MANIFEST} -t 1`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Inputs:");
    expect(stdout).toContain("direction");
    expect(stdout).toContain("Tier: 1");
  });

  it("should show Tier 2 instructions", () => {
    const { exitCode, stdout } = run(`tier -m ${TIER_MANIFEST} -t 2`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Instructions:");
    expect(stdout).toContain("Examples:");
    expect(stdout).toContain("Tier: 2");
  });

  it("should show Tier 3 dispatch", () => {
    const { exitCode, stdout } = run(`tier -m ${TIER_MANIFEST} -t 3`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Dispatch:");
    expect(stdout).toContain("cli");
    expect(stdout).toContain("Tier: 3");
  });

  it("should filter by capability name", () => {
    const { exitCode, stdout } = run(`tier database -m ${TIER_MANIFEST}`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("database-migrate");
    expect(stdout).not.toContain("run-tests");
  });

  it("should handle no matching capabilities", () => {
    const { exitCode, stdout } = run(`tier nonexistent -m ${TIER_MANIFEST}`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No capabilities matching");
  });
});
