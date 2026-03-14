#!/usr/bin/env node

import { Command } from "commander";
import { validateCommand } from "./commands/validate.js";
import { initCommand } from "./commands/init.js";
import { inspectCommand } from "./commands/inspect.js";
import { doctorCommand } from "./commands/doctor.js";
import { enforceCommand } from "./commands/enforce.js";
import { compileCommand } from "./commands/compile.js";

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
  .description("Wrap an agent with AIM enforcement")
  .argument("<agent>", "Agent to wrap (claude-code, cursor, windsurf)")
  .option("-m, --manifest <file>", "Path to manifest file", "aim.yaml")
  .action(() => {
    console.log("manifest wrap — coming in v0.3.0");
  });

program
  .command("publish")
  .description("Publish manifest to the Manifest Registry")
  .argument("[file]", "Path to manifest file", "aim.yaml")
  .action(() => {
    console.log("manifest publish — coming in v0.4.0");
  });

program
  .command("install")
  .description("Install a manifest from the registry")
  .argument("<name>", "Manifest package name")
  .option("--save", "Add as dependency in current manifest")
  .action(() => {
    console.log("manifest install — coming in v0.4.0");
  });

program.parse();
