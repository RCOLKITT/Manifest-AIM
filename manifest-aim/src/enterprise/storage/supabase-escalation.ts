/**
 * Supabase Escalation Storage Adapter
 *
 * Persistent storage for escalation events using Supabase PostgreSQL.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EscalationStorage } from "../escalation.js";
import type { EscalationEvent } from "../types.js";

export class SupabaseEscalationStorage implements EscalationStorage {
  constructor(private supabase: SupabaseClient) {}

  async saveEvent(event: EscalationEvent): Promise<void> {
    const row = this.eventToRow(event);
    const { error } = await this.supabase.from("escalation_events").insert(row);

    if (error) {
      throw new Error(`Failed to save escalation event: ${error.message}`);
    }
  }

  async getEvent(id: string): Promise<EscalationEvent | null> {
    const { data: row, error } = await this.supabase
      .from("escalation_events")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !row) {
      return null;
    }

    return this.rowToEvent(row);
  }

  async updateEvent(event: EscalationEvent): Promise<void> {
    const row = this.eventToRow(event);
    const { error } = await this.supabase
      .from("escalation_events")
      .update(row)
      .eq("id", event.id);

    if (error) {
      throw new Error(`Failed to update escalation event: ${error.message}`);
    }
  }

  async listActiveEvents(): Promise<EscalationEvent[]> {
    const { data, error } = await this.supabase
      .from("escalation_events")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list active escalation events: ${error.message}`);
    }

    return (data ?? []).map((row: Record<string, unknown>) => this.rowToEvent(row));
  }

  async listEventsByPolicy(policyId: string): Promise<EscalationEvent[]> {
    const { data, error } = await this.supabase
      .from("escalation_events")
      .select("*")
      .eq("policy_id", policyId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list escalation events by policy: ${error.message}`);
    }

    return (data ?? []).map((row: Record<string, unknown>) => this.rowToEvent(row));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Row Conversion
  // ──────────────────────────────────────────────────────────────────────────

  private eventToRow(event: EscalationEvent): Record<string, unknown> {
    return {
      id: event.id,
      policy_id: event.policyId,
      trigger_id: event.triggerId,
      current_level: event.currentLevel,
      status: event.status,
      trigger_context: event.triggerContext,
      history: event.history.map((h) => ({
        level: h.level,
        contacts: h.contacts,
        sentAt: h.sentAt.toISOString(),
        acknowledgedAt: h.acknowledgedAt?.toISOString(),
        acknowledgedBy: h.acknowledgedBy,
      })),
      created_at: event.createdAt.toISOString(),
      updated_at: event.updatedAt.toISOString(),
      resolved_at: event.resolvedAt?.toISOString(),
    };
  }

  private rowToEvent(row: Record<string, unknown>): EscalationEvent {
    const history = (row.history as Array<Record<string, unknown>>) ?? [];

    return {
      id: row.id as string,
      policyId: row.policy_id as string,
      triggerId: row.trigger_id as string,
      currentLevel: row.current_level as number,
      status: row.status as "active" | "acknowledged" | "resolved",
      triggerContext: row.trigger_context as EscalationEvent["triggerContext"],
      history: history.map((h) => ({
        level: h.level as number,
        contacts: h.contacts as string[],
        sentAt: new Date(h.sentAt as string),
        acknowledgedAt: h.acknowledgedAt ? new Date(h.acknowledgedAt as string) : undefined,
        acknowledgedBy: h.acknowledgedBy as string | undefined,
      })),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
    };
  }
}
