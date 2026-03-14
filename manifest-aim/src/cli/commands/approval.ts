/**
 * CLI command: manifest approval
 *
 * Manage approval requests for require_approval rules.
 */

import chalk from "chalk";

interface ApprovalOptions {
  policy?: string;
  status?: string;
  limit?: number;
}

export async function approvalCommand(
  subcommand: string,
  args: string[],
  options: ApprovalOptions,
): Promise<void> {
  switch (subcommand) {
    case "list":
      await listApprovals(options);
      break;
    case "show":
      await showApproval(args[0]);
      break;
    case "approve":
      await approveRequest(args[0], args[1]);
      break;
    case "reject":
      await rejectRequest(args[0], args[1]);
      break;
    case "cancel":
      await cancelRequest(args[0]);
      break;
    default:
      showHelp();
  }
}

function showHelp(): void {
  console.log(chalk.cyan("  AIM Approval Workflow Commands:"));
  console.log();
  console.log("  manifest approval list              List pending approval requests");
  console.log("  manifest approval show <id>         Show details of an approval request");
  console.log("  manifest approval approve <id>      Approve a request");
  console.log("  manifest approval reject <id>       Reject a request");
  console.log("  manifest approval cancel <id>       Cancel your own request");
  console.log();
  console.log(chalk.dim("  Options:"));
  console.log(chalk.dim("    --policy <name>   Filter by approval policy"));
  console.log(chalk.dim("    --status <s>      Filter by status (pending, approved, rejected, expired)"));
  console.log(chalk.dim("    --limit <n>       Limit number of results (default: 20)"));
  console.log();
  console.log(chalk.dim("  Approval requests are created when code triggers a 'require_approval' rule."));
  console.log(chalk.dim("  Only authorized approvers can approve or reject requests."));
}

async function listApprovals(options: ApprovalOptions): Promise<void> {
  console.log(chalk.cyan("  📋 Approval Requests"));
  console.log();

  const status = options.status ?? "pending";

  console.log(chalk.dim(`  Status: ${status}`));
  console.log();

  // Table header
  console.log(chalk.dim("  ID           Policy                Requester       Created         Status"));
  console.log(chalk.dim("  ────────────────────────────────────────────────────────────────────────────"));

  // Placeholder
  console.log(chalk.yellow("  No approval requests found."));
  console.log();
  console.log(chalk.dim("  Approval requests are created when:"));
  console.log(chalk.dim("  • Code triggers a rule with action: require_approval"));
  console.log(chalk.dim("  • A user requests an exception to a blocked rule"));
}

async function showApproval(requestId: string): Promise<void> {
  if (!requestId) {
    console.error(chalk.red("  Error: Request ID is required."));
    console.log(chalk.dim("  Usage: manifest approval show <request-id>"));
    return;
  }

  console.log(chalk.cyan(`  📝 Approval Request: ${requestId}`));
  console.log();

  // Placeholder
  console.log(chalk.yellow(`  Request ${requestId} not found.`));
  console.log();
  console.log(chalk.dim("  When viewing a request, you'll see:"));
  console.log(chalk.dim("  • The rule violation that triggered the request"));
  console.log(chalk.dim("  • The requester's justification"));
  console.log(chalk.dim("  • Current approval decisions"));
  console.log(chalk.dim("  • Code diff (if applicable)"));
}

async function approveRequest(requestId: string, comment?: string): Promise<void> {
  if (!requestId) {
    console.error(chalk.red("  Error: Request ID is required."));
    console.log(chalk.dim("  Usage: manifest approval approve <request-id> [comment]"));
    return;
  }

  console.log(chalk.cyan(`  ✅ Approving request: ${requestId}`));

  // Check authentication
  console.log();
  console.log(chalk.yellow("  You must be logged in to approve requests."));
  console.log(chalk.dim("  Run: manifest login"));
  console.log();
  console.log(chalk.dim("  After approval:"));
  console.log(chalk.dim("  • The blocked action will be allowed"));
  console.log(chalk.dim("  • An audit event will be recorded"));
  console.log(chalk.dim("  • The requester will be notified"));
}

async function rejectRequest(requestId: string, comment?: string): Promise<void> {
  if (!requestId) {
    console.error(chalk.red("  Error: Request ID is required."));
    console.log(chalk.dim("  Usage: manifest approval reject <request-id> [comment]"));
    return;
  }

  console.log(chalk.cyan(`  ❌ Rejecting request: ${requestId}`));
  console.log();
  console.log(chalk.yellow("  You must be logged in to reject requests."));
  console.log(chalk.dim("  Run: manifest login"));
}

async function cancelRequest(requestId: string): Promise<void> {
  if (!requestId) {
    console.error(chalk.red("  Error: Request ID is required."));
    console.log(chalk.dim("  Usage: manifest approval cancel <request-id>"));
    return;
  }

  console.log(chalk.cyan(`  🚫 Cancelling request: ${requestId}`));
  console.log();
  console.log(chalk.yellow("  You must be logged in to cancel requests."));
  console.log(chalk.dim("  Only the original requester or an admin can cancel requests."));
}
