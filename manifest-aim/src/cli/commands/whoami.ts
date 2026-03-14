/**
 * Whoami command — shows current authentication status.
 */

import chalk from "chalk";
import { loadConfig } from "../../registry/client.js";

const AUTH_BASE_URL = "https://jhwfncfwmpttwfcyiefk.supabase.co/functions/v1";

interface UserInfo {
  user_id: string;
  email: string;
  username?: string;
  trust_tier: "verified" | "trusted" | "community" | "unverified";
  manifests_published: number;
  created_at: string;
}

export async function whoamiCommand(): Promise<void> {
  const config = loadConfig();

  console.log();

  if (!config.apiKey) {
    console.log(chalk.yellow("  Not logged in."));
    console.log(chalk.dim(`  Run ${chalk.white("manifest login")} to authenticate.`));
    console.log();
    return;
  }

  try {
    const response = await fetch(`${AUTH_BASE_URL}/whoami`, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "User-Agent": "manifest-aim-cli/0.1.0",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.log(chalk.red("  Session expired. Please run `manifest login` again."));
        console.log();
        return;
      }
      throw new Error(`Failed to fetch user info: ${await response.text()}`);
    }

    const user = (await response.json()) as UserInfo;

    console.log(chalk.white.bold("  Manifest AIM — Account"));
    console.log();
    console.log(`  ${chalk.dim("Email:")}         ${user.email}`);
    if (user.username) {
      console.log(`  ${chalk.dim("Username:")}      @${user.username}`);
    }
    console.log(`  ${chalk.dim("User ID:")}       ${user.user_id.slice(0, 8)}...`);
    console.log(`  ${chalk.dim("Trust Tier:")}    ${formatTrustTier(user.trust_tier)}`);
    console.log(`  ${chalk.dim("Published:")}     ${user.manifests_published} manifests`);
    console.log(`  ${chalk.dim("Member since:")} ${new Date(user.created_at).toLocaleDateString()}`);
    console.log();
  } catch (err) {
    console.error(chalk.red(`  ✗ ${(err as Error).message}`));
    console.log();
    process.exit(1);
  }
}

function formatTrustTier(tier: string): string {
  switch (tier) {
    case "verified":
      return chalk.green("✓ Verified Publisher");
    case "trusted":
      return chalk.blue("⭐ Trusted Author");
    case "community":
      return chalk.white("Community");
    default:
      return chalk.dim("Unverified");
  }
}
