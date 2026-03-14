/**
 * Enterprise types for AIM
 *
 * Defines types for:
 * - RBAC (Role-Based Access Control)
 * - Approval workflows
 * - Audit events
 * - Escalation routing
 */

// ────────────────────────────────────────────────────────────────────────────
// RBAC Types
// ────────────────────────────────────────────────────────────────────────────

export type Permission =
  | "manifest:read"
  | "manifest:write"
  | "manifest:publish"
  | "manifest:delete"
  | "rule:override"
  | "approval:request"
  | "approval:review"
  | "approval:approve"
  | "approval:reject"
  | "audit:read"
  | "audit:export"
  | "team:manage"
  | "settings:manage"
  | "escalation:configure";

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  inherits?: string[]; // Role IDs to inherit from
}

export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[]; // Role IDs
  teams: string[]; // Team IDs
  metadata?: Record<string, unknown>;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  members: string[]; // User IDs
  defaultRole?: string; // Default role for team members
  escalationContacts?: EscalationContact[];
}

// Built-in roles
export const BUILT_IN_ROLES: Role[] = [
  {
    id: "viewer",
    name: "Viewer",
    description: "Read-only access to manifests and audits",
    permissions: ["manifest:read", "audit:read"],
  },
  {
    id: "developer",
    name: "Developer",
    description: "Can create and modify manifests, request approvals",
    permissions: [
      "manifest:read",
      "manifest:write",
      "approval:request",
      "audit:read",
    ],
  },
  {
    id: "reviewer",
    name: "Reviewer",
    description: "Can review and approve/reject requests",
    permissions: [
      "manifest:read",
      "approval:review",
      "approval:approve",
      "approval:reject",
      "audit:read",
    ],
  },
  {
    id: "admin",
    name: "Admin",
    description: "Full access to all features",
    permissions: [
      "manifest:read",
      "manifest:write",
      "manifest:publish",
      "manifest:delete",
      "rule:override",
      "approval:request",
      "approval:review",
      "approval:approve",
      "approval:reject",
      "audit:read",
      "audit:export",
      "team:manage",
      "settings:manage",
      "escalation:configure",
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Approval Workflow Types
// ────────────────────────────────────────────────────────────────────────────

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";

export interface ApprovalPolicy {
  id: string;
  name: string;
  description?: string;

  // What triggers this policy
  triggers: ApprovalTrigger[];

  // Who can approve
  approvers: ApproverConfig;

  // Settings
  settings: ApprovalSettings;
}

export interface ApprovalTrigger {
  type: "rule_violation" | "action" | "severity" | "file_pattern" | "custom";

  // For rule_violation
  ruleName?: string;

  // For action type
  action?: "block" | "warn" | "transform";

  // For severity type
  severity?: "critical" | "error" | "warning";

  // For file_pattern type
  filePattern?: string;

  // For custom type
  condition?: string; // Expression to evaluate
}

export interface ApproverConfig {
  type: "user" | "role" | "team" | "any_of" | "all_of";

  // For user type
  userIds?: string[];

  // For role type
  roleIds?: string[];

  // For team type
  teamIds?: string[];

  // For any_of/all_of types
  approvers?: ApproverConfig[];

  // Minimum approvals needed (for any_of)
  minApprovals?: number;
}

export interface ApprovalSettings {
  // How long before the request expires
  expiresIn?: string; // Duration string: "24h", "7d", etc.

  // Auto-approve after timeout (dangerous, use carefully)
  autoApproveOnExpiry?: boolean;

  // Require justification from requester
  requireJustification?: boolean;

  // Require comment from approver
  requireApproverComment?: boolean;

  // Notify on these events
  notifyOn?: ("created" | "approved" | "rejected" | "expired")[];

  // Escalate if not reviewed within this time
  escalateAfter?: string; // Duration string
}

export interface ApprovalRequest {
  id: string;
  policyId: string;
  status: ApprovalStatus;

  // Context
  context: ApprovalContext;

  // Requester info
  requesterId: string;
  justification?: string;

  // Approval decisions
  decisions: ApprovalDecision[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  resolvedAt?: Date;
}

export interface ApprovalContext {
  // What triggered the approval
  trigger: ApprovalTrigger;

  // Relevant rule violation (if applicable)
  violation?: {
    ruleName: string;
    message: string;
    filePath?: string;
    line?: number;
    severity: string;
  };

  // Code context
  code?: {
    filePath: string;
    content: string;
    diff?: string;
  };

  // Additional metadata
  metadata?: Record<string, unknown>;
}

export interface ApprovalDecision {
  approverId: string;
  decision: "approved" | "rejected";
  comment?: string;
  timestamp: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// Audit Types
// ────────────────────────────────────────────────────────────────────────────

export type AuditEventType =
  // Manifest events
  | "manifest.created"
  | "manifest.updated"
  | "manifest.deleted"
  | "manifest.published"
  // Enforcement events
  | "enforcement.started"
  | "enforcement.completed"
  | "enforcement.violation"
  | "enforcement.transform"
  | "enforcement.blocked"
  // Approval events
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected"
  | "approval.expired"
  | "approval.escalated"
  // User events
  | "user.login"
  | "user.logout"
  | "user.permission_changed"
  // System events
  | "system.error"
  | "system.config_changed";

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  timestamp: Date;

  // Actor
  actor: {
    type: "user" | "system" | "agent";
    id?: string;
    name?: string;
    ip?: string;
  };

  // Target resource
  resource?: {
    type: "manifest" | "rule" | "approval" | "user" | "team";
    id: string;
    name?: string;
  };

  // Event details
  details: Record<string, unknown>;

  // For violations
  violation?: {
    ruleName: string;
    severity: string;
    message: string;
    filePath?: string;
    line?: number;
  };

  // Context
  context?: {
    manifestName?: string;
    manifestVersion?: string;
    environment?: string;
    gitBranch?: string;
    gitCommit?: string;
  };

  // Outcome
  outcome: "success" | "failure" | "pending";
  error?: string;
}

export interface AuditQuery {
  // Time range
  startTime?: Date;
  endTime?: Date;

  // Filters
  types?: AuditEventType[];
  actorIds?: string[];
  resourceTypes?: string[];
  resourceIds?: string[];
  outcomes?: ("success" | "failure" | "pending")[];

  // For violations
  ruleNames?: string[];
  severities?: string[];

  // Pagination
  limit?: number;
  offset?: number;

  // Sorting
  orderBy?: "timestamp" | "type" | "severity";
  order?: "asc" | "desc";
}

export interface AuditSummary {
  period: {
    start: Date;
    end: Date;
  };

  totals: {
    events: number;
    violations: number;
    blocked: number;
    approvals: number;
    transforms: number;
  };

  byType: Record<AuditEventType, number>;

  bySeverity: {
    critical: number;
    error: number;
    warning: number;
    info: number;
  };

  byRule: Array<{
    ruleName: string;
    count: number;
    severity: string;
  }>;

  byFile: Array<{
    filePath: string;
    violationCount: number;
  }>;

  trends: {
    direction: "improving" | "stable" | "degrading";
    changePercent: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Escalation Types
// ────────────────────────────────────────────────────────────────────────────

export type EscalationChannel = "email" | "slack" | "pagerduty" | "webhook";

export interface EscalationContact {
  id: string;
  name: string;
  channel: EscalationChannel;

  // Channel-specific config
  config: {
    // Email
    email?: string;

    // Slack
    slackChannel?: string;
    slackUserId?: string;

    // PagerDuty
    pagerdutyServiceKey?: string;

    // Webhook
    webhookUrl?: string;
    webhookHeaders?: Record<string, string>;
  };
}

export interface EscalationPolicy {
  id: string;
  name: string;
  description?: string;

  // What triggers escalation
  triggers: EscalationTrigger[];

  // Escalation levels (in order)
  levels: EscalationLevel[];

  // Settings
  settings: {
    // Repeat escalation if not acknowledged
    repeatInterval?: string;
    maxRepeats?: number;

    // Auto-resolve after acknowledgment
    autoResolveOnAck?: boolean;
  };
}

export interface EscalationTrigger {
  type: "severity" | "approval_timeout" | "repeated_violation" | "custom";

  // For severity
  severity?: "critical" | "error";

  // For approval_timeout
  timeoutDuration?: string;

  // For repeated_violation
  violationThreshold?: number;
  timeWindow?: string;

  // For custom
  condition?: string;
}

export interface EscalationLevel {
  order: number;
  contacts: string[]; // EscalationContact IDs
  escalateAfter: string; // Duration before escalating to next level
  message?: string; // Custom message for this level
}

export interface EscalationEvent {
  id: string;
  policyId: string;
  triggerId: string;
  currentLevel: number;
  status: "active" | "acknowledged" | "resolved";

  // What triggered it
  triggerContext: {
    type: string;
    details: Record<string, unknown>;
    violation?: AuditEvent["violation"];
  };

  // History
  history: Array<{
    level: number;
    contacts: string[];
    sentAt: Date;
    acknowledgedAt?: Date;
    acknowledgedBy?: string;
  }>;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}
