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
    const query = url.searchParams.get("q") || "";
    const tags = url.searchParams.get("tags")?.split(",").filter(Boolean) || null;
    const domain = url.searchParams.get("domain") || null;
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);

    // Use the search_manifests function we created in the schema
    const { data, error } = await supabase.rpc("search_manifests", {
      p_query: query || null,
      p_tags: tags,
      p_domain: domain,
      p_limit: limit,
      p_offset: 0,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = (data || []).map((r: any) => ({
      name: r.name,
      description: r.description,
      tags: r.tags || [],
      domain: r.domain,
      downloads: r.downloads,
      stars: r.stars,
      latest_version: r.latest_version,
      is_official: r.is_official,
    }));

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
