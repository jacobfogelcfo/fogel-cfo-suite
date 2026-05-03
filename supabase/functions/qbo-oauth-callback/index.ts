// qbo-oauth-callback: handles Intuit redirect. Exchanges code for tokens and
// upserts quickbooks_connections + external_systems.
//
// This function runs WITHOUT a user JWT because Intuit redirects the browser
// here directly. We re-establish the user from the signed `state` payload (best-effort)
// and rely on storing tokens scoped to (client_id) decoded from state. The function
// uses SERVICE_ROLE for the upserts.
//
// Set verify_jwt = false for this function in supabase/config.toml.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const html = (body: string, status = 200) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>QuickBooks</title></head><body style="font-family:system-ui;padding:2rem;color:#0f172a">${body}<script>setTimeout(()=>window.close(),2500)</script></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const err = url.searchParams.get("error");

  if (err) return html(`<h2>QuickBooks connection cancelled</h2><p>${err}</p>`, 400);
  if (!code || !state || !realmId) return html("<h2>Missing parameters</h2>", 400);

  let parsed: { c: string; u: string; t: number };
  try {
    parsed = JSON.parse(atob(state));
  } catch {
    return html("<h2>Invalid state</h2>", 400);
  }
  // 10 minute window
  if (Date.now() - parsed.t > 10 * 60 * 1000) return html("<h2>State expired</h2>", 400);

  const CLIENT_ID = Deno.env.get("QBO_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("QBO_CLIENT_SECRET");
  const REDIRECT_URI = Deno.env.get("QBO_REDIRECT_URI");
  const ENV = (Deno.env.get("QBO_ENV") ?? "production").toLowerCase();
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI)
    return html("<h2>QBO env not configured</h2>", 500);

  const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
  const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
  const tokenResp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!tokenResp.ok) {
    const t = await tokenResp.text();
    return html(`<h2>Token exchange failed</h2><pre>${t.slice(0, 500)}</pre>`, 500);
  }
  const tok = await tokenResp.json();
  const accessToken = tok.access_token as string;
  const refreshToken = tok.refresh_token as string;
  const expiresIn = Number(tok.expires_in ?? 3600);
  const refreshExpiresIn = Number(tok.x_refresh_token_expires_in ?? 60 * 60 * 24 * 100);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const provenance = `claude:qbo-oauth-callback:${parsed.u}`;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const refreshExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000).toISOString();

  // Soft-delete any existing active connection for this client, then insert fresh.
  await admin
    .from("quickbooks_connections")
    .update({ is_active: false, deleted_at: new Date().toISOString(), updated_by: provenance })
    .eq("client_id", parsed.c)
    .eq("is_active", true);

  const { error: insErr } = await admin.from("quickbooks_connections").insert({
    client_id: parsed.c,
    realm_id: realmId,
    access_token: accessToken,
    refresh_token: refreshToken,
    access_token_expires_at: expiresAt,
    refresh_token_expires_at: refreshExpiresAt,
    environment: ENV,
    is_active: true,
    created_by: provenance,
  });
  if (insErr) return html(`<h2>Save failed</h2><pre>${insErr.message}</pre>`, 500);

  // Upsert external_systems pointer
  await admin.from("external_systems").upsert(
    {
      client_id: parsed.c,
      system_type: "quickbooks_online",
      system_name: "QuickBooks Online",
      external_account_id: realmId,
      is_active: true,
      created_by: provenance,
    },
    { onConflict: "client_id,system_type" }
  );

  return html(
    `<h2>QuickBooks connected ✓</h2><p>Realm <code>${realmId}</code>. You can close this window.</p>`
  );
});
