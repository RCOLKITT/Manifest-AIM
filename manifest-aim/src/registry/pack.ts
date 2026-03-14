/**
 * Manifest Pack/Unpack
 *
 * Package manifests for distribution with all dependencies bundled.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { createHash } from "crypto";
import yaml from "js-yaml";

export interface PackedManifest {
  format: "aim-pack-v1";
  name: string;
  version: string;
  description?: string;
  checksum: string;
  createdAt: string;
  manifest: Record<string, unknown>;
  dependencies?: Array<{
    name: string;
    version: string;
    manifest: Record<string, unknown>;
  }>;
}

export interface PackOptions {
  includeDependencies?: boolean;
  outputPath?: string;
}

/**
 * Pack a manifest and its dependencies into a single distributable file
 */
export async function packManifest(
  manifestPath: string,
  options: PackOptions = {}
): Promise<{ path: string; size: number; checksum: string }> {
  const content = await fs.readFile(manifestPath, "utf-8");
  const manifest = yaml.load(content) as Record<string, unknown>;

  const metadata = (manifest.metadata ?? {}) as Record<string, unknown>;
  const name = metadata.name as string;
  const version = metadata.version as string;
  const description = metadata.description as string | undefined;

  if (!name || !version) {
    throw new Error("Manifest must have metadata.name and metadata.version");
  }

  const packed: PackedManifest = {
    format: "aim-pack-v1",
    name,
    version,
    description,
    checksum: "",
    createdAt: new Date().toISOString(),
    manifest,
    dependencies: [],
  };

  // Include dependencies if requested
  if (options.includeDependencies) {
    const deps = (manifest.extends ?? []) as Array<string | Record<string, unknown>>;
    for (const dep of deps) {
      const depName = typeof dep === "string" ? dep : (dep.name as string);
      const depVersion = typeof dep === "string" ? "latest" : (dep.version as string) ?? "latest";

      // Try to find dependency in .aim/manifests/
      const depPath = path.join(path.dirname(manifestPath), ".aim", "manifests", `${depName}.aim.yaml`);
      try {
        const depContent = await fs.readFile(depPath, "utf-8");
        const depManifest = yaml.load(depContent) as Record<string, unknown>;
        packed.dependencies!.push({
          name: depName,
          version: depVersion,
          manifest: depManifest,
        });
      } catch {
        // Dependency not found locally, skip
        console.warn(`Warning: Dependency ${depName} not found locally`);
      }
    }
  }

  // Calculate checksum
  const contentForHash = JSON.stringify({
    manifest: packed.manifest,
    dependencies: packed.dependencies,
  });
  packed.checksum = createHash("sha256").update(contentForHash).digest("hex");

  // Write packed file
  const outputPath = options.outputPath ?? `${name}-${version}.aim.pack.json`;
  const packedContent = JSON.stringify(packed, null, 2);
  await fs.writeFile(outputPath, packedContent, "utf-8");

  const stats = await fs.stat(outputPath);

  return {
    path: outputPath,
    size: stats.size,
    checksum: packed.checksum,
  };
}

/**
 * Unpack a packed manifest file
 */
export async function unpackManifest(
  packedPath: string,
  outputDir: string = "."
): Promise<{ mainPath: string; dependencies: string[] }> {
  const content = await fs.readFile(packedPath, "utf-8");
  const packed = JSON.parse(content) as PackedManifest;

  if (packed.format !== "aim-pack-v1") {
    throw new Error(`Unsupported pack format: ${packed.format}`);
  }

  // Verify checksum
  const contentForHash = JSON.stringify({
    manifest: packed.manifest,
    dependencies: packed.dependencies,
  });
  const calculatedChecksum = createHash("sha256").update(contentForHash).digest("hex");

  if (calculatedChecksum !== packed.checksum) {
    throw new Error("Checksum verification failed - package may be corrupted");
  }

  // Write main manifest
  const mainPath = path.join(outputDir, "aim.yaml");
  await fs.writeFile(mainPath, yaml.dump(packed.manifest, { lineWidth: 120 }), "utf-8");

  const dependencyPaths: string[] = [];

  // Write dependencies
  if (packed.dependencies && packed.dependencies.length > 0) {
    const depsDir = path.join(outputDir, ".aim", "manifests");
    await fs.mkdir(depsDir, { recursive: true });

    for (const dep of packed.dependencies) {
      const depPath = path.join(depsDir, `${dep.name}.aim.yaml`);
      await fs.writeFile(depPath, yaml.dump(dep.manifest, { lineWidth: 120 }), "utf-8");
      dependencyPaths.push(depPath);
    }
  }

  return {
    mainPath,
    dependencies: dependencyPaths,
  };
}

/**
 * Verify a packed manifest file
 */
export async function verifyPack(packedPath: string): Promise<{
  valid: boolean;
  name: string;
  version: string;
  checksum: string;
  dependencyCount: number;
  error?: string;
}> {
  try {
    const content = await fs.readFile(packedPath, "utf-8");
    const packed = JSON.parse(content) as PackedManifest;

    if (packed.format !== "aim-pack-v1") {
      return {
        valid: false,
        name: packed.name ?? "unknown",
        version: packed.version ?? "unknown",
        checksum: packed.checksum ?? "",
        dependencyCount: packed.dependencies?.length ?? 0,
        error: `Unsupported pack format: ${packed.format}`,
      };
    }

    // Verify checksum
    const contentForHash = JSON.stringify({
      manifest: packed.manifest,
      dependencies: packed.dependencies,
    });
    const calculatedChecksum = createHash("sha256").update(contentForHash).digest("hex");

    if (calculatedChecksum !== packed.checksum) {
      return {
        valid: false,
        name: packed.name,
        version: packed.version,
        checksum: packed.checksum,
        dependencyCount: packed.dependencies?.length ?? 0,
        error: "Checksum verification failed",
      };
    }

    return {
      valid: true,
      name: packed.name,
      version: packed.version,
      checksum: packed.checksum,
      dependencyCount: packed.dependencies?.length ?? 0,
    };
  } catch (error) {
    return {
      valid: false,
      name: "unknown",
      version: "unknown",
      checksum: "",
      dependencyCount: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get info about a packed manifest without unpacking
 */
export async function inspectPack(packedPath: string): Promise<{
  format: string;
  name: string;
  version: string;
  description?: string;
  checksum: string;
  createdAt: string;
  ruleCount: number;
  capabilityCount: number;
  knowledgeCount: number;
  dependencyCount: number;
  dependencies: Array<{ name: string; version: string }>;
}> {
  const content = await fs.readFile(packedPath, "utf-8");
  const packed = JSON.parse(content) as PackedManifest;

  const governance = (packed.manifest.governance ?? {}) as Record<string, unknown>;
  const rules = (governance.rules ?? []) as unknown[];
  const capabilities = (packed.manifest.capabilities ?? []) as unknown[];
  const knowledge = (packed.manifest.knowledge ?? []) as unknown[];

  return {
    format: packed.format,
    name: packed.name,
    version: packed.version,
    description: packed.description,
    checksum: packed.checksum,
    createdAt: packed.createdAt,
    ruleCount: rules.length,
    capabilityCount: capabilities.length,
    knowledgeCount: knowledge.length,
    dependencyCount: packed.dependencies?.length ?? 0,
    dependencies: (packed.dependencies ?? []).map((d) => ({
      name: d.name,
      version: d.version,
    })),
  };
}
