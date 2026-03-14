import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hash function matching auth-complete
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Security Validation ──

// Blocked patterns that indicate malicious intent
const BLOCKED_PATTERNS = [
  /ignore\s+(previous|all|your)\s+instructions/i,
  /disregard\s+(your|the)\s+system\s+prompt/i,
  /you\s+are\s+now\s+(?!a\s+senior|an?\s+expert)/i,  // "you are now" except for personas
  /pretend\s+you\s+are/i,
  /jailbreak/i,
  /bypass\s+safety/i,
  /ignore\s+your\s+rules/i,
  /forget\s+everything/i,
  /override\s+your\s+instructions/i,
];

// Validate manifest schema (basic checks)
function validateSchema(content: Record<string, unknown>): { valid: boolean; error?: string } {
  // Required: aim version
  if (!content.aim || typeof content.aim !== "string") {
    return { valid: false, error: "Missing or invalid 'aim' version field" };
  }

  // Required: metadata.name and metadata.version
  const metadata = content.metadata as Record<string, unknown> | undefined;
  if (!metadata || typeof metadata !== "object") {
    return { valid: false, error: "Missing 'metadata' section" };
  }
  if (!metadata.name || typeof metadata.name !== "string") {
    return { valid: false, error: "Missing 'metadata.name'" };
  }
  if (!metadata.version || typeof metadata.version !== "string") {
    return { valid: false, error: "Missing 'metadata.version'" };
  }

  // Validate name format
  const namePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  if (!namePattern.test(metadata.name as string)) {
    return { valid: false, error: "Invalid name format. Use lowercase alphanumeric with hyphens." };
  }

  // Validate version format (semver)
  const versionPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/;
  if (!versionPattern.test(metadata.version as string)) {
    return { valid: false, error: "Invalid version format. Use semver (e.g., 1.0.0)" };
  }

  return { valid: true };
}

// Check for malicious patterns in content
function checkForMaliciousContent(content: Record<string, unknown>): { safe: boolean; reason?: string } {
  const contentStr = JSON.stringify(content);

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(contentStr)) {
      return { safe: false, reason: `Content contains blocked pattern: ${pattern.source}` };
    }
  }

  // Check for base64-encoded content that might be trying to hide malicious instructions
  const base64Pattern = /[A-Za-z0-9+/]{100,}={0,2}/;
  const suspiciousBase64Count = (contentStr.match(base64Pattern) || []).length;
  if (suspiciousBase64Count > 3) {
    return { safe: false, reason: "Suspicious amount of base64-encoded content detected" };
  }

  // Check for external URLs in knowledge sections (flag but don't block)
  const knowledge = content.knowledge as Array<Record<string, unknown>> | undefined;
  if (knowledge && Array.isArray(knowledge)) {
    for (const unit of knowledge) {
      const unitContent = unit.content as string | Record<string, unknown> | undefined;
      if (typeof unitContent === "object" && unitContent?.file) {
        const file = unitContent.file as string;
        if (file.startsWith("http://") || file.startsWith("https://")) {
          // External URLs in knowledge require review (for now, just log)
          console.log(`External URL in knowledge: ${file}`);
        }
      }
    }
  }

  return { safe: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify API key using hash
    const apiKey = authHeader.replace("Bearer ", "");
    const keyHash = await hashApiKey(apiKey);

    const { data: keyData, error: keyError } = await supabase
      .from("api_keys")
      .select("user_id, scopes")
      .eq("key_hash", keyHash)
      .single();

    if (keyError || !keyData) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!keyData.scopes.includes("publish")) {
      return new Response(JSON.stringify({ error: "API key lacks publish scope" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { name, version, description, content, checksum, rule_count, capability_count, knowledge_count, enforcement_types } = body;

    if (!name || !version || !content || !checksum) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Security Validation Pipeline ──

    // 1. Schema validation
    const schemaResult = validateSchema(content);
    if (!schemaResult.valid) {
      return new Response(JSON.stringify({ error: `Schema validation failed: ${schemaResult.error}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Malicious content check
    const securityResult = checkForMaliciousContent(content);
    if (!securityResult.safe) {
      return new Response(JSON.stringify({ error: `Security check failed: ${securityResult.reason}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if manifest exists
    let { data: manifest } = await supabase
      .from("manifests")
      .select("id")
      .eq("name", name)
      .single();

    // Create manifest if it doesn't exist
    if (!manifest) {
      const { data: newManifest, error: createError } = await supabase
        .from("manifests")
        .insert({
          name,
          description,
          owner_id: keyData.user_id,
          tags: content.metadata?.tags || [],
          domain: content.context?.domain || null,
        })
        .select("id")
        .single();

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      manifest = newManifest;
    }

    // Check if version already exists
    const { data: existingVersion } = await supabase
      .from("manifest_versions")
      .select("id")
      .eq("manifest_id", manifest.id)
      .eq("version", version)
      .single();

    if (existingVersion) {
      return new Response(JSON.stringify({ error: `Version ${version} already exists` }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create version
    const { error: versionError } = await supabase
      .from("manifest_versions")
      .insert({
        manifest_id: manifest.id,
        version,
        aim_version: content.aim || "1.0",
        content,
        checksum,
        rule_count: rule_count || 0,
        capability_count: capability_count || 0,
        knowledge_count: knowledge_count || 0,
        enforcement_types: enforcement_types || [],
      });

    if (versionError) {
      return new Response(JSON.stringify({ error: versionError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, name, version }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
