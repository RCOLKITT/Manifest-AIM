import { readFileSync, existsSync } from "node:fs";
import { resolve, extname, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import yaml from "js-yaml";
import chalk from "chalk";

const require = createRequire(import.meta.url);
const Ajv = require("ajv").default || require("ajv");
const addFormats = require("ajv-formats").default || require("ajv-formats");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, "..", "..", "..", "schemas", "aim-v1.0.schema.json");

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  manifest: Record<string, unknown> | null;
}

interface ValidationError {
  path: string;
  message: string;
  keyword: string;
}

interface ValidationWarning {
  path: string;
  message: string;
}

function loadManifest(filePath: string): Record<string, unknown> {
  const ext = extname(filePath).toLowerCase();
  const content = readFileSync(filePath, "utf-8");

  if (ext === ".yaml" || ext === ".yml") {
    return yaml.load(content) as Record<string, unknown>;
  } else if (ext === ".json") {
    return JSON.parse(content);
  }

  // Try YAML first, fall back to JSON
  try {
    return yaml.load(content) as Record<string, unknown>;
  } catch {
    return JSON.parse(content);
  }
}

function loadSchema(): Record<string, unknown> {
  const content = readFileSync(SCHEMA_PATH, "utf-8");
  return JSON.parse(content);
}

function runSemanticChecks(
  manifest: Record<string, unknown>,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Check: governance rules with 'block' action should have enforcement
  const governance = manifest.governance as
    | Record<string, unknown>
    | undefined;
  if (governance?.rules && Array.isArray(governance.rules)) {
    for (const rule of governance.rules as Record<string, unknown>[]) {
      // Block actions without enforcement mechanism
      if (rule.action === "block" && !rule.enforcement && !rule.detect) {
        warnings.push({
          path: `governance.rules[${rule.name}]`,
          message: `Rule "${rule.name}" has action 'block' but no enforcement or detect config. It will only work as injected enforcement.`,
        });
      }

      // Semantic enforcement without threshold
      if (rule.enforcement === "semantic") {
        const detect = rule.detect as Record<string, unknown> | undefined;
        if (detect?.type === "semantic" && !detect.threshold) {
          warnings.push({
            path: `governance.rules[${rule.name}].detect`,
            message: `Semantic detection for "${rule.name}" has no threshold. Default 0.8 will be used.`,
          });
        }
      }

      // Critical severity with non-blocking action
      if (
        rule.severity === "critical" &&
        rule.action !== "block" &&
        rule.action !== "escalate"
      ) {
        warnings.push({
          path: `governance.rules[${rule.name}]`,
          message: `Rule "${rule.name}" has critical severity but action is "${rule.action}". Consider using 'block' or 'escalate' for critical rules.`,
        });
      }
    }
  }

  // Check: capabilities with dispatch but no schema
  const capabilities = manifest.capabilities as
    | Record<string, unknown>[]
    | undefined;
  if (capabilities) {
    for (const cap of capabilities) {
      if (cap.dispatch && !cap.schema) {
        warnings.push({
          path: `capabilities[${cap.name}]`,
          message: `Capability "${cap.name}" has dispatch config but no schema. Tier 1 will have no typed interface.`,
        });
      }
    }
  }

  // Check: compliance context without audit enabled
  const context = manifest.context as Record<string, unknown> | undefined;
  if (context?.compliance && Array.isArray(context.compliance)) {
    const audit = governance?.audit as Record<string, unknown> | undefined;
    if (!audit?.enabled) {
      warnings.push({
        path: "governance.audit",
        message: `Manifest declares compliance context (${(context.compliance as string[]).join(", ")}) but audit is not enabled. Compliance frameworks typically require audit trails.`,
      });
    }
  }

  return warnings;
}

export async function validateCommand(
  file: string,
  options: { strict?: boolean; schema?: string },
): Promise<void> {
  const filePath = resolve(file);

  // Check file exists
  if (!existsSync(filePath)) {
    console.error(
      chalk.red(`\n  ✗ File not found: ${filePath}\n`),
    );
    console.error(
      chalk.dim(`  Run ${chalk.white("manifest init")} to create an aim.yaml\n`),
    );
    process.exit(1);
  }

  console.log(
    chalk.dim(`\n  Validating ${chalk.white(file)} against AIM v1.0 schema...\n`),
  );

  // Load manifest
  let manifest: Record<string, unknown>;
  try {
    manifest = loadManifest(filePath);
  } catch (err) {
    console.error(
      chalk.red(`  ✗ Failed to parse ${file}: ${(err as Error).message}\n`),
    );
    process.exit(1);
  }

  // Load schema
  let schema: Record<string, unknown>;
  try {
    if (options.schema) {
      schema = JSON.parse(readFileSync(resolve(options.schema), "utf-8"));
    } else {
      schema = loadSchema();
    }
  } catch (err) {
    console.error(
      chalk.red(
        `  ✗ Failed to load schema: ${(err as Error).message}\n`,
      ),
    );
    process.exit(1);
  }

  // Validate against JSON Schema
  const ajv = new Ajv({ allErrors: true, verbose: true });
  addFormats(ajv);

  const validate = ajv.compile(schema);
  const valid = validate(manifest);

  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!valid && validate.errors) {
    for (const err of validate.errors) {
      errors.push({
        path: err.instancePath || "/",
        message: err.message || "Unknown validation error",
        keyword: err.keyword,
      });
    }
  }

  // Run semantic checks (warnings)
  if (manifest) {
    warnings.push(...runSemanticChecks(manifest));
  }

  // Output results
  const metadata = manifest?.metadata as Record<string, unknown> | undefined;
  const name = metadata?.name || "unknown";
  const version = metadata?.version || "0.0.0";

  if (errors.length === 0) {
    console.log(
      chalk.green(`  ✓ ${chalk.white(`${name}@${version}`)} is valid AIM v1.0\n`),
    );

    // Show summary
    const governance = manifest?.governance as Record<string, unknown> | undefined;
    const rules = governance?.rules as unknown[] | undefined;
    const caps = manifest?.capabilities as unknown[] | undefined;
    const knowledge = manifest?.knowledge as unknown[] | undefined;

    console.log(chalk.dim("  Summary:"));
    if (caps) console.log(chalk.dim(`    Capabilities: ${caps.length}`));
    if (rules) console.log(chalk.dim(`    Governance rules: ${rules.length}`));
    if (knowledge) console.log(chalk.dim(`    Knowledge units: ${knowledge.length}`));

    // Estimate Tier 0 token cost
    if (caps) {
      const tier0Tokens = caps.length * 5;
      console.log(
        chalk.dim(`    Estimated Tier 0 cost: ~${tier0Tokens} tokens`),
      );
    }
    console.log();
  } else {
    console.log(
      chalk.red(`  ✗ ${errors.length} error(s) found in ${name}@${version}\n`),
    );

    for (const err of errors) {
      console.log(
        chalk.red(`    ✗ ${chalk.white(err.path)} — ${err.message}`),
      );
      console.log(chalk.dim(`      (${err.keyword})\n`));
    }
  }

  // Show warnings
  if (warnings.length > 0) {
    console.log(
      chalk.yellow(`  ⚠ ${warnings.length} warning(s):\n`),
    );
    for (const warn of warnings) {
      console.log(
        chalk.yellow(`    ⚠ ${chalk.white(warn.path)} — ${warn.message}`),
      );
    }
    console.log();
  }

  // Exit code
  if (errors.length > 0) {
    process.exit(1);
  }
  if (options.strict && warnings.length > 0) {
    process.exit(1);
  }
}
