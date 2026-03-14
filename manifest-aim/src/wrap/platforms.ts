/**
 * Platform-specific context formatters.
 *
 * Each agent platform has its own conventions for context injection.
 * This module translates the generic AIM context into platform-specific files.
 */

import type { AgentPlatform } from "./types.js";

interface PlatformConfig {
  /** The file name to write (relative to output dir or project root). */
  fileName: string;
  /** Description for CLI output. */
  description: string;
  /** Transform the context text for this platform. */
  transform: (context: string, manifestName: string) => string;
}

const PLATFORMS: Record<AgentPlatform, PlatformConfig> = {
  "claude-code": {
    fileName: "CLAUDE.md",
    description: "Claude Code context file",
    transform: (context: string) => {
      // Claude Code reads CLAUDE.md as system-level instructions.
      // The generated markdown is already in the right format.
      return context;
    },
  },

  cursor: {
    fileName: ".cursorrules",
    description: "Cursor rules file",
    transform: (context: string) => {
      // Cursor reads .cursorrules as project-level instructions.
      // Same markdown format works.
      return context;
    },
  },

  windsurf: {
    fileName: ".windsurfrules",
    description: "Windsurf rules file",
    transform: (context: string) => {
      return context;
    },
  },

  generic: {
    fileName: "aim-context.md",
    description: "Generic agent context file",
    transform: (context: string) => {
      return context;
    },
  },
};

export function getPlatformConfig(platform: AgentPlatform): PlatformConfig {
  return PLATFORMS[platform];
}

export function getSupportedPlatforms(): AgentPlatform[] {
  return Object.keys(PLATFORMS) as AgentPlatform[];
}
