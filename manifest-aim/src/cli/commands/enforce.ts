import { resolve } from "node:path";
import { existsSync } from "node:fs";
import chalk from "chalk";
import { enforce } from "../../enforce/engine.js";
import type { Violation, EnforceSummary } from "../../enforce/types.js";

function severityColor(severity: string): (text: string) => string {
  switch (severity) {
    case "critical": return chalk.red.bold;
    case "error": return chalk.red;
    case "warning": return chalk.yellow;
    case "info": return chalk.blue;
    default: return chalk.white;
  }
}

function severityIcon(severity: string): string {
  switch (severity) {
    case "critical": return "✗";
    case "error": return "✗";
    case "warning": return "⚠";
    case "info": return "ℹ";
    default: return "•";
  }
}

function actionLabel(action: string): string {
  switch (action) {
    case "block": return chalk.red.bold("BLOCK");
    case "warn": return chalk.yellow("WARN");
    case "log": return chalk.dim("LOG");
    case "require_approval": return chalk.magenta("APPROVAL");
    case "escalate": return chalk.magenta("ESCALATE");
    case "transform": return chalk.cyan("TRANSFORM");
    case "retry": return chalk.cyan("RETRY");
    default: return action;
  }
}

function formatViolation(v: Violation): void {
  const color = severityColor(v.severity);
  const icon = severityIcon(v.severity);
  const location = v.line ? `${v.file}:${v.line}${v.column ? `:${v.column}` : ""}` : v.file;

  console.log(
    `  ${color(icon)} ${actionLabel(v.action)} ${chalk.white(location)}`,
  );
  console.log(
    `    ${color(v.message)}`,
  );
  if (v.match) {
    // Show the matched text (truncated)
    const matchText = v.match.length > 80 ? v.match.slice(0, 77) + "..." : v.match;
    console.log(
      `    ${chalk.dim("matched:")} ${chalk.dim(matchText)}`,
    );
  }
  if (v.fix_hint) {
    console.log(
      `    ${chalk.dim("fix:")} ${chalk.dim(v.fix_hint)}`,
    );
  }
  console.log();
}

function formatSummary(summary: EnforceSummary): void {
  console.log(chalk.dim("  ─".repeat(30)));
  console.log();

  // Summary line
  if (summary.totalViolations === 0) {
    console.log(chalk.green.bold("  ✓ No violations found"));
    console.log(chalk.dim(`    ${summary.files} files checked`));
  } else {
    const blocked = summary.byAction["block"] ?? 0;
    const warnings = (summary.byAction["warn"] ?? 0) + (summary.byAction["log"] ?? 0);

    if (blocked > 0) {
      console.log(chalk.red.bold(`  ✗ ${blocked} blocking violation${blocked !== 1 ? "s" : ""}`));
    }
    if (warnings > 0) {
      console.log(chalk.yellow(`  ⚠ ${warnings} warning${warnings !== 1 ? "s" : ""}`));
    }

    console.log(chalk.dim(`    ${summary.files} files checked, ${summary.filesWithViolations} with issues`));
  }

  // Breakdown by severity
  const severities = ["critical", "error", "warning", "info"];
  const severityCounts = severities
    .filter((s) => (summary.bySeverity[s] ?? 0) > 0)
    .map((s) => `${summary.bySeverity[s]} ${s}`);

  if (severityCounts.length > 0) {
    console.log(chalk.dim(`    ${severityCounts.join(", ")}`));
  }

  // Duration
  console.log(chalk.dim(`    completed in ${Math.round(summary.duration)}ms`));
  console.log();
}

export async function enforceCommand(
  targetPath: string,
  options: { manifest?: string; report?: boolean; environment?: string },
): Promise<void> {
  const manifestPath = resolve(options.manifest ?? "aim.yaml");
  const resolvedTarget = resolve(targetPath);

  // Check manifest exists
  if (!existsSync(manifestPath)) {
    console.error(chalk.red(`\n  ✗ Manifest not found: ${manifestPath}\n`));
    console.error(chalk.dim(`  Run ${chalk.white("manifest init")} to create an aim.yaml\n`));
    process.exit(1);
  }

  // Check target exists
  if (!existsSync(resolvedTarget)) {
    console.error(chalk.red(`\n  ✗ Target not found: ${resolvedTarget}\n`));
    process.exit(1);
  }

  console.log(
    chalk.dim(`\n  Enforcing ${chalk.white(options.manifest ?? "aim.yaml")} against ${chalk.white(targetPath)}...\n`),
  );

  // Run enforcement
  let summary: EnforceSummary;
  try {
    summary = enforce({
      manifestPath,
      targetPath: resolvedTarget,
      environment: options.environment,
    });
  } catch (err) {
    console.error(chalk.red(`  ✗ Enforcement failed: ${(err as Error).message}\n`));
    process.exit(1);
  }

  // Output violations grouped by file
  if (summary.totalViolations > 0) {
    const fileGroups = new Map<string, Violation[]>();
    for (const result of summary.results) {
      if (result.violations.length > 0) {
        fileGroups.set(result.file, result.violations);
      }
    }

    for (const [file, violations] of fileGroups) {
      console.log(chalk.white.bold(`  ${file}`));
      console.log();
      for (const v of violations) {
        formatViolation(v);
      }
    }
  }

  // Summary
  formatSummary(summary);

  // Exit code: 1 if any blocking violations
  if (summary.blocked) {
    process.exit(1);
  }
}
