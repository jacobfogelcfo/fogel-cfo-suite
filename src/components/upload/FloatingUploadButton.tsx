import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadInvoiceDialog } from "./UploadInvoiceDialog";
import { useClient } from "@/contexts/ClientContext";

export function FloatingUploadButton() {
  const [open, setOpen] = useState(false);
  const { currentClient } = useClient();
  if (!currentClient) return null;

  return (
    <>
      <Button
        size="lg"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 end-6 z-40 h-14 w-14 rounded-full shadow-lg"
        aria-label="Upload invoice"
      >
        <Plus className="h-6 w-6" />
      </Button>
      <UploadInvoiceDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
