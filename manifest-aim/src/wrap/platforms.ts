/**
 * Platform-specific context formatters.
 *
 * Each agent platform has its own conventions for context injection.
 * This module translates the generic AIM context into platform-specific files.
 */

import type { AgentPlatform } from "./types.js";

export interface PlatformConfig {
  /** The file name to write (relative to output dir or project root). */
  fileName: string;
  /** Description for CLI output. */
  description: string;
  /** Transform the context text for this platform. */
  transform: (context: string, manifestName: string) => string;
  /** Platform-specific features and capabilities. */
  features: {
    supportsMarkdown: boolean;
    supportsCodeBlocks: boolean;
    maxContextLength?: number;
    supportsIncludes?: boolean;
  };
}

const PLATFORMS: Record<AgentPlatform, PlatformConfig> = {
  "claude-code": {
    fileName: "CLAUDE.md",
    description: "Claude Code context file",
    features: {
      supportsMarkdown: true,
      supportsCodeBlocks: true,
      supportsIncludes: true,
    },
    transform: (context: string) => {
      // Claude Code reads CLAUDE.md as system-level instructions.
      // The generated markdown is already in the right format.
      return context;
    },
  },

  cursor: {
    fileName: ".cursorrules",
    description: "Cursor rules file",
    features: {
      supportsMarkdown: true,
      supportsCodeBlocks: true,
      maxContextLength: 100000,
    },
    transform: (context: string, manifestName: string) => {
      // Cursor reads .cursorrules as project-level instructions.
      // Add Cursor-specific header with enforcement reminder.
      const header = `# Cursor Rules — Generated from AIM manifest: ${manifestName}
# Run \`manifest enforce .\` to verify AI output compliance.
# Regenerate with: manifest wrap cursor

`;
      return header + context;
    },
  },

  windsurf: {
    fileName: ".windsurfrules",
    description: "Windsurf rules file",
    features: {
      supportsMarkdown: true,
      supportsCodeBlocks: true,
      maxContextLength: 100000,
    },
    transform: (context: string, manifestName: string) => {
      // Windsurf (Codeium) uses .windsurfrules for project context.
      // Add Windsurf-specific header.
      const header = `# Windsurf Rules — Generated from AIM manifest: ${manifestName}
# Run \`manifest enforce .\` to verify AI output compliance.
# Regenerate with: manifest wrap windsurf

`;
      return header + context;
    },
  },

  generic: {
    fileName: "aim-context.md",
    description: "Generic agent context file",
    features: {
      supportsMarkdown: true,
      supportsCodeBlocks: true,
    },
    transform: (context: string, manifestName: string) => {
      const header = `<!-- AIM Context: ${manifestName} -->
<!-- Inject this into your agent's system prompt -->

`;
      return header + context;
    },
  },
};

export function getPlatformConfig(platform: AgentPlatform): PlatformConfig {
  return PLATFORMS[platform];
}

export function getSupportedPlatforms(): AgentPlatform[] {
  return Object.keys(PLATFORMS) as AgentPlatform[];
}
