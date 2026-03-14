/**
 * Supabase Approval Storage Adapter
 *
 * Persistent storage for approval requests using Supabase PostgreSQL.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalStorage, ApprovalQuery } from "../approval.js";
import type { ApprovalRequest, ApprovalDecision, ApprovalStatus } from "../types.js";

export class SupabaseApprovalStorage implements ApprovalStorage {
  constructor(private supabase: SupabaseClient) {}

  async saveRequest(request: ApprovalRequest): Promise<void> {
    const row = this.requestToRow(request);
    const { error } = await this.supabase.from("approval_requests").insert(row);

    if (error) {
      throw new Error(`Failed to save approval request: ${error.message}`);
    }

    // Save decisions separately
    if (request.decisions.length > 0) {
      const decisionRows = request.decisions.map((d) => ({
        request_id: request.id,
        approver_id: d.approverId,
        decision: d.decision,
        comment: d.comment,
        created_at: d.timestamp.toISOString(),
      }));

      const { error: decisionError } = await this.supabase
        .from("approval_decisions")
        .insert(decisionRows);

      if (decisionError) {
        throw new Error(`Failed to save approval decisions: ${decisionError.message}`);
      }
    }
  }

  async getRequest(id: string): Promise<ApprovalRequest | null> {
    const { data: row, error } = await this.supabase
      .from("approval_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !row) {
      return null;
    }

    // Get decisions
    const { data: decisions } = await this.supabase
      .from("approval_decisions")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: true });

    return this.rowToRequest(row, decisions ?? []);
  }

  async updateRequest(request: ApprovalRequest): Promise<void> {
    const row = this.requestToRow(request);
    const { error } = await this.supabase
      .from("approval_requests")
      .update(row)
      .eq("id", request.id);

    if (error) {
      throw new Error(`Failed to update approval request: ${error.message}`);
    }

    // Upsert decisions
    for (const decision of request.decisions) {
      const decisionRow = {
        request_id: request.id,
        approver_id: decision.approverId,
        decision: decision.decision,
        comment: decision.comment,
        created_at: decision.timestamp.toISOString(),
      };

      const { error: decisionError } = await this.supabase
        .from("approval_decisions")
        .upsert(decisionRow, { onConflict: "request_id,approver_id" });

      if (decisionError) {
        throw new Error(`Failed to update approval decision: ${decisionError.message}`);
      }
    }
  }

  async listRequests(query: ApprovalQuery): Promise<ApprovalRequest[]> {
    let q = this.supabase.from("approval_requests").select("*");

    if (query.status && query.status.length > 0) {
      q = q.in("status", query.status);
    }
    if (query.policyId) {
      q = q.eq("policy_id", query.policyId);
    }
    if (query.requesterId) {
      q = q.eq("requester_id", query.requesterId);
    }
    if (query.createdAfter) {
      q = q.gte("created_at", query.createdAfter.toISOString());
    }
    if (query.createdBefore) {
      q = q.lte("created_at", query.createdBefore.toISOString());
    }

    q = q.order("created_at", { ascending: false });

    if (query.offset) {
      q = q.range(query.offset, query.offset + (query.limit ?? 100) - 1);
    } else if (query.limit) {
      q = q.limit(query.limit);
    }

    const { data, error } = await q;

    if (error) {
      throw new Error(`Failed to list approval requests: ${error.message}`);
    }

    // Get decisions for all requests
    const requestIds = (data ?? []).map((r: Record<string, unknown>) => r.id);
    const { data: allDecisions } = await this.supabase
      .from("approval_decisions")
      .select("*")
      .in("request_id", requestIds);

    const decisionsByRequest = new Map<string, Array<Record<string, unknown>>>();
    for (const d of allDecisions ?? []) {
      const requestId = d.request_id as string;
      if (!decisionsByRequest.has(requestId)) {
        decisionsByRequest.set(requestId, []);
      }
      decisionsByRequest.get(requestId)!.push(d);
    }

    return (data ?? []).map((row: Record<string, unknown>) =>
      this.rowToRequest(row, decisionsByRequest.get(row.id as string) ?? [])
    );
  }

  async countPendingByPolicy(policyId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("approval_requests")
      .select("*", { count: "exact", head: true })
      .eq("policy_id", policyId)
      .eq("status", "pending");

    if (error) {
      throw new Error(`Failed to count pending requests: ${error.message}`);
    }

    return count ?? 0;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Row Conversion
  // ──────────────────────────────────────────────────────────────────────────

  private requestToRow(request: ApprovalRequest): Record<string, unknown> {
    return {
      id: request.id,
      policy_id: request.policyId,
      status: request.status,
      context: request.context,
      requester_id: request.requesterId,
      justification: request.justification,
      created_at: request.createdAt.toISOString(),
      updated_at: request.updatedAt.toISOString(),
      expires_at: request.expiresAt?.toISOString(),
      resolved_at: request.resolvedAt?.toISOString(),
    };
  }

  private rowToRequest(
    row: Record<string, unknown>,
    decisionRows: Array<Record<string, unknown>>
  ): ApprovalRequest {
    const decisions: ApprovalDecision[] = decisionRows.map((d) => ({
      approverId: d.approver_id as string,
      decision: d.decision as "approved" | "rejected",
      comment: d.comment as string | undefined,
      timestamp: new Date(d.created_at as string),
    }));

    return {
      id: row.id as string,
      policyId: row.policy_id as string,
      status: row.status as ApprovalStatus,
      context: row.context as ApprovalRequest["context"],
      requesterId: row.requester_id as string,
      justification: row.justification as string | undefined,
      decisions,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      expiresAt: row.expires_at ? new Date(row.expires_at as string) : undefined,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
    };
  }
}
