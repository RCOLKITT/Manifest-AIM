/**
 * CLI command: manifest wrap <platform>
 *
 * Generates platform-specific context injection files from an AIM manifest.
 * This is how AIM governance enters the agent's context window.
 */

import chalk from "chalk";
import { watch as fsWatch } from "node:fs";
import { resolve, dirname } from "node:path";
import { wrap } from "../../wrap/wrap.js";
import { getSupportedPlatforms } from "../../wrap/platforms.js";
import type { AgentPlatform } from "../../wrap/types.js";

interface WrapOptions {
  manifest: string;
  output?: string;
  environment?: string;
  dryRun?: boolean;
  watch?: boolean;
  all?: boolean;
}

function generateForPlatform(
  platform: AgentPlatform,
  options: WrapOptions,
  silent = false,
): void {
  try {
    const result = wrap({
      manifestPath: options.manifest,
      platform,
      outputDir: options.output,
      environment: options.environment,
      dryRun: options.dryRun,
    });

    if (options.dryRun) {
      console.log(result.context);
      console.log();
      console.log(chalk.dim("  (dry run — no files written)"));
      console.log();

      // Section summary (also show in dry-run)
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
    } else if (!silent) {
      console.log(
        chalk.green(`  ✓ Generated ${chalk.bold(result.outputPath)}`),
      );

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
      if (platform === "claude-code") {
        console.log();
        console.log(
          chalk.dim(
            "  Claude Code will automatically load CLAUDE.md as project context.",
          ),
        );
      } else if (platform === "cursor") {
        console.log();
        console.log(
          chalk.dim(
            "  Cursor will automatically load .cursorrules as project instructions.",
          ),
        );
      } else if (platform === "windsurf") {
        console.log();
        console.log(
          chalk.dim(
            "  Windsurf will automatically load .windsurfrules as project instructions.",
          ),
        );
      }
    } else {
      // Silent mode (for watch)
      console.log(
        chalk.dim(`  [${new Date().toLocaleTimeString()}] `) +
          chalk.green(`✓ ${platform} → ${result.outputPath}`),
      );
    }
  } catch (err) {
    console.error(chalk.red(`  Error: ${(err as Error).message}`));
    if (!silent) {
      process.exit(1);
    }
  }
}

export function wrapCommand(platform: string, options: WrapOptions): void {
  const supported = getSupportedPlatforms();

  // Handle --all flag
  if (options.all) {
    console.log(
      `  Wrapping ${chalk.cyan(options.manifest)} for ${chalk.green("all platforms")}...`,
    );
    console.log();

    for (const p of supported) {
      if (p === "generic") continue; // Skip generic when using --all
      generateForPlatform(p, options);
      console.log();
    }

    console.log(chalk.dim("  Run `manifest enforce` after sessions to verify compliance."));
    return;
  }

  // Validate platform
  if (!supported.includes(platform as AgentPlatform)) {
    console.error(chalk.red(`  Unknown platform: ${platform}`));
    console.error(chalk.dim(`  Supported: ${supported.join(", ")}`));
    process.exit(1);
  }

  console.log(
    `  Wrapping ${chalk.cyan(options.manifest)} for ${chalk.green(platform)}...`,
  );
  console.log();

  // Initial generation
  generateForPlatform(platform as AgentPlatform, options);

  // Watch mode
  if (options.watch && !options.dryRun) {
    console.log();
    console.log(
      chalk.cyan("  Watching for changes...") +
        chalk.dim(" (Ctrl+C to stop)"),
    );
    console.log();

    const manifestPath = resolve(options.manifest);
    const manifestDir = dirname(manifestPath);

    let debounceTimer: NodeJS.Timeout | null = null;

    fsWatch(manifestPath, () => {
      // Debounce rapid changes
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        generateForPlatform(platform as AgentPlatform, options, true);
      }, 100);
    });

    // Also watch the directory for the manifest file (handles renames/recreations)
    fsWatch(manifestDir, (_eventType, filename) => {
      if (filename && resolve(manifestDir, filename) === manifestPath) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          generateForPlatform(platform as AgentPlatform, options, true);
        }, 100);
      }
    });

    // Keep process alive
    process.stdin.resume();
  }
}
