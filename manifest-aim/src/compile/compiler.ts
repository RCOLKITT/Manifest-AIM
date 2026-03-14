/**
 * Manifest compiler — the main compile pipeline.
 * Resolves inheritance, merges dependencies, applies overrides.
 */

import { resolve, dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import yaml from "js-yaml";
import {
  resolveInheritanceChain,
  resolveDependencies,
} from "./resolver.js";
import { mergeManifests } from "./merge.js";
import type {
  RawManifest,
  CompositionStrategy,
  CompileResult,
  Conflict,
} from "./types.js";

export interface CompileOptions {
  manifestPath: string;
  outputPath?: string;
}

/**
 * Apply explicit field overrides to a compiled manifest.
 */
function applyOverrides(
  manifest: RawManifest,
  overrides: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(overrides)) {
    // Support dot-notation paths: "governance.quality_gates.code.max_complexity"
    const parts = key.split(".");
    let target: Record<string, unknown> = manifest as unknown as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (target[part] === undefined || typeof target[part] !== "object") {
        target[part] = {};
      }
      target = target[part] as Record<string, unknown>;
    }

    target[parts[parts.length - 1]] = value;
  }
}

/**
 * Main compile function.
 */
export function compile(options: CompileOptions): CompileResult {
  const entryPath = resolve(options.manifestPath);
  const entryDir = dirname(entryPath);
  const warnings: string[] = [];
  const errors: string[] = [];

  // Step 1: Resolve inheritance chain
  const chain = resolveInheritanceChain(entryPath);
  const sourcesResolved = chain.map((c) => c.path);

  // Step 2: Determine composition strategy
  // Use the entry manifest's composition strategy (the most-derived manifest decides)
  const entryManifest = chain[chain.length - 1].manifest;
  const strategy: CompositionStrategy =
    entryManifest.composition?.strategy ?? "most_restrictive";

  // Step 3: Merge the inheritance chain (left to right = ancestor to child)
  let compiled = chain[0].manifest;
  const conflicts: Conflict[] = [];

  for (let i = 1; i < chain.length; i++) {
    compiled = mergeManifests(
      compiled,
      chain[i].manifest,
      strategy,
      chain[i - 1].manifest.metadata.name,
      chain[i].manifest.metadata.name,
      conflicts,
    );
  }

  // Step 4: Resolve and merge dependencies
  const deps = resolveDependencies(entryManifest, entryDir);
  for (const dep of deps) {
    sourcesResolved.push(dep.path);

    // Dependencies add to the manifest but don't override identity
    const savedMetadata = { ...compiled.metadata };
    compiled = mergeManifests(
      compiled,
      dep.manifest,
      strategy,
      compiled.metadata.name,
      dep.manifest.metadata.name,
      conflicts,
    );
    // Restore the primary manifest's identity
    compiled.metadata = savedMetadata;

    // Apply dependency-level overrides
    if (dep.override) {
      applyOverrides(compiled, dep.override);
      warnings.push(
        `Dependency "${dep.manifest.metadata.name}" has local overrides applied`,
      );
    }
  }

  // Step 5: Apply top-level overrides
  if (entryManifest.overrides) {
    applyOverrides(compiled, entryManifest.overrides);
    warnings.push("Top-level overrides applied to compiled manifest");
  }

  // Step 6: Report conflicts
  if (conflicts.length > 0) {
    warnings.push(
      `${conflicts.length} conflict${conflicts.length !== 1 ? "s" : ""} resolved using "${strategy}" strategy`,
    );
  }

  // Step 7: Write compiled output
  if (options.outputPath) {
    const outputDir = dirname(resolve(options.outputPath));
    mkdirSync(outputDir, { recursive: true });
    const yamlOutput = yaml.dump(compiled, {
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });
    writeFileSync(resolve(options.outputPath), yamlOutput, "utf-8");
  }

  return {
    compiled,
    conflicts,
    warnings,
    errors,
    sourcesResolved,
  };
}
