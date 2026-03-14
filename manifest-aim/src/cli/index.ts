#!/usr/bin/env node

import { Command } from "commander";
import { validateCommand } from "./commands/validate.js";
import { initCommand } from "./commands/init.js";
import { inspectCommand } from "./commands/inspect.js";
import { doctorCommand } from "./commands/doctor.js";
import { enforceCommand } from "./commands/enforce.js";
import { compileCommand } from "./commands/compile.js";
import { wrapCommand } from "./commands/wrap.js";
import { tierCommand } from "./commands/tier.js";
import { diffCommand } from "./commands/diff.js";
import { publishCommand } from "./commands/publish.js";
import { installCommand } from "./commands/install.js";
import { searchCommand } from "./commands/search.js";
import { generateCommand } from "./commands/generate.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { whoamiCommand } from "./commands/whoami.js";
import { hooksCommand } from "./commands/hooks.js";
import { auditCommand } from "./commands/audit.js";
import { approvalCommand } from "./commands/approval.js";
import { teamCommand } from "./commands/team.js";
import { serveCommand } from "./commands/serve.js";
import { mcpCommand, mcpConfigCommand } from "./commands/mcp.js";

const program = new Command();

program
  .name("manifest")
  .description("Manifest — The Agent Instruction Manifest Platform\nDefine it. Manifest it.")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize a new aim.yaml in the current directory")
  .option("-t, --template <name>", "Use a reference manifest as starting template")
  .option("--force", "Overwrite existing aim.yaml")
  .action(initCommand);

program
  .command("validate")
  .description("Validate an AIM manifest against the protocol schema")
  .argument("[file]", "Path to manifest file", "aim.yaml")
  .option("--strict", "Fail on warnings (not just errors)")
  .option("--schema <path>", "Path to custom schema file")
  .action(validateCommand);

program
  .command("inspect")
  .description("Show what an agent sees at each tier")
  .argument("[file]", "Path to manifest file", "aim.yaml")
  .option("--tier <number>", "Show specific tier (0-3)", "0")
  .option("--capability <name>", "Inspect a specific capability")
  .option("--tokens", "Show estimated token counts")
  .action(inspectCommand);

program
  .command("doctor")
  .description("Verify tools, auth, and environment health")
  .argument("[file]", "Path to manifest file", "aim.yaml")
  .action(doctorCommand);

program
  .command("compile")
  .description("Resolve dependencies, detect conflicts, produce compiled manifest")
  .argument("[file]", "Path to manifest file", "aim.yaml")
  .option("-o, --output <path>", "Output path for compiled manifest", ".aim/compiled.yaml")
  .action(compileCommand);

program
  .command("enforce")
  .description("Run enforcement checks against files")
  .argument("[path]", "File or directory to check", ".")
  .option("-m, --manifest <file>", "Path to manifest file", "aim.yaml")
  .option("--report", "Output full governance report")
  .option("-e, --environment <env>", "Override environment context (e.g., production)")
  .option("--staged", "Only check git-staged files (for pre-commit hooks)")
  .action(enforceCommand);

program
  .command("wrap")
  .description("Generate platform-specific context injection from AIM manifest")
  .argument("<platform>", "Target platform (claude-code, cursor, windsurf, generic)")
  .option("-m, --manifest <file>", "Path to manifest file", "aim.yaml")
  .option("-o, --output <dir>", "Output directory for generated file")
  .option("-e, --environment <env>", "Override environment context")
  .option("--dry-run", "Print to stdout instead of writing files")
  .option("-w, --watch", "Watch manifest for changes and regenerate")
  .option("--all", "Generate for all supported platforms at once")
  .action(wrapCommand);

program
  .command("tier")
  .description("Inspect capabilities at a specific tier level (0-3)")
  .argument("[filter]", "Filter capabilities by name or tag")
  .option("-m, --manifest <file>", "Path to manifest file", "aim.yaml")
  .option("-t, --tier <number>", "Tier level to load (0=index, 1=schema, 2=instructions, 3=dispatch)", "0")
  .action(tierCommand);

program
  .command("diff")
  .description("Compare two AIM manifests and show differences")
  .argument("<fileA>", "First manifest file")
  .argument("<fileB>", "Second manifest file")
  .action(diffCommand);

program
  .command("generate")
  .description("Auto-generate an AIM manifest from codebase analysis")
  .option("-p, --path <dir>", "Project directory to analyze", ".")
  .option("-o, --output <file>", "Output path for generated manifest", "aim.yaml")
  .option("--force", "Overwrite existing aim.yaml")
  .action(generateCommand);

program
  .command("publish")
  .description("Publish manifest to the Manifest Registry")
  .argument("[file]", "Path to manifest file", "aim.yaml")
  .option("--dry-run", "Validate and show what would be published without uploading")
  .action(publishCommand);

program
  .command("install")
  .description("Install a manifest from the registry")
  .argument("<name>", "Manifest package name (e.g., enterprise-typescript or name@1.0.0)")
  .option("--save", "Add as dependency in current manifest")
  .option("-o, --output <dir>", "Output directory", ".aim/manifests")
  .action(installCommand);

program
  .command("search")
  .description("Search the Manifest Registry")
  .argument("<query>", "Search query")
  .option("--tags <tags>", "Filter by tags (comma-separated)")
  .option("--domain <domain>", "Filter by domain")
  .option("--limit <n>", "Max results", "20")
  .action(searchCommand);

program
  .command("login")
  .description("Authenticate with the Manifest Registry")
  .action(loginCommand);

program
  .command("logout")
  .description("Sign out of the Manifest Registry")
  .action(logoutCommand);

program
  .command("whoami")
  .description("Show current authentication status")
  .action(whoamiCommand);

program
  .command("hooks")
  .description("Manage git hooks for real-time AIM enforcement")
  .argument("<action>", "Action: install, uninstall, or status")
  .option("--force", "Overwrite existing hooks")
  .option("--type <hooks>", "Hook types to install (comma-separated)", "pre-commit")
  .action(hooksCommand);

// ────────────────────────────────────────────────────────────────────────────
// Enterprise Commands
// ────────────────────────────────────────────────────────────────────────────

program
  .command("audit")
  .description("View and export audit logs for governance events")
  .argument("[subcommand]", "Subcommand: list, summary, export", "list")
  .option("--days <n>", "Filter to last N days", "7")
  .option("--type <type>", "Filter by event type")
  .option("--severity <s>", "Filter by severity")
  .option("--format <fmt>", "Output format: json, csv, table", "table")
  .option("-o, --output <path>", "Export to file")
  .option("--limit <n>", "Limit results", "50")
  .action(auditCommand);

program
  .command("approval")
  .description("Manage approval requests for require_approval rules")
  .argument("[subcommand]", "Subcommand: list, show, approve, reject, cancel")
  .argument("[args...]", "Additional arguments")
  .option("--policy <name>", "Filter by approval policy")
  .option("--status <s>", "Filter by status")
  .option("--limit <n>", "Limit results", "20")
  .action((subcommand, args, options) => approvalCommand(subcommand, args, options));

program
  .command("team")
  .description("Manage teams and RBAC permissions")
  .argument("[subcommand]", "Subcommand: list, show, create, add-member, remove-member, roles")
  .argument("[args...]", "Additional arguments")
  .option("--role <role>", "Role to assign")
  .action((subcommand, args, options) => teamCommand(subcommand, args, options));

program
  .command("serve")
  .description("Start the AIM API server for Studio and other clients")
  .option("-p, --port <port>", "Port to listen on", "4000")
  .action((options) => serveCommand({ port: parseInt(options.port, 10) }));

program
  .command("mcp")
  .description("Start the AIM MCP server for native agent integration")
  .option("-m, --manifest <file>", "Path to manifest file", "aim.yaml")
  .option("--config", "Show MCP configuration instructions")
  .action((options) => {
    if (options.config) {
      mcpConfigCommand();
    } else {
      mcpCommand({ manifest: options.manifest });
    }
  });

program.parse();
