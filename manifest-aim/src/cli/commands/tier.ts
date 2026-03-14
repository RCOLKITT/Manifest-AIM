import { resolve } from "node:path";
import { existsSync } from "node:fs";
import chalk from "chalk";
import { loadCapabilitiesAtTier, formatTierOutput } from "../../tier/loader.js";
import type { TierLevel } from "../../tier/loader.js";

export function tierCommand(
  filter: string | undefined,
  options: { manifest?: string; tier?: string },
): void {
  const manifestPath = resolve(options.manifest ?? "aim.yaml");

  if (!existsSync(manifestPath)) {
    console.error(chalk.red(`\n  ✗ Manifest not found: ${manifestPath}\n`));
    console.error(chalk.dim(`  Run ${chalk.white("manifest init")} to create an aim.yaml\n`));
    process.exit(1);
  }

  const tier = (options.tier ? parseInt(options.tier, 10) : 0) as TierLevel;
  if (![0, 1, 2, 3].includes(tier)) {
    console.error(chalk.red(`\n  ✗ Invalid tier: ${options.tier}. Must be 0, 1, 2, or 3.\n`));
    process.exit(1);
  }

  try {
    const result = loadCapabilitiesAtTier(manifestPath, tier, filter);

    if (result.capabilities.length === 0) {
      if (filter) {
        console.log(chalk.yellow(`\n  No capabilities matching "${filter}" found.\n`));
      } else {
        console.log(chalk.yellow("\n  No capabilities defined in manifest.\n"));
      }
      return;
    }

    console.log();
    console.log(chalk.dim(`  ${formatTierOutput(result).split("\n").join("\n  ")}`));
    console.log();
  } catch (err) {
    console.error(chalk.red(`  ✗ ${(err as Error).message}\n`));
    process.exit(1);
  }
}
