import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { execSync } from "node:child_process";
import yaml from "js-yaml";
import chalk from "chalk";

function loadManifest(filePath: string): Record<string, unknown> {
  const ext = extname(filePath).toLowerCase();
  const content = readFileSync(filePath, "utf-8");
  if (ext === ".json") return JSON.parse(content);
  return yaml.load(content) as Record<string, unknown>;
}

function checkCommand(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function getCommandVersion(command: string): string | null {
  try {
    return execSync(`${command} --version`, { stdio: "pipe" })
      .toString()
      .trim()
      .split("\n")[0];
  } catch {
    return null;
  }
}

export async function doctorCommand(file: string): Promise<void> {
  const filePath = resolve(file);
  let hasErrors = false;

  console.log(chalk.dim("\n  Manifest Doctor — Environment Health Check\n"));

  // 1. Check manifest file
  console.log(chalk.white("  Manifest File:"));
  if (existsSync(filePath)) {
    console.log(chalk.green(`    ✓ ${file} found`));
    try {
      const manifest = loadManifest(filePath);
      const metadata = manifest.metadata as Record<string, unknown>;
      console.log(
        chalk.green(`    ✓ Valid YAML — ${metadata?.name}@${metadata?.version}`),
      );
    } catch (err) {
      console.log(
        chalk.red(`    ✗ Parse error: ${(err as Error).message}`),
      );
      hasErrors = true;
    }
  } else {
    console.log(chalk.red(`    ✗ ${file} not found`));
    console.log(
      chalk.dim(`      Run ${chalk.white("manifest init")} to create one`),
    );
    hasErrors = true;
  }
  console.log();

  // 2. Check Node.js
  console.log(chalk.white("  Runtime:"));
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split(".")[0], 10);
  if (nodeMajor >= 20) {
    console.log(chalk.green(`    ✓ Node.js ${nodeVersion}`));
  } else {
    console.log(
      chalk.red(`    ✗ Node.js ${nodeVersion} — requires >=20.0.0`),
    );
    hasErrors = true;
  }
  console.log();

  // 3. Check enforcement tools
  console.log(chalk.white("  Enforcement Tools:"));

  // Extract tool commands from manifest rules
  const toolsToCheck: { name: string; command: string; install?: string }[] = [
    { name: "TypeScript", command: "tsc", install: "npm install -g typescript" },
    { name: "Semgrep", command: "semgrep", install: "pip install semgrep" },
  ];

  // If manifest exists, scan for additional tool commands
  if (existsSync(filePath)) {
    try {
      const manifest = loadManifest(filePath);
      const governance = manifest.governance as Record<string, unknown> | undefined;
      const rules = (governance?.rules || []) as Record<string, unknown>[];

      for (const rule of rules) {
        const detect = rule.detect as Record<string, unknown> | undefined;
        if (detect?.type === "tool" && detect.command) {
          const cmd = (detect.command as string).split(" ")[0];
          const existing = toolsToCheck.find(
            (t) => t.command === cmd || t.name === cmd,
          );
          if (!existing) {
            toolsToCheck.push({
              name: cmd,
              command: cmd,
              install: detect.install as string | undefined,
            });
          }
        }
      }
    } catch {
      // Ignore parse errors — already reported above
    }
  }

  for (const tool of toolsToCheck) {
    if (checkCommand(tool.command)) {
      const version = getCommandVersion(tool.command);
      console.log(
        chalk.green(
          `    ✓ ${tool.name}${version ? ` (${version})` : ""}`,
        ),
      );
    } else {
      console.log(chalk.yellow(`    ⚠ ${tool.name} — not found`));
      if (tool.install) {
        console.log(chalk.dim(`      Install: ${tool.install}`));
      }
    }
  }
  console.log();

  // 4. Check .aim directory
  console.log(chalk.white("  Local State:"));
  const aimDir = resolve(".aim");
  if (existsSync(aimDir)) {
    console.log(chalk.green("    ✓ .aim/ directory exists"));
  } else {
    console.log(chalk.yellow("    ⚠ .aim/ directory not found"));
    console.log(
      chalk.dim("      Will be created on first compile or enforce"),
    );
  }
  console.log();

  // Summary
  if (hasErrors) {
    console.log(
      chalk.red("  ✗ Issues found. Fix the errors above and run doctor again.\n"),
    );
    process.exit(1);
  } else {
    console.log(chalk.green("  ✓ Environment is healthy. Ready to go.\n"));
  }
}
