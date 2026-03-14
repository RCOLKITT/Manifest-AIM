import chalk from "chalk";
import { loadConfig, searchManifests } from "../../registry/client.js";

export async function searchCommand(
  query: string,
  options: { tags?: string; domain?: string; limit?: string },
): Promise<void> {
  console.log(chalk.dim(`\n  Searching registry for "${query}"...\n`));

  try {
    const config = loadConfig();
    const results = await searchManifests(query, config, {
      tags: options.tags?.split(","),
      domain: options.domain,
      limit: options.limit ? parseInt(options.limit, 10) : 20,
    });

    if (results.length === 0) {
      console.log(chalk.yellow(`  No manifests found for "${query}".`));
      console.log(chalk.dim(`  Try different keywords or browse at https://registry.manifestaim.dev\n`));
      return;
    }

    for (const r of results) {
      const official = r.is_official ? chalk.blue(" [official]") : "";
      console.log(
        `  ${chalk.white.bold(r.name)}${chalk.dim(`@${r.latest_version}`)}${official}`,
      );
      if (r.description) {
        console.log(chalk.dim(`    ${r.description}`));
      }

      const stats: string[] = [];
      if (r.downloads > 0) stats.push(`↓${r.downloads}`);
      if (r.stars > 0) stats.push(`★${r.stars}`);
      if (r.tags.length > 0) stats.push(r.tags.join(", "));
      if (stats.length > 0) {
        console.log(chalk.dim(`    ${stats.join(" · ")}`));
      }
      console.log();
    }

    console.log(chalk.dim(`  ${results.length} result${results.length !== 1 ? "s" : ""}\n`));
  } catch (err) {
    console.error(chalk.red(`\n  ✗ ${(err as Error).message}\n`));
    process.exit(1);
  }
}
