import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Verify API key
    const token = authHeader.replace("Bearer ", "");
    const keyPrefix = token.slice(0, 8);

    const { data: keyData, error: keyError } = await supabase
      .from("api_keys")
      .select("user_id, scopes")
      .eq("key_prefix", keyPrefix)
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
