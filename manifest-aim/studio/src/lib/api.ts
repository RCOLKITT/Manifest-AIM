/**
 * AIM Studio API Client
 *
 * Connects to the manifest serve API server for all operations.
 */

export interface ApiConfig {
  baseUrl: string;
}

export interface Manifest {
  id: string;
  name: string;
  version: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRequest {
  id: string;
  policyId: string;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  context: {
    ruleName: string;
    filePath?: string;
    details?: Record<string, unknown>;
  };
  requesterId: string;
  justification?: string;
  decisions: ApprovalDecision[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  resolvedAt?: string;
}

export interface ApprovalDecision {
  approverId: string;
  decision: "approved" | "rejected";
  comment?: string;
  timestamp: string;
}

export interface AuditEvent {
  id: string;
  type: string;
  timestamp: string;
  actor: {
    type: "user" | "system" | "agent";
    id?: string;
    name?: string;
  };
  violation?: {
    ruleName: string;
    severity: string;
    message: string;
    filePath?: string;
    line?: number;
  };
  outcome: "success" | "failure" | "pending";
}

export interface AuditSummary {
  period: { start: string; end: string };
  totals: {
    events: number;
    violations: number;
    blocked: number;
    approvals: number;
    transforms: number;
  };
  bySeverity: Record<string, number>;
  byRule: Array<{ ruleName: string; count: number; severity: string }>;
  byFile: Array<{ filePath: string; violationCount: number }>;
  trends: {
    direction: "improving" | "degrading" | "stable";
    changePercent: number;
  };
}

export interface Escalation {
  id: string;
  policyId: string;
  status: "active" | "acknowledged" | "resolved";
  currentLevel: number;
  triggerContext: {
    type: string;
    violation?: {
      ruleName: string;
      severity: string;
    };
  };
  history: Array<{
    level: number;
    contacts: string[];
    sentAt: string;
    acknowledgedAt?: string;
  }>;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  members: Array<{ userId: string; role: string }>;
}

export interface EnforceResult {
  passed: boolean;
  violations: Array<{
    ruleName: string;
    severity: string;
    message: string;
    filePath?: string;
    line?: number;
  }>;
  blocked: boolean;
  transformed: boolean;
}

class AIMApiClient {
  private baseUrl: string;

  constructor(config: ApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `API error: ${response.status}`);
    }

    return response.json();
  }

  // Health
  async health(): Promise<{ status: string; timestamp: string }> {
    return this.request("/health");
  }

  // Manifests
  async listManifests(): Promise<{ manifests: Manifest[] }> {
    return this.request("/api/manifests");
  }

  async getManifest(id: string): Promise<{ manifest: Manifest }> {
    return this.request(`/api/manifests/${id}`);
  }

  async createManifest(
    name: string,
    content: string
  ): Promise<{ manifest: Manifest }> {
    return this.request("/api/manifests", {
      method: "POST",
      body: JSON.stringify({ name, content }),
    });
  }

  async updateManifest(
    id: string,
    content: string
  ): Promise<{ manifest: Manifest }> {
    return this.request(`/api/manifests/${id}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  }

  async deleteManifest(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/manifests/${id}`, { method: "DELETE" });
  }

  async validateManifest(
    id: string
  ): Promise<{ valid: boolean; errors?: string[] }> {
    return this.request(`/api/manifests/${id}/validate`, { method: "POST" });
  }

  // Enforcement
  async enforce(
    manifestId: string,
    content: string,
    filePath: string
  ): Promise<{ result: EnforceResult }> {
    return this.request("/api/enforce", {
      method: "POST",
      body: JSON.stringify({ manifestId, content, filePath }),
    });
  }

  // Approvals
  async listApprovals(params?: {
    status?: string;
    limit?: number;
  }): Promise<{ requests: ApprovalRequest[] }> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.limit) query.set("limit", params.limit.toString());
    const queryString = query.toString();
    return this.request(`/api/approvals${queryString ? `?${queryString}` : ""}`);
  }

  async getApproval(id: string): Promise<{ request: ApprovalRequest }> {
    return this.request(`/api/approvals/${id}`);
  }

  async approveRequest(
    id: string,
    approverId: string,
    comment?: string
  ): Promise<{ request: ApprovalRequest }> {
    return this.request(`/api/approvals/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ approverId, comment }),
    });
  }

  async rejectRequest(
    id: string,
    approverId: string,
    comment?: string
  ): Promise<{ request: ApprovalRequest }> {
    return this.request(`/api/approvals/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ approverId, comment }),
    });
  }

  // Audit
  async listAuditEvents(params?: {
    type?: string;
    severity?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }): Promise<{ events: AuditEvent[] }> {
    const query = new URLSearchParams();
    if (params?.type) query.set("type", params.type);
    if (params?.severity) query.set("severity", params.severity);
    if (params?.startTime) query.set("startTime", params.startTime);
    if (params?.endTime) query.set("endTime", params.endTime);
    if (params?.limit) query.set("limit", params.limit.toString());
    const queryString = query.toString();
    return this.request(`/api/audit${queryString ? `?${queryString}` : ""}`);
  }

  async getAuditSummary(params?: {
    startTime?: string;
    endTime?: string;
  }): Promise<{ summary: AuditSummary }> {
    const query = new URLSearchParams();
    if (params?.startTime) query.set("startTime", params.startTime);
    if (params?.endTime) query.set("endTime", params.endTime);
    const queryString = query.toString();
    return this.request(
      `/api/audit/summary${queryString ? `?${queryString}` : ""}`
    );
  }

  // Escalations
  async listEscalations(params?: {
    status?: string;
    policyId?: string;
  }): Promise<{ escalations: Escalation[] }> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.policyId) query.set("policyId", params.policyId);
    const queryString = query.toString();
    return this.request(
      `/api/escalations${queryString ? `?${queryString}` : ""}`
    );
  }

  // Teams
  async listTeams(): Promise<{ teams: Team[] }> {
    return this.request("/api/teams");
  }
}

// Create singleton client with default config
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const api = new AIMApiClient({ baseUrl: API_BASE_URL });

export default api;
