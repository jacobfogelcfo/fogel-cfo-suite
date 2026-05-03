import { Badge } from "@/components/ui/badge";

const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  needs_review: { label: "Needs review", variant: "secondary" },
  ready: { label: "Ready", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  pushed: { label: "Synced", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  duplicate: { label: "Duplicate", variant: "destructive" },
  failed: { label: "Failed", variant: "destructive" },
};

export function InvoiceStatusBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "needs_review").toLowerCase();
  const cfg = map[s] ?? { label: s, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
