/**
 * AIM API Server
 *
 * REST API for AIM Studio and other clients.
 * Provides endpoints for manifests, enforcement, approvals, and audit.
 */

import { createServer } from "node:http";
import { parse as parseUrl } from "node:url";
import { RBACManager } from "../enterprise/rbac.js";
import { ApprovalEngine, InMemoryApprovalStorage } from "../enterprise/approval.js";
import { AuditLogger, InMemoryAuditStorage, DefaultAuditExporter } from "../enterprise/audit.js";
import { EscalationEngine, InMemoryEscalationStorage, consoleChannelHandlers } from "../enterprise/escalation.js";
import type { AuditEventType } from "../enterprise/types.js";

export interface APIConfig {
  port: number;
  cors?: boolean;
  rbac: RBACManager;
  approvalEngine: ApprovalEngine;
  auditLogger: AuditLogger;
  escalationEngine: EscalationEngine;
}

export interface APIRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
  userId?: string;
}

export interface APIResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

type RouteHandler = (req: APIRequest) => Promise<APIResponse>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

/**
 * Simple API server for AIM
 */
export class AIMServer {
  private routes: Route[] = [];
  private config: APIConfig;

  constructor(config: APIConfig) {
    this.config = config;
    this.registerRoutes();
  }

  private registerRoutes(): void {
    // ── Health ──
    this.route("GET", "/health", this.healthCheck.bind(this));

    // ── Manifests ──
    this.route("POST", "/api/manifests/validate", this.validateManifest.bind(this));
    this.route("POST", "/api/manifests/compile", this.compileManifest.bind(this));
    this.route("POST", "/api/manifests/wrap", this.wrapManifest.bind(this));

    // ── Enforcement ──
    this.route("POST", "/api/enforce", this.runEnforcement.bind(this));

    // ── Approvals ──
    this.route("GET", "/api/approvals", this.listApprovals.bind(this));
    this.route("GET", "/api/approvals/:id", this.getApproval.bind(this));
    this.route("POST", "/api/approvals", this.createApproval.bind(this));
    this.route("POST", "/api/approvals/:id/approve", this.approveRequest.bind(this));
    this.route("POST", "/api/approvals/:id/reject", this.rejectRequest.bind(this));

    // ── Audit ──
    this.route("GET", "/api/audit", this.listAuditEvents.bind(this));
    this.route("GET", "/api/audit/summary", this.getAuditSummary.bind(this));
    this.route("GET", "/api/audit/export", this.exportAudit.bind(this));

    // ── Escalations ──
    this.route("GET", "/api/escalations", this.listEscalations.bind(this));
    this.route("POST", "/api/escalations/:id/acknowledge", this.acknowledgeEscalation.bind(this));
    this.route("POST", "/api/escalations/:id/resolve", this.resolveEscalation.bind(this));

    // ── Teams ──
    this.route("GET", "/api/teams", this.listTeams.bind(this));
    this.route("GET", "/api/roles", this.listRoles.bind(this));
  }

  private route(method: string, path: string, handler: RouteHandler): void {
    // Convert path to regex with named params
    const paramNames: string[] = [];
    const pattern = path.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return "([^/]+)";
    });

    this.routes.push({
      method,
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
      handler,
    });
  }

  private matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;

      const match = path.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });
        return { route, params };
      }
    }
    return null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Route Handlers
  // ──────────────────────────────────────────────────────────────────────────

  private async healthCheck(_req: APIRequest): Promise<APIResponse> {
    return {
      status: 200,
      body: {
        status: "ok",
        version: "0.1.0",
        timestamp: new Date().toISOString(),
      },
    };
  }

  private async validateManifest(req: APIRequest): Promise<APIResponse> {
    const { manifest } = req.body as { manifest: string };

    // Basic validation
    try {
      // Simple check for required fields
      if (!manifest.includes("aim:")) {
        return {
          status: 400,
          body: { valid: false, errors: [{ message: "Missing 'aim' version field" }] },
        };
      }

      if (!manifest.includes("metadata:")) {
        return {
          status: 400,
          body: { valid: false, errors: [{ message: "Missing 'metadata' section" }] },
        };
      }

      return {
        status: 200,
        body: { valid: true },
      };
    } catch (e) {
      return {
        status: 400,
        body: { valid: false, errors: [{ message: (e as Error).message }] },
      };
    }
  }

  private async compileManifest(req: APIRequest): Promise<APIResponse> {
    const { manifest } = req.body as { manifest: string };

    // Would use actual compiler
    return {
      status: 200,
      body: {
        compiled: manifest,
        dependencies: [],
        warnings: [],
      },
    };
  }

  private async wrapManifest(req: APIRequest): Promise<APIResponse> {
    const { manifest, platform } = req.body as { manifest: string; platform: string };

    // Would use actual wrap function
    return {
      status: 200,
      body: {
        platform,
        context: `# Generated for ${platform}\n\n${manifest}`,
      },
    };
  }

  private async runEnforcement(req: APIRequest): Promise<APIResponse> {
    const { code, manifest } = req.body as { code: string; manifest: string };

    // Would run actual enforcement
    return {
      status: 200,
      body: {
        violations: [],
        blocked: false,
        transforms: [],
      },
    };
  }

  // ── Approvals ──

  private async listApprovals(req: APIRequest): Promise<APIResponse> {
    const status = req.query.status as "pending" | "approved" | "rejected" | undefined;

    const requests = await this.config.approvalEngine.listRequests({
      status: status ? [status] : undefined,
      limit: parseInt(req.query.limit || "50", 10),
    });

    return {
      status: 200,
      body: { requests },
    };
  }

  private async getApproval(req: APIRequest): Promise<APIResponse> {
    const request = await this.config.approvalEngine.getRequest(req.params.id);

    if (!request) {
      return { status: 404, body: { error: "Approval request not found" } };
    }

    return { status: 200, body: { request } };
  }

  private async createApproval(req: APIRequest): Promise<APIResponse> {
    const { policyId, context, justification } = req.body as {
      policyId: string;
      context: unknown;
      justification?: string;
    };

    if (!req.userId) {
      return { status: 401, body: { error: "Authentication required" } };
    }

    try {
      const request = await this.config.approvalEngine.createRequest(
        policyId,
        context as Parameters<typeof this.config.approvalEngine.createRequest>[1],
        req.userId,
        justification
      );

      await this.config.auditLogger.logApprovalRequested(
        request.id,
        policyId,
        req.userId
      );

      return { status: 201, body: { request } };
    } catch (e) {
      return { status: 400, body: { error: (e as Error).message } };
    }
  }

  private async approveRequest(req: APIRequest): Promise<APIResponse> {
    const { comment } = req.body as { comment?: string };

    if (!req.userId) {
      return { status: 401, body: { error: "Authentication required" } };
    }

    try {
      const request = await this.config.approvalEngine.submitDecision(
        req.params.id,
        req.userId,
        "approved",
        comment
      );

      await this.config.auditLogger.logApprovalDecision(
        request.id,
        req.userId,
        "approved"
      );

      return { status: 200, body: { request } };
    } catch (e) {
      return { status: 400, body: { error: (e as Error).message } };
    }
  }

  private async rejectRequest(req: APIRequest): Promise<APIResponse> {
    const { comment } = req.body as { comment?: string };

    if (!req.userId) {
      return { status: 401, body: { error: "Authentication required" } };
    }

    try {
      const request = await this.config.approvalEngine.submitDecision(
        req.params.id,
        req.userId,
        "rejected",
        comment
      );

      await this.config.auditLogger.logApprovalDecision(
        request.id,
        req.userId,
        "rejected"
      );

      return { status: 200, body: { request } };
    } catch (e) {
      return { status: 400, body: { error: (e as Error).message } };
    }
  }

  // ── Audit ──

  private async listAuditEvents(req: APIRequest): Promise<APIResponse> {
    const events = await this.config.auditLogger.query({
      types: req.query.type ? [req.query.type as AuditEventType] : undefined,
      limit: parseInt(req.query.limit || "50", 10),
    });

    return { status: 200, body: { events } };
  }

  private async getAuditSummary(req: APIRequest): Promise<APIResponse> {
    const days = parseInt(req.query.days || "7", 10);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    const summary = await this.config.auditLogger.getSummary(startTime, endTime);

    return { status: 200, body: { summary } };
  }

  private async exportAudit(req: APIRequest): Promise<APIResponse> {
    const format = (req.query.format as "json" | "csv") || "json";

    const data = await this.config.auditLogger.export({}, format);

    return {
      status: 200,
      body: data,
      headers: {
        "Content-Type": format === "json" ? "application/json" : "text/csv",
        "Content-Disposition": `attachment; filename="audit-export.${format}"`,
      },
    };
  }

  // ── Escalations ──

  private async listEscalations(_req: APIRequest): Promise<APIResponse> {
    const events = await this.config.escalationEngine.getActiveEvents();
    return { status: 200, body: { events } };
  }

  private async acknowledgeEscalation(req: APIRequest): Promise<APIResponse> {
    if (!req.userId) {
      return { status: 401, body: { error: "Authentication required" } };
    }

    try {
      await this.config.escalationEngine.acknowledge(req.params.id, req.userId);
      return { status: 200, body: { acknowledged: true } };
    } catch (e) {
      return { status: 400, body: { error: (e as Error).message } };
    }
  }

  private async resolveEscalation(req: APIRequest): Promise<APIResponse> {
    try {
      await this.config.escalationEngine.resolve(req.params.id);
      return { status: 200, body: { resolved: true } };
    } catch (e) {
      return { status: 400, body: { error: (e as Error).message } };
    }
  }

  // ── Teams ──

  private async listTeams(_req: APIRequest): Promise<APIResponse> {
    const teams = this.config.rbac.getAllTeams();
    return { status: 200, body: { teams } };
  }

  private async listRoles(_req: APIRequest): Promise<APIResponse> {
    const roles = this.config.rbac.getAllRoles();
    return { status: 200, body: { roles } };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Server
  // ──────────────────────────────────────────────────────────────────────────

  start(): void {
    const server = createServer(async (req, res) => {
      // CORS
      if (this.config.cors) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }
      }

      const url = parseUrl(req.url || "/", true);
      const path = url.pathname || "/";
      const query = (url.query || {}) as Record<string, string>;

      // Parse body for POST/PUT
      let body: unknown = {};
      if (req.method === "POST" || req.method === "PUT") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const rawBody = Buffer.concat(chunks).toString();
        if (rawBody) {
          try {
            body = JSON.parse(rawBody);
          } catch {
            body = rawBody;
          }
        }
      }

      // Extract user ID from auth header (simplified)
      const authHeader = req.headers.authorization || "";
      const userId = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

      // Match route
      const match = this.matchRoute(req.method || "GET", path);

      if (!match) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      try {
        const apiReq: APIRequest = {
          method: req.method || "GET",
          path,
          params: match.params,
          query,
          body,
          headers: req.headers as Record<string, string>,
          userId,
        };

        const response = await match.route.handler(apiReq);

        const headers = {
          "Content-Type": "application/json",
          ...response.headers,
        };

        res.writeHead(response.status, headers);
        res.end(
          typeof response.body === "string"
            ? response.body
            : JSON.stringify(response.body)
        );
      } catch (e) {
        console.error("API Error:", e);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });

    server.listen(this.config.port, () => {
      console.log(`AIM API server running on http://localhost:${this.config.port}`);
    });
  }
}

/**
 * Create and start the API server with default configuration
 */
export function createAPIServer(port: number = 4000): AIMServer {
  const rbac = new RBACManager();
  const approvalEngine = new ApprovalEngine({
    rbac,
    storage: new InMemoryApprovalStorage(),
  });
  const auditLogger = new AuditLogger({
    storage: new InMemoryAuditStorage(),
    exporter: new DefaultAuditExporter(),
  });
  const escalationEngine = new EscalationEngine({
    storage: new InMemoryEscalationStorage(),
    channels: consoleChannelHandlers,
  });

  return new AIMServer({
    port,
    cors: true,
    rbac,
    approvalEngine,
    auditLogger,
    escalationEngine,
  });
}
