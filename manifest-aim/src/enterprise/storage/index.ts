/**
 * Supabase Storage Adapters for Enterprise Features
 *
 * Provides persistent storage for audit events, approval requests,
 * and escalation events using Supabase PostgreSQL.
 */

export { SupabaseAuditStorage } from "./supabase-audit.js";
export { SupabaseApprovalStorage } from "./supabase-approval.js";
export { SupabaseEscalationStorage } from "./supabase-escalation.js";

import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseAuditStorage } from "./supabase-audit.js";
import { SupabaseApprovalStorage } from "./supabase-approval.js";
import { SupabaseEscalationStorage } from "./supabase-escalation.js";

/**
 * Create all Supabase storage adapters from a single client
 */
export function createSupabaseStorageAdapters(supabase: SupabaseClient) {
  return {
    audit: new SupabaseAuditStorage(supabase),
    approval: new SupabaseApprovalStorage(supabase),
    escalation: new SupabaseEscalationStorage(supabase),
  };
}
