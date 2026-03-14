/**
 * Login command — authenticates with the Manifest Registry using Supabase Auth.
 *
 * Flow:
 * 1. Generate a random session code
 * 2. Open browser to auth page with session code
 * 3. Poll the auth endpoint until user completes login
 * 4. Save credentials to ~/.manifest-aim/config.json
 */

import chalk from "chalk";
import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";
import { loadConfig, saveConfig } from "../../registry/client.js";

const SUPABASE_URL = "https://jhwfncfwmpttwfcyiefk.supabase.co";
const AUTH_BASE_URL = `${SUPABASE_URL}/functions/v1`;
const WEB_AUTH_URL = "https://manifest-aim.com/auth/cli";

// Public publishable key - safe to include (security via RLS policies)
const SUPABASE_ANON_KEY = "sb_publishable_JEbbEKI_ZvC5pYGpEHmmgg_XkUEDw7j";

interface AuthSession {
  session_id: string;
  status: "pending" | "completed" | "expired";
  access_token?: string;
  refresh_token?: string;
  user_id?: string;
  email?: string;
  api_key?: string;
}

export async function loginCommand(): Promise<void> {
  console.log();
  console.log(chalk.white.bold("  Manifest AIM — Login"));
  console.log();

  // Check if already logged in
  const existingConfig = loadConfig();
  if (existingConfig.apiKey) {
    console.log(chalk.yellow("  Already logged in."));
    console.log(chalk.dim(`  Run ${chalk.white("manifest logout")} to sign out first.`));
    console.log();
    return;
  }

  // Generate session ID for device auth flow
  const sessionId = randomBytes(16).toString("hex");

  // Create auth session on server
  console.log(chalk.dim("  Creating auth session..."));

  try {
    const initResponse = await fetch(`${AUTH_BASE_URL}/auth-init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!initResponse.ok) {
      throw new Error(`Failed to create auth session: ${await initResponse.text()}`);
    }

    const authUrl = `${WEB_AUTH_URL}?session=${sessionId}`;

    console.log();
    console.log(chalk.white("  Opening browser for authentication..."));
    console.log(chalk.dim(`  → ${authUrl}`));
    console.log();

    // Open browser
    openBrowser(authUrl);

    console.log(chalk.dim("  Waiting for authentication..."));

    // Poll for completion
    const result = await pollForAuth(sessionId);

    if (!result.api_key) {
      throw new Error("Authentication failed: no API key received");
    }

    // Save to config
    const config = loadConfig();
    config.apiKey = result.api_key;
    config.userId = result.user_id;
    saveConfig(config);

    console.log();
    console.log(chalk.green.bold(`  ✓ Logged in as: ${result.email}`));
    console.log(chalk.dim(`    User ID: ${result.user_id?.slice(0, 8)}...`));
    console.log();
    console.log(chalk.dim("  You can now publish manifests to the registry."));
    console.log();
  } catch (err) {
    console.error(chalk.red(`\n  ✗ ${(err as Error).message}\n`));
    process.exit(1);
  }
}

async function pollForAuth(sessionId: string, maxAttempts = 60): Promise<AuthSession> {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000); // Poll every 2 seconds

    const response = await fetch(`${AUTH_BASE_URL}/auth-status?session=${sessionId}`, {
      headers: {
        "User-Agent": "manifest-aim-cli/0.1.0",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) {
      continue;
    }

    const data = (await response.json()) as AuthSession;

    if (data.status === "completed") {
      return data;
    }

    if (data.status === "expired") {
      throw new Error("Auth session expired. Please try again.");
    }

    // Show progress
    process.stdout.write(".");
  }

  throw new Error("Authentication timed out. Please try again.");
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin"
    ? `open "${url}"`
    : process.platform === "win32"
    ? `start "${url}"`
    : `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) {
      console.log(chalk.yellow("\n  Could not open browser automatically."));
      console.log(chalk.white(`  Please open this URL manually:\n  ${url}\n`));
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
