import { resolve } from "node:path";
import { existsSync } from "node:fs";
import chalk from "chalk";
import {
  loadConfig,
  prepareManifestForPublish,
  publishManifest,
} from "../../registry/client.js";

export async function publishCommand(
  file: string,
  options: { dryRun?: boolean },
): Promise<void> {
  const manifestPath = resolve(file);

  if (!existsSync(manifestPath)) {
    console.error(chalk.red(`\n  ✗ Manifest not found: ${manifestPath}\n`));
    process.exit(1);
  }

  try {
    // Prepare manifest
    const prepared = prepareManifestForPublish(manifestPath);

    console.log();
    console.log(chalk.white.bold(`  Publishing ${prepared.metadata.name}@${prepared.metadata.version}`));
    console.log(chalk.dim(`  ${prepared.metadata.description}`));
    console.log();
    console.log(chalk.dim(`  Rules: ${prepared.ruleCount}`));
    console.log(chalk.dim(`  Capabilities: ${prepared.capabilityCount}`));
    console.log(chalk.dim(`  Knowledge units: ${prepared.knowledgeCount}`));
    console.log(chalk.dim(`  Enforcement: ${prepared.enforcementTypes.join(", ") || "none"}`));
    console.log(chalk.dim(`  Checksum: ${prepared.checksum.slice(0, 16)}...`));
    console.log();

    if (options.dryRun) {
      console.log(chalk.yellow("  (dry run — nothing published)"));
      console.log();
      return;
    }

    // Publish to registry
    const config = loadConfig();
    const result = await publishManifest(manifestPath, config);

    console.log(chalk.green.bold(`  ✓ Published ${result.name}@${result.version}`));
    console.log(chalk.dim(`  ${result.url}`));
    console.log();
  } catch (err) {
    const message = (err as Error).message;

    if (message.includes("Not authenticated")) {
      console.error(chalk.red(`\n  ✗ ${message}`));
      console.error(chalk.dim(`\n  To authenticate, run: manifest login\n`));
    } else {
      console.error(chalk.red(`\n  ✗ ${message}\n`));
    }
    process.exit(1);
  }
}
