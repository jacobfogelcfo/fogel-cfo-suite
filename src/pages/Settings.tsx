import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClient } from "@/contexts/ClientContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import { ProfileTab } from "@/components/settings/ProfileTab";
import { OrganizationTab } from "@/components/settings/OrganizationTab";
import { MembersTab } from "@/components/settings/MembersTab";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";

export default function SettingsPage() {
  const { currentClient, currentRole } = useClient();
  const { isSuperAdmin } = useUserRole();

  const canManageOrg = isSuperAdmin || currentRole === "client_manager";
  const canManageMembers = canManageOrg || currentRole === "local_admin";
  const canManageIntegrations = canManageOrg;

  const tabs = useMemo(() => {
    const t: { value: string; label: string }[] = [{ value: "profile", label: "Profile" }];
    if (canManageOrg) t.push({ value: "organization", label: "Organization" });
    if (canManageMembers) t.push({ value: "members", label: "Members" });
    if (canManageIntegrations) t.push({ value: "integrations", label: "Integrations" });
    return t;
  }, [canManageOrg, canManageMembers, canManageIntegrations]);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {currentClient ? currentClient.client_name : "Your account"}
        </p>
      </header>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <ProfileTab />
        </TabsContent>

        {canManageOrg && (
          <TabsContent value="organization" className="mt-6">
            <OrganizationTab />
          </TabsContent>
        )}

        {canManageMembers && (
          <TabsContent value="members" className="mt-6">
            <MembersTab />
          </TabsContent>
        )}

        {canManageIntegrations && (
          <TabsContent value="integrations" className="mt-6">
            <IntegrationsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
