/**
 * CLI command: manifest wrap <platform>
 *
 * Generates platform-specific context injection files from an AIM manifest.
 * This is how AIM governance enters the agent's context window.
 */

import chalk from "chalk";
import { wrap } from "../../wrap/wrap.js";
import { getSupportedPlatforms } from "../../wrap/platforms.js";
import type { AgentPlatform } from "../../wrap/types.js";

export function wrapCommand(
  platform: string,
  options: { manifest: string; output?: string; environment?: string; dryRun?: boolean },
): void {
  const supported = getSupportedPlatforms();
  if (!supported.includes(platform as AgentPlatform)) {
    console.error(
      chalk.red(`  Unknown platform: ${platform}`),
    );
    console.error(
      chalk.dim(`  Supported: ${supported.join(", ")}`),
    );
    process.exit(1);
  }

  console.log(
    `  Wrapping ${chalk.cyan(options.manifest)} for ${chalk.green(platform)}...`,
  );
  console.log();

  try {
    const result = wrap({
      manifestPath: options.manifest,
      platform: platform as AgentPlatform,
      outputDir: options.output,
      environment: options.environment,
      dryRun: options.dryRun,
    });

    if (options.dryRun) {
      // Dry run: print to stdout
      console.log(result.context);
      console.log();
      console.log(chalk.dim("  (dry run — no files written)"));
    } else {
      // Show what was generated
      console.log(
        chalk.green(`  ✓ Generated ${chalk.bold(result.outputPath)}`),
      );
    }

    console.log();

    // Section summary
    console.log(chalk.dim("  Sections:"));
    for (const section of result.sections) {
      console.log(
        chalk.dim(`    • ${section.name} (${section.lineCount} lines)`),
      );
    }

    console.log();
    console.log(
      `  ${chalk.cyan(result.manifest.name)} v${result.manifest.version}`,
    );

    // Platform-specific guidance
    if (platform === "claude-code" && !options.dryRun) {
      console.log();
      console.log(
        chalk.dim(
          "  Claude Code will automatically load CLAUDE.md as project context.",
        ),
      );
      console.log(
        chalk.dim(
          "  Run `manifest enforce` after sessions to verify compliance.",
        ),
      );
    } else if (platform === "cursor" && !options.dryRun) {
      console.log();
      console.log(
        chalk.dim(
          "  Cursor will automatically load .cursorrules as project instructions.",
        ),
      );
    } else if (platform === "windsurf" && !options.dryRun) {
      console.log();
      console.log(
        chalk.dim(
          "  Windsurf will automatically load .windsurfrules as project instructions.",
        ),
      );
    }
  } catch (err) {
    console.error(chalk.red(`  Error: ${(err as Error).message}`));
    process.exit(1);
  }
}
