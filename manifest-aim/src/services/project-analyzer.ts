/**
 * Deep project analysis service.
 *
 * Reads real project files (package.json, Cargo.toml, go.mod, etc.)
 * and extracts meaningful context: actual build commands, real dependencies,
 * detected patterns, testing frameworks, linting tools, and more.
 *
 * Adapted from Rebar MCP for use in Manifest CLI.
 */
import * as path from "node:path";
import { readFileSafe, fileExists } from "./file-ops.js";

/** Supported tech stacks */
export type TechStack =
  | "nextjs"
  | "react"
  | "vue"
  | "angular"
  | "svelte"
  | "express"
  | "fastapi"
  | "django"
  | "flask"
  | "springboot"
  | "go"
  | "rust"
  | "dotnet";

export interface ProjectAnalysis {
  /** Detected project name */
  name: string;
  /** Detected tech stacks, ordered by confidence */
  stacks: TechStack[];
  /** Primary language */
  language: "typescript" | "javascript" | "python" | "java" | "go" | "rust" | "csharp" | "ruby" | "php" | "unknown";
  /** Actual build commands from project config */
  buildCommands: Record<string, string>;
  /** Actual test commands */
  testCommands: Record<string, string>;
  /** Detected linter/formatter */
  linter: string | null;
  formatter: string | null;
  /** Detected test framework */
  testFramework: string | null;
  /** Key dependencies (frameworks, ORMs, state managers, etc.) */
  keyDependencies: DependencyInfo[];
  /** Detected patterns */
  patterns: ProjectPattern[];
  /** Whether it's a monorepo */
  isMonorepo: boolean;
  /** Monorepo tool if detected */
  monorepoTool: string | null;
  /** Detected package manager */
  packageManager: "npm" | "yarn" | "pnpm" | "bun" | "pip" | "poetry" | "cargo" | "go" | "maven" | "gradle" | "unknown";
  /** Source directories that exist */
  sourceDirs: string[];
  /** Whether TypeScript is used */
  usesTypeScript: boolean;
  /** Detected database/ORM */
  database: string | null;
  /** Detected CSS framework */
  cssFramework: string | null;
  /** Detected API style */
  apiStyle: "rest" | "graphql" | "grpc" | "trpc" | null;
  /** Detected deployment target */
  deployTarget: string | null;
  /** Project description from manifest */
  description: string | null;
  /** Node.js engine requirement */
  nodeVersion: string | null;
  /** Has Docker */
  hasDocker: boolean;
  /** Has CI/CD */
  ciPlatform: string | null;
  /** Environment variables referenced (names only, never values) */
  envVarNames: string[];
}

export interface DependencyInfo {
  name: string;
  category: "framework" | "orm" | "testing" | "linting" | "styling" | "state" | "api" | "auth" | "monitoring" | "build" | "utility";
  description: string;
}

export interface ProjectPattern {
  name: string;
  description: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Performs deep analysis of a project directory.
 * This is the core intelligence that drives smart manifest generation.
 */
export async function analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
  const analysis: ProjectAnalysis = {
    name: path.basename(projectPath),
    stacks: [],
    language: "unknown",
    buildCommands: {},
    testCommands: {},
    linter: null,
    formatter: null,
    testFramework: null,
    keyDependencies: [],
    patterns: [],
    isMonorepo: false,
    monorepoTool: null,
    packageManager: "unknown",
    sourceDirs: [],
    usesTypeScript: false,
    database: null,
    cssFramework: null,
    apiStyle: null,
    deployTarget: null,
    description: null,
    nodeVersion: null,
    hasDocker: false,
    ciPlatform: null,
    envVarNames: [],
  };

  // Run all detections in parallel for speed
  await Promise.all([
    analyzeNodeProject(projectPath, analysis),
    analyzePythonProject(projectPath, analysis),
    analyzeGoProject(projectPath, analysis),
    analyzeRustProject(projectPath, analysis),
    analyzeJavaProject(projectPath, analysis),
    analyzeInfrastructure(projectPath, analysis),
    analyzeSourceDirs(projectPath, analysis),
    analyzeEnvVars(projectPath, analysis),
  ]);

  return analysis;
}

// ─── Node.js / JavaScript / TypeScript ──────────────────────────────

async function analyzeNodeProject(projectPath: string, analysis: ProjectAnalysis): Promise<void> {
  const pkgJsonStr = await readFileSafe(path.join(projectPath, "package.json"));
  if (!pkgJsonStr) return;

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(pkgJsonStr) as Record<string, unknown>;
  } catch {
    return;
  }

  // Name and description
  if (typeof pkg.name === "string") analysis.name = pkg.name;
  if (typeof pkg.description === "string") analysis.description = pkg.description;

  // Engine requirements
  if (pkg.engines && typeof pkg.engines === "object") {
    const engines = pkg.engines as Record<string, string>;
    if (engines.node) analysis.nodeVersion = engines.node;
  }

  // Package manager detection
  if (await fileExists(path.join(projectPath, "pnpm-lock.yaml"))) {
    analysis.packageManager = "pnpm";
  } else if (await fileExists(path.join(projectPath, "yarn.lock"))) {
    analysis.packageManager = "yarn";
  } else if (await fileExists(path.join(projectPath, "bun.lockb"))) {
    analysis.packageManager = "bun";
  } else {
    analysis.packageManager = "npm";
  }

  // Scripts — extract ACTUAL build/test/lint commands
  const scripts = (pkg.scripts || {}) as Record<string, string>;
  for (const [key, value] of Object.entries(scripts)) {
    if (["build", "compile", "bundle"].some((k) => key.includes(k))) {
      analysis.buildCommands[key] = value;
    }
    if (["test", "spec", "e2e", "cypress", "playwright"].some((k) => key.includes(k))) {
      analysis.testCommands[key] = value;
    }
  }

  // Collect all deps
  const allDeps = {
    ...(pkg.dependencies as Record<string, string> || {}),
    ...(pkg.devDependencies as Record<string, string> || {}),
  };
  const depNames = new Set(Object.keys(allDeps));

  // TypeScript
  analysis.usesTypeScript = depNames.has("typescript") ||
    await fileExists(path.join(projectPath, "tsconfig.json"));
  analysis.language = analysis.usesTypeScript ? "typescript" : "javascript";

  // ── Framework Detection (ordered by specificity) ──────────────

  // Next.js
  if (depNames.has("next")) {
    analysis.stacks.push("nextjs");
    analysis.keyDependencies.push({ name: "next", category: "framework", description: "React framework with SSR/SSG" });

    // Detect Next.js patterns
    if (await fileExists(path.join(projectPath, "app"))) {
      analysis.patterns.push({ name: "app-router", description: "Uses Next.js App Router (app/ directory)", confidence: "high" });
    } else if (await fileExists(path.join(projectPath, "pages"))) {
      analysis.patterns.push({ name: "pages-router", description: "Uses Next.js Pages Router (pages/ directory)", confidence: "high" });
    }
  }

  // React (standalone)
  if (depNames.has("react") && !depNames.has("next")) {
    analysis.stacks.push("react");
    analysis.keyDependencies.push({ name: "react", category: "framework", description: "UI component library" });
  }

  // Vue / Nuxt
  if (depNames.has("nuxt") || depNames.has("nuxt3")) {
    analysis.stacks.push("vue");
    analysis.keyDependencies.push({ name: "nuxt", category: "framework", description: "Vue meta-framework with SSR" });
  } else if (depNames.has("vue")) {
    analysis.stacks.push("vue");
    analysis.keyDependencies.push({ name: "vue", category: "framework", description: "Progressive JavaScript framework" });
  }

  // Angular
  if (depNames.has("@angular/core")) {
    analysis.stacks.push("angular");
    analysis.keyDependencies.push({ name: "@angular/core", category: "framework", description: "Enterprise web framework" });
  }

  // Svelte / SvelteKit
  if (depNames.has("@sveltejs/kit")) {
    analysis.stacks.push("svelte");
    analysis.keyDependencies.push({ name: "@sveltejs/kit", category: "framework", description: "Svelte meta-framework" });
  } else if (depNames.has("svelte")) {
    analysis.stacks.push("svelte");
    analysis.keyDependencies.push({ name: "svelte", category: "framework", description: "Compiled UI framework" });
  }

  // Express
  if (depNames.has("express")) {
    analysis.stacks.push("express");
    analysis.keyDependencies.push({ name: "express", category: "framework", description: "Node.js web framework" });
  }

  // Monorepo detection
  if (pkg.workspaces) {
    analysis.isMonorepo = true;
    if (depNames.has("turbo")) {
      analysis.monorepoTool = "Turborepo";
    } else if (depNames.has("nx")) {
      analysis.monorepoTool = "Nx";
    } else if (depNames.has("lerna")) {
      analysis.monorepoTool = "Lerna";
    } else {
      analysis.monorepoTool = "npm workspaces";
    }
  }

  // ── ORM / Database ────────────────────────────────────────────

  if (depNames.has("prisma") || depNames.has("@prisma/client")) {
    analysis.database = "Prisma";
    analysis.keyDependencies.push({ name: "prisma", category: "orm", description: "Type-safe ORM with auto-generated client" });
  } else if (depNames.has("drizzle-orm")) {
    analysis.database = "Drizzle";
    analysis.keyDependencies.push({ name: "drizzle-orm", category: "orm", description: "Lightweight TypeScript ORM" });
  } else if (depNames.has("typeorm")) {
    analysis.database = "TypeORM";
    analysis.keyDependencies.push({ name: "typeorm", category: "orm", description: "TypeScript ORM for SQL databases" });
  } else if (depNames.has("sequelize")) {
    analysis.database = "Sequelize";
    analysis.keyDependencies.push({ name: "sequelize", category: "orm", description: "Promise-based ORM" });
  } else if (depNames.has("mongoose")) {
    analysis.database = "Mongoose (MongoDB)";
    analysis.keyDependencies.push({ name: "mongoose", category: "orm", description: "MongoDB ODM" });
  } else if (depNames.has("knex")) {
    analysis.database = "Knex.js";
    analysis.keyDependencies.push({ name: "knex", category: "orm", description: "SQL query builder" });
  }

  // ── Testing ───────────────────────────────────────────────────

  if (depNames.has("vitest")) {
    analysis.testFramework = "Vitest";
    analysis.keyDependencies.push({ name: "vitest", category: "testing", description: "Vite-native testing framework" });
  } else if (depNames.has("jest")) {
    analysis.testFramework = "Jest";
    analysis.keyDependencies.push({ name: "jest", category: "testing", description: "JavaScript testing framework" });
  } else if (depNames.has("mocha")) {
    analysis.testFramework = "Mocha";
    analysis.keyDependencies.push({ name: "mocha", category: "testing", description: "Flexible test framework" });
  }
  if (depNames.has("@testing-library/react")) {
    analysis.keyDependencies.push({ name: "@testing-library/react", category: "testing", description: "React component testing utilities" });
  }
  if (depNames.has("playwright") || depNames.has("@playwright/test")) {
    analysis.keyDependencies.push({ name: "playwright", category: "testing", description: "End-to-end browser testing" });
  }
  if (depNames.has("cypress")) {
    analysis.keyDependencies.push({ name: "cypress", category: "testing", description: "End-to-end testing framework" });
  }

  // ── Linting / Formatting ──────────────────────────────────────

  if (depNames.has("@biomejs/biome") || depNames.has("biome")) {
    analysis.linter = "Biome";
    analysis.formatter = "Biome";
  } else {
    if (depNames.has("eslint")) {
      analysis.linter = "ESLint";
      analysis.keyDependencies.push({ name: "eslint", category: "linting", description: "JavaScript/TypeScript linter" });
    }
    if (depNames.has("prettier")) {
      analysis.formatter = "Prettier";
      analysis.keyDependencies.push({ name: "prettier", category: "linting", description: "Opinionated code formatter" });
    }
  }
  if (depNames.has("oxlint")) {
    analysis.linter = "oxlint";
  }

  // ── CSS / Styling ─────────────────────────────────────────────

  if (depNames.has("tailwindcss")) {
    analysis.cssFramework = "Tailwind CSS";
    analysis.keyDependencies.push({ name: "tailwindcss", category: "styling", description: "Utility-first CSS framework" });
  } else if (depNames.has("styled-components")) {
    analysis.cssFramework = "styled-components";
  } else if (depNames.has("@emotion/react")) {
    analysis.cssFramework = "Emotion";
  } else if (depNames.has("sass") || depNames.has("node-sass")) {
    analysis.cssFramework = "Sass";
  }

  // ── State Management ──────────────────────────────────────────

  if (depNames.has("zustand")) {
    analysis.keyDependencies.push({ name: "zustand", category: "state", description: "Lightweight state management" });
  }
  if (depNames.has("@reduxjs/toolkit") || depNames.has("redux")) {
    analysis.keyDependencies.push({ name: "redux", category: "state", description: "Predictable state container" });
  }
  if (depNames.has("@tanstack/react-query")) {
    analysis.keyDependencies.push({ name: "@tanstack/react-query", category: "state", description: "Server state management" });
  }
  if (depNames.has("jotai")) {
    analysis.keyDependencies.push({ name: "jotai", category: "state", description: "Primitive atomic state management" });
  }

  // ── API Style ─────────────────────────────────────────────────

  if (depNames.has("@trpc/server") || depNames.has("@trpc/client")) {
    analysis.apiStyle = "trpc";
    analysis.keyDependencies.push({ name: "trpc", category: "api", description: "End-to-end typesafe API" });
  } else if (depNames.has("graphql") || depNames.has("@apollo/server") || depNames.has("graphql-yoga")) {
    analysis.apiStyle = "graphql";
    analysis.keyDependencies.push({ name: "graphql", category: "api", description: "GraphQL API layer" });
  } else if (depNames.has("@grpc/grpc-js")) {
    analysis.apiStyle = "grpc";
  } else {
    analysis.apiStyle = "rest";
  }

  // ── Auth ──────────────────────────────────────────────────────

  if (depNames.has("next-auth") || depNames.has("@auth/core")) {
    analysis.keyDependencies.push({ name: "next-auth", category: "auth", description: "Authentication for Next.js" });
  }
  if (depNames.has("passport")) {
    analysis.keyDependencies.push({ name: "passport", category: "auth", description: "Node.js authentication middleware" });
  }
  if (depNames.has("@clerk/nextjs") || depNames.has("@clerk/clerk-js")) {
    analysis.keyDependencies.push({ name: "clerk", category: "auth", description: "Drop-in authentication and user management" });
  }
  if (depNames.has("@supabase/supabase-js")) {
    analysis.keyDependencies.push({ name: "supabase", category: "auth", description: "Backend-as-a-service with auth" });
  }

  // ── Deploy Target ─────────────────────────────────────────────

  const vercelConfig = await fileExists(path.join(projectPath, "vercel.json"));
  const netlifyConfig = await fileExists(path.join(projectPath, "netlify.toml"));
  if (vercelConfig || depNames.has("vercel")) {
    analysis.deployTarget = "Vercel";
  } else if (netlifyConfig) {
    analysis.deployTarget = "Netlify";
  } else if (depNames.has("@aws-cdk/core") || depNames.has("aws-cdk-lib")) {
    analysis.deployTarget = "AWS CDK";
  } else if (depNames.has("serverless")) {
    analysis.deployTarget = "Serverless Framework";
  }

  // ── Monitoring ────────────────────────────────────────────────

  if (depNames.has("@sentry/nextjs") || depNames.has("@sentry/node") || depNames.has("@sentry/react")) {
    analysis.keyDependencies.push({ name: "sentry", category: "monitoring", description: "Error tracking and performance monitoring" });
  }
  if (depNames.has("datadog-metrics") || depNames.has("dd-trace")) {
    analysis.keyDependencies.push({ name: "datadog", category: "monitoring", description: "APM and infrastructure monitoring" });
  }
}

// ─── Python ─────────────────────────────────────────────────────────

async function analyzePythonProject(projectPath: string, analysis: ProjectAnalysis): Promise<void> {
  const pyprojectStr = await readFileSafe(path.join(projectPath, "pyproject.toml"));
  const requirementsStr = await readFileSafe(path.join(projectPath, "requirements.txt"));
  const setupPy = await fileExists(path.join(projectPath, "setup.py"));

  if (!pyprojectStr && !requirementsStr && !setupPy) return;

  analysis.language = "python";

  // Package manager
  if (pyprojectStr?.includes("[tool.poetry]")) {
    analysis.packageManager = "poetry";
  } else {
    analysis.packageManager = "pip";
  }

  // Combine all dependency strings for scanning
  const allContent = (pyprojectStr || "") + "\n" + (requirementsStr || "");

  // Framework detection
  if (allContent.includes("fastapi")) {
    analysis.stacks.push("fastapi");
    analysis.keyDependencies.push({ name: "fastapi", category: "framework", description: "High-performance async web framework" });
    analysis.buildCommands.dev = "uvicorn app.main:app --reload";
  }
  if (allContent.includes("django")) {
    analysis.stacks.push("django");
    analysis.keyDependencies.push({ name: "django", category: "framework", description: "Full-featured web framework" });
    analysis.buildCommands.dev = "python manage.py runserver";
  }
  if (allContent.includes("flask")) {
    analysis.stacks.push("flask");
    analysis.keyDependencies.push({ name: "flask", category: "framework", description: "Lightweight web framework" });
  }

  // Testing
  if (allContent.includes("pytest")) {
    analysis.testFramework = "pytest";
    analysis.testCommands.test = "pytest";
    analysis.keyDependencies.push({ name: "pytest", category: "testing", description: "Python testing framework" });
  }

  // Linting
  if (allContent.includes("ruff")) {
    analysis.linter = "Ruff";
    analysis.formatter = "Ruff";
  } else if (allContent.includes("flake8")) {
    analysis.linter = "Flake8";
  }
  if (allContent.includes("black")) {
    analysis.formatter = "Black";
  }

  // ORM
  if (allContent.includes("sqlalchemy")) {
    analysis.database = "SQLAlchemy";
    analysis.keyDependencies.push({ name: "sqlalchemy", category: "orm", description: "Python SQL toolkit and ORM" });
  }
  if (allContent.includes("alembic")) {
    analysis.keyDependencies.push({ name: "alembic", category: "orm", description: "Database migration tool for SQLAlchemy" });
  }
  if (allContent.includes("tortoise-orm")) {
    analysis.database = "Tortoise ORM";
  }

  // Type checking
  if (allContent.includes("mypy")) {
    analysis.patterns.push({ name: "type-checked", description: "Uses mypy for static type checking", confidence: "high" });
  }
}

// ─── Go ─────────────────────────────────────────────────────────────

async function analyzeGoProject(projectPath: string, analysis: ProjectAnalysis): Promise<void> {
  const goMod = await readFileSafe(path.join(projectPath, "go.mod"));
  if (!goMod) return;

  analysis.language = "go";
  analysis.stacks.push("go");
  analysis.packageManager = "go";
  analysis.buildCommands.build = "go build ./...";
  analysis.testCommands.test = "go test ./...";
  analysis.linter = "golangci-lint";
  analysis.formatter = "gofmt";

  // Extract module name
  const moduleMatch = goMod.match(/module\s+(\S+)/);
  if (moduleMatch) {
    analysis.name = moduleMatch[1].split("/").pop() || analysis.name;
  }

  // Framework detection
  if (goMod.includes("github.com/gin-gonic/gin")) {
    analysis.keyDependencies.push({ name: "gin", category: "framework", description: "HTTP web framework" });
  }
  if (goMod.includes("github.com/gofiber/fiber")) {
    analysis.keyDependencies.push({ name: "fiber", category: "framework", description: "Express-inspired web framework" });
  }
  if (goMod.includes("google.golang.org/grpc")) {
    analysis.apiStyle = "grpc";
  }
  if (goMod.includes("gorm.io/gorm")) {
    analysis.database = "GORM";
    analysis.keyDependencies.push({ name: "gorm", category: "orm", description: "Go ORM library" });
  }
}

// ─── Rust ───────────────────────────────────────────────────────────

async function analyzeRustProject(projectPath: string, analysis: ProjectAnalysis): Promise<void> {
  const cargoToml = await readFileSafe(path.join(projectPath, "Cargo.toml"));
  if (!cargoToml) return;

  analysis.language = "rust";
  analysis.stacks.push("rust");
  analysis.packageManager = "cargo";
  analysis.buildCommands.build = "cargo build";
  analysis.testCommands.test = "cargo test";
  analysis.linter = "Clippy";
  analysis.formatter = "rustfmt";

  // Extract crate name
  const nameMatch = cargoToml.match(/name\s*=\s*"([^"]+)"/);
  if (nameMatch) analysis.name = nameMatch[1];

  if (cargoToml.includes("actix-web")) {
    analysis.keyDependencies.push({ name: "actix-web", category: "framework", description: "Powerful actor-based web framework" });
  }
  if (cargoToml.includes("axum")) {
    analysis.keyDependencies.push({ name: "axum", category: "framework", description: "Ergonomic web framework built on Tokio" });
  }
  if (cargoToml.includes("diesel")) {
    analysis.database = "Diesel";
    analysis.keyDependencies.push({ name: "diesel", category: "orm", description: "Type-safe SQL query builder" });
  }
  if (cargoToml.includes("sqlx")) {
    analysis.database = "SQLx";
    analysis.keyDependencies.push({ name: "sqlx", category: "orm", description: "Async SQL toolkit with compile-time checking" });
  }
}

// ─── Java / Spring Boot ─────────────────────────────────────────────

async function analyzeJavaProject(projectPath: string, analysis: ProjectAnalysis): Promise<void> {
  const pomXml = await readFileSafe(path.join(projectPath, "pom.xml"));
  const buildGradle = await readFileSafe(path.join(projectPath, "build.gradle"));
  const buildGradleKts = await readFileSafe(path.join(projectPath, "build.gradle.kts"));

  const buildFile = pomXml || buildGradle || buildGradleKts;
  if (!buildFile) return;

  analysis.language = "java";
  analysis.packageManager = pomXml ? "maven" : "gradle";

  if (pomXml) {
    analysis.buildCommands.build = "./mvnw clean package";
    analysis.testCommands.test = "./mvnw test";
  } else {
    analysis.buildCommands.build = "./gradlew build";
    analysis.testCommands.test = "./gradlew test";
  }

  if (buildFile.includes("spring-boot")) {
    analysis.stacks.push("springboot");
    analysis.keyDependencies.push({ name: "spring-boot", category: "framework", description: "Enterprise Java framework" });
    analysis.buildCommands.dev = pomXml ? "./mvnw spring-boot:run" : "./gradlew bootRun";
  }

  if (buildFile.includes("spring-data-jpa")) {
    analysis.database = "Spring Data JPA";
    analysis.keyDependencies.push({ name: "spring-data-jpa", category: "orm", description: "JPA-based data access" });
  }
  if (buildFile.includes("flyway")) {
    analysis.keyDependencies.push({ name: "flyway", category: "orm", description: "Database migration tool" });
  }
  if (buildFile.includes("spring-security")) {
    analysis.keyDependencies.push({ name: "spring-security", category: "auth", description: "Authentication and authorization framework" });
  }

  analysis.testFramework = "JUnit";
}

// ─── Infrastructure ─────────────────────────────────────────────────

async function analyzeInfrastructure(projectPath: string, analysis: ProjectAnalysis): Promise<void> {
  // Docker
  if (
    await fileExists(path.join(projectPath, "Dockerfile")) ||
    await fileExists(path.join(projectPath, "docker-compose.yml")) ||
    await fileExists(path.join(projectPath, "docker-compose.yaml"))
  ) {
    analysis.hasDocker = true;
  }

  // CI/CD
  if (await fileExists(path.join(projectPath, ".github/workflows"))) {
    analysis.ciPlatform = "GitHub Actions";
  } else if (await fileExists(path.join(projectPath, ".gitlab-ci.yml"))) {
    analysis.ciPlatform = "GitLab CI";
  } else if (await fileExists(path.join(projectPath, ".circleci"))) {
    analysis.ciPlatform = "CircleCI";
  } else if (await fileExists(path.join(projectPath, "Jenkinsfile"))) {
    analysis.ciPlatform = "Jenkins";
  }
}

// ─── Source Directories ─────────────────────────────────────────────

async function analyzeSourceDirs(projectPath: string, analysis: ProjectAnalysis): Promise<void> {
  const candidates = [
    "src", "app", "lib", "pages", "components", "api",
    "server", "client", "packages", "apps",
    "tests", "test", "__tests__", "spec",
  ];

  for (const dir of candidates) {
    if (await fileExists(path.join(projectPath, dir))) {
      analysis.sourceDirs.push(dir);
    }
  }
}

// ─── Environment Variables ──────────────────────────────────────────

async function analyzeEnvVars(projectPath: string, analysis: ProjectAnalysis): Promise<void> {
  // Read .env.example or .env.sample (never .env itself!)
  const envExample =
    (await readFileSafe(path.join(projectPath, ".env.example"))) ||
    (await readFileSafe(path.join(projectPath, ".env.sample"))) ||
    (await readFileSafe(path.join(projectPath, ".env.local.example")));

  if (envExample) {
    const names = envExample
      .split("\n")
      .filter((line) => line.includes("=") && !line.startsWith("#"))
      .map((line) => line.split("=")[0].trim())
      .filter((name) => name.length > 0);
    analysis.envVarNames = names;
  }
}

/**
 * Generates a human-readable summary of the project analysis.
 */
export function summarizeAnalysis(analysis: ProjectAnalysis): string {
  const lines: string[] = [
    `Project: ${analysis.name}`,
    `Language: ${analysis.language}`,
    `Stacks: ${analysis.stacks.length > 0 ? analysis.stacks.join(", ") : "(none detected)"}`,
    `Package manager: ${analysis.packageManager}`,
  ];

  if (analysis.description) lines.push(`Description: ${analysis.description}`);
  if (analysis.usesTypeScript) lines.push("TypeScript: yes");
  if (analysis.isMonorepo) lines.push(`Monorepo: ${analysis.monorepoTool || "yes"}`);
  if (analysis.database) lines.push(`Database: ${analysis.database}`);
  if (analysis.testFramework) lines.push(`Testing: ${analysis.testFramework}`);
  if (analysis.linter) lines.push(`Linter: ${analysis.linter}`);
  if (analysis.formatter) lines.push(`Formatter: ${analysis.formatter}`);
  if (analysis.cssFramework) lines.push(`CSS: ${analysis.cssFramework}`);
  if (analysis.apiStyle) lines.push(`API: ${analysis.apiStyle}`);
  if (analysis.deployTarget) lines.push(`Deploy: ${analysis.deployTarget}`);
  if (analysis.hasDocker) lines.push("Docker: yes");
  if (analysis.ciPlatform) lines.push(`CI/CD: ${analysis.ciPlatform}`);

  if (Object.keys(analysis.buildCommands).length > 0) {
    lines.push("Build commands:");
    for (const [key, value] of Object.entries(analysis.buildCommands)) {
      lines.push(`  ${key}: ${value}`);
    }
  }
  if (Object.keys(analysis.testCommands).length > 0) {
    lines.push("Test commands:");
    for (const [key, value] of Object.entries(analysis.testCommands)) {
      lines.push(`  ${key}: ${value}`);
    }
  }

  if (analysis.keyDependencies.length > 0) {
    lines.push("Key dependencies:");
    for (const dep of analysis.keyDependencies) {
      lines.push(`  ${dep.name} (${dep.category}) — ${dep.description}`);
    }
  }

  if (analysis.patterns.length > 0) {
    lines.push("Detected patterns:");
    for (const p of analysis.patterns) {
      lines.push(`  ${p.name} — ${p.description} [${p.confidence}]`);
    }
  }

  if (analysis.envVarNames.length > 0) {
    lines.push(`Environment variables: ${analysis.envVarNames.join(", ")}`);
  }

  return lines.join("\n");
}
