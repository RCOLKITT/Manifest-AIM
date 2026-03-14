/**
 * File operations for project analysis.
 * Adapted from Rebar MCP for use in Manifest CLI.
 */
import { readFile, access, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

/**
 * Safely reads a file, returning null if it doesn't exist or can't be read.
 */
export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Checks if a file or directory exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists files recursively in a directory.
 */
export async function listFilesRecursive(
  dirPath: string,
  maxDepth = 3
): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip common non-source directories
          if (
            !["node_modules", ".git", "dist", "build", ".next", "coverage"].includes(
              entry.name
            )
          ) {
            await walk(fullPath, depth + 1);
          }
        } else {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory not accessible, skip
    }
  }

  await walk(dirPath, 0);
  return files;
}
