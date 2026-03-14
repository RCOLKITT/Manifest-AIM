# Enterprise Features Guide

This guide covers the enterprise governance features in Manifest AIM.

## Overview

Enterprise features provide:

- **RBAC** — Role-based access control for teams
- **Approval Workflows** — Human-in-the-loop governance
- **Audit Logging** — Compliance-ready event tracking
- **Escalation Routing** — Multi-channel alert delivery

## Role-Based Access Control

### Built-in Roles

| Role | Permissions |
|------|-------------|
| `viewer` | `manifest:read`, `audit:read`, `approval:read` |
| `developer` | All viewer + `manifest:create`, `manifest:edit`, `manifest:delete`, `approval:create` |
| `reviewer` | All viewer + `approval:approve`, `approval:reject`, `approval:cancel` |
| `admin` | All permissions including `rbac:manage`, `audit:export`, `audit:purge` |

### Using RBAC

```typescript
import { RBACManager, User } from "manifest-aim/enterprise";

const rbac = new RBACManager();

// Add a user
const user: User = {
  id: "user-123",
  email: "dev@company.com",
  name: "Developer",
};
rbac.addUser(user);

// Assign roles
rbac.assignRole("user-123", "developer");

// Check permissions
if (rbac.hasPermission("user-123", "manifest:edit")) {
  // Allow edit
}

// Check multiple permissions
if (rbac.hasAllPermissions("user-123", ["manifest:read", "manifest:edit"])) {
  // Has both
}

if (rbac.hasAnyPermission("user-123", ["approval:approve", "approval:reject"])) {
  // Has at least one
}
```

### Teams

```typescript
const team: Team = {
  id: "team-1",
  name: "Platform",
  members: [{ userId: "user-123", role: "developer" }],
};
rbac.addTeam(team);

// Get effective permissions (combines direct + team roles)
const permissions = rbac.getEffectivePermissions("user-123");
```

### Custom Roles

```typescript
rbac.addRole({
  id: "custom-role",
  name: "Custom Role",
  permissions: ["manifest:read", "manifest:edit", "approval:create"],
});
```

## Approval Workflows

### Configuring Approval Policies

In your manifest:

```yaml
governance:
  rules:
    - name: production-deploy
      enforcement: static
      detect:
        type: tool
        command: "echo {{file}}"
      action: require_approval
      config:
        approval:
          # Direct approvers
          approvers: ["lead@company.com", "security@company.com"]

          # Role-based approvers
          approver_roles: ["reviewer", "admin"]

          # Team-based approvers
          approver_teams: ["security-team"]

          # Require justification text
          require_justification: true

          # Number of approvals needed
          min_approvals: 2

          # Auto-expire after
          expires_in: "24h"

          # Escalate if not resolved
          escalate_after: "4h"
```

### Programmatic Usage

```typescript
import { ApprovalManager, InMemoryApprovalStorage } from "manifest-aim/enterprise";

const storage = new InMemoryApprovalStorage();
const manager = new ApprovalManager(storage);

// Register policy
manager.registerPolicy({
  id: "policy-1",
  name: "Production Deploys",
  trigger: { ruleName: "production-deploy" },
  approvers: ["lead@company.com"],
  requiredApprovals: 2,
  expiresIn: 86400000, // 24 hours
});

// Create approval request
const request = await manager.createRequest({
  policyId: "policy-1",
  context: {
    ruleName: "production-deploy",
    filePath: "deploy.sh",
    details: { target: "production" },
  },
  requesterId: "dev@company.com",
  justification: "Critical hotfix for payment processing",
});

// Submit approval
const result = await manager.submitDecision(request.id, {
  approverId: "lead@company.com",
  decision: "approved",
  comment: "Looks good, approved for deploy",
});

// Check status
if (result.status === "approved") {
  // Proceed with action
}
```

### Approval States

| Status | Description |
|--------|-------------|
| `pending` | Awaiting approvals |
| `approved` | Met approval threshold |
| `rejected` | At least one rejection |
| `expired` | Past expiration time |
| `cancelled` | Manually cancelled |

## Audit Logging

### Event Types

| Type | Description |
|------|-------------|
| `enforcement.violation` | Rule violation detected |
| `enforcement.blocked` | Action blocked by rule |
| `enforcement.allowed` | Action permitted |
| `enforcement.transform` | Output modified |
| `approval.requested` | Approval request created |
| `approval.approved` | Request approved |
| `approval.rejected` | Request rejected |
| `approval.expired` | Request expired |
| `config.updated` | Manifest configuration changed |
| `user.action` | User performed action |

### Logging Events

```typescript
import { AuditLogger, InMemoryAuditStorage } from "manifest-aim/enterprise";

const storage = new InMemoryAuditStorage();
const logger = new AuditLogger(storage);

// Log a violation
await logger.logViolation(
  {
    ruleName: "no-secrets",
    severity: "critical",
    message: "Hardcoded API key detected",
    filePath: "config.ts",
    line: 42,
  },
  "my-manifest"
);

// Log config change
await logger.logConfigChange(
  "rules",
  { oldValue: "warn", newValue: "block" },
  { type: "user", id: "admin@company.com" }
);

// Log user action
await logger.logUserAction(
  "approved deployment",
  { type: "user", id: "lead@company.com" },
  { requestId: "req-123" }
);
```

### Querying Events

```typescript
// Query with filters
const events = await logger.query({
  startTime: new Date("2024-01-01"),
  endTime: new Date("2024-01-31"),
  types: ["enforcement.violation", "enforcement.blocked"],
  severities: ["critical", "error"],
  ruleNames: ["no-secrets"],
  limit: 100,
  orderBy: "timestamp",
  order: "desc",
});
```

### Compliance Summaries

```typescript
const summary = await logger.getSummary(
  new Date("2024-01-01"),
  new Date("2024-01-31")
);

console.log(summary);
// {
//   period: { start: Date, end: Date },
//   totals: { events: 150, violations: 45, blocked: 12, approvals: 8, transforms: 3 },
//   bySeverity: { critical: 5, error: 15, warning: 20, info: 5 },
//   byRule: [{ ruleName: "no-secrets", count: 12, severity: "critical" }, ...],
//   byFile: [{ filePath: "config.ts", violationCount: 8 }, ...],
//   trends: { direction: "improving", changePercent: -15 }
// }
```

### Export

```typescript
// Export to CSV
const csv = await logger.export({
  format: "csv",
  startTime: new Date("2024-01-01"),
  endTime: new Date("2024-01-31"),
});

// Export to JSON
const json = await logger.export({
  format: "json",
  types: ["enforcement.violation"],
});
```

## Escalation Routing

### Escalation Policies

```typescript
import { EscalationEngine, InMemoryEscalationStorage } from "manifest-aim/enterprise";

const storage = new InMemoryEscalationStorage();
const engine = new EscalationEngine(storage);

// Register policy
engine.registerPolicy({
  id: "critical-violations",
  name: "Critical Violation Escalation",
  trigger: {
    type: "violation",
    condition: (violation) => violation.severity === "critical",
  },
  levels: [
    {
      contacts: [
        { type: "email", address: "oncall@company.com" },
        { type: "slack", channel: "#security-alerts" },
      ],
      waitTime: 300000, // 5 minutes
    },
    {
      contacts: [
        { type: "email", address: "manager@company.com" },
        { type: "pagerduty", serviceId: "P123ABC" },
      ],
      waitTime: 900000, // 15 minutes
    },
  ],
  maxLevel: 2,
});

// Trigger escalation
await engine.escalate({
  type: "violation",
  ruleName: "no-secrets",
  severity: "critical",
  message: "API key in source code",
});
```

### Escalation Handlers

```typescript
// Register notification handler
engine.registerHandler("email", async (contact, event) => {
  await sendEmail({
    to: contact.address,
    subject: `[AIM] ${event.triggerContext.violation?.ruleName}`,
    body: formatViolation(event),
  });
});

engine.registerHandler("slack", async (contact, event) => {
  await slack.postMessage({
    channel: contact.channel,
    text: formatSlackAlert(event),
  });
});

engine.registerHandler("pagerduty", async (contact, event) => {
  await pagerduty.trigger({
    serviceId: contact.serviceId,
    description: event.triggerContext.violation?.message,
  });
});
```

### Managing Escalations

```typescript
// Acknowledge to pause escalation
await engine.acknowledge("escalation-123", "oncall@company.com");

// Resolve to close escalation
await engine.resolve("escalation-123");

// List active escalations
const active = await engine.listActive();
```

## Persistent Storage (Supabase)

For production deployments, use Supabase PostgreSQL for persistence.

### Setup

1. Create Supabase project
2. Run migrations:

```bash
supabase db push
```

3. Configure storage adapters:

```typescript
import { createClient } from "@supabase/supabase-js";
import { createSupabaseStorageAdapters } from "manifest-aim/enterprise/storage";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const storage = createSupabaseStorageAdapters(supabase);

// Use with managers
const auditLogger = new AuditLogger(storage.audit);
const approvalManager = new ApprovalManager(storage.approval);
const escalationEngine = new EscalationEngine(storage.escalation);
```

### Database Schema

Tables created by migration:

- `roles` — Role definitions
- `teams` — Team definitions
- `team_members` — Team membership
- `user_roles` — User role assignments
- `approval_policies` — Approval policy configuration
- `approval_requests` — Approval request records
- `approval_decisions` — Individual approval/reject decisions
- `audit_events` — Audit log entries
- `escalation_contacts` — Contact directory
- `escalation_policies` — Escalation policy configuration
- `escalation_events` — Active/resolved escalations

### Row-Level Security

All tables include RLS policies for multi-tenant deployments.

## CLI Commands

### Audit Commands

```bash
# List recent events
manifest audit list --limit 20

# Filter by type
manifest audit list --type enforcement.violation

# Filter by severity
manifest audit list --severity critical

# Filter by time range
manifest audit list --after 2024-01-01 --before 2024-01-31

# Generate summary
manifest audit summary --days 30

# Export to file
manifest audit export --format csv --output audit.csv
manifest audit export --format json --output audit.json
```

### Approval Commands

```bash
# List pending approvals
manifest approval list --status pending

# Show request details
manifest approval show req-123

# Approve with comment
manifest approval approve req-123 --comment "Approved for production"

# Reject with reason
manifest approval reject req-123 --comment "Missing test coverage"

# Cancel request
manifest approval cancel req-123
```

### Team Commands

```bash
# List teams
manifest team list

# Show role permissions
manifest team roles
```

### API Server

```bash
# Start server on default port (4000)
manifest serve

# Custom port
manifest serve --port 8080
```

## API Endpoints

When running `manifest serve`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/manifests` | GET | List manifests |
| `/api/manifests/:id` | GET | Get manifest |
| `/api/manifests` | POST | Create manifest |
| `/api/manifests/:id` | PUT | Update manifest |
| `/api/manifests/:id` | DELETE | Delete manifest |
| `/api/manifests/:id/validate` | POST | Validate manifest |
| `/api/enforce` | POST | Run enforcement |
| `/api/approvals` | GET | List approvals |
| `/api/approvals/:id` | GET | Get approval |
| `/api/approvals/:id/approve` | POST | Approve request |
| `/api/approvals/:id/reject` | POST | Reject request |
| `/api/audit` | GET | List audit events |
| `/api/audit/summary` | GET | Get summary |
| `/api/escalations` | GET | List escalations |
| `/api/teams` | GET | List teams |
