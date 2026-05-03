import { useClient } from "@/contexts/ClientContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Plug } from "lucide-react";
import { toast } from "sonner";

export function IntegrationsTab() {
  const { currentClient } = useClient();

  const qboQ = useQuery({
    queryKey: ["qbo-conn", currentClient?.id],
    enabled: !!currentClient,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quickbooks_connections")
        .select("id, realm_id, is_active, created_at")
        .eq("client_id", currentClient!.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  if (!currentClient) return null;

  const connect = () => {
    toast.info("QuickBooks OAuth flow — coming in next milestone.");
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
              {qboQ.data?.is_active ? (
                <Badge>Connected</Badge>
              ) : (
                <Badge variant="secondary">Not connected</Badge>
              )}
            </div>
            {qboQ.data?.realm_id && (
              <p className="mt-1 text-xs text-muted-foreground">
                Realm: {qboQ.data.realm_id}
              </p>
            )}
          </div>
          <Button variant="outline" onClick={connect}>
            {qboQ.data?.is_active ? "Reconnect" : "Connect"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
