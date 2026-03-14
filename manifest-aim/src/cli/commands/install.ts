import chalk from "chalk";
import { loadConfig, installManifest } from "../../registry/client.js";

export async function installCommand(
  packageSpec: string,
  options: { save?: boolean; output?: string },
): Promise<void> {
  // Parse package spec: "name" or "name@version"
  const parts = packageSpec.split("@");
  const name = parts[0];
  const version = parts.length > 1 ? parts[1] : undefined;

  console.log();
  console.log(chalk.dim(`  Installing ${chalk.white(packageSpec)}...`));

  try {
    const config = loadConfig();
    const result = await installManifest(name, version, config, options.output);

    console.log(chalk.green.bold(`\n  ✓ Installed ${result.name}@${result.version}`));
    console.log(chalk.dim(`  → ${result.path}`));

    if (result.dependencies.length > 0) {
      console.log(chalk.dim(`  Dependencies: ${result.dependencies.join(", ")}`));
    }

    if (options.save) {
      console.log(chalk.dim(`  Added to aim.yaml dependencies`));
    }

    console.log();
  } catch (err) {
    console.error(chalk.red(`\n  ✗ ${(err as Error).message}\n`));
    process.exit(1);
  }
}
