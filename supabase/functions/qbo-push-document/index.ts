// qbo-push-document: pushes an approved intake_documents row to QuickBooks
// as a Bill (vendor invoice). Refreshes access_token if expired.

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

type Conn = {
  id: string;
  client_id: string;
  realm_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  environment: string | null;
};

async function refreshIfNeeded(admin: any, conn: Conn): Promise<Conn> {
  const expiresAt = new Date(conn.access_token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) return conn;

  const CLIENT_ID = Deno.env.get("QBO_CLIENT_ID")!;
  const CLIENT_SECRET = Deno.env.get("QBO_CLIENT_SECRET")!;
  const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
  const r = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
  });
  if (!r.ok) throw new Error(`refresh failed: ${await r.text()}`);
  const t = await r.json();
  const newAccess = t.access_token as string;
  const newRefresh = (t.refresh_token as string) ?? conn.refresh_token;
  const newExp = new Date(Date.now() + Number(t.expires_in ?? 3600) * 1000).toISOString();
  await admin
    .from("quickbooks_connections")
    .update({
      access_token: newAccess,
      refresh_token: newRefresh,
      access_token_expires_at: newExp,
    })
    .eq("id", conn.id);
  return { ...conn, access_token: newAccess, refresh_token: newRefresh, access_token_expires_at: newExp };
}

async function findOrCreateVendor(
  baseUrl: string,
  conn: Conn,
  vendorName: string
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${conn.access_token}`,
    Accept: "application/json",
  };
  const safe = vendorName.replace(/'/g, "\\'");
  const q = encodeURIComponent(`select Id from Vendor where DisplayName = '${safe}'`);
  const r = await fetch(`${baseUrl}/v3/company/${conn.realm_id}/query?query=${q}&minorversion=70`, {
    headers,
  });
  if (r.ok) {
    const j = await r.json();
    const id = j?.QueryResponse?.Vendor?.[0]?.Id;
    if (id) return id;
  }
  const create = await fetch(
    `${baseUrl}/v3/company/${conn.realm_id}/vendor?minorversion=70`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ DisplayName: vendorName }),
    }
  );
  if (!create.ok) throw new Error(`vendor create failed: ${await create.text()}`);
  const j = await create.json();
  return j?.Vendor?.Id;
}

async function defaultExpenseAccount(baseUrl: string, conn: Conn): Promise<string> {
  const q = encodeURIComponent(
    `select Id from Account where AccountType = 'Expense' maxresults 1`
  );
  const r = await fetch(`${baseUrl}/v3/company/${conn.realm_id}/query?query=${q}&minorversion=70`, {
    headers: { Authorization: `Bearer ${conn.access_token}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`account lookup failed: ${await r.text()}`);
  const j = await r.json();
  const id = j?.QueryResponse?.Account?.[0]?.Id;
  if (!id) throw new Error("No Expense account found in QBO.");
  return id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(401, { error: "missing bearer" });

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json(401, { error: "invalid session" });

    const body = (await req.json()) as { intake_doc_id?: string };
    if (!body?.intake_doc_id) return json(400, { error: "intake_doc_id required" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const provenance = `user:${user.id}`;

    const { data: doc, error: docErr } = await admin
      .from("intake_documents")
      .select(
        "id, client_id, vendor_name, invoice_number, invoice_date, due_date, currency, total_amount, intake_status"
      )
      .eq("id", body.intake_doc_id)
      .single();
    if (docErr || !doc) return json(404, { error: "intake_document not found" });

    const { data: hasAccess } = await userClient.rpc("has_client_access", { _client_id: doc.client_id });
    if (!hasAccess) return json(403, { error: "no access" });

    if (!doc.vendor_name || !doc.total_amount) {
      return json(400, { error: "vendor_name and total_amount required to push" });
    }

    const { data: connRow, error: connErr } = await admin
      .from("quickbooks_connections")
      .select("id, client_id, realm_id, access_token, refresh_token, access_token_expires_at, environment")
      .eq("client_id", doc.client_id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (connErr) return json(500, { error: connErr.message });
    if (!connRow) return json(400, { error: "QuickBooks not connected for this organization" });

    let conn = connRow as Conn;
    conn = await refreshIfNeeded(admin, conn);

    const baseUrl =
      (conn.environment ?? "production") === "sandbox"
        ? "https://sandbox-quickbooks.api.intuit.com"
        : "https://quickbooks.api.intuit.com";

    try {
      const vendorId = await findOrCreateVendor(baseUrl, conn, doc.vendor_name);
      const accountId = await defaultExpenseAccount(baseUrl, conn);

      const bill = {
        VendorRef: { value: vendorId },
        TxnDate: doc.invoice_date ?? undefined,
        DueDate: doc.due_date ?? undefined,
        DocNumber: doc.invoice_number ?? undefined,
        CurrencyRef: doc.currency ? { value: doc.currency } : undefined,
        Line: [
          {
            DetailType: "AccountBasedExpenseLineDetail",
            Amount: Number(doc.total_amount),
            AccountBasedExpenseLineDetail: { AccountRef: { value: accountId } },
          },
        ],
      };

      const resp = await fetch(
        `${baseUrl}/v3/company/${conn.realm_id}/bill?minorversion=70`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${conn.access_token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(bill),
        }
      );
      if (!resp.ok) throw new Error(await resp.text());
      const created = await resp.json();
      const qboId = created?.Bill?.Id;

      await admin
        .from("intake_documents")
        .update({
          intake_status: "pushed",
          quickbooks_id: qboId,
          quickbooks_type: "Bill",
          quickbooks_synced_at: new Date().toISOString(),
          quickbooks_sync_error: null,
          updated_by: provenance,
        })
        .eq("id", doc.id);

      return json(200, { ok: true, quickbooks_id: qboId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "qbo push failed";
      await admin
        .from("intake_documents")
        .update({
          quickbooks_sync_error: msg.slice(0, 1000),
          updated_by: provenance,
        })
        .eq("id", doc.id);
      return json(500, { error: msg });
    }
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "unknown" });
  }
});
