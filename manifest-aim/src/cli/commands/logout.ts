/**
 * Logout command — removes stored credentials.
 */

import chalk from "chalk";
import { loadConfig, saveConfig } from "../../registry/client.js";

export async function logoutCommand(): Promise<void> {
  const config = loadConfig();

  if (!config.apiKey) {
    console.log(chalk.yellow("\n  Not currently logged in.\n"));
    return;
  }

  // Clear credentials
  delete config.apiKey;
  delete config.userId;
  saveConfig(config);

  console.log(chalk.green("\n  ✓ Logged out successfully.\n"));
}
