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
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const name = pathParts[pathParts.length - 1];
    const version = url.searchParams.get("version");

    if (!name) {
      return new Response(JSON.stringify({ error: "Missing manifest name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get manifest
    const { data: manifest, error: manifestError } = await supabase
      .from("manifests")
      .select("id, name, description")
      .eq("name", name)
      .single();

    if (manifestError || !manifest) {
      return new Response(JSON.stringify({ error: `Manifest "${name}" not found` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get version (specific or latest)
    let versionQuery = supabase
      .from("manifest_versions")
      .select("version, content, dependencies")
      .eq("manifest_id", manifest.id);

    if (version) {
      versionQuery = versionQuery.eq("version", version);
    } else {
      versionQuery = versionQuery.order("published_at", { ascending: false }).limit(1);
    }

    const { data: versionData, error: versionError } = await versionQuery.single();

    if (versionError || !versionData) {
      return new Response(
        JSON.stringify({ error: version ? `Version ${version} not found` : "No versions found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        name: manifest.name,
        version: versionData.version,
        content: versionData.content,
        dependencies: versionData.dependencies || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
