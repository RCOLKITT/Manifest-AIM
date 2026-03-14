/**
 * Wrap engine — generates platform-specific context injection from AIM manifests.
 *
 * `manifest wrap <platform>` loads an AIM manifest, extracts all context
 * (governance rules, knowledge, quality gates, capabilities, persona),
 * and writes a platform-specific file that injects AIM governance into
 * the agent's context window.
 *
 * This is Phase 1: wrapper mode. The agent receives AIM context as instructions.
 * Enforcement happens post-output via `manifest enforce`.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { extractManifestContext, generateContextText } from "./context-generator.js";
import { getPlatformConfig } from "./platforms.js";
import type { WrapOptions, WrapResult, AgentPlatform } from "./types.js";

/**
 * Wrap a manifest for a target agent platform.
 */
export function wrap(options: WrapOptions): WrapResult {
  const {
    manifestPath,
    platform,
    outputDir,
    environment,
    dryRun = false,
  } = options;

  // 1. Extract manifest context
  const ctx = extractManifestContext(manifestPath, environment);

  // 2. Generate the context injection text
  const { text, sections } = generateContextText(ctx);

  // 3. Get platform-specific config
  const platformConfig = getPlatformConfig(platform);

  // 4. Apply platform-specific transform
  const finalText = platformConfig.transform(text, ctx.metadata.name);

  // 5. Write to file (unless dry-run)
  let outputPath: string | null = null;
  if (!dryRun) {
    if (platform === "claude-code") {
      // CLAUDE.md goes in the project root (or outputDir if specified)
      const dir = outputDir ? resolve(outputDir) : resolve(".");
      outputPath = join(dir, platformConfig.fileName);
    } else if (platform === "cursor" || platform === "windsurf") {
      // .cursorrules / .windsurfrules go in project root
      const dir = outputDir ? resolve(outputDir) : resolve(".");
      outputPath = join(dir, platformConfig.fileName);
    } else {
      // Generic: put in .aim/ directory
      const dir = outputDir ? resolve(outputDir) : resolve(".aim");
      outputPath = join(dir, platformConfig.fileName);
    }

    const targetDir = dirname(outputPath);
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    writeFileSync(outputPath, finalText, "utf-8");
  }

  return {
    context: finalText,
    outputPath,
    sections,
    manifest: {
      name: ctx.metadata.name,
      version: ctx.metadata.version,
    },
  };
}
