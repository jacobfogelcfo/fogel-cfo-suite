import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useClient } from "@/contexts/ClientContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import { provenanceUser } from "@/lib/provenance";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { Money } from "@/components/Money";
import type { IntakeDocRow } from "./InvoiceTable";
import { toast } from "sonner";
import { Loader2, ExternalLink, Cloud, Check, X } from "lucide-react";

type Props = {
  row: IntakeDocRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type LineItem = {
  id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
};

export function InvoiceDrawer({ row, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { currentClient, currentRole } = useClient();
  const { isSuperAdmin } = useUserRole();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Partial<IntakeDocRow>>({});
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const canAdmin = isSuperAdmin || currentRole === "client_manager" || currentRole === "local_admin";

  useEffect(() => {
    if (row) setEdit({
      vendor_name: row.vendor_name,
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      due_date: row.due_date,
      currency: row.currency,
      total_amount: row.total_amount,
    });
  }, [row?.id]);

  // Resolve file signed URL
  useEffect(() => {
    if (!row || !open) { setFileUrl(null); return; }
    (async () => {
      const { data: doc } = await supabase
        .from("intake_documents")
        .select("file_url")
        .eq("id", row.id)
        .single();
      if (doc?.file_url) {
        const { data } = await supabase.storage.from("documents").createSignedUrl(doc.file_url, 3600);
        setFileUrl(data?.signedUrl ?? null);
      }
    })();
  }, [row?.id, open]);

  const linesQ = useQuery({
    queryKey: ["intake-lines", row?.id],
    enabled: !!row?.id && open,
    queryFn: async (): Promise<LineItem[]> => {
      const { data, error } = await supabase
        .from("intake_line_items")
        .select("id, description, quantity, unit_price, total")
        .eq("intake_doc_id", row!.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LineItem[];
    },
  });

  if (!row || !user) return null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["intake-list"] });
    qc.invalidateQueries({ queryKey: ["intake-lines", row.id] });
  };

  const saveEdits = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("intake_documents")
      .update({ ...edit, updated_by: provenanceUser(user.id) })
      .eq("id", row.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved.");
    refresh();
  };

  const setStatus = async (status: string) => {
    setBusy(true);
    const { error } = await supabase
      .from("intake_documents")
      .update({ intake_status: status, updated_by: provenanceUser(user.id) })
      .eq("id", row.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status}.`);
    refresh();

    // Auto-push if approved + feature enabled
    if (status === "approved") {
      const features = (currentClient?.config as any)?.features ?? {};
      if (features.qbo_auto_push) await pushToQbo();
    }
  };

  const pushToQbo = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("qbo-push-document", {
        body: { intake_doc_id: row.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Pushed to QuickBooks.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "QBO push failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {row.vendor_name ?? "Untitled"} <InvoiceStatusBadge status={row.intake_status} />
          </SheetTitle>
          <SheetDescription>
            {row.file_name} · uploaded by {row.submitted_by_email ?? "unknown"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {fileUrl && (
            <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> Open original file
            </a>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Vendor">
              <Input value={edit.vendor_name ?? ""} onChange={(e) => setEdit((s) => ({ ...s, vendor_name: e.target.value }))} disabled={!canAdmin || busy} />
            </Field>
            <Field label="Invoice #">
              <Input value={edit.invoice_number ?? ""} onChange={(e) => setEdit((s) => ({ ...s, invoice_number: e.target.value }))} disabled={!canAdmin || busy} />
            </Field>
            <Field label="Invoice date">
              <Input type="date" value={edit.invoice_date ?? ""} onChange={(e) => setEdit((s) => ({ ...s, invoice_date: e.target.value }))} disabled={!canAdmin || busy} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={edit.due_date ?? ""} onChange={(e) => setEdit((s) => ({ ...s, due_date: e.target.value }))} disabled={!canAdmin || busy} />
            </Field>
            <Field label="Currency">
              <Input value={edit.currency ?? ""} maxLength={3} onChange={(e) => setEdit((s) => ({ ...s, currency: e.target.value.toUpperCase() }))} disabled={!canAdmin || busy} />
            </Field>
            <Field label="Total">
              <Input type="number" step="0.01" value={edit.total_amount ?? ""} onChange={(e) => setEdit((s) => ({ ...s, total_amount: e.target.value === "" ? null : Number(e.target.value) }))} disabled={!canAdmin || busy} />
            </Field>
          </div>

          <div className="text-sm">
            Native: <Money amount={row.total_amount} currency={row.currency} /> ·{" "}
            ILS-equiv: {row.ils_equivalent != null ? row.ils_equivalent.toFixed(2) : "—"}
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">Line items</div>
            {linesQ.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : (linesQ.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">None extracted.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {(linesQ.data ?? []).map((li) => (
                  <li key={li.id} className="flex justify-between gap-2 border-b py-1">
                    <span className="truncate">{li.description ?? "—"}</span>
                    <span className="text-muted-foreground">
                      {li.quantity ?? "—"} × {li.unit_price ?? "—"} = {li.total ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {row.quickbooks_sync_error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              QBO error: {row.quickbooks_sync_error}
            </div>
          )}
          {row.quickbooks_id && (
            <div className="text-xs text-muted-foreground">
              QBO id: {row.quickbooks_id} · synced {row.quickbooks_synced_at}
            </div>
          )}

          {canAdmin && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button onClick={saveEdits} disabled={busy} variant="outline">
                {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />} Save edits
              </Button>
              <Button onClick={() => setStatus("approved")} disabled={busy}>
                <Check className="me-2 h-4 w-4" /> Approve
              </Button>
              <Button onClick={() => setStatus("rejected")} disabled={busy} variant="destructive">
                <X className="me-2 h-4 w-4" /> Reject
              </Button>
              <Button onClick={pushToQbo} disabled={busy} variant="secondary">
                <Cloud className="me-2 h-4 w-4" /> Push to QBO
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
