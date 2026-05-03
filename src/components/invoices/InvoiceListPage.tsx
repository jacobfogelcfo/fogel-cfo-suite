import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useClient } from "@/contexts/ClientContext";
import { Input } from "@/components/ui/input";
import { InvoiceTable, type IntakeDocRow } from "./InvoiceTable";
import { InvoiceDrawer } from "./InvoiceDrawer";
import { Search } from "lucide-react";

type Mode = "mine" | "all" | "needs_review";

const SELECT =
  "id, client_id, vendor_name, invoice_number, invoice_date, due_date, currency, total_amount, ils_equivalent, intake_status, intake_classification, submitted_by_email, quickbooks_id, quickbooks_synced_at, quickbooks_sync_error, file_name, created_at";

export function InvoiceListPage({ mode, title, subtitle }: { mode: Mode; title: string; subtitle?: string }) {
  const { user } = useAuth();
  const { currentClient } = useClient();
  const [q, setQ] = useState("");
  const [active, setActive] = useState<IntakeDocRow | null>(null);
  const [open, setOpen] = useState(false);

  const queryKey = ["intake-list", mode, currentClient?.id, user?.email];

  const listQ = useQuery({
    queryKey,
    enabled: !!currentClient,
    queryFn: async (): Promise<IntakeDocRow[]> => {
      let query = supabase
        .from("intake_documents")
        .select(SELECT)
        .eq("client_id", currentClient!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);

      if (mode === "mine" && user?.email) {
        query = query.eq("submitted_by_email", user.email.toLowerCase());
      }
      if (mode === "needs_review") {
        query = query.in("intake_status", ["needs_review", "failed"]);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as IntakeDocRow[];
    },
  });

  const filtered = useMemo(() => {
    const rows = listQ.data ?? [];
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) =>
      [r.vendor_name, r.invoice_number, r.file_name, r.submitted_by_email]
        .some((v) => v?.toLowerCase().includes(needle))
    );
  }, [listQ.data, q]);

  if (!currentClient) {
    return <div className="p-8 text-sm text-muted-foreground">No organization selected.</div>;
  }

  return (
    <div className="p-8">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="relative w-72">
          <Search className="absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search vendor, invoice #, file…"
            className="ps-8"
          />
        </div>
      </header>

      <InvoiceTable
        rows={filtered}
        loading={listQ.isLoading}
        onRowClick={(r) => { setActive(r); setOpen(true); }}
        emptyText={mode === "mine" ? "You haven't uploaded anything yet." : "No documents found."}
      />

      <InvoiceDrawer row={active} open={open} onOpenChange={setOpen} />
    </div>
  );
}
