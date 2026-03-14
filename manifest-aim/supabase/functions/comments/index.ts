import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Path: /comments/:manifestName or /comments/:manifestName/:commentId
  const manifestName = pathParts[1];
  const commentId = pathParts[2];

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // GET /comments/:manifestName - List comments for a manifest
    if (req.method === "GET" && manifestName && !commentId) {
      const { data, error } = await supabase.rpc("get_manifest_comments", {
        p_manifest_name: manifestName,
      });

      if (error) throw error;

      // Organize into threaded structure
      const comments = data || [];
      const topLevel = comments.filter((c: any) => !c.parent_id);
      const replies = comments.filter((c: any) => c.parent_id);

      const threaded = topLevel.map((comment: any) => ({
        ...comment,
        replies: replies.filter((r: any) => r.parent_id === comment.id),
      }));

      return new Response(JSON.stringify(threaded), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /comments/:manifestName - Create a comment
    if (req.method === "POST" && manifestName) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify the user's token
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await supabase.auth.getUser(token);

      if (userError || !userData.user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json();
      const { content, parent_id } = body;

      if (!content || content.trim().length === 0) {
        return new Response(JSON.stringify({ error: "Content is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get manifest ID
      const { data: manifest, error: manifestError } = await supabase
        .from("manifests")
        .select("id")
        .eq("name", manifestName)
        .single();

      if (manifestError || !manifest) {
        return new Response(JSON.stringify({ error: "Manifest not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create comment
      const { data: comment, error: insertError } = await supabase
        .from("comments")
        .insert({
          manifest_id: manifest.id,
          user_id: userData.user.id,
          content: content.trim(),
          parent_id: parent_id || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Return comment with user info
      const user = userData.user;
      const result = {
        ...comment,
        user_email: user.email,
        user_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0],
        user_avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture,
      };

      return new Response(JSON.stringify(result), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE /comments/:manifestName/:commentId - Delete a comment
    if (req.method === "DELETE" && manifestName && commentId) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await supabase.auth.getUser(token);

      if (userError || !userData.user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify ownership and delete
      const { error: deleteError } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", userData.user.id);

      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
