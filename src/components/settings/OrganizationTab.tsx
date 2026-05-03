import { useEffect, useState } from "react";
import { useClient } from "@/contexts/ClientContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { provenanceUser } from "@/lib/provenance";

const FEATURE_KEYS = [
  "donations",
  "us_transfers",
  "bank_dashboard",
  "income",
  "expenses",
  "management",
  "vendors",
  "projects",
] as const;

export function OrganizationTab() {
  const { currentClient } = useClient();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [language, setLanguage] = useState("en");
  const [direction, setDirection] = useState("ltr");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!currentClient) return;
    setName(currentClient.client_name ?? "");
    setCurrency(currentClient.base_currency ?? "USD");
    setLanguage(currentClient.language ?? "en");
    setDirection(currentClient.direction ?? "ltr");
    setTimezone(currentClient.timezone ?? "America/Chicago");
    const cfg = (currentClient.config ?? {}) as Record<string, unknown>;
    const f = (cfg.features ?? {}) as Record<string, boolean>;
    setFeatures(f);
  }, [currentClient]);

  if (!currentClient) {
    return <p className="text-sm text-muted-foreground">No organization selected.</p>;
  }

  const save = async () => {
    setBusy(true);
    const cfg = { ...(currentClient.config ?? {}), features };
    const { error } = await supabase
      .from("clients")
      .update({
        client_name: name,
        base_currency: currency,
        language,
        direction,
        timezone,
        config: cfg,
        updated_by: provenanceUser(user?.id ?? ""),
      })
      .eq("id", currentClient.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Organization updated.");
    qc.invalidateQueries({ queryKey: ["accessible-clients"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Base currency</Label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
          </div>
          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="he">עברית (Hebrew)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Direction</Label>
            <Select value={direction} onValueChange={setDirection}>
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

        <div>
          <h3 className="mb-3 text-sm font-semibold">Features</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {FEATURE_KEYS.map((key) => (
              <label key={key} className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm capitalize">{key.replace(/_/g, " ")}</span>
                <Switch
                  checked={!!features[key]}
                  onCheckedChange={(v) => setFeatures((s) => ({ ...s, [key]: v }))}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
