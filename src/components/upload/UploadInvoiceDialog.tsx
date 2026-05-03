import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useAuth } from "@/contexts/AuthContext";
import { useClient } from "@/contexts/ClientContext";
import { supabase } from "@/lib/supabase";
import { provenanceUser } from "@/lib/provenance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, UploadCloud, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const ACCEPT = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "text/csv": [".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

function subtypeFor(mime: string, name: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime === "text/csv" || name.endsWith(".csv")) return "csv";
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    name.endsWith(".xlsx")
  )
    return "xlsx";
  return "other";
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadInvoiceDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { currentClient } = useClient();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");

  const features = (currentClient?.config as any)?.features ?? {};
  const multi = features.multi_invoice_per_request !== false;

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (!accepted.length) return;
      setFiles((prev) => (multi ? [...prev, ...accepted] : accepted.slice(0, 1)));
    },
    [multi]
  );

  const { getRootProps, getInputProps, isDragActive, open: openPicker } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: multi,
    noClick: true,
    noKeyboard: true,
    disabled: busy,
  });

  const reset = () => {
    setFiles([]);
    setProgress("");
  };

  const submit = async () => {
    if (!currentClient) return toast.error("No organization selected.");
    if (!user) return toast.error("Not signed in.");
    if (files.length === 0) return toast.error("Choose at least one file.");

    setBusy(true);
    const provenance = provenanceUser(user.id);
    let success = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(`Uploading ${i + 1}/${files.length}: ${file.name}`);
      try {
        const buf = await file.arrayBuffer();
        const hash = await sha256Hex(buf);
        const ext = file.name.split(".").pop() || "bin";
        const objectPath = `${currentClient.id}/intake/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(objectPath, file, {
            contentType: file.type || undefined,
            upsert: false,
          });
        if (upErr) throw upErr;

        const subtype = subtypeFor(file.type || "", file.name.toLowerCase());
        const { data: srcRow, error: insErr } = await supabase
          .from("source_documents")
          .insert({
            client_id: currentClient.id,
            source_type: "upload",
            source_subtype: subtype,
            raw_file_path: objectPath,
            file_name: file.name,
            file_type: file.type || null,
            file_size_bytes: file.size,
            source_hash: hash,
            ingestion_status: "pending",
            submitted_by_email: user.email ?? null,
            created_by: provenance,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;

        setProgress(`Extracting ${i + 1}/${files.length}: ${file.name}`);
        const { data: fnData, error: fnErr } = await supabase.functions.invoke(
          "extract-document",
          { body: { source_doc_id: srcRow.id } }
        );
        if (fnErr) throw fnErr;
        if ((fnData as any)?.error) throw new Error((fnData as any).error);
        success++;
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : "upload failed";
        toast.error(`${file.name}: ${msg}`);
      }
    }

    setBusy(false);
    setProgress("");
    if (success > 0) toast.success(`Uploaded ${success} document(s).`);
    if (failed === 0) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) {
          onOpenChange(o);
          if (!o) reset();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload invoices</DialogTitle>
          <DialogDescription>
            PDFs and images are extracted automatically. CSV/XLSX go to manual review (parser
            coming soon).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
              busy && "opacity-50"
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {isDragActive
                  ? "Drop files here"
                  : `Drag PDF/image/CSV/XLSX here${multi ? "" : " (one file)"}`}
              </p>
              <p className="text-xs text-muted-foreground">or use the button below</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={openPicker}
            >
              Select file{multi ? "s" : ""}
            </Button>
          </div>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="max-w-[180px] truncate">{f.name}</span>
                  <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                  {!busy && (
                    <button
                      onClick={() =>
                        setFiles((s) => s.filter((_, idx) => idx !== i))
                      }
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {progress && (
            <p className="text-xs text-muted-foreground">{progress}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || files.length === 0}>
            {busy ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="me-2 h-4 w-4" />
            )}
            Upload {files.length > 0 ? `(${files.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
