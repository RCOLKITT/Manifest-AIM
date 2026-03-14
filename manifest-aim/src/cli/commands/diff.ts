/**
 * manifest diff — compare two AIM manifests and show what changed.
 *
 * Useful for:
 * - Reviewing governance changes before merging
 * - Auditing rule additions/removals across versions
 * - Understanding inheritance/compilation effects
 */

import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";
import chalk from "chalk";
import yaml from "js-yaml";

interface DiffSection {
  name: string;
  added: string[];
  removed: string[];
  changed: string[];
}

function loadManifest(path: string): Record<string, unknown> {
  const resolvedPath = resolve(path);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Manifest not found: ${resolvedPath}`);
  }

  const content = readFileSync(resolvedPath, "utf-8");
  const ext = extname(resolvedPath).toLowerCase();

  if (ext === ".json") {
    return JSON.parse(content);
  }
  return yaml.load(content) as Record<string, unknown>;
}

function getRules(manifest: Record<string, unknown>): Array<Record<string, unknown>> {
  const gov = (manifest.governance ?? {}) as Record<string, unknown>;
  return (gov.rules ?? []) as Array<Record<string, unknown>>;
}

function getCapabilities(manifest: Record<string, unknown>): Array<Record<string, unknown>> {
  return (manifest.capabilities ?? []) as Array<Record<string, unknown>>;
}

function getKnowledge(manifest: Record<string, unknown>): Array<Record<string, unknown>> {
  return (manifest.knowledge ?? []) as Array<Record<string, unknown>>;
}

function diffNamedItems(
  sectionName: string,
  aItems: Array<Record<string, unknown>>,
  bItems: Array<Record<string, unknown>>,
  detailFn: (item: Record<string, unknown>) => string,
): DiffSection {
  const aMap = new Map(aItems.map((i) => [i.name as string, i]));
  const bMap = new Map(bItems.map((i) => [i.name as string, i]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  // Find removed and changed
  for (const [name, aItem] of aMap) {
    const bItem = bMap.get(name);
    if (!bItem) {
      removed.push(`${name}: ${detailFn(aItem)}`);
    } else {
      const aStr = JSON.stringify(aItem);
      const bStr = JSON.stringify(bItem);
      if (aStr !== bStr) {
        changed.push(`${name}: ${detailFn(aItem)} → ${detailFn(bItem)}`);
      }
    }
  }

  // Find added
  for (const [name, bItem] of bMap) {
    if (!aMap.has(name)) {
      added.push(`${name}: ${detailFn(bItem)}`);
    }
  }

  return { name: sectionName, added, removed, changed };
}

export function diffCommand(
  fileA: string,
  fileB: string,
): void {
  let manifestA: Record<string, unknown>;
  let manifestB: Record<string, unknown>;

  try {
    manifestA = loadManifest(fileA);
  } catch (err) {
    console.error(chalk.red(`\n  ✗ ${(err as Error).message}\n`));
    process.exit(1);
  }

  try {
    manifestB = loadManifest(fileB);
  } catch (err) {
    console.error(chalk.red(`\n  ✗ ${(err as Error).message}\n`));
    process.exit(1);
  }

  const metaA = (manifestA.metadata ?? {}) as Record<string, unknown>;
  const metaB = (manifestB.metadata ?? {}) as Record<string, unknown>;

  console.log();
  console.log(chalk.dim(`  Comparing manifests:`));
  console.log(chalk.dim(`    A: ${chalk.white(`${metaA.name}@${metaA.version}`)} (${fileA})`));
  console.log(chalk.dim(`    B: ${chalk.white(`${metaB.name}@${metaB.version}`)} (${fileB})`));
  console.log();

  const sections: DiffSection[] = [];

  // Diff governance rules
  sections.push(diffNamedItems(
    "Governance Rules",
    getRules(manifestA),
    getRules(manifestB),
    (r) => `[${r.action}/${r.severity}] ${r.enforcement}`,
  ));

  // Diff capabilities
  sections.push(diffNamedItems(
    "Capabilities",
    getCapabilities(manifestA),
    getCapabilities(manifestB),
    (c) => (c.index as string) ?? (c.description as string) ?? "",
  ));

  // Diff knowledge
  sections.push(diffNamedItems(
    "Knowledge",
    getKnowledge(manifestA),
    getKnowledge(manifestB),
    (k) => `priority=${k.priority ?? 0}`,
  ));

  // Diff context
  const ctxA = (manifestA.context ?? {}) as Record<string, unknown>;
  const ctxB = (manifestB.context ?? {}) as Record<string, unknown>;
  const ctxChanges: string[] = [];
  const allCtxKeys = new Set([...Object.keys(ctxA), ...Object.keys(ctxB)]);
  for (const key of allCtxKeys) {
    const a = JSON.stringify(ctxA[key]);
    const b = JSON.stringify(ctxB[key]);
    if (a !== b) {
      if (ctxA[key] === undefined) {
        ctxChanges.push(`${key}: (none) → ${b}`);
      } else if (ctxB[key] === undefined) {
        ctxChanges.push(`${key}: ${a} → (none)`);
      } else {
        ctxChanges.push(`${key}: ${a} → ${b}`);
      }
    }
  }

  // Output results
  let totalChanges = 0;

  // Context changes
  if (ctxChanges.length > 0) {
    console.log(chalk.white.bold("  Context"));
    for (const change of ctxChanges) {
      console.log(chalk.yellow(`    ~ ${change}`));
    }
    console.log();
    totalChanges += ctxChanges.length;
  }

  // Named sections
  for (const section of sections) {
    const hasChanges = section.added.length + section.removed.length + section.changed.length > 0;
    if (!hasChanges) continue;

    console.log(chalk.white.bold(`  ${section.name}`));

    for (const item of section.added) {
      console.log(chalk.green(`    + ${item}`));
    }
    for (const item of section.removed) {
      console.log(chalk.red(`    - ${item}`));
    }
    for (const item of section.changed) {
      console.log(chalk.yellow(`    ~ ${item}`));
    }
    console.log();

    totalChanges += section.added.length + section.removed.length + section.changed.length;
  }

  // Summary
  if (totalChanges === 0) {
    console.log(chalk.green.bold("  ✓ Manifests are identical"));
  } else {
    console.log(chalk.dim(`  ${totalChanges} difference${totalChanges !== 1 ? "s" : ""} found`));
  }
  console.log();
}
