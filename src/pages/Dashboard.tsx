import { useClient } from "@/contexts/ClientContext";
import { useUserRole } from "@/contexts/UserRoleContext";

export default function Dashboard() {
  const { currentClient, currentRole, loading } = useClient();
  const { isSuperAdmin } = useUserRole();

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!currentClient) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold">No organization selected</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have access to any organization yet. Contact your Fogel CFO admin.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-2">
      <h1 className="text-2xl font-semibold">{currentClient.client_name}</h1>
      <p className="text-sm text-muted-foreground">
        Role: {isSuperAdmin ? "super_admin" : currentRole} · Currency:{" "}
        {currentClient.base_currency ?? "—"} · Language: {currentClient.language ?? "—"} ·
        Direction: {currentClient.direction ?? "—"}
      </p>
      <p className="pt-4 text-sm text-muted-foreground">
        Foundation is live. Settings, upload flow, invoices, and QuickBooks integration coming next.
      </p>
    </div>
  );
}
