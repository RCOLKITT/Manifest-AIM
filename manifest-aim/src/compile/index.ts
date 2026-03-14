export { compile } from "./compiler.js";
export { resolveInheritanceChain, resolveDependencies, resolveManifestPath, loadRawManifest } from "./resolver.js";
export { mergeManifests } from "./merge.js";
export type {
  RawManifest,
  RawRule,
  CompositionStrategy,
  Conflict,
  CompileResult,
} from "./types.js";
