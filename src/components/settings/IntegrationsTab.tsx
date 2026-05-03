import { useClient } from "@/contexts/ClientContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Plug, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export function IntegrationsTab() {
  const { currentClient } = useClient();
  const [busy, setBusy] = useState(false);

  const qboQ = useQuery({
    queryKey: ["qbo-conn", currentClient?.id],
    enabled: !!currentClient,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quickbooks_connections")
        .select("id, realm_id, is_active, created_at, environment")
        .eq("client_id", currentClient!.id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  if (!currentClient) return null;

  const connect = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("qbo-oauth-start", {
        body: { client_id: currentClient.id },
      });
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error("No authorize URL returned");
      window.open(url, "_blank", "width=720,height=820");
      toast.info("Complete the QuickBooks login in the new window, then refresh.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start QBO OAuth");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5" /> Integrations
        </CardTitle>
        <CardDescription>Connect external systems to push approved invoices.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">QuickBooks Online</span>
              {qboQ.data?.is_active ? <Badge>Connected</Badge> : <Badge variant="secondary">Not connected</Badge>}
              {qboQ.data?.environment === "sandbox" && <Badge variant="outline">Sandbox</Badge>}
            </div>
            {qboQ.data?.realm_id && (
              <p className="mt-1 text-xs text-muted-foreground">Realm: {qboQ.data.realm_id}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Tip: enable <code>qbo_auto_push</code> under Organization → Features to auto-push approved invoices.
            </p>
          </div>
          <Button variant="outline" onClick={connect} disabled={busy}>
            {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {qboQ.data?.is_active ? "Reconnect" : "Connect"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
