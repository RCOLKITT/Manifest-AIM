import { resolve } from "node:path";
import { existsSync } from "node:fs";
import chalk from "chalk";
import { compile } from "../../compile/compiler.js";

export async function compileCommand(
  file: string,
  options: { output?: string },
): Promise<void> {
  const manifestPath = resolve(file);
  const outputPath = options.output ?? ".aim/compiled.yaml";

  if (!existsSync(manifestPath)) {
    console.error(chalk.red(`\n  ✗ Manifest not found: ${manifestPath}\n`));
    console.error(chalk.dim(`  Run ${chalk.white("manifest init")} to create an aim.yaml\n`));
    process.exit(1);
  }

  console.log(
    chalk.dim(`\n  Compiling ${chalk.white(file)}...\n`),
  );

  try {
    const result = compile({
      manifestPath,
      outputPath,
    });

    // Show sources resolved
    console.log(chalk.dim("  Sources resolved:"));
    for (const source of result.sourcesResolved) {
      console.log(chalk.dim(`    • ${source}`));
    }
    console.log();

    // Show conflicts
    if (result.conflicts.length > 0) {
      console.log(chalk.yellow(`  ⚠ ${result.conflicts.length} conflict${result.conflicts.length !== 1 ? "s" : ""} resolved:\n`));
      for (const conflict of result.conflicts) {
        console.log(chalk.white(`    ${conflict.field}`));
        for (const source of conflict.sources) {
          console.log(chalk.dim(`      ${source.manifest}: ${JSON.stringify(source.value)}`));
        }
        console.log(chalk.dim(`      → ${conflict.resolution}`));
        console.log();
      }
    }

    // Show warnings
    for (const warning of result.warnings) {
      console.log(chalk.yellow(`  ⚠ ${warning}`));
    }

    // Show errors
    for (const error of result.errors) {
      console.error(chalk.red(`  ✗ ${error}`));
    }

    if (result.errors.length > 0) {
      process.exit(1);
    }

    // Summary
    const compiled = result.compiled;
    const ruleCount = compiled.governance?.rules?.length ?? 0;
    const capCount = compiled.capabilities?.length ?? 0;
    const knowledgeCount = compiled.knowledge?.length ?? 0;

    console.log(
      chalk.green(`\n  ✓ Compiled ${chalk.white(`${compiled.metadata.name}@${compiled.metadata.version}`)}`),
    );
    console.log(chalk.dim(`    → ${resolve(outputPath)}`));
    console.log(chalk.dim(`    ${capCount} capabilities, ${ruleCount} rules, ${knowledgeCount} knowledge units`));
    console.log(chalk.dim(`    ${result.sourcesResolved.length} source${result.sourcesResolved.length !== 1 ? "s" : ""} merged, ${result.conflicts.length} conflicts resolved`));
    console.log();
  } catch (err) {
    console.error(chalk.red(`\n  ✗ Compilation failed: ${(err as Error).message}\n`));
    process.exit(1);
  }
}
