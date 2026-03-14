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
  .argument("<path>", "File or directory to check")
  .option("-m, --manifest <file>", "Path to manifest file", "aim.yaml")
  .option("--report", "Output full governance report")
  .option("-e, --environment <env>", "Override environment context (e.g., production)")
  .action(enforceCommand);

program
  .command("wrap")
  .description("Generate platform-specific context injection from AIM manifest")
  .argument("<platform>", "Target platform (claude-code, cursor, windsurf, generic)")
  .option("-m, --manifest <file>", "Path to manifest file", "aim.yaml")
  .option("-o, --output <dir>", "Output directory for generated file")
  .option("-e, --environment <env>", "Override environment context")
  .option("--dry-run", "Print to stdout instead of writing files")
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

program.parse();
