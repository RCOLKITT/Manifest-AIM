/**
 * Manifest Resolver
 *
 * Resolves manifest dependencies and builds dependency trees.
 */

import type { RegistryConfig, SearchResult } from "./client.js";
import { installManifest } from "./client.js";

export interface ResolvedManifest {
  name: string;
  version: string;
  path: string;
  dependencies: ResolvedManifest[];
}

export interface ResolutionResult {
  root: ResolvedManifest;
  flat: ResolvedManifest[];
  order: string[]; // Installation order (dependencies first)
}

export interface DependencySpec {
  name: string;
  version?: string; // semver range or exact version
}

/**
 * Parse a dependency string like "name@1.0.0" or "name"
 */
export function parseDependencySpec(spec: string): DependencySpec {
  const atIndex = spec.lastIndexOf("@");
  if (atIndex > 0) {
    return {
      name: spec.substring(0, atIndex),
      version: spec.substring(atIndex + 1),
    };
  }
  return { name: spec };
}

/**
 * Resolve all dependencies for a manifest
 */
export async function resolveDependencies(
  rootName: string,
  rootVersion: string | undefined,
  config: RegistryConfig,
  outputDir: string = ".aim/manifests"
): Promise<ResolutionResult> {
  const resolved = new Map<string, ResolvedManifest>();
  const order: string[] = [];

  async function resolve(
    name: string,
    version: string | undefined
  ): Promise<ResolvedManifest> {
    const key = version ? `${name}@${version}` : name;

    // Check if already resolved
    if (resolved.has(key)) {
      return resolved.get(key)!;
    }

    // Install the manifest
    const result = await installManifest(name, version, config, outputDir);

    const manifest: ResolvedManifest = {
      name: result.name,
      version: result.version,
      path: result.path,
      dependencies: [],
    };

    resolved.set(key, manifest);

    // Resolve dependencies recursively
    for (const depSpec of result.dependencies) {
      const { name: depName, version: depVersion } = parseDependencySpec(depSpec);
      const depManifest = await resolve(depName, depVersion);
      manifest.dependencies.push(depManifest);
    }

    // Add to order (dependencies first, so add after deps are resolved)
    order.push(`${result.name}@${result.version}`);

    return manifest;
  }

  const root = await resolve(rootName, rootVersion);

  return {
    root,
    flat: Array.from(resolved.values()),
    order,
  };
}

/**
 * Check for version conflicts in resolved dependencies
 */
export function checkConflicts(
  result: ResolutionResult
): Array<{ name: string; versions: string[] }> {
  const versionsByName = new Map<string, Set<string>>();

  for (const manifest of result.flat) {
    if (!versionsByName.has(manifest.name)) {
      versionsByName.set(manifest.name, new Set());
    }
    versionsByName.get(manifest.name)!.add(manifest.version);
  }

  const conflicts: Array<{ name: string; versions: string[] }> = [];
  for (const [name, versions] of versionsByName) {
    if (versions.size > 1) {
      conflicts.push({ name, versions: Array.from(versions) });
    }
  }

  return conflicts;
}

/**
 * Generate a lockfile from resolved dependencies
 */
export function generateLockfile(result: ResolutionResult): string {
  const lockfile = {
    version: 1,
    generated: new Date().toISOString(),
    dependencies: result.flat.map((m) => ({
      name: m.name,
      version: m.version,
      path: m.path,
    })),
  };

  return JSON.stringify(lockfile, null, 2);
}

/**
 * Parse a lockfile
 */
export function parseLockfile(content: string): {
  version: number;
  generated: string;
  dependencies: Array<{ name: string; version: string; path: string }>;
} {
  return JSON.parse(content);
}

/**
 * Compare semantic versions
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, "").split(".").map(Number);
  const partsB = b.replace(/^v/, "").split(".").map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;
    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }

  return 0;
}

/**
 * Check if a version satisfies a semver range (simplified)
 */
export function satisfies(version: string, range: string): boolean {
  // Handle exact match
  if (range === version || range === `v${version}` || `v${range}` === version) {
    return true;
  }

  // Handle caret (^) - compatible with major version
  if (range.startsWith("^")) {
    const rangeVersion = range.substring(1);
    const [rangeMajor] = rangeVersion.split(".").map(Number);
    const [versionMajor] = version.split(".").map(Number);
    return versionMajor === rangeMajor && compareVersions(version, rangeVersion) >= 0;
  }

  // Handle tilde (~) - compatible with minor version
  if (range.startsWith("~")) {
    const rangeVersion = range.substring(1);
    const [rangeMajor, rangeMinor] = rangeVersion.split(".").map(Number);
    const [versionMajor, versionMinor] = version.split(".").map(Number);
    return (
      versionMajor === rangeMajor &&
      versionMinor === rangeMinor &&
      compareVersions(version, rangeVersion) >= 0
    );
  }

  // Handle >= and >
  if (range.startsWith(">=")) {
    return compareVersions(version, range.substring(2)) >= 0;
  }
  if (range.startsWith(">")) {
    return compareVersions(version, range.substring(1)) > 0;
  }

  // Handle <= and <
  if (range.startsWith("<=")) {
    return compareVersions(version, range.substring(2)) <= 0;
  }
  if (range.startsWith("<")) {
    return compareVersions(version, range.substring(1)) < 0;
  }

  // Handle wildcard
  if (range === "*" || range === "latest") {
    return true;
  }

  return false;
}
