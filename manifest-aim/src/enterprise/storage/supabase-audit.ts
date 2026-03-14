/**
 * Supabase Audit Storage Adapter
 *
 * Persistent storage for audit events using Supabase PostgreSQL.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditStorage } from "../audit.js";
import type { AuditEvent, AuditEventType, AuditQuery, AuditSummary } from "../types.js";

export class SupabaseAuditStorage implements AuditStorage {
  constructor(private supabase: SupabaseClient) {}

  async save(event: AuditEvent): Promise<void> {
    const row = this.eventToRow(event);
    const { error } = await this.supabase.from("audit_events").insert(row);

    if (error) {
      throw new Error(`Failed to save audit event: ${error.message}`);
    }
  }

  async saveBatch(events: AuditEvent[]): Promise<void> {
    const rows = events.map((e) => this.eventToRow(e));
    const { error } = await this.supabase.from("audit_events").insert(rows);

    if (error) {
      throw new Error(`Failed to save audit events: ${error.message}`);
    }
  }

  async query(query: AuditQuery): Promise<AuditEvent[]> {
    let q = this.supabase.from("audit_events").select("*");

    if (query.startTime) {
      q = q.gte("timestamp", query.startTime.toISOString());
    }
    if (query.endTime) {
      q = q.lte("timestamp", query.endTime.toISOString());
    }
    if (query.types && query.types.length > 0) {
      q = q.in("type", query.types);
    }
    if (query.actorIds && query.actorIds.length > 0) {
      q = q.in("actor_id", query.actorIds);
    }
    if (query.resourceTypes && query.resourceTypes.length > 0) {
      q = q.in("resource_type", query.resourceTypes);
    }
    if (query.resourceIds && query.resourceIds.length > 0) {
      q = q.in("resource_id", query.resourceIds);
    }
    if (query.outcomes && query.outcomes.length > 0) {
      q = q.in("outcome", query.outcomes);
    }
    if (query.ruleNames && query.ruleNames.length > 0) {
      q = q.in("violation_rule_name", query.ruleNames);
    }
    if (query.severities && query.severities.length > 0) {
      q = q.in("violation_severity", query.severities);
    }

    // Sorting
    const orderBy = query.orderBy ?? "timestamp";
    const ascending = query.order === "asc";
    q = q.order(orderBy, { ascending });

    // Pagination
    if (query.offset) {
      q = q.range(query.offset, query.offset + (query.limit ?? 100) - 1);
    } else if (query.limit) {
      q = q.limit(query.limit);
    }

    const { data, error } = await q;

    if (error) {
      throw new Error(`Failed to query audit events: ${error.message}`);
    }

    return (data ?? []).map((row: Record<string, unknown>) => this.rowToEvent(row));
  }

  async count(query: AuditQuery): Promise<number> {
    let q = this.supabase
      .from("audit_events")
      .select("*", { count: "exact", head: true });

    if (query.startTime) {
      q = q.gte("timestamp", query.startTime.toISOString());
    }
    if (query.endTime) {
      q = q.lte("timestamp", query.endTime.toISOString());
    }
    if (query.types && query.types.length > 0) {
      q = q.in("type", query.types);
    }

    const { count, error } = await q;

    if (error) {
      throw new Error(`Failed to count audit events: ${error.message}`);
    }

    return count ?? 0;
  }

  async getSummary(startTime: Date, endTime: Date): Promise<AuditSummary> {
    // Get all events in range
    const { data: events, error } = await this.supabase
      .from("audit_events")
      .select("*")
      .gte("timestamp", startTime.toISOString())
      .lte("timestamp", endTime.toISOString());

    if (error) {
      throw new Error(`Failed to get audit summary: ${error.message}`);
    }

    const eventList = events ?? [];

    // Calculate summary
    const byType: Record<string, number> = {};
    const bySeverity = { critical: 0, error: 0, warning: 0, info: 0 };
    const byRule: Map<string, { count: number; severity: string }> = new Map();
    const byFile: Map<string, number> = new Map();

    let violations = 0;
    let blocked = 0;
    let approvals = 0;
    let transforms = 0;

    for (const row of eventList) {
      byType[row.type] = (byType[row.type] ?? 0) + 1;

      if (row.type === "enforcement.violation" && row.violation_rule_name) {
        violations++;

        const sev = row.violation_severity as keyof typeof bySeverity;
        if (sev in bySeverity) {
          bySeverity[sev]++;
        }

        const existing = byRule.get(row.violation_rule_name);
        if (existing) {
          existing.count++;
        } else {
          byRule.set(row.violation_rule_name, {
            count: 1,
            severity: row.violation_severity ?? "info",
          });
        }

        if (row.violation_file_path) {
          byFile.set(
            row.violation_file_path,
            (byFile.get(row.violation_file_path) ?? 0) + 1
          );
        }
      }

      if (row.type === "enforcement.blocked") blocked++;
      if (row.type === "approval.approved" || row.type === "approval.rejected")
        approvals++;
      if (row.type === "enforcement.transform") transforms++;
    }

    // Get previous period for trend
    const periodDuration = endTime.getTime() - startTime.getTime();
    const previousStart = new Date(startTime.getTime() - periodDuration);

    const { count: previousViolations } = await this.supabase
      .from("audit_events")
      .select("*", { count: "exact", head: true })
      .gte("timestamp", previousStart.toISOString())
      .lt("timestamp", startTime.toISOString())
      .eq("type", "enforcement.violation");

    let trends: AuditSummary["trends"];
    if (!previousViolations) {
      trends = { direction: "stable", changePercent: 0 };
    } else {
      const change = ((violations - previousViolations) / previousViolations) * 100;
      trends = {
        direction:
          change < -10 ? "improving" : change > 10 ? "degrading" : "stable",
        changePercent: Math.round(change),
      };
    }

    return {
      period: { start: startTime, end: endTime },
      totals: { events: eventList.length, violations, blocked, approvals, transforms },
      byType: byType as Record<AuditEventType, number>,
      bySeverity,
      byRule: Array.from(byRule.entries())
        .map(([ruleName, data]) => ({
          ruleName,
          count: data.count,
          severity: data.severity,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      byFile: Array.from(byFile.entries())
        .map(([filePath, violationCount]) => ({ filePath, violationCount }))
        .sort((a, b) => b.violationCount - a.violationCount)
        .slice(0, 10),
      trends,
    };
  }

  async purge(before: Date): Promise<number> {
    const { data, error } = await this.supabase
      .from("audit_events")
      .delete()
      .lt("timestamp", before.toISOString())
      .select("id");

    if (error) {
      throw new Error(`Failed to purge audit events: ${error.message}`);
    }

    return data?.length ?? 0;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Row Conversion
  // ──────────────────────────────────────────────────────────────────────────

  private eventToRow(event: AuditEvent): Record<string, unknown> {
    return {
      id: event.id,
      type: event.type,
      timestamp: event.timestamp.toISOString(),
      actor_type: event.actor.type,
      actor_id: event.actor.id,
      actor_name: event.actor.name,
      actor_ip: event.actor.ip,
      resource_type: event.resource?.type,
      resource_id: event.resource?.id,
      resource_name: event.resource?.name,
      details: event.details,
      violation_rule_name: event.violation?.ruleName,
      violation_severity: event.violation?.severity,
      violation_message: event.violation?.message,
      violation_file_path: event.violation?.filePath,
      violation_line: event.violation?.line,
      manifest_name: event.context?.manifestName,
      manifest_version: event.context?.manifestVersion,
      environment: event.context?.environment,
      git_branch: event.context?.gitBranch,
      git_commit: event.context?.gitCommit,
      outcome: event.outcome,
      error: event.error,
    };
  }

  private rowToEvent(row: Record<string, unknown>): AuditEvent {
    return {
      id: row.id as string,
      type: row.type as AuditEventType,
      timestamp: new Date(row.timestamp as string),
      actor: {
        type: row.actor_type as "user" | "system" | "agent",
        id: row.actor_id as string | undefined,
        name: row.actor_name as string | undefined,
        ip: row.actor_ip as string | undefined,
      },
      resource: row.resource_type
        ? {
            type: row.resource_type as "manifest" | "rule" | "approval" | "user" | "team",
            id: row.resource_id as string,
            name: row.resource_name as string | undefined,
          }
        : undefined,
      details: (row.details as Record<string, unknown>) ?? {},
      violation: row.violation_rule_name
        ? {
            ruleName: row.violation_rule_name as string,
            severity: row.violation_severity as string,
            message: row.violation_message as string,
            filePath: row.violation_file_path as string | undefined,
            line: row.violation_line as number | undefined,
          }
        : undefined,
      context: {
        manifestName: row.manifest_name as string | undefined,
        manifestVersion: row.manifest_version as string | undefined,
        environment: row.environment as string | undefined,
        gitBranch: row.git_branch as string | undefined,
        gitCommit: row.git_commit as string | undefined,
      },
      outcome: row.outcome as "success" | "failure" | "pending",
      error: row.error as string | undefined,
    };
  }
}
