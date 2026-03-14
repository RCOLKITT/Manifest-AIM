import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import chalk from "chalk";
import { analyzeProject, summarizeAnalysis } from "../../services/project-analyzer.js";
import { generateAIM } from "../../services/aim-generator.js";

const STARTER_MANIFEST = `aim: "1.0"

metadata:
  name: ${"%PROJECT_NAME%"}
  version: 0.1.0
  description: "AIM manifest for ${"%PROJECT_NAME%"}"
  authors: []
  tags: []

context:
  domain: software-engineering
  environment: development

governance:
  rules:
    - name: no-hardcoded-secrets
      description: "Detect hardcoded API keys, passwords, and secrets"
      category: security
      enforcement: static
      detect:
        type: pattern
        match: "(api_key|secret|password|token)\\\\s*[=:]\\\\s*['\\\"][^'\\\"]{8,}['\\\"]"
        scope: output
      action: block
      severity: critical
      message: "Hardcoded secrets detected. Use environment variables."

    - name: require-error-handling
      description: "Catch blocks must handle errors meaningfully"
      category: quality
      enforcement: static
      detect:
        type: pattern
        match: "catch\\\\s*\\\\([^)]*\\\\)\\\\s*\\\\{\\\\s*\\\\}"
      action: warn
      severity: warning
      message: "Empty catch block detected. Log or handle the error."

  quality_gates:
    code:
      require_error_handling: true
      require_types: true

  audit:
    enabled: true
    level: summary
    format: json

knowledge:
  - name: project-standards
    trigger: "starting any new task"
    content: |
      Follow project coding standards:
      - Use descriptive variable and function names
      - Write tests for all new functionality
      - Handle errors explicitly — never silently swallow them
      - Document public interfaces
`;

export async function initCommand(options: {
  template?: string;
  force?: boolean;
  smart?: boolean;
  strictness?: "standard" | "strict" | "paranoid";
  compliance?: string[];
}): Promise<void> {
  const targetPath = resolve("aim.yaml");
  const aimDir = resolve(".aim");
  const projectPath = resolve(".");

  // Check if file already exists
  if (existsSync(targetPath) && !options.force) {
    console.error(
      chalk.red(
        `\n  ✗ aim.yaml already exists. Use ${chalk.white("--force")} to overwrite.\n`,
      ),
    );
    process.exit(1);
  }

  // Detect project name from directory, sanitize to kebab-case
  const rawName = basename(resolve("."));
  const projectName = rawName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")   // Replace invalid chars with hyphens
    .replace(/-+/g, "-")            // Collapse multiple hyphens
    .replace(/^-|-$/g, "")          // Trim leading/trailing hyphens
    || "my-project";                // Fallback if empty

  // Generate manifest content
  let content: string;
  let usedSmartAnalysis = false;

  // Use smart analysis unless explicitly disabled or using a template
  if (!options.template && options.smart !== false) {
    console.log(chalk.dim("\n  Analyzing project..."));

    try {
      const analysis = await analyzeProject(projectPath);

      // Check if we detected anything meaningful
      if (analysis.stacks.length > 0 || analysis.language !== "unknown") {
        content = generateAIM(analysis, {
          strictness: options.strictness || "standard",
          compliance: options.compliance || [],
          includeKnowledge: true,
        });
        usedSmartAnalysis = true;

        console.log(chalk.green("  ✓ Project analyzed successfully\n"));
        console.log(chalk.dim(`    ${summarizeAnalysis(analysis).split("\n").slice(0, 5).join("\n    ")}`));
        console.log();
      } else {
        console.log(chalk.dim("  No project manifest detected, using starter template\n"));
        content = STARTER_MANIFEST.replace(/%PROJECT_NAME%/g, projectName);
      }
    } catch (error) {
      console.log(chalk.dim("  Analysis failed, using starter template\n"));
      content = STARTER_MANIFEST.replace(/%PROJECT_NAME%/g, projectName);
    }
  } else if (options.template) {
    // TODO: Load from reference manifests or registry
    console.log(
      chalk.yellow(
        `\n  ⚠ Template "${options.template}" — registry templates coming in v0.4.0`,
      ),
    );
    console.log(chalk.dim("  Using default starter template.\n"));
    content = STARTER_MANIFEST.replace(/%PROJECT_NAME%/g, projectName);
  } else {
    content = STARTER_MANIFEST.replace(/%PROJECT_NAME%/g, projectName);
  }

  // Write manifest
  writeFileSync(targetPath, content, "utf-8");

  // Create .aim directory
  if (!existsSync(aimDir)) {
    mkdirSync(aimDir, { recursive: true });
  }

  console.log(chalk.green(`  ✓ Created ${chalk.white("aim.yaml")}\n`));

  if (usedSmartAnalysis) {
    console.log(chalk.dim("  Generated from your project:"));
    console.log(chalk.dim("    • Security rules based on detected tech stack"));
    console.log(chalk.dim("    • Quality rules matching your strictness level"));
    console.log(chalk.dim("    • Knowledge units from build/test configuration\n"));
  }

  console.log(chalk.dim("  Next steps:"));
  console.log(
    chalk.dim(`    1. Review ${chalk.white("aim.yaml")} and customize for your team`),
  );
  console.log(
    chalk.dim(`    2. Run ${chalk.white("manifest validate")} to check your manifest`),
  );
  console.log(
    chalk.dim(
      `    3. Run ${chalk.white("manifest wrap .")} to inject governance into agent context`,
    ),
  );
  console.log();
}
