// qbo-oauth-start: returns the Intuit authorize URL for the calling user/client.
// Caller must be authenticated and have access to the client.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const CLIENT_ID = Deno.env.get("QBO_CLIENT_ID");
    const REDIRECT_URI = Deno.env.get("QBO_REDIRECT_URI");
    const ENV = (Deno.env.get("QBO_ENV") ?? "production").toLowerCase();
    if (!CLIENT_ID || !REDIRECT_URI)
      return json(500, { error: "QBO_CLIENT_ID / QBO_REDIRECT_URI not set" });

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(401, { error: "missing bearer" });

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json(401, { error: "invalid session" });

    const body = (await req.json().catch(() => ({}))) as { client_id?: string };
    if (!body?.client_id) return json(400, { error: "client_id required" });

    const { data: hasAccess, error } = await userClient.rpc("has_client_access", {
      _client_id: body.client_id,
    });
    if (error) return json(500, { error: error.message });
    if (!hasAccess) return json(403, { error: "no access" });

    const state = btoa(JSON.stringify({ c: body.client_id, u: user.id, t: Date.now() }));
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      scope: "com.intuit.quickbooks.accounting",
      redirect_uri: REDIRECT_URI,
      state,
    });
    const base =
      ENV === "sandbox"
        ? "https://appcenter.intuit.com/connect/oauth2"
        : "https://appcenter.intuit.com/connect/oauth2";
    return json(200, { url: `${base}?${params.toString()}`, state });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "unknown" });
  }
});
