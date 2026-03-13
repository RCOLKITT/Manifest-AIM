import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import yaml from "js-yaml";
import chalk from "chalk";

function loadManifest(filePath: string): Record<string, unknown> {
  const ext = extname(filePath).toLowerCase();
  const content = readFileSync(filePath, "utf-8");
  if (ext === ".json") return JSON.parse(content);
  return yaml.load(content) as Record<string, unknown>;
}

function estimateTokens(text: string): number {
  // Rough estimation: ~4 chars per token
  return Math.ceil(text.length / 4);
}

export async function inspectCommand(
  file: string,
  options: { tier?: string; capability?: string; tokens?: boolean },
): Promise<void> {
  const filePath = resolve(file);

  if (!existsSync(filePath)) {
    console.error(chalk.red(`\n  ✗ File not found: ${filePath}\n`));
    process.exit(1);
  }

  const manifest = loadManifest(filePath);
  const tier = parseInt(options.tier || "0", 10);
  const metadata = manifest.metadata as Record<string, unknown>;
  const capabilities = (manifest.capabilities || []) as Record<string, unknown>[];
  const knowledge = (manifest.knowledge || []) as Record<string, unknown>[];
  const governance = manifest.governance as Record<string, unknown> | undefined;
  const rules = (governance?.rules || []) as Record<string, unknown>[];

  console.log(
    chalk.dim(
      `\n  Inspecting ${chalk.white(`${metadata?.name}@${metadata?.version}`)} — Tier ${tier}\n`,
    ),
  );

  if (tier === 0) {
    console.log(chalk.white("  ═══ Tier 0: Index (loaded at init) ═══\n"));

    // Metadata
    console.log(chalk.dim("  Manifest:"));
    console.log(`    ${metadata?.name} — ${metadata?.description}`);
    console.log();

    // Capability indexes
    if (capabilities.length > 0) {
      console.log(chalk.dim(`  Capabilities (${capabilities.length}):`));
      let totalTokens = 0;
      for (const cap of capabilities) {
        const line = `    ${chalk.white(cap.name as string)}: ${cap.index}`;
        console.log(line);
        if (cap.tags) {
          console.log(
            chalk.dim(`      tags: [${(cap.tags as string[]).join(", ")}]`),
          );
        }
        totalTokens += estimateTokens(
          `${cap.name} ${cap.index} ${(cap.tags as string[] || []).join(" ")}`,
        );
      }
      console.log();

      if (options.tokens) {
        console.log(
          chalk.dim(`  Estimated Tier 0 token cost: ~${totalTokens} tokens`),
        );
      }
    }

    // Governance summary
    if (rules.length > 0) {
      const blocking = rules.filter((r) => r.action === "block").length;
      const warning = rules.filter((r) => r.action === "warn").length;
      console.log(chalk.dim(`  Governance: ${rules.length} rules`));
      console.log(chalk.dim(`    ${blocking} blocking, ${warning} warning`));
    }

    console.log();
  } else if (tier === 1) {
    console.log(
      chalk.white("  ═══ Tier 1: Schema (loaded on relevance match) ═══\n"),
    );

    const targetCaps = options.capability
      ? capabilities.filter((c) => c.name === options.capability)
      : capabilities;

    if (targetCaps.length === 0) {
      console.log(chalk.yellow("  No matching capabilities found.\n"));
      return;
    }

    for (const cap of targetCaps) {
      console.log(chalk.white(`  ${cap.name}:`));
      if (cap.schema) {
        const schema = cap.schema as Record<string, unknown>;
        if (schema.inputs) {
          console.log(chalk.dim("    inputs:"));
          console.log(chalk.dim(`      ${JSON.stringify(schema.inputs, null, 2).replace(/\n/g, "\n      ")}`));
        }
        if (schema.outputs) {
          console.log(chalk.dim("    outputs:"));
          console.log(chalk.dim(`      ${JSON.stringify(schema.outputs, null, 2).replace(/\n/g, "\n      ")}`));
        }
        if (schema.preconditions) {
          console.log(chalk.dim(`    preconditions: ${JSON.stringify(schema.preconditions)}`));
        }
      } else {
        console.log(chalk.dim("    (no schema defined)"));
      }

      // Show active constraints
      if (cap.constraints) {
        console.log(chalk.dim("    constraints:"));
        for (const c of cap.constraints as Record<string, unknown>[]) {
          const when = c.when ? ` when: ${c.when}` : "";
          console.log(chalk.dim(`      - ${c.rule}${when}`));
        }
      }
      console.log();
    }
  } else if (tier === 2) {
    console.log(
      chalk.white("  ═══ Tier 2: Instructions (loaded on commitment) ═══\n"),
    );

    const targetCaps = options.capability
      ? capabilities.filter((c) => c.name === options.capability)
      : capabilities;

    for (const cap of targetCaps) {
      console.log(chalk.white(`  ${cap.name}:`));
      if (cap.instructions) {
        const instructions =
          typeof cap.instructions === "string"
            ? cap.instructions
            : `[file: ${(cap.instructions as Record<string, string>).file}]`;
        console.log(chalk.dim(`    ${instructions.replace(/\n/g, "\n    ")}`));
        if (options.tokens) {
          console.log(
            chalk.dim(`    (~${estimateTokens(instructions)} tokens)`),
          );
        }
      }
      if (cap.examples) {
        console.log(
          chalk.dim(`    examples: ${(cap.examples as unknown[]).length}`),
        );
      }
      if (cap.anti_patterns) {
        console.log(
          chalk.dim(
            `    anti_patterns: ${(cap.anti_patterns as unknown[]).length}`,
          ),
        );
      }
      console.log();
    }

    // Knowledge units
    if (knowledge.length > 0) {
      console.log(chalk.white("  Knowledge units:\n"));
      for (const k of knowledge) {
        console.log(chalk.white(`  ${k.name}:`));
        console.log(chalk.dim(`    trigger: "${k.trigger}"`));
        if (k.content) {
          const content = typeof k.content === "string" ? k.content : "[file]";
          const preview =
            content.length > 200 ? content.substring(0, 200) + "..." : content;
          console.log(chalk.dim(`    ${preview.replace(/\n/g, "\n    ")}`));
          if (options.tokens) {
            console.log(
              chalk.dim(`    (~${estimateTokens(content)} tokens)`),
            );
          }
        }
        console.log();
      }
    }
  } else if (tier === 3) {
    console.log(
      chalk.white("  ═══ Tier 3: Execution (never enters context) ═══\n"),
    );
    console.log(
      chalk.dim(
        "  Tier 3 dispatch configs are shown here for inspection only.",
      ),
    );
    console.log(
      chalk.dim("  They are NEVER loaded into the agent's context window.\n"),
    );

    const targetCaps = options.capability
      ? capabilities.filter((c) => c.name === options.capability)
      : capabilities;

    for (const cap of targetCaps) {
      console.log(chalk.white(`  ${cap.name}:`));
      if (cap.dispatch) {
        const dispatch = cap.dispatch as Record<string, unknown>;
        console.log(chalk.dim(`    type: ${dispatch.type}`));
        if (dispatch.config) {
          console.log(
            chalk.dim(
              `    config: ${JSON.stringify(dispatch.config, null, 2).replace(/\n/g, "\n    ")}`,
            ),
          );
        }
      } else {
        console.log(chalk.dim("    (no dispatch configured)"));
      }
      console.log();
    }
  } else {
    console.error(chalk.red(`\n  ✗ Invalid tier: ${tier}. Must be 0-3.\n`));
    process.exit(1);
  }
}
