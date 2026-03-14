/**
 * Manifest Registry
 *
 * Publish and install AIM manifests from the registry.
 */

export {
  loadConfig,
  saveConfig,
  prepareManifestForPublish,
  publishManifest,
  installManifest,
  searchManifests,
} from "./client.js";
export type {
  RegistryConfig,
  PublishResult,
  SearchResult,
  InstallResult,
} from "./client.js";

export {
  resolveDependencies,
  checkConflicts,
  generateLockfile,
  parseLockfile,
  compareVersions,
  satisfies,
  parseDependencySpec,
} from "./resolver.js";
export type {
  ResolvedManifest,
  ResolutionResult,
  DependencySpec,
} from "./resolver.js";

export {
  packManifest,
  unpackManifest,
  verifyPack,
  inspectPack,
} from "./pack.js";
export type {
  PackedManifest,
  PackOptions,
} from "./pack.js";
