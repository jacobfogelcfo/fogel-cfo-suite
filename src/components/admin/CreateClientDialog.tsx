import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/contexts/ClientContext";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateClientDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { setCurrentClientId } = useClient();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [language, setLanguage] = useState("en");
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !slug.trim()) return toast.error("Name and slug are required.");
    setBusy(true);
    const { data, error } = await supabase
      .from("clients")
      .insert({
        client_name: name.trim(),
        slug: slug.trim().toLowerCase(),
        base_currency: currency,
        language,
        direction,
        timezone,
        is_active: true,
        config: { features: {} },
        created_by: provenanceUser(user?.id ?? ""),
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Created ${name}.`);
    qc.invalidateQueries({ queryKey: ["accessible-clients"] });
    if (data?.id) setCurrentClientId(data.id);
    onOpenChange(false);
    setName("");
    setSlug("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>
            Super admin only. Fills the top-level client columns; features can be toggled later in Settings.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="kge" />
          </div>
          <div className="space-y-2">
            <Label>Base currency</Label>
            <Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="he">Hebrew</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as "ltr" | "rtl")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ltr">LTR</SelectItem>
                <SelectItem value="rtl">RTL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Timezone</Label>
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
