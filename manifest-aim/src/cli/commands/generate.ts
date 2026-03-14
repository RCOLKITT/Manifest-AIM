/**
 * manifest generate — auto-generate an AIM manifest from codebase analysis.
 *
 * Scans the project to detect:
 * - Language/framework (TypeScript, Python, React, etc.)
 * - Package manager and dependencies
 * - Existing linters/formatters (ESLint, Prettier, Ruff, etc.)
 * - Test framework
 * - CI/CD configuration
 *
 * Then generates an aim.yaml with appropriate rules, knowledge, and quality gates.
 */

import { resolve, join, basename } from "node:path";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import chalk from "chalk";
import yaml from "js-yaml";

interface ProjectProfile {
  name: string;
  languages: string[];
  frameworks: string[];
  packageManager: string | null;
  testFramework: string | null;
  linters: string[];
  hasTypeScript: boolean;
  hasCi: boolean;
  hasDocker: boolean;
  domain: string;
}

function detectProject(projectPath: string): ProjectProfile {
  const dir = resolve(projectPath);
  const files = new Set<string>();

  // Collect top-level files
  try {
    for (const entry of readdirSync(dir)) {
      files.add(entry.toLowerCase());
    }
  } catch {
    // If we can't read the dir, work with empty
  }

  const profile: ProjectProfile = {
    name: basename(dir).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    languages: [],
    frameworks: [],
    packageManager: null,
    testFramework: null,
    linters: [],
    hasTypeScript: false,
    hasCi: false,
    hasDocker: false,
    domain: "software-engineering",
  };

  // Detect package manager
  if (files.has("package.json")) {
    profile.packageManager = files.has("pnpm-lock.yaml")
      ? "pnpm"
      : files.has("yarn.lock")
        ? "yarn"
        : "npm";
    profile.languages.push("javascript");

    // Parse package.json for frameworks
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
      const allDeps = {
        ...((pkg.dependencies ?? {}) as Record<string, string>),
        ...((pkg.devDependencies ?? {}) as Record<string, string>),
      };

      if (allDeps.react) profile.frameworks.push("react");
      if (allDeps.next) profile.frameworks.push("nextjs");
      if (allDeps.vue) profile.frameworks.push("vue");
      if (allDeps.svelte) profile.frameworks.push("svelte");
      if (allDeps.express) profile.frameworks.push("express");
      if (allDeps.fastify) profile.frameworks.push("fastify");
      if (allDeps.nestjs || allDeps["@nestjs/core"]) profile.frameworks.push("nestjs");

      // Test framework
      if (allDeps.vitest) profile.testFramework = "vitest";
      else if (allDeps.jest) profile.testFramework = "jest";
      else if (allDeps.mocha) profile.testFramework = "mocha";
      else if (allDeps.playwright || allDeps["@playwright/test"]) profile.testFramework = "playwright";

      // Linters
      if (allDeps.eslint) profile.linters.push("eslint");
      if (allDeps.prettier) profile.linters.push("prettier");
      if (allDeps.biome || allDeps["@biomejs/biome"]) profile.linters.push("biome");

      // TypeScript
      if (allDeps.typescript) profile.hasTypeScript = true;
    } catch {
      // Ignore parse errors
    }
  }

  if (files.has("tsconfig.json")) {
    profile.hasTypeScript = true;
    if (!profile.languages.includes("typescript")) {
      profile.languages.push("typescript");
    }
  }

  // Python
  if (files.has("pyproject.toml") || files.has("setup.py") || files.has("requirements.txt")) {
    profile.languages.push("python");
    profile.packageManager = profile.packageManager ?? "pip";

    // Detect Python frameworks/tools
    try {
      const content = files.has("pyproject.toml")
        ? readFileSync(join(dir, "pyproject.toml"), "utf-8")
        : files.has("requirements.txt")
          ? readFileSync(join(dir, "requirements.txt"), "utf-8")
          : "";

      if (content.includes("fastapi")) profile.frameworks.push("fastapi");
      if (content.includes("django")) profile.frameworks.push("django");
      if (content.includes("flask")) profile.frameworks.push("flask");
      if (content.includes("pytest")) profile.testFramework = profile.testFramework ?? "pytest";
      if (content.includes("ruff")) profile.linters.push("ruff");
      if (content.includes("mypy")) profile.linters.push("mypy");
      if (content.includes("black")) profile.linters.push("black");
    } catch {
      // Ignore
    }
  }

  // Go
  if (files.has("go.mod")) {
    profile.languages.push("go");
    profile.packageManager = profile.packageManager ?? "go modules";
  }

  // Rust
  if (files.has("cargo.toml")) {
    profile.languages.push("rust");
    profile.packageManager = profile.packageManager ?? "cargo";
  }

  // CI/CD
  if (existsSync(join(dir, ".github", "workflows"))) profile.hasCi = true;
  if (files.has(".gitlab-ci.yml")) profile.hasCi = true;
  if (files.has("jenkinsfile")) profile.hasCi = true;

  // Docker
  if (files.has("dockerfile") || files.has("docker-compose.yml") || files.has("docker-compose.yaml")) {
    profile.hasDocker = true;
  }

  // Determine domain
  if (profile.frameworks.some((f) => ["react", "vue", "svelte", "nextjs"].includes(f))) {
    profile.domain = "frontend-engineering";
  } else if (profile.frameworks.some((f) => ["express", "fastify", "nestjs", "fastapi", "django", "flask"].includes(f))) {
    profile.domain = "backend-engineering";
  }

  return profile;
}

function generateManifest(profile: ProjectProfile): Record<string, unknown> {
  const rules: Array<Record<string, unknown>> = [];
  const knowledge: Array<Record<string, unknown>> = [];

  // ── Security rules (always) ──
  rules.push({
    name: "no-eval",
    description: "Prevent dynamic code execution",
    category: "security",
    enforcement: "static",
    detect: { type: "pattern", match: "\\beval\\s*\\(" },
    action: "block",
    severity: "critical",
    message: "eval() is forbidden — arbitrary code execution risk.",
  });

  rules.push({
    name: "no-hardcoded-secrets",
    description: "Prevent hardcoded secrets",
    category: "security",
    enforcement: "static",
    detect: {
      type: "pattern",
      match: "(api_key|secret|password|token|private_key)\\s*[=:]\\s*['\"][^'\"]{8,}['\"]",
    },
    action: "block",
    severity: "critical",
    message: "Hardcoded secrets detected.",
    fix_hint: "Use environment variables or a secrets manager",
  });

  // ── TypeScript-specific ──
  if (profile.hasTypeScript) {
    rules.push({
      name: "no-any-type",
      description: "Prevent use of 'any' type",
      category: "quality",
      enforcement: "static",
      detect: { type: "pattern", match: ":\\s*any\\b", file_types: ["ts", "tsx"] },
      action: "warn",
      severity: "warning",
      message: "Avoid 'any' type — use specific types or 'unknown'.",
    });

    rules.push({
      name: "no-ts-ignore",
      description: "Prevent @ts-ignore comments",
      category: "quality",
      enforcement: "static",
      detect: { type: "pattern", match: "@ts-ignore", file_types: ["ts", "tsx"] },
      action: "warn",
      severity: "warning",
      message: "Use @ts-expect-error with explanation instead of @ts-ignore.",
    });
  }

  // ── React-specific ──
  if (profile.frameworks.includes("react")) {
    rules.push({
      name: "no-direct-dom",
      description: "Prevent direct DOM manipulation",
      category: "quality",
      enforcement: "static",
      detect: {
        type: "pattern",
        match: "document\\.(getElementById|querySelector|createElement)",
        file_types: ["ts", "tsx", "js", "jsx"],
      },
      action: "block",
      severity: "error",
      message: "Direct DOM manipulation bypasses React's virtual DOM.",
      fix_hint: "Use useRef() for DOM access",
    });

    knowledge.push({
      name: "react-patterns",
      trigger: "creating components, hooks, or React features",
      priority: 100,
      content: [
        "## React Patterns",
        "1. Use functional components exclusively",
        "2. Prefer named exports over default exports",
        "3. Destructure props in function signature",
        "4. Keep components under 150 lines",
        "5. Extract custom hooks for reusable logic",
      ].join("\n"),
    });
  }

  // ── Python-specific ──
  if (profile.languages.includes("python")) {
    rules.push({
      name: "no-bare-except",
      description: "Prevent bare except clauses",
      category: "quality",
      enforcement: "static",
      detect: { type: "pattern", match: "except\\s*:", file_types: ["py"] },
      action: "block",
      severity: "error",
      message: "Bare except catches SystemExit and KeyboardInterrupt.",
      fix_hint: "Use 'except Exception:' or catch specific exception types",
    });

    rules.push({
      name: "no-print-in-production",
      description: "Prevent print() in production code",
      category: "quality",
      enforcement: "static",
      when: "environment == 'production'",
      detect: { type: "pattern", match: "\\bprint\\s*\\(", file_types: ["py"] },
      action: "warn",
      severity: "warning",
      message: "Use logging module instead of print() in production.",
    });
  }

  // ── Console/debug ──
  rules.push({
    name: "no-console-in-production",
    description: "Prevent console.log in production",
    category: "quality",
    enforcement: "static",
    when: "environment == 'production'",
    detect: { type: "pattern", match: "console\\.(log|debug)\\(" },
    action: "warn",
    severity: "warning",
    message: "Remove console.log before production.",
  });

  // ── Linter integration ──
  for (const linter of profile.linters) {
    rules.push({
      name: `run-${linter}`,
      description: `Enforce ${linter} compliance`,
      category: "quality",
      enforcement: "static",
      detect: {
        type: "tool",
        command: linter === "eslint"
          ? "npx eslint {{file}} --format json"
          : linter === "ruff"
            ? "ruff check {{file}} --output-format json"
            : linter === "biome"
              ? "npx biome check {{file}} --reporter json"
              : `${linter} {{file}}`,
        success_codes: [0],
      },
      action: "warn",
      severity: "warning",
      message: `${linter} check failed.`,
    });
  }

  // ── Coding guidelines (injected) ──
  const guidelines: string[] = [
    "Follow these coding standards:",
    "1. Write self-documenting code with clear naming",
    "2. Handle errors explicitly — never swallow exceptions",
    "3. Keep functions under 50 lines and classes under 300 lines",
    "4. Write tests for all business logic",
    "5. Use dependency injection over hard-coded dependencies",
  ];

  if (profile.hasTypeScript) {
    guidelines.push("6. Use strict TypeScript — no 'any' types");
    guidelines.push("7. Prefer interfaces over type aliases for object shapes");
  }

  rules.push({
    name: "coding-standards",
    enforcement: "injected",
    action: "log",
    instruction: guidelines.join("\n"),
    severity: "info",
  });

  // ── Quality gates ──
  const qualityGates: Record<string, unknown> = {
    code: {
      test_coverage_minimum: 80,
      max_complexity: 15,
      max_file_length: 400,
      require_error_handling: true,
      ...(profile.hasTypeScript ? { require_types: "strict" } : {}),
    },
  };

  // ── Build manifest ──
  const manifest: Record<string, unknown> = {
    aim: "1.0",
    metadata: {
      name: profile.name,
      version: "1.0.0",
      description: `Auto-generated AIM manifest for ${profile.name}`,
      tags: [
        ...profile.languages,
        ...profile.frameworks,
        profile.domain,
      ].filter(Boolean),
    },
    context: {
      persona: `Engineer working on the ${profile.name} codebase`,
      domain: profile.domain,
      environment: "development",
    },
    governance: {
      rules,
      quality_gates: qualityGates,
    },
  };

  if (knowledge.length > 0) {
    manifest.knowledge = knowledge;
  }

  return manifest;
}

export function generateCommand(
  options: { path?: string; output?: string; force?: boolean },
): void {
  const projectPath = resolve(options.path ?? ".");
  const outputPath = resolve(options.output ?? "aim.yaml");

  // Check if aim.yaml already exists
  if (existsSync(outputPath) && !options.force) {
    console.error(chalk.yellow(`\n  ⚠ ${outputPath} already exists.`));
    console.error(chalk.dim(`  Use --force to overwrite.\n`));
    process.exit(1);
  }

  console.log(chalk.dim(`\n  Analyzing ${chalk.white(projectPath)}...\n`));

  // Detect project
  const profile = detectProject(projectPath);

  console.log(chalk.white.bold("  Project Profile"));
  console.log(chalk.dim(`    Name: ${profile.name}`));
  console.log(chalk.dim(`    Languages: ${profile.languages.join(", ") || "unknown"}`));
  console.log(chalk.dim(`    Frameworks: ${profile.frameworks.join(", ") || "none detected"}`));
  console.log(chalk.dim(`    Package manager: ${profile.packageManager ?? "unknown"}`));
  console.log(chalk.dim(`    Test framework: ${profile.testFramework ?? "none detected"}`));
  console.log(chalk.dim(`    Linters: ${profile.linters.join(", ") || "none detected"}`));
  console.log(chalk.dim(`    TypeScript: ${profile.hasTypeScript ? "yes" : "no"}`));
  console.log(chalk.dim(`    CI/CD: ${profile.hasCi ? "yes" : "no"}`));
  console.log(chalk.dim(`    Docker: ${profile.hasDocker ? "yes" : "no"}`));
  console.log(chalk.dim(`    Domain: ${profile.domain}`));
  console.log();

  // Generate manifest
  const manifest = generateManifest(profile);
  const output = yaml.dump(manifest, { lineWidth: 120, noRefs: true });

  // Write
  writeFileSync(outputPath, output, "utf-8");

  const ruleCount = ((manifest.governance as Record<string, unknown>).rules as unknown[]).length;
  const knowledgeCount = ((manifest.knowledge as unknown[]) ?? []).length;

  console.log(chalk.green.bold(`  ✓ Generated ${outputPath}`));
  console.log(chalk.dim(`    ${ruleCount} rules, ${knowledgeCount} knowledge units`));
  console.log(chalk.dim(`\n  Next steps:`));
  console.log(chalk.dim(`    1. Review and customize the generated manifest`));
  console.log(chalk.dim(`    2. Run ${chalk.white("manifest validate")} to check`));
  console.log(chalk.dim(`    3. Run ${chalk.white("manifest wrap claude-code")} to activate\n`));
}
