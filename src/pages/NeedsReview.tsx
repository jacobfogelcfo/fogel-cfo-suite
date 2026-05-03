import { InvoiceListPage } from "@/components/invoices/InvoiceListPage";

export default function NeedsReview() {
  return <InvoiceListPage mode="needs_review" title="Needs Review" subtitle="Documents awaiting correction or approval." />;
}
