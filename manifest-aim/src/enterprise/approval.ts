/**
 * Approval Workflow Engine for AIM
 *
 * Implements the require_approval action for human-in-the-loop governance.
 * Supports configurable approval policies, multi-level approvals, and timeouts.
 */

import { randomUUID } from "node:crypto";
import type {
  ApprovalPolicy,
  ApprovalRequest,
  ApprovalContext,
  ApprovalDecision,
  ApprovalStatus,
  ApproverConfig,
  ApprovalTrigger,
} from "./types.js";
import { RBACManager } from "./rbac.js";

export interface ApprovalEngineConfig {
  rbac: RBACManager;
  storage: ApprovalStorage;
  notifier?: ApprovalNotifier;
  onApproved?: (request: ApprovalRequest) => void | Promise<void>;
  onRejected?: (request: ApprovalRequest) => void | Promise<void>;
  onExpired?: (request: ApprovalRequest) => void | Promise<void>;
}

/**
 * Storage interface for approval requests
 */
export interface ApprovalStorage {
  saveRequest(request: ApprovalRequest): Promise<void>;
  getRequest(id: string): Promise<ApprovalRequest | null>;
  updateRequest(request: ApprovalRequest): Promise<void>;
  listRequests(query: ApprovalQuery): Promise<ApprovalRequest[]>;
  countPendingByPolicy(policyId: string): Promise<number>;
}

export interface ApprovalQuery {
  status?: ApprovalStatus[];
  policyId?: string;
  requesterId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Notifier interface for approval events
 */
export interface ApprovalNotifier {
  notifyRequestCreated(
    request: ApprovalRequest,
    approverIds: string[],
  ): Promise<void>;
  notifyRequestApproved(
    request: ApprovalRequest,
    approverId: string,
  ): Promise<void>;
  notifyRequestRejected(
    request: ApprovalRequest,
    approverId: string,
  ): Promise<void>;
  notifyRequestExpired(request: ApprovalRequest): Promise<void>;
  notifyRequestEscalated(
    request: ApprovalRequest,
    escalateTo: string[],
  ): Promise<void>;
}

/**
 * In-memory storage implementation (for development/testing)
 */
export class InMemoryApprovalStorage implements ApprovalStorage {
  private requests: Map<string, ApprovalRequest> = new Map();

  async saveRequest(request: ApprovalRequest): Promise<void> {
    this.requests.set(request.id, { ...request });
  }

  async getRequest(id: string): Promise<ApprovalRequest | null> {
    const request = this.requests.get(id);
    return request ? { ...request } : null;
  }

  async updateRequest(request: ApprovalRequest): Promise<void> {
    this.requests.set(request.id, { ...request });
  }

  async listRequests(query: ApprovalQuery): Promise<ApprovalRequest[]> {
    let results = Array.from(this.requests.values());

    if (query.status && query.status.length > 0) {
      results = results.filter((r) => query.status!.includes(r.status));
    }

    if (query.policyId) {
      results = results.filter((r) => r.policyId === query.policyId);
    }

    if (query.requesterId) {
      results = results.filter((r) => r.requesterId === query.requesterId);
    }

    if (query.createdAfter) {
      results = results.filter((r) => r.createdAt >= query.createdAfter!);
    }

    if (query.createdBefore) {
      results = results.filter((r) => r.createdAt <= query.createdBefore!);
    }

    // Sort by creation date (newest first)
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async countPendingByPolicy(policyId: string): Promise<number> {
    return Array.from(this.requests.values()).filter(
      (r) => r.policyId === policyId && r.status === "pending",
    ).length;
  }
}

/**
 * Main approval workflow engine
 */
export class ApprovalEngine {
  private policies: Map<string, ApprovalPolicy> = new Map();
  private config: ApprovalEngineConfig;
  private expiryCheckInterval?: NodeJS.Timeout;

  constructor(config: ApprovalEngineConfig) {
    this.config = config;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Policy Management
  // ──────────────────────────────────────────────────────────────────────────

  registerPolicy(policy: ApprovalPolicy): void {
    this.policies.set(policy.id, policy);
  }

  getPolicy(policyId: string): ApprovalPolicy | undefined {
    return this.policies.get(policyId);
  }

  getAllPolicies(): ApprovalPolicy[] {
    return Array.from(this.policies.values());
  }

  removePolicy(policyId: string): boolean {
    return this.policies.delete(policyId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Request Creation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Check if an action triggers an approval policy
   */
  findMatchingPolicy(trigger: ApprovalTrigger): ApprovalPolicy | undefined {
    for (const policy of this.policies.values()) {
      for (const policyTrigger of policy.triggers) {
        if (this.triggerMatches(policyTrigger, trigger)) {
          return policy;
        }
      }
    }
    return undefined;
  }

  private triggerMatches(
    policyTrigger: ApprovalTrigger,
    actualTrigger: ApprovalTrigger,
  ): boolean {
    if (policyTrigger.type !== actualTrigger.type) {
      return false;
    }

    switch (policyTrigger.type) {
      case "rule_violation":
        return policyTrigger.ruleName === actualTrigger.ruleName;

      case "action":
        return policyTrigger.action === actualTrigger.action;

      case "severity":
        return policyTrigger.severity === actualTrigger.severity;

      case "file_pattern":
        if (!policyTrigger.filePattern || !actualTrigger.filePattern) {
          return false;
        }
        return this.matchesGlob(
          actualTrigger.filePattern,
          policyTrigger.filePattern,
        );

      case "custom":
        // Custom conditions would need an expression evaluator
        return false;

      default:
        return false;
    }
  }

  private matchesGlob(path: string, pattern: string): boolean {
    // Simple glob matching (could use minimatch for full support)
    const regexPattern = pattern
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, ".");
    return new RegExp(`^${regexPattern}$`).test(path);
  }

  /**
   * Create a new approval request
   */
  async createRequest(
    policyId: string,
    context: ApprovalContext,
    requesterId: string,
    justification?: string,
  ): Promise<ApprovalRequest> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Approval policy not found: ${policyId}`);
    }

    // Check if requester has permission
    if (!this.config.rbac.hasPermission(requesterId, "approval:request")) {
      throw new Error(`User ${requesterId} cannot request approvals`);
    }

    // Check if justification is required
    if (policy.settings.requireJustification && !justification) {
      throw new Error("Justification is required for this approval policy");
    }

    const now = new Date();
    const expiresAt = policy.settings.expiresIn
      ? this.calculateExpiry(now, policy.settings.expiresIn)
      : undefined;

    const request: ApprovalRequest = {
      id: randomUUID(),
      policyId,
      status: "pending",
      context,
      requesterId,
      justification,
      decisions: [],
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    await this.config.storage.saveRequest(request);

    // Notify approvers
    if (this.config.notifier && policy.settings.notifyOn?.includes("created")) {
      const approverIds = this.resolveApprovers(policy.approvers);
      await this.config.notifier.notifyRequestCreated(request, approverIds);
    }

    return request;
  }

  private calculateExpiry(from: Date, duration: string): Date {
    const match = duration.match(/^(\d+)(h|d|w)$/);
    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const ms = {
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
    };

    return new Date(from.getTime() + value * ms[unit as keyof typeof ms]);
  }

  /**
   * Resolve approver config to actual user IDs
   */
  private resolveApprovers(config: ApproverConfig): string[] {
    const approvers: string[] = [];

    switch (config.type) {
      case "user":
        if (config.userIds) {
          approvers.push(...config.userIds);
        }
        break;

      case "role":
        if (config.roleIds) {
          for (const roleId of config.roleIds) {
            // Get all users with this role
            // This would need a method in RBACManager to list users by role
            // For now, we'll just return the role IDs
            approvers.push(`role:${roleId}`);
          }
        }
        break;

      case "team":
        if (config.teamIds) {
          for (const teamId of config.teamIds) {
            const team = this.config.rbac.getTeam(teamId);
            if (team) {
              approvers.push(...team.members);
            }
          }
        }
        break;

      case "any_of":
      case "all_of":
        if (config.approvers) {
          for (const subConfig of config.approvers) {
            approvers.push(...this.resolveApprovers(subConfig));
          }
        }
        break;
    }

    return [...new Set(approvers)]; // Dedupe
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Decision Making
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Submit an approval decision
   */
  async submitDecision(
    requestId: string,
    approverId: string,
    decision: "approved" | "rejected",
    comment?: string,
  ): Promise<ApprovalRequest> {
    const request = await this.config.storage.getRequest(requestId);
    if (!request) {
      throw new Error(`Approval request not found: ${requestId}`);
    }

    if (request.status !== "pending") {
      throw new Error(`Request is already ${request.status}`);
    }

    const policy = this.policies.get(request.policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${request.policyId}`);
    }

    // Check if approver has permission
    const requiredPermission =
      decision === "approved" ? "approval:approve" : "approval:reject";
    if (!this.config.rbac.hasPermission(approverId, requiredPermission)) {
      throw new Error(`User ${approverId} cannot ${decision} requests`);
    }

    // Check if comment is required
    if (policy.settings.requireApproverComment && !comment) {
      throw new Error("Comment is required for this approval policy");
    }

    // Check if approver is authorized for this policy
    if (!this.isAuthorizedApprover(policy.approvers, approverId)) {
      throw new Error(`User ${approverId} is not an authorized approver`);
    }

    // Add the decision
    const approvalDecision: ApprovalDecision = {
      approverId,
      decision,
      comment,
      timestamp: new Date(),
    };

    request.decisions.push(approvalDecision);
    request.updatedAt = new Date();

    // Check if request is now resolved
    const resolution = this.checkResolution(policy.approvers, request);
    if (resolution) {
      request.status = resolution;
      request.resolvedAt = new Date();

      // Trigger callbacks
      if (resolution === "approved" && this.config.onApproved) {
        await this.config.onApproved(request);
      } else if (resolution === "rejected" && this.config.onRejected) {
        await this.config.onRejected(request);
      }

      // Send notifications
      if (this.config.notifier) {
        if (
          resolution === "approved" &&
          policy.settings.notifyOn?.includes("approved")
        ) {
          await this.config.notifier.notifyRequestApproved(request, approverId);
        } else if (
          resolution === "rejected" &&
          policy.settings.notifyOn?.includes("rejected")
        ) {
          await this.config.notifier.notifyRequestRejected(request, approverId);
        }
      }
    }

    await this.config.storage.updateRequest(request);
    return request;
  }

  private isAuthorizedApprover(
    config: ApproverConfig,
    userId: string,
  ): boolean {
    switch (config.type) {
      case "user":
        return config.userIds?.includes(userId) ?? false;

      case "role":
        if (!config.roleIds) return false;
        return config.roleIds.some((roleId) =>
          this.config.rbac.hasRole(userId, roleId),
        );

      case "team":
        if (!config.teamIds) return false;
        return config.teamIds.some((teamId) =>
          this.config.rbac.isTeamMember(userId, teamId),
        );

      case "any_of":
      case "all_of":
        if (!config.approvers) return false;
        return config.approvers.some((subConfig) =>
          this.isAuthorizedApprover(subConfig, userId),
        );

      default:
        return false;
    }
  }

  private checkResolution(
    config: ApproverConfig,
    request: ApprovalRequest,
  ): ApprovalStatus | null {
    // Any rejection means rejected
    if (request.decisions.some((d) => d.decision === "rejected")) {
      return "rejected";
    }

    const approvals = request.decisions.filter(
      (d) => d.decision === "approved",
    );

    switch (config.type) {
      case "user":
      case "role":
      case "team":
        // Single approver needed
        return approvals.length > 0 ? "approved" : null;

      case "any_of":
        // Need minApprovals (default 1)
        const minApprovals = config.minApprovals ?? 1;
        return approvals.length >= minApprovals ? "approved" : null;

      case "all_of":
        // Need all approvers
        if (!config.approvers) return "approved";
        const totalApprovers = this.resolveApprovers(config).length;
        return approvals.length >= totalApprovers ? "approved" : null;

      default:
        return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Request Management
  // ──────────────────────────────────────────────────────────────────────────

  async getRequest(requestId: string): Promise<ApprovalRequest | null> {
    return this.config.storage.getRequest(requestId);
  }

  async listRequests(query: ApprovalQuery): Promise<ApprovalRequest[]> {
    return this.config.storage.listRequests(query);
  }

  async cancelRequest(requestId: string, userId: string): Promise<void> {
    const request = await this.config.storage.getRequest(requestId);
    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }

    // Only requester or admin can cancel
    if (
      request.requesterId !== userId &&
      !this.config.rbac.hasRole(userId, "admin")
    ) {
      throw new Error("Only requester or admin can cancel requests");
    }

    if (request.status !== "pending") {
      throw new Error(`Cannot cancel ${request.status} request`);
    }

    request.status = "cancelled";
    request.updatedAt = new Date();
    request.resolvedAt = new Date();

    await this.config.storage.updateRequest(request);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Expiry Handling
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Start periodic expiry checking
   */
  startExpiryCheck(intervalMs: number = 60000): void {
    this.expiryCheckInterval = setInterval(() => {
      this.checkExpiredRequests().catch(console.error);
    }, intervalMs);
  }

  stopExpiryCheck(): void {
    if (this.expiryCheckInterval) {
      clearInterval(this.expiryCheckInterval);
      this.expiryCheckInterval = undefined;
    }
  }

  private async checkExpiredRequests(): Promise<void> {
    const pendingRequests = await this.config.storage.listRequests({
      status: ["pending"],
    });

    const now = new Date();

    for (const request of pendingRequests) {
      if (request.expiresAt && request.expiresAt <= now) {
        const policy = this.policies.get(request.policyId);

        if (policy?.settings.autoApproveOnExpiry) {
          // Auto-approve (use with caution)
          request.status = "approved";
        } else {
          request.status = "expired";
        }

        request.updatedAt = now;
        request.resolvedAt = now;

        await this.config.storage.updateRequest(request);

        if (this.config.onExpired) {
          await this.config.onExpired(request);
        }

        if (
          this.config.notifier &&
          policy?.settings.notifyOn?.includes("expired")
        ) {
          await this.config.notifier.notifyRequestExpired(request);
        }
      }
    }
  }
}

/**
 * Create a default approval engine with in-memory storage
 */
export function createApprovalEngine(
  rbac: RBACManager,
  options?: Partial<ApprovalEngineConfig>,
): ApprovalEngine {
  return new ApprovalEngine({
    rbac,
    storage: new InMemoryApprovalStorage(),
    ...options,
  });
}
