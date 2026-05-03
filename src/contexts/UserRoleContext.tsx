import { createContext, useContext, ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, SUPER_ADMIN_EMAILS } from "@/lib/supabase";
import { useAuth } from "./AuthContext";

export type AppRole = "super_admin" | "client_manager" | "local_admin" | "member" | "none";

export type ClientAccess = {
  client_id: string;
  role: AppRole;
};

type UserRoleContextValue = {
  email: string | null;
  isSuperAdmin: boolean;
  accessList: ClientAccess[];
  loading: boolean;
};

const UserRoleContext = createContext<UserRoleContextValue | undefined>(undefined);

export function UserRoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() ?? null;
  const isSuperAdmin = !!email && (SUPER_ADMIN_EMAILS as readonly string[]).includes(email);

  const { data, isLoading } = useQuery({
    queryKey: ["user-access", email],
    enabled: !!email,
    queryFn: async (): Promise<ClientAccess[]> => {
      if (!email) return [];

      if (isSuperAdmin) {
        const { data: clients, error } = await supabase
          .from("clients")
          .select("id")
          .is("deleted_at", null);
        if (error) throw error;
        return (clients ?? []).map((c: { id: string }) => ({
          client_id: c.id,
          role: "super_admin" as AppRole,
        }));
      }

      const [managers, members] = await Promise.all([
        supabase
          .from("client_managers")
          .select("client_id")
          .eq("manager_email", email)
          .eq("is_active", true)
          .is("deleted_at", null),
        supabase
          .from("client_members")
          .select("client_id, role")
          .eq("user_email", email)
          .eq("is_active", true)
          .is("deleted_at", null),
      ]);

      if (managers.error) throw managers.error;
      if (members.error) throw members.error;

      const map = new Map<string, AppRole>();
      for (const m of managers.data ?? []) map.set(m.client_id, "client_manager");
      for (const m of members.data ?? []) {
        if (map.has(m.client_id)) continue;
        const role = (m.role as string) === "local_admin" ? "local_admin" : "member";
        map.set(m.client_id, role);
      }

      return Array.from(map.entries()).map(([client_id, role]) => ({ client_id, role }));
    },
  });

  const value = useMemo<UserRoleContextValue>(
    () => ({
      email,
      isSuperAdmin,
      accessList: data ?? [],
      loading: !!email && isLoading,
    }),
    [email, isSuperAdmin, data, isLoading]
  );

  return <UserRoleContext.Provider value={value}>{children}</UserRoleContext.Provider>;
}

export function useUserRole() {
  const ctx = useContext(UserRoleContext);
  if (!ctx) throw new Error("useUserRole must be used within UserRoleProvider");
  return ctx;
}

export function roleForClient(access: ClientAccess[], clientId: string | null): AppRole {
  if (!clientId) return "none";
  return access.find((a) => a.client_id === clientId)?.role ?? "none";
}
