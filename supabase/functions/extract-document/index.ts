// Edge function: extract-document
// Triggered after a client uploads a file and inserts a source_documents row.
// Runs Gemini multimodal extraction for PDF/image. Writes intake_documents
// (+ intake_line_items + FX) and updates source_documents.ingestion_status.
//
// Auth: relies on the calling user's JWT (verify_jwt = true). The function
// then uses the SERVICE_ROLE client for writes, after re-checking access via
// has_client_access RPC against the user.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Body = { source_doc_id: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json(500, { error: "LOVABLE_API_KEY not set" });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "missing bearer" });

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json(401, { error: "invalid session" });

    const body = (await req.json()) as Body;
    if (!body?.source_doc_id) return json(400, { error: "source_doc_id required" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load source row
    const { data: src, error: srcErr } = await admin
      .from("source_documents")
      .select(
        "id, client_id, entity_id, raw_file_path, file_name, file_type, source_subtype, submitted_by_email, source_hash"
      )
      .eq("id", body.source_doc_id)
      .single();
    if (srcErr || !src) return json(404, { error: "source_documents row not found" });

    // Re-check access: ask the user-scoped client (RLS) so we honor has_client_access
    const { data: hasAccess, error: accessErr } = await userClient.rpc(
      "has_client_access",
      { _client_id: src.client_id }
    );
    if (accessErr) return json(500, { error: accessErr.message });
    if (!hasAccess) return json(403, { error: "no access to this client" });

    // Download file bytes from storage
    if (!src.raw_file_path) return json(400, { error: "source_documents.raw_file_path missing" });
    const { data: fileBlob, error: dlErr } = await admin.storage
      .from("documents")
      .download(src.raw_file_path);
    if (dlErr || !fileBlob) return json(500, { error: `download failed: ${dlErr?.message ?? "unknown"}` });

    const mime = src.file_type ?? fileBlob.type ?? "application/octet-stream";
    const isExtractable = mime.startsWith("image/") || mime === "application/pdf";

    const provenance = `claude:extract-document:${user.id}`;

    if (!isExtractable) {
      // CSV/XLSX/other: deterministic parsers will be added in next milestone.
      // For now create an intake row in needs_review with raw file metadata.
      const intake = await admin
        .from("intake_documents")
        .insert({
          client_id: src.client_id,
          entity_id: src.entity_id,
          source_doc_id: src.id,
          file_url: src.raw_file_path,
          file_name: src.file_name,
          file_type: mime,
          intake_status: "needs_review",
          notes: "Tabular files (CSV/XLSX) extraction pending — manual review required.",
          submitted_by_email: src.submitted_by_email ?? user.email ?? null,
          created_by: provenance,
        })
        .select("id")
        .single();
      if (intake.error) return json(500, { error: intake.error.message });
      await admin
        .from("source_documents")
        .update({
          ingestion_status: "processed",
          ingestion_pipeline: "manual-review",
          requires_review: true,
          updated_by: provenance,
        })
        .eq("id", src.id);
      return json(200, { ok: true, intake_id: intake.data.id, mode: "needs_review" });
    }

    // ---- Gemini extraction ----
    const buf = new Uint8Array(await fileBlob.arrayBuffer());
    const b64 = base64Encode(buf);

    const tool = {
      type: "function",
      function: {
        name: "record_invoice",
        description: "Extract structured invoice / receipt fields from the document.",
        parameters: {
          type: "object",
          properties: {
            vendor_name: { type: "string" },
            invoice_number: { type: "string" },
            ref_number: { type: "string" },
            invoice_date: { type: "string", description: "YYYY-MM-DD" },
            due_date: { type: "string", description: "YYYY-MM-DD" },
            currency: { type: "string", description: "ISO 4217" },
            subtotal: { type: "number" },
            tax: { type: "number" },
            total_amount: { type: "number" },
            payment_terms: { type: "string" },
            tax_id: { type: "string" },
            classification: {
              type: "string",
              enum: ["invoice", "receipt", "donation", "other"],
            },
            classification_confidence: { type: "number" },
            classification_reason: { type: "string" },
            line_items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  quantity: { type: "number" },
                  unit_price: { type: "number" },
                  total: { type: "number" },
                  tax_rate: { type: "number" },
                  tax_amount: { type: "number" },
                },
              },
            },
          },
        },
      },
    };

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            {
              role: "system",
              content:
                "You extract structured data from accounting documents. Always call record_invoice with the best available values. Use null for unknown fields. Dates must be YYYY-MM-DD.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract this document:" },
                {
                  type: "image_url",
                  image_url: { url: `data:${mime};base64,${b64}` },
                },
              ],
            },
          ],
          tools: [tool],
          tool_choice: { type: "function", function: { name: "record_invoice" } },
        }),
      }
    );

    if (!aiResp.ok) {
      const t = await aiResp.text();
      await admin
        .from("source_documents")
        .update({
          ingestion_status: "failed",
          ingestion_pipeline: "lovable-ai/google/gemini-2.5-pro",
          error_payload: { status: aiResp.status, body: t.slice(0, 2000) },
          updated_by: provenance,
        })
        .eq("id", src.id);
      if (aiResp.status === 429)
        return json(429, { error: "Rate limit exceeded. Try again shortly." });
      if (aiResp.status === 402)
        return json(402, { error: "AI credits exhausted. Add funds in Lovable workspace." });
      return json(500, { error: `AI gateway error: ${aiResp.status}` });
    }

    const aiJson = await aiResp.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let extracted: Record<string, any> = {};
    try {
      extracted = JSON.parse(call?.function?.arguments ?? "{}");
    } catch {
      extracted = {};
    }

    // FX lookup
    let exchange_rate_at_time: number | null = null;
    let ils_equivalent: number | null = null;
    if (extracted.currency && extracted.invoice_date && extracted.total_amount != null) {
      const { data: fx } = await admin
        .from("fx_rates")
        .select("rate")
        .eq("from_currency", String(extracted.currency).toUpperCase())
        .eq("to_currency", "ILS")
        .lte("rate_date", extracted.invoice_date)
        .order("rate_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fx?.rate) {
        exchange_rate_at_time = Number(fx.rate);
        ils_equivalent = Number((Number(extracted.total_amount) * Number(fx.rate)).toFixed(2));
      }
    }

    const intakeInsert = await admin
      .from("intake_documents")
      .insert({
        client_id: src.client_id,
        entity_id: src.entity_id,
        source_doc_id: src.id,
        file_url: src.raw_file_path,
        file_name: src.file_name,
        file_type: mime,
        intake_status: "needs_review",
        intake_classification: extracted.classification ?? null,
        intake_classification_confidence: extracted.classification_confidence ?? null,
        intake_classification_reason: extracted.classification_reason ?? null,
        vendor_name: extracted.vendor_name ?? null,
        invoice_number: extracted.invoice_number ?? null,
        ref_number: extracted.ref_number ?? null,
        invoice_date: extracted.invoice_date ?? null,
        due_date: extracted.due_date ?? null,
        currency: extracted.currency ? String(extracted.currency).toUpperCase().slice(0, 3) : null,
        subtotal: extracted.subtotal ?? null,
        tax: extracted.tax ?? null,
        total_amount: extracted.total_amount ?? null,
        payment_terms: extracted.payment_terms ?? null,
        tax_id: extracted.tax_id ?? null,
        exchange_rate_at_time,
        ils_equivalent,
        multi_invoice_data: { raw_extraction: extracted },
        submitted_by_email: src.submitted_by_email ?? user.email ?? null,
        created_by: provenance,
      })
      .select("id")
      .single();

    if (intakeInsert.error) {
      await admin
        .from("source_documents")
        .update({
          ingestion_status: "failed",
          error_payload: { stage: "intake_insert", message: intakeInsert.error.message },
          updated_by: provenance,
        })
        .eq("id", src.id);
      return json(500, { error: intakeInsert.error.message });
    }

    const intakeId = intakeInsert.data.id;
    const items = Array.isArray(extracted.line_items) ? extracted.line_items : [];
    if (items.length > 0) {
      const rows = items.map((li: any, i: number) => ({
        client_id: src.client_id,
        intake_doc_id: intakeId,
        position: i,
        description: li.description ?? null,
        quantity: li.quantity ?? null,
        unit_price: li.unit_price ?? null,
        total: li.total ?? null,
        tax_rate: li.tax_rate ?? null,
        tax_amount: li.tax_amount ?? null,
        created_by: provenance,
      }));
      const liResp = await admin.from("intake_line_items").insert(rows);
      if (liResp.error) {
        // non-fatal: leave intake but record
        await admin
          .from("intake_documents")
          .update({
            extraction_error: `line items insert failed: ${liResp.error.message}`,
            updated_by: provenance,
          })
          .eq("id", intakeId);
      }
    }

    await admin
      .from("source_documents")
      .update({
        ingestion_status: "processed",
        ingestion_pipeline: "lovable-ai/google/gemini-2.5-pro",
        updated_by: provenance,
      })
      .eq("id", src.id);

    return json(200, { ok: true, intake_id: intakeId, mode: "extracted" });
  } catch (e) {
    console.error("extract-document error", e);
    return json(500, { error: e instanceof Error ? e.message : "unknown" });
  }
});

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa is available in Deno
  return btoa(binary);
}
