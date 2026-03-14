/**
 * Manifest resolver — loads and resolves inherits and dependencies chains.
 *
 * For now, supports local file paths. Registry resolution will come in v0.4.0.
 * Inherits and dependencies can reference:
 *   - Relative paths: "./base.aim.yaml"
 *   - Absolute paths: "/path/to/manifest.aim.yaml"
 *   - Names: "acme-base" (resolved relative to .aim/ or manifest directory)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join, extname } from "node:path";
import yaml from "js-yaml";
import type { RawManifest } from "./types.js";

/**
 * Try to resolve a manifest reference to a file path.
 * Resolution order:
 *   1. Exact path (relative to referencing manifest's directory)
 *   2. Name + .aim.yaml in same directory
 *   3. Name + .aim.yaml in .aim/ directory
 */
export function resolveManifestPath(
  reference: string,
  fromDir: string,
): string | null {
  // If it has a file extension, treat as direct path
  if (extname(reference)) {
    const direct = resolve(fromDir, reference);
    if (existsSync(direct)) return direct;
    return null;
  }

  // Try name.aim.yaml in the same directory
  const sameDirPath = resolve(fromDir, `${reference}.aim.yaml`);
  if (existsSync(sameDirPath)) return sameDirPath;

  // Try in .aim/ subdirectory
  const aimDirPath = resolve(fromDir, ".aim", `${reference}.aim.yaml`);
  if (existsSync(aimDirPath)) return aimDirPath;

  // Try name.aim.yaml in manifests/ directory (common for project manifests)
  const manifestsDirPath = resolve(fromDir, "manifests", `${reference}.aim.yaml`);
  if (existsSync(manifestsDirPath)) return manifestsDirPath;

  return null;
}

export function loadRawManifest(filePath: string): RawManifest {
  const content = readFileSync(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();

  if (ext === ".json") {
    return JSON.parse(content) as RawManifest;
  }
  return yaml.load(content) as RawManifest;
}

/**
 * Resolve the full inheritance chain for a manifest.
 * Returns manifests in order: [root ancestor, ..., parent, target].
 * Detects circular inheritance.
 */
export function resolveInheritanceChain(
  entryPath: string,
  seen?: Set<string>,
): Array<{ path: string; manifest: RawManifest }> {
  const resolvedPath = resolve(entryPath);
  const visited = seen ?? new Set<string>();

  if (visited.has(resolvedPath)) {
    throw new Error(`Circular inheritance detected: ${resolvedPath} already in chain`);
  }
  visited.add(resolvedPath);

  const manifest = loadRawManifest(resolvedPath);
  const chain: Array<{ path: string; manifest: RawManifest }> = [];

  // Resolve parents first (they come before us in the chain)
  if (manifest.inherits && manifest.inherits.length > 0) {
    const fromDir = dirname(resolvedPath);
    for (const parentRef of manifest.inherits) {
      const parentPath = resolveManifestPath(parentRef, fromDir);
      if (!parentPath) {
        throw new Error(
          `Cannot resolve inherited manifest "${parentRef}" from ${resolvedPath}`,
        );
      }
      const parentChain = resolveInheritanceChain(parentPath, visited);
      chain.push(...parentChain);
    }
  }

  // Add ourselves at the end
  chain.push({ path: resolvedPath, manifest });

  return chain;
}

/**
 * Resolve dependencies (loaded alongside, not in inheritance chain).
 * Dependencies add rules/capabilities but don't override the base manifest.
 */
export function resolveDependencies(
  manifest: RawManifest,
  fromDir: string,
): Array<{ path: string; manifest: RawManifest; override?: Record<string, unknown> }> {
  const deps: Array<{ path: string; manifest: RawManifest; override?: Record<string, unknown> }> = [];

  if (!manifest.dependencies || manifest.dependencies.length === 0) {
    return deps;
  }

  for (const dep of manifest.dependencies) {
    const depPath = resolveManifestPath(dep.aim, fromDir);
    if (!depPath) {
      throw new Error(
        `Cannot resolve dependency "${dep.aim}"${dep.version ? ` (${dep.version})` : ""}`,
      );
    }
    const depManifest = loadRawManifest(depPath);
    deps.push({ path: depPath, manifest: depManifest, override: dep.override });
  }

  return deps;
}
