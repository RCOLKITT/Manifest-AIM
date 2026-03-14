# Manifest

**The Agent Instruction Manifest Platform**

> *Define it. Manifest it.*

Manifest is the platform that implements the **AIM (Agent Instruction Manifest)** protocol — a portable, composable, progressively-loaded specification that tells AI agents what they can do, how to do it well, and what they must never do.

## The Problem

AI agents today operate with fragmented instructions. MCP burns tokens loading every tool schema upfront. Skills files are local and non-portable. Rules files are static with no conditional logic. System prompts are ephemeral. The result: you can't trust agent output meets your standards.

## The Solution

AIM unifies four concerns into a single manifest:

| Concern | What it answers | Today's fragmented approach |
|---------|----------------|---------------------------|
| **Capabilities** | What can the agent do? | MCP servers, tool definitions |
| **Knowledge** | How should it approach the work? | Skills files, system prompts |
| **Governance** | What must/must not it do? | Rules files, hope |
| **Execution** | How does it actually run? | MCP, CLI, REST, code |

### Progressive Disclosure (Why Token Burn Dies)

AIM uses four tiers. Agents only load what they need, when they need it:

| Tier | Token Cost | When Loaded |
|------|-----------|-------------|
| 0 — Index | ~5 per item | Always |
| 1 — Schema | ~50-200 per item | On relevance match |
| 2 — Instructions | Variable | On commitment |
| 3 — Execution | 0 (never enters context) | On dispatch |

**50 capabilities via MCP:** ~25,000 tokens burned upfront.
**50 capabilities via AIM:** ~250 tokens at init. 99% reduction.

### Enforceable Governance (Why "Hope" Dies)

AIM governance isn't a suggestion. Three enforcement mechanisms ensure compliance:

- **Static Analysis** — Real tools (semgrep, ESLint, tsc) validate output. Deterministic. High trust.
- **Semantic (LLM-as-Judge)** — A second LLM evaluates against nuanced rules. Generalizable. Medium trust.
- **Injected** — Rules injected into agent context. Zero overhead. For style/preference guidance.

## Quick Start

```bash
# Install
npm install -g manifest-aim

# Initialize a manifest in your project
manifest init

# Validate your manifest
manifest validate

# Compile (resolve dependencies, check conflicts)
manifest compile

# Health check
manifest doctor

# Wrap an agent with AIM enforcement
manifest wrap claude-code
```

## Example `aim.yaml`

```yaml
aim: "1.0"

metadata:
  name: my-project-standards
  version: 1.0.0
  description: "Production TypeScript development standards"

context:
  domain: software-engineering
  environment: production
  compliance: [soc2]

governance:
  rules:
    - name: no-hardcoded-secrets
      enforcement: static
      detect:
        type: tool
        command: "semgrep --config=p/secrets --json {{file}}"
        match_condition: "results.length > 0"
      action: block
      severity: critical
      message: "Hardcoded secrets detected. Use environment variables."

    - name: strict-typescript
      enforcement: static
      detect:
        type: tool
        command: "npx tsc --noEmit --strict {{file}}"
        exit_code_fail: non-zero
      action: block
      severity: error

    - name: clean-architecture
      enforcement: semantic
      detect:
        type: semantic
        criteria: "Domain modules must not import from infrastructure layers"
        model: fast
        threshold: 0.9
      action: warn
      severity: warning

  quality_gates:
    code:
      test_coverage_minimum: 80
      require_types: strict
      max_complexity: 10
      require_error_handling: true
      require_logging: structured

knowledge:
  - name: security-checklist
    trigger: "creating API endpoints, auth flows, or data handlers"
    content: |
      Before delivering code that handles user input or sensitive data:
      1. All inputs validated (use zod schemas)
      2. Auth middleware on protected routes
      3. Rate limiting on public endpoints
      4. Secrets from environment, never hardcoded
      5. SQL queries parameterized
      6. Error responses never leak internals
```

## CLI Commands

### Core Commands

| Command | Description |
|---------|-------------|
| `manifest init` | Create a new `aim.yaml` in current directory |
| `manifest validate` | Validate manifest against AIM JSON Schema |
| `manifest compile` | Resolve dependencies, detect conflicts, produce compiled manifest |
| `manifest inspect` | Show what an agent sees at each tier |
| `manifest doctor` | Verify tools, auth, and environment health |
| `manifest wrap <agent>` | Wrap an agent with AIM enforcement |
| `manifest enforce <path>` | Run enforcement checks standalone |
| `manifest publish` | Publish manifest to Manifest Registry |
| `manifest install <name>` | Install manifest from registry |
| `manifest generate` | Auto-generate manifest from project analysis (via Rebar) |

### Enterprise Commands

| Command | Description |
|---------|-------------|
| `manifest serve` | Start the AIM API server for Studio integration |
| `manifest audit list` | List audit events with filtering |
| `manifest audit summary` | Generate compliance summary |
| `manifest audit export` | Export audit log to CSV or JSON |
| `manifest approval list` | List approval requests |
| `manifest approval show <id>` | Show approval request details |
| `manifest approval approve <id>` | Approve a pending request |
| `manifest approval reject <id>` | Reject a pending request |
| `manifest team list` | List teams and members |
| `manifest team roles` | Show role definitions |

## Enterprise Features

Manifest includes enterprise-grade governance for teams and organizations:

### Role-Based Access Control (RBAC)

Built-in roles with granular permissions:

- **viewer** — Read manifests, audit logs, and approvals
- **developer** — Create and edit manifests
- **reviewer** — Approve or reject requests
- **admin** — Full access including RBAC management

```typescript
const rbac = new RBACManager();
rbac.addUser(user);
rbac.assignRole(userId, "developer");

if (rbac.hasPermission(userId, "manifest:edit")) {
  // User can edit manifests
}
```

### Approval Workflows

Human-in-the-loop governance with configurable policies:

```yaml
governance:
  rules:
    - name: production-deploy
      action: require_approval
      config:
        approval:
          approvers: ["lead@company.com"]
          approver_roles: ["reviewer"]
          require_justification: true
          min_approvals: 2
          expires_in: "24h"
          escalate_after: "4h"
```

### Audit Logging

Comprehensive audit trail for compliance:

- All enforcement actions logged
- Query and filter by time, type, severity
- Generate compliance summaries with trends
- Export to CSV or JSON
- Automatic retention policies

### Escalation Routing

Multi-channel escalation with tiered policies:

```yaml
escalation:
  - name: critical-violations
    trigger: severity >= critical
    levels:
      - contacts: ["oncall@company.com"]
        wait: 5m
        channels: [email, slack]
      - contacts: ["manager@company.com"]
        wait: 15m
        channels: [email, pagerduty]
```

### Persistent Storage

Enterprise deployments use Supabase PostgreSQL for persistence:

```typescript
import { createClient } from "@supabase/supabase-js";
import { createSupabaseStorageAdapters } from "manifest-aim/enterprise/storage";

const supabase = createClient(url, key);
const storage = createSupabaseStorageAdapters(supabase);

// Use with enterprise managers
const auditLogger = new AuditLogger(storage.audit);
const approvalManager = new ApprovalManager(storage.approval);
```

## AIM Studio

A web-based management interface for enterprise deployments:

- **Manifest Editor** — Visual editor with real-time validation
- **Rule Builder** — Drag-and-drop rule creation
- **Audit Dashboard** — Compliance metrics and trends
- **Approval Queue** — Manage approval requests
- **Team Management** — RBAC and team configuration

Start the API server and connect Studio:

```bash
manifest serve --port 4000
```

## Product Family

| Product | Role |
|---------|------|
| **AIM** | The protocol — the instruction language for AI agents |
| **Manifest** | The platform — CLI, runtime, registry, enterprise governance |
| **Studio** | The interface — web UI for enterprise management |
| **Rebar** | The generator — analyzes projects, outputs `aim.yaml` automatically |

## Documentation

- [AIM Protocol Specification](docs/SPECIFICATION.md)
- [Enforcement Architecture](docs/ENFORCEMENT.md)
- [Manifest Schema Reference](docs/SCHEMA.md)
- [Writing Your First Manifest](docs/GETTING_STARTED.md)
- [Enterprise Features Guide](docs/ENTERPRISE.md)
- [API Reference](docs/API.md)
- [Reference Manifests](manifests/reference/)

## License

Copyright © 2026 Vaspera Capital. All rights reserved.

See [LICENSE](LICENSE) for details.
