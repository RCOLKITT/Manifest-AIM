/**
 * Registry client — communicates with the Manifest Registry (Supabase backend).
 *
 * Handles publish, install, search, and authentication for the CLI.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { createHash } from "node:crypto";
import yaml from "js-yaml";

const DEFAULT_REGISTRY_URL = "https://registry.manifestaim.dev";
const CONFIG_DIR = join(
  process.env.HOME ?? process.env.USERPROFILE ?? ".",
  ".manifest-aim",
);
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface RegistryConfig {
  registryUrl: string;
  apiKey?: string;
  userId?: string;
}

export interface PublishResult {
  name: string;
  version: string;
  url: string;
  checksum: string;
}

export interface SearchResult {
  name: string;
  description: string;
  tags: string[];
  domain: string;
  downloads: number;
  stars: number;
  latest_version: string;
  is_official: boolean;
}

export interface InstallResult {
  name: string;
  version: string;
  path: string;
  dependencies: string[];
}

/**
 * Load or create registry configuration.
 */
export function loadConfig(): RegistryConfig {
  if (existsSync(CONFIG_FILE)) {
    const content = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content);
  }
  return { registryUrl: DEFAULT_REGISTRY_URL };
}

/**
 * Save registry configuration.
 */
export function saveConfig(config: RegistryConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Parse a manifest file and extract metadata for publishing.
 */
export function prepareManifestForPublish(manifestPath: string): {
  content: Record<string, unknown>;
  metadata: { name: string; version: string; description: string };
  checksum: string;
  ruleCount: number;
  capabilityCount: number;
  knowledgeCount: number;
  enforcementTypes: string[];
} {
  const resolvedPath = resolve(manifestPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Manifest not found: ${resolvedPath}`);
  }

  const raw = readFileSync(resolvedPath, "utf-8");
  const ext = extname(resolvedPath).toLowerCase();
  const content = (ext === ".json" ? JSON.parse(raw) : yaml.load(raw)) as Record<string, unknown>;

  const metadata = (content.metadata ?? {}) as Record<string, unknown>;
  const name = metadata.name as string;
  const version = metadata.version as string;
  const description = (metadata.description as string) ?? "";

  if (!name) throw new Error("Manifest must have metadata.name");
  if (!version) throw new Error("Manifest must have metadata.version");

  // Validate name format
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name) && name.length > 1) {
    throw new Error(`Invalid manifest name: "${name}". Use lowercase alphanumeric with hyphens.`);
  }

  const governance = (content.governance ?? {}) as Record<string, unknown>;
  const rules = (governance.rules ?? []) as unknown[];
  const capabilities = (content.capabilities ?? []) as unknown[];
  const knowledge = (content.knowledge ?? []) as unknown[];

  // Extract enforcement types
  const enforcementTypes = [
    ...new Set(
      (rules as Array<Record<string, unknown>>)
        .map((r) => {
          const e = r.enforcement;
          if (typeof e === "string") return e;
          if (e && typeof e === "object") return (e as Record<string, unknown>).primary as string;
          return null;
        })
        .filter((e): e is string => e !== null),
    ),
  ];

  // Compute checksum
  const checksum = createHash("sha256").update(raw).digest("hex");

  return {
    content,
    metadata: { name, version, description },
    checksum,
    ruleCount: rules.length,
    capabilityCount: capabilities.length,
    knowledgeCount: knowledge.length,
    enforcementTypes,
  };
}

/**
 * Publish a manifest to the registry.
 */
export async function publishManifest(
  manifestPath: string,
  config: RegistryConfig,
): Promise<PublishResult> {
  if (!config.apiKey) {
    throw new Error(
      "Not authenticated. Run `manifest login` to authenticate with the registry.",
    );
  }

  const prepared = prepareManifestForPublish(manifestPath);

  const response = await fetch(`${config.registryUrl}/api/v1/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "User-Agent": "manifest-aim-cli/0.1.0",
    },
    body: JSON.stringify({
      name: prepared.metadata.name,
      version: prepared.metadata.version,
      description: prepared.metadata.description,
      content: prepared.content,
      checksum: prepared.checksum,
      rule_count: prepared.ruleCount,
      capability_count: prepared.capabilityCount,
      knowledge_count: prepared.knowledgeCount,
      enforcement_types: prepared.enforcementTypes,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Publish failed (${response.status}): ${error}`);
  }

  const result = await response.json();
  return {
    name: prepared.metadata.name,
    version: prepared.metadata.version,
    url: `${config.registryUrl}/manifests/${prepared.metadata.name}`,
    checksum: prepared.checksum,
  };
}

/**
 * Install a manifest from the registry.
 */
export async function installManifest(
  packageName: string,
  version: string | undefined,
  config: RegistryConfig,
  outputDir: string = ".aim/manifests",
): Promise<InstallResult> {
  const versionParam = version ? `?version=${version}` : "";
  const response = await fetch(
    `${config.registryUrl}/api/v1/manifests/${packageName}${versionParam}`,
    {
      headers: {
        "User-Agent": "manifest-aim-cli/0.1.0",
      },
    },
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Manifest "${packageName}" not found in registry.`);
    }
    throw new Error(`Install failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as {
    name: string;
    version: string;
    content: Record<string, unknown>;
    dependencies?: Array<{ name: string; version: string }>;
  };

  // Write manifest to local .aim/manifests/
  const resolvedDir = resolve(outputDir);
  if (!existsSync(resolvedDir)) {
    mkdirSync(resolvedDir, { recursive: true });
  }

  const outputPath = join(resolvedDir, `${data.name}.aim.yaml`);
  writeFileSync(outputPath, yaml.dump(data.content, { lineWidth: 120 }));

  // Record download
  try {
    await fetch(`${config.registryUrl}/api/v1/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: packageName,
        version: data.version,
        cli_version: "0.1.0",
      }),
    });
  } catch {
    // Download tracking is best-effort
  }

  return {
    name: data.name,
    version: data.version,
    path: outputPath,
    dependencies: (data.dependencies ?? []).map((d) => `${d.name}@${d.version}`),
  };
}

/**
 * Search the registry for manifests.
 */
export async function searchManifests(
  query: string,
  config: RegistryConfig,
  options?: { tags?: string[]; domain?: string; limit?: number },
): Promise<SearchResult[]> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (options?.tags) params.set("tags", options.tags.join(","));
  if (options?.domain) params.set("domain", options.domain);
  if (options?.limit) params.set("limit", String(options.limit));

  const response = await fetch(
    `${config.registryUrl}/api/v1/search?${params.toString()}`,
    {
      headers: { "User-Agent": "manifest-aim-cli/0.1.0" },
    },
  );

  if (!response.ok) {
    throw new Error(`Search failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as SearchResult[];
}
