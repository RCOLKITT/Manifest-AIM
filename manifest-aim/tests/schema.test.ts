import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import yaml from "js-yaml";

const require = createRequire(import.meta.url);
const Ajv = require("ajv").default || require("ajv");
const addFormats = require("ajv-formats").default || require("ajv-formats");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCHEMA_PATH = join(__dirname, "..", "schemas", "aim-v1.0.schema.json");
const FIXTURES_PATH = join(__dirname, "fixtures");

function loadYaml(filename: string): Record<string, unknown> {
  const content = readFileSync(join(FIXTURES_PATH, filename), "utf-8");
  return yaml.load(content) as Record<string, unknown>;
}

function loadSchema(): Record<string, unknown> {
  return JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
}

describe("AIM v1.0 JSON Schema", () => {
  let validate: (data: unknown) => boolean;

  beforeAll(() => {
    const schema = loadSchema();
    const ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  describe("schema loads correctly", () => {
    it("should parse the schema without errors", () => {
      const schema = loadSchema();
      expect(schema).toBeDefined();
      expect(schema.$id).toBe("https://manifestaim.dev/schemas/aim-v1.0.json");
      expect(schema.title).toContain("AIM");
    });

    it("should compile into a validator", () => {
      expect(validate).toBeTypeOf("function");
    });
  });

  describe("valid manifests", () => {
    it("should accept a minimal valid manifest", () => {
      const manifest = loadYaml("minimal-valid.aim.yaml");
      const valid = validate(manifest);
      expect(valid).toBe(true);
    });

    it("should accept a full manifest with all sections", () => {
      const manifest = loadYaml("full-valid.aim.yaml");
      const valid = validate(manifest);
      if (!valid) {
        console.error("Validation errors:", JSON.stringify((validate as any).errors, null, 2));
      }
      expect(valid).toBe(true);
    });

    it("should accept the enterprise-typescript reference manifest", () => {
      const content = readFileSync(
        join(__dirname, "..", "manifests", "reference", "enterprise-typescript.aim.yaml"),
        "utf-8",
      );
      const manifest = yaml.load(content) as Record<string, unknown>;
      const valid = validate(manifest);
      if (!valid) {
        console.error("Validation errors:", JSON.stringify((validate as any).errors, null, 2));
      }
      expect(valid).toBe(true);
    });
  });

  describe("invalid manifests", () => {
    it("should reject invalid AIM version", () => {
      const manifest = loadYaml("invalid-aim-version.aim.yaml");
      const valid = validate(manifest);
      expect(valid).toBe(false);
      const errors = (validate as any).errors;
      expect(errors.some((e: any) => e.instancePath === "/aim")).toBe(true);
    });

    it("should reject missing required fields (version, description)", () => {
      const manifest = loadYaml("invalid-missing-required.aim.yaml");
      const valid = validate(manifest);
      expect(valid).toBe(false);
      const errors = (validate as any).errors;
      const missingFields = errors
        .filter((e: any) => e.keyword === "required")
        .map((e: any) => e.params.missingProperty);
      expect(missingFields).toContain("version");
      expect(missingFields).toContain("description");
    });

    it("should reject invalid semver", () => {
      const manifest = loadYaml("invalid-bad-semver.aim.yaml");
      const valid = validate(manifest);
      expect(valid).toBe(false);
      const errors = (validate as any).errors;
      expect(errors.some((e: any) => e.instancePath === "/metadata/version")).toBe(true);
    });

    it("should reject non-kebab-case name", () => {
      const manifest = loadYaml("invalid-bad-name.aim.yaml");
      const valid = validate(manifest);
      expect(valid).toBe(false);
      const errors = (validate as any).errors;
      expect(errors.some((e: any) => e.instancePath === "/metadata/name")).toBe(true);
    });
  });

  describe("individual field validation", () => {
    it("should reject unknown top-level properties", () => {
      const manifest = {
        aim: "1.0",
        metadata: { name: "test", version: "1.0.0", description: "test" },
        unknown_field: "should fail",
      };
      const valid = validate(manifest);
      expect(valid).toBe(false);
    });

    it("should accept all valid governance actions", () => {
      const validActions = ["block", "warn", "require_approval", "escalate", "transform", "log", "retry"];
      for (const action of validActions) {
        const manifest = {
          aim: "1.0",
          metadata: { name: "test", version: "1.0.0", description: "test" },
          governance: {
            rules: [{
              name: "test-rule",
              action,
              severity: "error",
            }],
          },
        };
        const valid = validate(manifest);
        expect(valid).toBe(true);
      }
    });

    it("should reject invalid governance action", () => {
      const manifest = {
        aim: "1.0",
        metadata: { name: "test", version: "1.0.0", description: "test" },
        governance: {
          rules: [{
            name: "test-rule",
            action: "invalid-action",
            severity: "error",
          }],
        },
      };
      const valid = validate(manifest);
      expect(valid).toBe(false);
    });

    it("should accept all valid severity levels", () => {
      const validSeverities = ["info", "warning", "error", "critical"];
      for (const severity of validSeverities) {
        const manifest = {
          aim: "1.0",
          metadata: { name: "test", version: "1.0.0", description: "test" },
          governance: {
            rules: [{
              name: "test-rule",
              action: "warn",
              severity,
            }],
          },
        };
        const valid = validate(manifest);
        expect(valid).toBe(true);
      }
    });

    it("should accept all valid enforcement types", () => {
      const validTypes = ["static", "semantic", "injected"];
      for (const enforcement of validTypes) {
        const manifest = {
          aim: "1.0",
          metadata: { name: "test", version: "1.0.0", description: "test" },
          governance: {
            rules: [{
              name: "test-rule",
              action: "warn",
              severity: "warning",
              enforcement,
            }],
          },
        };
        const valid = validate(manifest);
        expect(valid).toBe(true);
      }
    });

    it("should accept layered enforcement (primary + fallback)", () => {
      const manifest = {
        aim: "1.0",
        metadata: { name: "test", version: "1.0.0", description: "test" },
        governance: {
          rules: [{
            name: "test-rule",
            action: "block",
            severity: "critical",
            enforcement: {
              primary: "static",
              fallback: "semantic",
            },
          }],
        },
      };
      const valid = validate(manifest);
      expect(valid).toBe(true);
    });

    it("should accept all valid composition strategies", () => {
      const strategies = ["most_restrictive", "last_wins", "priority_weighted", "strict_fail"];
      for (const strategy of strategies) {
        const manifest = {
          aim: "1.0",
          metadata: { name: "test", version: "1.0.0", description: "test" },
          composition: { strategy },
        };
        const valid = validate(manifest);
        expect(valid).toBe(true);
      }
    });

    it("should accept all valid dispatch types", () => {
      const dispatchTypes = ["mcp", "cli", "rest", "code", "agent"];
      for (const type of dispatchTypes) {
        const manifest = {
          aim: "1.0",
          metadata: { name: "test", version: "1.0.0", description: "test" },
          capabilities: [{
            name: "test-cap",
            index: "Test capability",
            dispatch: { type, config: {} },
          }],
        };
        const valid = validate(manifest);
        expect(valid).toBe(true);
      }
    });

    it("should accept all valid audit levels", () => {
      const levels = ["none", "summary", "detailed", "forensic"];
      for (const level of levels) {
        const manifest = {
          aim: "1.0",
          metadata: { name: "test", version: "1.0.0", description: "test" },
          governance: {
            audit: { level },
          },
        };
        const valid = validate(manifest);
        expect(valid).toBe(true);
      }
    });

    it("should accept quality gates with all code fields", () => {
      const manifest = {
        aim: "1.0",
        metadata: { name: "test", version: "1.0.0", description: "test" },
        governance: {
          quality_gates: {
            code: {
              test_coverage_minimum: 80,
              require_types: "strict",
              max_complexity: 10,
              max_file_length: 400,
              require_error_handling: true,
              require_logging: "structured",
              require_input_validation: true,
              forbidden_patterns: ["console\\.log"],
              required_patterns: ["logger\\."],
            },
          },
        },
      };
      const valid = validate(manifest);
      expect(valid).toBe(true);
    });
  });

  describe("detection modes", () => {
    function makeManifestWithDetect(detect: Record<string, unknown>) {
      return {
        aim: "1.0",
        metadata: { name: "test", version: "1.0.0", description: "test" },
        governance: {
          rules: [{
            name: "test-rule",
            action: "block",
            severity: "error",
            enforcement: "static",
            detect,
          }],
        },
      };
    }

    it("should accept pattern detection", () => {
      const manifest = makeManifestWithDetect({
        type: "pattern",
        match: "console\\.log",
        scope: "output",
        file_types: ["ts", "js"],
      });
      expect(validate(manifest)).toBe(true);
    });

    it("should accept tool detection", () => {
      const manifest = makeManifestWithDetect({
        type: "tool",
        command: "semgrep --config=p/secrets {{file}}",
        exit_code_fail: "non-zero",
        timeout: "PT30S",
        install: "pip install semgrep",
      });
      expect(validate(manifest)).toBe(true);
    });

    it("should accept semantic detection", () => {
      const manifest = makeManifestWithDetect({
        type: "semantic",
        criteria: "Check for clean architecture violations",
        model: "fast",
        threshold: 0.8,
        examples: [
          { input: "import { db } from './infra'", verdict: "fail", reason: "Direct infra import" },
          { input: "constructor(private repo: Repo) {}", verdict: "pass", reason: "Uses DI" },
        ],
      });
      expect(validate(manifest)).toBe(true);
    });

    it("should accept composite detection", () => {
      const manifest = makeManifestWithDetect({
        type: "composite",
        strategy: "weighted",
        checks: [
          { type: "pattern", match: "eval\\(", weight: 0.5 },
          { type: "semantic", criteria: "Check for code injection", weight: 0.5 },
        ],
        threshold: 0.6,
      });
      expect(validate(manifest)).toBe(true);
    });
  });

  describe("capabilities", () => {
    it("should require name and index for capabilities", () => {
      const manifest = {
        aim: "1.0",
        metadata: { name: "test", version: "1.0.0", description: "test" },
        capabilities: [{ tags: ["test"] }],
      };
      const valid = validate(manifest);
      expect(valid).toBe(false);
    });

    it("should enforce index max length of 100 chars", () => {
      const manifest = {
        aim: "1.0",
        metadata: { name: "test", version: "1.0.0", description: "test" },
        capabilities: [{
          name: "test-cap",
          index: "x".repeat(101),
        }],
      };
      const valid = validate(manifest);
      expect(valid).toBe(false);
    });

    it("should accept capability with full tier 1-3 config", () => {
      const manifest = {
        aim: "1.0",
        metadata: { name: "test", version: "1.0.0", description: "test" },
        capabilities: [{
          name: "full-cap",
          tags: ["test"],
          index: "A fully configured capability",
          schema: {
            inputs: { query: { type: "string", required: true } },
            outputs: { result: { type: "string" } },
            preconditions: ["Auth required"],
            side_effects: ["Modifies database"],
            idempotent: false,
            timeout: "PT30S",
            rate_limit: "10/minute",
          },
          instructions: "Use this capability for database queries",
          examples: [{ description: "Basic query", input: { query: "SELECT 1" } }],
          anti_patterns: [{ description: "Never use SELECT *" }],
          dispatch: { type: "cli", config: { command: "psql -c '{{query}}'" } },
          constraints: [
            { when: "environment == 'production'", rule: "Read-only", enforcement: "static" },
          ],
          requires: ["auth-service"],
          retry: { max_attempts: 3, backoff: "exponential", delay: "PT5S" },
        }],
      };
      const valid = validate(manifest);
      if (!valid) {
        console.error("Errors:", JSON.stringify((validate as any).errors, null, 2));
      }
      expect(valid).toBe(true);
    });
  });

  describe("transforms", () => {
    it("should accept all transform types", () => {
      const types = ["remove_match", "replace", "inject", "rewrite"];
      for (const type of types) {
        const manifest = {
          aim: "1.0",
          metadata: { name: "test", version: "1.0.0", description: "test" },
          governance: {
            transforms: [{
              name: "test-transform",
              transform: { type },
            }],
          },
        };
        const valid = validate(manifest);
        expect(valid).toBe(true);
      }
    });

    it("should accept inject transform with position and template", () => {
      const manifest = {
        aim: "1.0",
        metadata: { name: "test", version: "1.0.0", description: "test" },
        governance: {
          transforms: [{
            name: "add-header",
            when: "file.is_new == true",
            transform: {
              type: "inject",
              position: "top",
              template: "// Generated by AIM",
              scope: "output",
            },
          }],
        },
      };
      const valid = validate(manifest);
      expect(valid).toBe(true);
    });
  });

  describe("lifecycle hooks", () => {
    it("should accept all lifecycle events", () => {
      const manifest = {
        aim: "1.0",
        metadata: { name: "test", version: "1.0.0", description: "test" },
        lifecycle: {
          on_init: [{ action: "log", config: { message: "init" } }],
          on_capability_load: [{ action: "log", config: {} }],
          on_governance_trigger: [{ action: "webhook", config: { url: "https://example.com" } }],
          on_error: [{ action: "notify", config: { channel: "#alerts" } }],
          on_complete: [{ action: "log", config: {} }],
          on_escalation: [{ action: "notify", config: {} }],
        },
      };
      const valid = validate(manifest);
      expect(valid).toBe(true);
    });
  });

  describe("dependencies and composition", () => {
    it("should accept dependencies with version ranges", () => {
      const manifest = {
        aim: "1.0",
        metadata: { name: "test", version: "1.0.0", description: "test" },
        dependencies: [
          { aim: "security-baseline", version: ">=1.0.0" },
          { aim: "hipaa-pack", version: "^2.0.0", registry: "https://registry.manifestaim.dev" },
        ],
      };
      const valid = validate(manifest);
      expect(valid).toBe(true);
    });

    it("should accept inherits array", () => {
      const manifest = {
        aim: "1.0",
        metadata: { name: "test", version: "1.0.0", description: "test" },
        inherits: ["base-standards", "team-frontend"],
      };
      const valid = validate(manifest);
      expect(valid).toBe(true);
    });
  });
});
