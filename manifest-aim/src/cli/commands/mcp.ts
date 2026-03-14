/**
 * CLI command: manifest mcp
 *
 * Start the AIM MCP (Model Context Protocol) server for native agent integration.
 */

import chalk from "chalk";
import { runMCPServer } from "../../mcp/index.js";

interface MCPOptions {
  manifest?: string;
}

export async function mcpCommand(options: MCPOptions): Promise<void> {
  // When running as MCP server, we want minimal output to stderr
  // (stdout is used for MCP protocol communication)
  console.error(chalk.dim("  Starting AIM MCP Server..."));

  try {
    await runMCPServer({
      manifestPath: options.manifest,
    });
  } catch (error) {
    console.error(chalk.red(`  Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

/**
 * Print MCP configuration instructions
 */
export function mcpConfigCommand(): void {
  console.log();
  console.log(chalk.white.bold("  AIM MCP Server Configuration"));
  console.log();
  console.log(chalk.dim("  Add this to your MCP client configuration:"));
  console.log();
  console.log(chalk.cyan("  Claude Desktop (claude_desktop_config.json):"));
  console.log(chalk.gray(`  {
    "mcpServers": {
      "aim": {
        "command": "npx",
        "args": ["manifest", "mcp"]
      }
    }
  }`));
  console.log();
  console.log(chalk.cyan("  Claude Code (settings.json):"));
  console.log(chalk.gray(`  {
    "mcpServers": {
      "aim": {
        "command": "npx manifest mcp"
      }
    }
  }`));
  console.log();
  console.log(chalk.dim("  Available tools:"));
  console.log(chalk.dim("    • aim_enforce  — Run governance checks on code"));
  console.log(chalk.dim("    • aim_validate — Validate a manifest"));
  console.log(chalk.dim("    • aim_rules    — List governance rules"));
  console.log(chalk.dim("    • aim_context  — Get project guidelines"));
  console.log(chalk.dim("    • aim_knowledge — Get relevant knowledge units"));
  console.log();
}
