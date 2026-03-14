/**
 * CLI command: manifest serve
 *
 * Start the AIM API server for Studio and other clients.
 */

import chalk from "chalk";
import { createAPIServer } from "../../api/server.js";

interface ServeOptions {
  port?: number;
}

export async function serveCommand(options: ServeOptions): Promise<void> {
  const port = options.port ?? 4000;

  console.log(chalk.cyan("  Starting AIM API Server..."));
  console.log();

  const server = createAPIServer(port);
  server.start();

  console.log();
  console.log(chalk.dim("  Endpoints:"));
  console.log(chalk.dim("    GET  /health             Health check"));
  console.log(chalk.dim("    POST /api/manifests/*    Manifest operations"));
  console.log(chalk.dim("    POST /api/enforce        Run enforcement"));
  console.log(chalk.dim("    GET  /api/approvals      List approvals"));
  console.log(chalk.dim("    GET  /api/audit          List audit events"));
  console.log(chalk.dim("    GET  /api/escalations    List active escalations"));
  console.log();
  console.log(chalk.dim("  Press Ctrl+C to stop"));
}
