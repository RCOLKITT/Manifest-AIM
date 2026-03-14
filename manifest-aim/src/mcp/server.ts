/**
 * AIM MCP Server
 *
 * Model Context Protocol server that exposes AIM functionality as tools
 * for native agent integration.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as os from "node:os";
import yaml from "js-yaml";
import { enforce, loadManifestForEnforcement } from "../enforce/index.js";
import { extractManifestContext, generateContextText } from "../wrap/context-generator.js";
import type { EnforceSummary, Violation } from "../enforce/types.js";

const SERVER_NAME = "aim";
const SERVER_VERSION = "0.1.0";

interface MCPServerConfig {
  manifestPath?: string;
  projectPath?: string;
}

/**
 * Create and configure the AIM MCP server
 */
export function createMCPServer(config: MCPServerConfig = {}) {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  const projectPath = config.projectPath || process.cwd();
  const manifestPath = config.manifestPath || join(projectPath, "aim.yaml");

  // ──────────────────────────────────────────────────────────────────────────
  // Tools
  // ──────────────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "aim_enforce",
        description: "Run AIM governance enforcement on code. Returns violations if any rules are broken.",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "The code content to check",
            },
            filePath: {
              type: "string",
              description: "The file path (for context)",
            },
            environment: {
              type: "string",
              description: "Environment override (development, production)",
            },
          },
          required: ["content", "filePath"],
        },
      },
      {
        name: "aim_validate",
        description: "Check if a manifest is valid",
        inputSchema: {
          type: "object",
          properties: {
            manifestPath: {
              type: "string",
              description: "Path to the manifest file (defaults to aim.yaml)",
            },
          },
        },
      },
      {
        name: "aim_rules",
        description: "List all governance rules from the current manifest",
        inputSchema: {
          type: "object",
          properties: {
            filter: {
              type: "string",
              description: "Filter by category (security, quality, style)",
            },
          },
        },
      },
      {
        name: "aim_context",
        description: "Get the current AIM context/guidelines for the project",
        inputSchema: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              description: "Platform format (claude-code, cursor, generic)",
              default: "generic",
            },
          },
        },
      },
      {
        name: "aim_knowledge",
        description: "Get relevant knowledge units for a task",
        inputSchema: {
          type: "object",
          properties: {
            trigger: {
              type: "string",
              description: "The task or context to match against knowledge triggers",
            },
          },
          required: ["trigger"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "aim_enforce": {
        const { content, filePath, environment } = args as {
          content: string;
          filePath: string;
          environment?: string;
        };

        try {
          if (!existsSync(manifestPath)) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: "No aim.yaml manifest found",
                    hint: "Run 'manifest init' to create one",
                  }),
                },
              ],
            };
          }

          // Write content to a temp file for enforcement
          const tempDir = join(os.tmpdir(), "aim-mcp");
          if (!existsSync(tempDir)) {
            mkdirSync(tempDir, { recursive: true });
          }
          const tempFile = join(tempDir, filePath.replace(/[/\\]/g, "_"));
          writeFileSync(tempFile, content, "utf-8");

          const result: EnforceSummary = await enforce({
            manifestPath,
            targetPath: tempFile,
            environment,
          });

          // Collect all violations from results
          const allViolations: Violation[] = [];
          for (const r of result.results) {
            allViolations.push(...r.violations);
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  passed: result.totalViolations === 0,
                  violations: allViolations,
                  blocked: result.blocked,
                  warnings: allViolations.filter((v) => v.action === "warn").length,
                }),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : "Unknown error",
                }),
              },
            ],
            isError: true,
          };
        }
      }

      case "aim_validate": {
        const { manifestPath: customPath } = args as { manifestPath?: string };
        const pathToValidate = customPath || manifestPath;

        try {
          if (!existsSync(pathToValidate)) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ valid: false, error: "Manifest not found" }),
                },
              ],
            };
          }

          loadManifestForEnforcement(pathToValidate);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ valid: true }),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  valid: false,
                  error: error instanceof Error ? error.message : "Unknown error",
                }),
              },
            ],
          };
        }
      }

      case "aim_rules": {
        const { filter } = args as { filter?: string };

        try {
          if (!existsSync(manifestPath)) {
            return {
              content: [{ type: "text", text: JSON.stringify({ rules: [], error: "No manifest" }) }],
            };
          }

          const manifest = loadManifestForEnforcement(manifestPath);
          let rules = manifest.rules;

          if (filter) {
            rules = rules.filter((r) =>
              r.category?.toLowerCase() === filter.toLowerCase()
            );
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  rules: rules.map((r) => ({
                    name: r.name,
                    description: r.description,
                    category: r.category,
                    severity: r.severity,
                    action: r.action,
                    enforcement: r.enforcement,
                  })),
                }),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : "Unknown error",
                }),
              },
            ],
            isError: true,
          };
        }
      }

      case "aim_context": {
        try {
          if (!existsSync(manifestPath)) {
            return {
              content: [{ type: "text", text: "No AIM manifest found in this project." }],
            };
          }

          const context = extractManifestContext(manifestPath);
          const result = generateContextText(context);

          return {
            content: [{ type: "text", text: result.text }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error generating context: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }

      case "aim_knowledge": {
        const { trigger } = args as { trigger: string };

        try {
          if (!existsSync(manifestPath)) {
            return {
              content: [{ type: "text", text: JSON.stringify({ knowledge: [] }) }],
            };
          }

          const content = readFileSync(manifestPath, "utf-8");
          const manifest = yaml.load(content) as Record<string, unknown>;
          const knowledge = (manifest.knowledge ?? []) as Array<Record<string, unknown>>;

          // Simple trigger matching
          const triggerLower = trigger.toLowerCase();
          const matched = knowledge.filter((k) => {
            const kTrigger = (k.trigger as string)?.toLowerCase() || "";
            return kTrigger.split(/[,;]/).some((t) => triggerLower.includes(t.trim()));
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  matched: matched.length,
                  knowledge: matched.map((k) => ({
                    name: k.name,
                    content: k.content,
                  })),
                }),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : "Unknown error",
                }),
              },
            ],
            isError: true,
          };
        }
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Resources
  // ──────────────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources: Array<{
      uri: string;
      name: string;
      description?: string;
      mimeType?: string;
    }> = [];

    // Add manifest as a resource
    if (existsSync(manifestPath)) {
      resources.push({
        uri: `aim://manifest`,
        name: "AIM Manifest",
        description: "The project's AIM governance manifest",
        mimeType: "application/x-yaml",
      });
    }

    // Add reference manifests
    const referencePath = join(projectPath, "manifests", "reference");
    if (existsSync(referencePath)) {
      try {
        const files = readdirSync(referencePath);
        for (const file of files) {
          if (file.endsWith(".yaml") || file.endsWith(".yml")) {
            resources.push({
              uri: `aim://reference/${file}`,
              name: `Reference: ${file.replace(/\.ya?ml$/, "")}`,
              description: `Reference manifest: ${file}`,
              mimeType: "application/x-yaml",
            });
          }
        }
      } catch {
        // Ignore errors
      }
    }

    return { resources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === "aim://manifest") {
      if (!existsSync(manifestPath)) {
        throw new Error("Manifest not found");
      }
      const content = readFileSync(manifestPath, "utf-8");
      return {
        contents: [{ uri, mimeType: "application/x-yaml", text: content }],
      };
    }

    if (uri.startsWith("aim://reference/")) {
      const fileName = uri.replace("aim://reference/", "");
      const filePath = join(projectPath, "manifests", "reference", fileName);
      if (!existsSync(filePath)) {
        throw new Error(`Reference manifest not found: ${fileName}`);
      }
      const content = readFileSync(filePath, "utf-8");
      return {
        contents: [{ uri, mimeType: "application/x-yaml", text: content }],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  return server;
}

/**
 * Run the MCP server
 */
export async function runMCPServer(config: MCPServerConfig = {}) {
  const server = createMCPServer(config);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Handle shutdown
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}
