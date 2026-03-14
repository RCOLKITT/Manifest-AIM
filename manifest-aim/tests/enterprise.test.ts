/**
 * Tests for enterprise features: RBAC, Approval Workflow, Audit, Escalation
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RBACManager, AuthorizationError } from "../src/enterprise/rbac.js";
import {
  ApprovalEngine,
  InMemoryApprovalStorage,
} from "../src/enterprise/approval.js";
import {
  AuditLogger,
  InMemoryAuditStorage,
  DefaultAuditExporter,
} from "../src/enterprise/audit.js";
import {
  EscalationEngine,
  InMemoryEscalationStorage,
  consoleChannelHandlers,
} from "../src/enterprise/escalation.js";

// ────────────────────────────────────────────────────────────────────────────
// RBAC Tests
// ────────────────────────────────────────────────────────────────────────────

describe("RBAC", () => {
  let rbac: RBACManager;

  beforeEach(() => {
    rbac = new RBACManager();
  });

  describe("built-in roles", () => {
    it("should have viewer, developer, reviewer, admin roles", () => {
      const roles = rbac.getAllRoles();
      const roleNames = roles.map((r) => r.id);

      expect(roleNames).toContain("viewer");
      expect(roleNames).toContain("developer");
      expect(roleNames).toContain("reviewer");
      expect(roleNames).toContain("admin");
    });

    it("should return correct permissions for viewer role", () => {
      const permissions = rbac.getRolePermissions("viewer");
      expect(permissions).toContain("manifest:read");
      expect(permissions).toContain("audit:read");
      expect(permissions).not.toContain("manifest:write");
    });

    it("should return all permissions for admin role", () => {
      const permissions = rbac.getRolePermissions("admin");
      expect(permissions).toContain("manifest:read");
      expect(permissions).toContain("manifest:write");
      expect(permissions).toContain("manifest:publish");
      expect(permissions).toContain("approval:approve");
      expect(permissions).toContain("team:manage");
    });
  });

  describe("user management", () => {
    it("should add and retrieve users", () => {
      rbac.addUser({
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        roles: ["developer"],
        teams: [],
      });

      const user = rbac.getUser("user-1");
      expect(user).toBeDefined();
      expect(user?.email).toBe("test@example.com");
    });

    it("should find user by email", () => {
      rbac.addUser({
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        roles: ["developer"],
        teams: [],
      });

      const user = rbac.getUserByEmail("test@example.com");
      expect(user?.id).toBe("user-1");
    });

    it("should get user permissions from roles", () => {
      rbac.addUser({
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        roles: ["developer"],
        teams: [],
      });

      const permissions = rbac.getUserPermissions("user-1");
      expect(permissions).toContain("manifest:read");
      expect(permissions).toContain("manifest:write");
      expect(permissions).toContain("approval:request");
    });
  });

  describe("permission checking", () => {
    beforeEach(() => {
      rbac.addUser({
        id: "dev-1",
        email: "dev@example.com",
        name: "Developer",
        roles: ["developer"],
        teams: [],
      });
      rbac.addUser({
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        roles: ["admin"],
        teams: [],
      });
    });

    it("should check single permission correctly", () => {
      expect(rbac.hasPermission("dev-1", "manifest:read")).toBe(true);
      expect(rbac.hasPermission("dev-1", "manifest:publish")).toBe(false);
      expect(rbac.hasPermission("admin-1", "manifest:publish")).toBe(true);
    });

    it("should check multiple permissions with hasAllPermissions", () => {
      expect(
        rbac.hasAllPermissions("dev-1", ["manifest:read", "manifest:write"])
      ).toBe(true);
      expect(
        rbac.hasAllPermissions("dev-1", ["manifest:read", "manifest:publish"])
      ).toBe(false);
    });

    it("should check any permission with hasAnyPermission", () => {
      expect(
        rbac.hasAnyPermission("dev-1", ["manifest:publish", "manifest:write"])
      ).toBe(true);
      expect(
        rbac.hasAnyPermission("dev-1", ["manifest:publish", "team:manage"])
      ).toBe(false);
    });
  });

  describe("team management", () => {
    it("should add users to teams", () => {
      rbac.addTeam({
        id: "team-1",
        name: "Engineering",
        members: [],
        defaultRole: "developer",
      });

      rbac.addUser({
        id: "user-1",
        email: "test@example.com",
        name: "Test",
        roles: [],
        teams: [],
      });

      rbac.addUserToTeam("user-1", "team-1");

      const team = rbac.getTeam("team-1");
      expect(team?.members).toContain("user-1");
      expect(rbac.isTeamMember("user-1", "team-1")).toBe(true);
    });
  });

  describe("authorization middleware", () => {
    it("should throw AuthorizationError when permission missing", () => {
      rbac.addUser({
        id: "user-1",
        email: "test@example.com",
        name: "Test",
        roles: ["viewer"],
        teams: [],
      });

      const check = rbac.requirePermission("manifest:write");

      expect(() => check("user-1")).toThrow(AuthorizationError);
    });

    it("should not throw when permission present", () => {
      rbac.addUser({
        id: "user-1",
        email: "test@example.com",
        name: "Test",
        roles: ["developer"],
        teams: [],
      });

      const check = rbac.requirePermission("manifest:write");

      expect(() => check("user-1")).not.toThrow();
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Approval Workflow Tests
// ────────────────────────────────────────────────────────────────────────────

describe("Approval Workflow", () => {
  let rbac: RBACManager;
  let engine: ApprovalEngine;

  beforeEach(() => {
    rbac = new RBACManager();
    rbac.addUser({
      id: "requester-1",
      email: "requester@example.com",
      name: "Requester",
      roles: ["developer"],
      teams: [],
    });
    rbac.addUser({
      id: "approver-1",
      email: "approver@example.com",
      name: "Approver",
      roles: ["reviewer"],
      teams: [],
    });

    engine = new ApprovalEngine({
      rbac,
      storage: new InMemoryApprovalStorage(),
    });

    engine.registerPolicy({
      id: "security-override",
      name: "Security Override",
      triggers: [{ type: "severity", severity: "critical" }],
      approvers: { type: "user", userIds: ["approver-1"] },
      settings: {
        expiresIn: "24h",
        requireJustification: true,
      },
    });
  });

  it("should create approval request", async () => {
    const request = await engine.createRequest(
      "security-override",
      {
        trigger: { type: "severity", severity: "critical" },
        violation: {
          ruleName: "no-eval",
          message: "Dynamic execution detected",
          severity: "critical",
        },
      },
      "requester-1",
      "Need eval for template parsing"
    );

    expect(request.id).toBeDefined();
    expect(request.status).toBe("pending");
    expect(request.justification).toBe("Need eval for template parsing");
  });

  it("should require justification when configured", async () => {
    await expect(
      engine.createRequest(
        "security-override",
        {
          trigger: { type: "severity", severity: "critical" },
        },
        "requester-1"
        // No justification
      )
    ).rejects.toThrow("Justification is required");
  });

  it("should approve request", async () => {
    const request = await engine.createRequest(
      "security-override",
      { trigger: { type: "severity", severity: "critical" } },
      "requester-1",
      "Justified"
    );

    const updated = await engine.submitDecision(
      request.id,
      "approver-1",
      "approved",
      "Looks safe"
    );

    expect(updated.status).toBe("approved");
    expect(updated.decisions).toHaveLength(1);
    expect(updated.decisions[0].decision).toBe("approved");
  });

  it("should reject request", async () => {
    const request = await engine.createRequest(
      "security-override",
      { trigger: { type: "severity", severity: "critical" } },
      "requester-1",
      "Justified"
    );

    const updated = await engine.submitDecision(
      request.id,
      "approver-1",
      "rejected",
      "Too risky"
    );

    expect(updated.status).toBe("rejected");
  });

  it("should list pending requests", async () => {
    await engine.createRequest(
      "security-override",
      { trigger: { type: "severity", severity: "critical" } },
      "requester-1",
      "Test 1"
    );
    await engine.createRequest(
      "security-override",
      { trigger: { type: "severity", severity: "critical" } },
      "requester-1",
      "Test 2"
    );

    const pending = await engine.listRequests({ status: ["pending"] });
    expect(pending).toHaveLength(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Audit Tests
// ────────────────────────────────────────────────────────────────────────────

describe("Audit Logger", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger({
      storage: new InMemoryAuditStorage(),
      exporter: new DefaultAuditExporter(),
    });
  });

  it("should log audit events", async () => {
    const event = await logger.log({
      type: "enforcement.violation",
      actor: { type: "agent" },
      details: {},
      violation: {
        ruleName: "no-console-log",
        severity: "warning",
        message: "console.log detected",
        filePath: "src/app.ts",
        line: 42,
      },
      context: { manifestName: "test-manifest" },
      outcome: "failure",
    });

    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it("should query events by type", async () => {
    await logger.logViolation(
      { ruleName: "rule-1", severity: "warning", message: "Test" },
      "manifest"
    );
    await logger.logBlocked("rule-2", "file.ts", "Blocked", "manifest");

    const violations = await logger.query({
      types: ["enforcement.violation"],
    });
    expect(violations).toHaveLength(1);

    const blocked = await logger.query({ types: ["enforcement.blocked"] });
    expect(blocked).toHaveLength(1);
  });

  it("should generate summary", async () => {
    // Log events first
    await logger.logViolation(
      { ruleName: "rule-1", severity: "warning", message: "Test 1" },
      "manifest"
    );
    await logger.logViolation(
      { ruleName: "rule-1", severity: "warning", message: "Test 2" },
      "manifest"
    );
    await logger.logViolation(
      { ruleName: "rule-2", severity: "critical", message: "Test 3" },
      "manifest"
    );

    // Get summary for time range that includes our events
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const summary = await logger.getSummary(oneHourAgo, now);

    expect(summary.totals.events).toBe(3);
    expect(summary.byType["enforcement.violation"]).toBe(3);
  });

  it("should export to JSON", async () => {
    await logger.logViolation(
      { ruleName: "rule-1", severity: "warning", message: "Test" },
      "manifest"
    );

    const json = await logger.export({}, "json");
    const parsed = JSON.parse(json);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it("should export to CSV", async () => {
    await logger.logViolation(
      { ruleName: "rule-1", severity: "warning", message: "Test" },
      "manifest"
    );

    const csv = await logger.export({}, "csv");

    // CSV uses quoted values
    expect(csv).toContain('"id","type","timestamp"');
    expect(csv).toContain("enforcement.violation");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Escalation Tests
// ────────────────────────────────────────────────────────────────────────────

describe("Escalation Engine", () => {
  let engine: EscalationEngine;

  beforeEach(() => {
    engine = new EscalationEngine({
      storage: new InMemoryEscalationStorage(),
      channels: consoleChannelHandlers,
    });

    engine.registerContact({
      id: "contact-1",
      name: "On-Call",
      channel: "email",
      config: { email: "oncall@example.com" },
    });

    engine.registerPolicy({
      id: "critical-violations",
      name: "Critical Violations",
      triggers: [{ type: "severity", severity: "critical" }],
      levels: [
        { order: 0, contacts: ["contact-1"], escalateAfter: "15m" },
      ],
      settings: {},
    });
  });

  it("should create escalation for critical violation", async () => {
    await engine.evaluateViolation(
      {
        ruleName: "no-eval",
        severity: "critical",
        message: "Dynamic execution detected",
      },
      {}
    );

    const events = await engine.getActiveEvents();
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("active");
  });

  it("should not escalate non-matching violations", async () => {
    await engine.evaluateViolation(
      {
        ruleName: "no-console-log",
        severity: "warning",
        message: "console.log detected",
      },
      {}
    );

    const events = await engine.getActiveEvents();
    expect(events).toHaveLength(0);
  });

  it("should acknowledge escalation", async () => {
    await engine.evaluateViolation(
      { ruleName: "test", severity: "critical", message: "Test" },
      {}
    );

    const events = await engine.getActiveEvents();
    await engine.acknowledge(events[0].id, "user-1");

    const updated = await engine.getEvent(events[0].id);
    expect(updated?.status).toBe("acknowledged");
  });

  it("should resolve escalation", async () => {
    await engine.evaluateViolation(
      { ruleName: "test", severity: "critical", message: "Test" },
      {}
    );

    const events = await engine.getActiveEvents();
    await engine.resolve(events[0].id);

    const updated = await engine.getEvent(events[0].id);
    expect(updated?.status).toBe("resolved");
  });
});
