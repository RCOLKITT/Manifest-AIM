/**
 * Auth Status — Check CLI auth session status.
 *
 * Polled by `manifest login` to check if user has completed auth.
 * Returns API key once auth is complete.
 */

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

    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session");

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Missing session parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check session status
    const { data: session, error } = await supabase
      .from("cli_auth_sessions")
      .select(`
        session_id,
        status,
        user_id,
        api_key_id,
        expires_at
      `)
      .eq("session_id", sessionId)
      .single();

    if (error || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if expired
    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from("cli_auth_sessions")
        .update({ status: "expired" })
        .eq("session_id", sessionId);

      return new Response(
        JSON.stringify({ session_id: sessionId, status: "expired" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If pending, just return status
    if (session.status === "pending") {
      return new Response(
        JSON.stringify({ session_id: sessionId, status: "pending" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If completed, get user info and API key
    if (session.status === "completed" && session.user_id) {
      // Get user email
      const { data: userData } = await supabase.auth.admin.getUserById(session.user_id);

      // Get API key (we stored the plain key temporarily in the session)
      const { data: apiKeyData } = await supabase
        .from("api_keys")
        .select("id, key_prefix")
        .eq("id", session.api_key_id)
        .single();

      // Get the actual key from a temp storage (or generate new one)
      // For security, we store the key hash, so we need to pass the plain key through
      const { data: tempKey } = await supabase
        .from("cli_auth_sessions")
        .select("temp_api_key")
        .eq("session_id", sessionId)
        .single();

      return new Response(
        JSON.stringify({
          session_id: sessionId,
          status: "completed",
          user_id: session.user_id,
          email: userData?.user?.email,
          api_key: tempKey?.temp_api_key,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ session_id: sessionId, status: session.status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
