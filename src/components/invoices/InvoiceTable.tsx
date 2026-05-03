import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { Money } from "@/components/Money";
import { Cloud, CloudOff } from "lucide-react";

export type IntakeDocRow = {
  id: string;
  client_id: string;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  total_amount: number | null;
  ils_equivalent: number | null;
  intake_status: string | null;
  intake_classification: string | null;
  submitted_by_email: string | null;
  quickbooks_id: string | null;
  quickbooks_synced_at: string | null;
  quickbooks_sync_error: string | null;
  file_name: string | null;
  created_at: string | null;
};

type Props = {
  rows: IntakeDocRow[];
  loading: boolean;
  onRowClick: (row: IntakeDocRow) => void;
  emptyText?: string;
};

export function InvoiceTable({ rows, loading, onRowClick, emptyText = "No documents." }: Props) {
  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!rows.length) {
    return (
      <div className="rounded-md border p-12 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendor</TableHead>
            <TableHead>Invoice #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>QBO</TableHead>
            <TableHead>Submitted by</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="cursor-pointer" onClick={() => onRowClick(r)}>
              <TableCell className="font-medium">{r.vendor_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell>{r.invoice_number ?? "—"}</TableCell>
              <TableCell>{r.invoice_date ?? "—"}</TableCell>
              <TableCell className="text-right">
                <Money amount={r.total_amount} currency={r.currency} showConverted asOfDate={r.invoice_date ?? undefined} />
              </TableCell>
              <TableCell><InvoiceStatusBadge status={r.intake_status} /></TableCell>
              <TableCell>
                {r.quickbooks_id ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Cloud className="h-3 w-3" /> Synced
                  </span>
                ) : r.quickbooks_sync_error ? (
                  <span className="inline-flex items-center gap-1 text-xs text-destructive">
                    <CloudOff className="h-3 w-3" /> Error
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground truncate max-w-[160px]">{r.submitted_by_email ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
