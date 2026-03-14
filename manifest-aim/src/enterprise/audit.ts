/**
 * Audit System for AIM
 *
 * Tracks all governance events for compliance, analytics, and debugging.
 * Supports querying, aggregation, and export.
 */

import { randomUUID } from "node:crypto";
import type {
  AuditEvent,
  AuditEventType,
  AuditQuery,
  AuditSummary,
} from "./types.js";

export interface AuditConfig {
  storage: AuditStorage;
  // Maximum events to keep in memory (for in-memory storage)
  maxEvents?: number;
  // Auto-export when reaching threshold
  exportThreshold?: number;
  exporter?: AuditExporter;
}

/**
 * Storage interface for audit events
 */
export interface AuditStorage {
  save(event: AuditEvent): Promise<void>;
  saveBatch(events: AuditEvent[]): Promise<void>;
  query(query: AuditQuery): Promise<AuditEvent[]>;
  count(query: AuditQuery): Promise<number>;
  getSummary(startTime: Date, endTime: Date): Promise<AuditSummary>;
  purge(before: Date): Promise<number>;
}

/**
 * Exporter interface for audit events
 */
export interface AuditExporter {
  export(events: AuditEvent[], format: "json" | "csv"): Promise<string>;
  exportToFile(
    events: AuditEvent[],
    filePath: string,
    format: "json" | "csv",
  ): Promise<void>;
}

/**
 * In-memory audit storage (for development/testing)
 */
export class InMemoryAuditStorage implements AuditStorage {
  private events: AuditEvent[] = [];
  private maxEvents: number;

  constructor(maxEvents: number = 10000) {
    this.maxEvents = maxEvents;
  }

  async save(event: AuditEvent): Promise<void> {
    this.events.push(event);
    this.trimIfNeeded();
  }

  async saveBatch(events: AuditEvent[]): Promise<void> {
    this.events.push(...events);
    this.trimIfNeeded();
  }

  private trimIfNeeded(): void {
    if (this.events.length > this.maxEvents) {
      // Remove oldest events
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  async query(query: AuditQuery): Promise<AuditEvent[]> {
    let results = [...this.events];

    // Apply filters
    if (query.startTime) {
      results = results.filter((e) => e.timestamp >= query.startTime!);
    }

    if (query.endTime) {
      results = results.filter((e) => e.timestamp <= query.endTime!);
    }

    if (query.types && query.types.length > 0) {
      results = results.filter((e) => query.types!.includes(e.type));
    }

    if (query.actorIds && query.actorIds.length > 0) {
      results = results.filter(
        (e) => e.actor.id && query.actorIds!.includes(e.actor.id),
      );
    }

    if (query.resourceTypes && query.resourceTypes.length > 0) {
      results = results.filter(
        (e) => e.resource && query.resourceTypes!.includes(e.resource.type),
      );
    }

    if (query.resourceIds && query.resourceIds.length > 0) {
      results = results.filter(
        (e) => e.resource && query.resourceIds!.includes(e.resource.id),
      );
    }

    if (query.outcomes && query.outcomes.length > 0) {
      results = results.filter((e) => query.outcomes!.includes(e.outcome));
    }

    if (query.ruleNames && query.ruleNames.length > 0) {
      results = results.filter(
        (e) => e.violation && query.ruleNames!.includes(e.violation.ruleName),
      );
    }

    if (query.severities && query.severities.length > 0) {
      results = results.filter(
        (e) => e.violation && query.severities!.includes(e.violation.severity),
      );
    }

    // Sort
    const orderBy = query.orderBy ?? "timestamp";
    const order = query.order ?? "desc";

    results.sort((a, b) => {
      let comparison = 0;
      switch (orderBy) {
        case "timestamp":
          comparison = a.timestamp.getTime() - b.timestamp.getTime();
          break;
        case "type":
          comparison = a.type.localeCompare(b.type);
          break;
        case "severity":
          const severityOrder = { critical: 0, error: 1, warning: 2, info: 3 };
          const aSev = a.violation?.severity ?? "info";
          const bSev = b.violation?.severity ?? "info";
          comparison =
            (severityOrder[aSev as keyof typeof severityOrder] ?? 4) -
            (severityOrder[bSev as keyof typeof severityOrder] ?? 4);
          break;
      }
      return order === "asc" ? comparison : -comparison;
    });

    // Apply pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async count(query: AuditQuery): Promise<number> {
    const results = await this.query({ ...query, limit: undefined });
    return results.length;
  }

  async getSummary(startTime: Date, endTime: Date): Promise<AuditSummary> {
    const events = await this.query({
      startTime,
      endTime,
      limit: undefined,
    });

    // Initialize counters
    const byType: Record<string, number> = {};
    const bySeverity = { critical: 0, error: 0, warning: 0, info: 0 };
    const byRule: Map<string, { count: number; severity: string }> = new Map();
    const byFile: Map<string, number> = new Map();

    let violations = 0;
    let blocked = 0;
    let approvals = 0;
    let transforms = 0;

    for (const event of events) {
      // Count by type
      byType[event.type] = (byType[event.type] ?? 0) + 1;

      // Count violations and categorize
      if (event.type === "enforcement.violation" && event.violation) {
        violations++;

        // By severity
        const sev = event.violation.severity as keyof typeof bySeverity;
        if (sev in bySeverity) {
          bySeverity[sev]++;
        }

        // By rule
        const ruleName = event.violation.ruleName;
        const existing = byRule.get(ruleName);
        if (existing) {
          existing.count++;
        } else {
          byRule.set(ruleName, { count: 1, severity: event.violation.severity });
        }

        // By file
        if (event.violation.filePath) {
          const fileCount = byFile.get(event.violation.filePath) ?? 0;
          byFile.set(event.violation.filePath, fileCount + 1);
        }
      }

      // Count other event types
      if (event.type === "enforcement.blocked") blocked++;
      if (
        event.type === "approval.approved" ||
        event.type === "approval.rejected"
      )
        approvals++;
      if (event.type === "enforcement.transform") transforms++;
    }

    // Calculate trends (compare to previous period)
    const periodDuration = endTime.getTime() - startTime.getTime();
    const previousStart = new Date(startTime.getTime() - periodDuration);
    const previousEvents = await this.query({
      startTime: previousStart,
      endTime: startTime,
      limit: undefined,
    });

    const previousViolations = previousEvents.filter(
      (e) => e.type === "enforcement.violation",
    ).length;

    let trends: AuditSummary["trends"];
    if (previousViolations === 0) {
      trends = { direction: "stable", changePercent: 0 };
    } else {
      const change =
        ((violations - previousViolations) / previousViolations) * 100;
      trends = {
        direction:
          change < -10 ? "improving" : change > 10 ? "degrading" : "stable",
        changePercent: Math.round(change),
      };
    }

    return {
      period: { start: startTime, end: endTime },
      totals: {
        events: events.length,
        violations,
        blocked,
        approvals,
        transforms,
      },
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
    const initialCount = this.events.length;
    this.events = this.events.filter((e) => e.timestamp >= before);
    return initialCount - this.events.length;
  }
}

/**
 * JSON/CSV exporter for audit events
 */
export class DefaultAuditExporter implements AuditExporter {
  async export(
    events: AuditEvent[],
    format: "json" | "csv",
  ): Promise<string> {
    if (format === "json") {
      return JSON.stringify(events, null, 2);
    }

    // CSV format
    const headers = [
      "id",
      "type",
      "timestamp",
      "actor_type",
      "actor_id",
      "actor_name",
      "resource_type",
      "resource_id",
      "outcome",
      "rule_name",
      "severity",
      "message",
      "file_path",
      "line",
    ];

    const rows = events.map((e) => [
      e.id,
      e.type,
      e.timestamp.toISOString(),
      e.actor.type,
      e.actor.id ?? "",
      e.actor.name ?? "",
      e.resource?.type ?? "",
      e.resource?.id ?? "",
      e.outcome,
      e.violation?.ruleName ?? "",
      e.violation?.severity ?? "",
      e.violation?.message ?? "",
      e.violation?.filePath ?? "",
      e.violation?.line?.toString() ?? "",
    ]);

    const csvRows = [headers, ...rows].map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    );

    return csvRows.join("\n");
  }

  async exportToFile(
    events: AuditEvent[],
    filePath: string,
    format: "json" | "csv",
  ): Promise<void> {
    const { writeFile } = await import("node:fs/promises");
    const content = await this.export(events, format);
    await writeFile(filePath, content, "utf-8");
  }
}

/**
 * Main audit logger class
 */
export class AuditLogger {
  private config: AuditConfig;
  private pendingEvents: AuditEvent[] = [];
  private flushInterval?: NodeJS.Timeout;

  constructor(config: AuditConfig) {
    this.config = config;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Event Logging
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Log an audit event
   */
  async log(event: Omit<AuditEvent, "id" | "timestamp">): Promise<AuditEvent> {
    const fullEvent: AuditEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date(),
    };

    await this.config.storage.save(fullEvent);

    // Check if we need to export
    if (this.config.exportThreshold && this.config.exporter) {
      const count = await this.config.storage.count({});
      if (count >= this.config.exportThreshold) {
        // Trigger export in background
        this.exportAndPurge().catch(console.error);
      }
    }

    return fullEvent;
  }

  /**
   * Log a batch of events
   */
  async logBatch(
    events: Array<Omit<AuditEvent, "id" | "timestamp">>,
  ): Promise<AuditEvent[]> {
    const fullEvents: AuditEvent[] = events.map((e) => ({
      ...e,
      id: randomUUID(),
      timestamp: new Date(),
    }));

    await this.config.storage.saveBatch(fullEvents);
    return fullEvents;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Convenience Methods
  // ──────────────────────────────────────────────────────────────────────────

  async logEnforcementStarted(
    manifestName: string,
    environment?: string,
    gitContext?: { branch?: string; commit?: string },
  ): Promise<AuditEvent> {
    return this.log({
      type: "enforcement.started",
      actor: { type: "system" },
      resource: { type: "manifest", id: manifestName, name: manifestName },
      details: { environment },
      context: {
        manifestName,
        environment,
        gitBranch: gitContext?.branch,
        gitCommit: gitContext?.commit,
      },
      outcome: "success",
    });
  }

  async logViolation(
    violation: AuditEvent["violation"],
    manifestName: string,
    actorId?: string,
  ): Promise<AuditEvent> {
    return this.log({
      type: "enforcement.violation",
      actor: actorId ? { type: "user", id: actorId } : { type: "agent" },
      resource: { type: "rule", id: violation!.ruleName },
      details: {},
      violation,
      context: { manifestName },
      outcome: "failure",
    });
  }

  async logBlocked(
    ruleName: string,
    filePath: string,
    message: string,
    manifestName: string,
  ): Promise<AuditEvent> {
    return this.log({
      type: "enforcement.blocked",
      actor: { type: "system" },
      resource: { type: "rule", id: ruleName },
      details: { filePath, message },
      violation: {
        ruleName,
        severity: "critical",
        message,
        filePath,
      },
      context: { manifestName },
      outcome: "success", // Successfully blocked
    });
  }

  async logTransform(
    ruleName: string,
    filePath: string,
    before: string,
    after: string,
    manifestName: string,
  ): Promise<AuditEvent> {
    return this.log({
      type: "enforcement.transform",
      actor: { type: "system" },
      resource: { type: "rule", id: ruleName },
      details: {
        filePath,
        before: before.substring(0, 500), // Truncate for storage
        after: after.substring(0, 500),
      },
      context: { manifestName },
      outcome: "success",
    });
  }

  async logApprovalRequested(
    requestId: string,
    policyId: string,
    requesterId: string,
  ): Promise<AuditEvent> {
    return this.log({
      type: "approval.requested",
      actor: { type: "user", id: requesterId },
      resource: { type: "approval", id: requestId },
      details: { policyId },
      outcome: "pending",
    });
  }

  async logApprovalDecision(
    requestId: string,
    approverId: string,
    decision: "approved" | "rejected",
  ): Promise<AuditEvent> {
    return this.log({
      type: decision === "approved" ? "approval.approved" : "approval.rejected",
      actor: { type: "user", id: approverId },
      resource: { type: "approval", id: requestId },
      details: { decision },
      outcome: "success",
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Querying
  // ──────────────────────────────────────────────────────────────────────────

  async query(query: AuditQuery): Promise<AuditEvent[]> {
    return this.config.storage.query(query);
  }

  async count(query: AuditQuery): Promise<number> {
    return this.config.storage.count(query);
  }

  async getSummary(startTime: Date, endTime: Date): Promise<AuditSummary> {
    return this.config.storage.getSummary(startTime, endTime);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Export & Maintenance
  // ──────────────────────────────────────────────────────────────────────────

  async export(
    query: AuditQuery,
    format: "json" | "csv" = "json",
  ): Promise<string> {
    if (!this.config.exporter) {
      throw new Error("No exporter configured");
    }
    const events = await this.config.storage.query(query);
    return this.config.exporter.export(events, format);
  }

  async exportToFile(
    query: AuditQuery,
    filePath: string,
    format: "json" | "csv" = "json",
  ): Promise<void> {
    if (!this.config.exporter) {
      throw new Error("No exporter configured");
    }
    const events = await this.config.storage.query(query);
    await this.config.exporter.exportToFile(events, filePath, format);
  }

  async purge(before: Date): Promise<number> {
    return this.config.storage.purge(before);
  }

  private async exportAndPurge(): Promise<void> {
    if (!this.config.exporter) return;

    const events = await this.config.storage.query({});
    const fileName = `audit-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    await this.config.exporter.exportToFile(events, fileName, "json");

    // Purge exported events
    const oldestExported = events[events.length - 1];
    if (oldestExported) {
      await this.config.storage.purge(oldestExported.timestamp);
    }
  }
}

/**
 * Create a default audit logger with in-memory storage
 */
export function createAuditLogger(
  options?: Partial<AuditConfig>,
): AuditLogger {
  return new AuditLogger({
    storage: new InMemoryAuditStorage(options?.maxEvents),
    exporter: new DefaultAuditExporter(),
    ...options,
  });
}
