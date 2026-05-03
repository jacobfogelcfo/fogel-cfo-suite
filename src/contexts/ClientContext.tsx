import { createContext, useContext, ReactNode, useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, CURRENT_CLIENT_KEY } from "@/lib/supabase";
import { useUserRole, roleForClient, type AppRole } from "./UserRoleContext";

export type ClientRow = {
  id: string;
  client_name: string;
  base_currency: string | null;
  language: string | null;
  direction: string | null;
  timezone: string | null;
  config: Record<string, unknown> | null;
};

type ClientContextValue = {
  clients: ClientRow[];
  currentClientId: string | null;
  currentClient: ClientRow | null;
  setCurrentClientId: (id: string | null) => void;
  currentRole: AppRole;
  loading: boolean;
};

const ClientContext = createContext<ClientContextValue | undefined>(undefined);

export function ClientProvider({ children }: { children: ReactNode }) {
  const { accessList, loading: roleLoading } = useUserRole();

  const accessIds = useMemo(() => accessList.map((a) => a.client_id), [accessList]);
  const accessKey = accessIds.join(",");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["accessible-clients", accessKey],
    enabled: !roleLoading && accessIds.length > 0,
    queryFn: async (): Promise<ClientRow[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, client_name, base_currency, language, direction, timezone, config")
        .in("id", accessIds)
        .is("deleted_at", null)
        .order("client_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const [currentClientId, setCurrentClientIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CURRENT_CLIENT_KEY);
    } catch {
      return null;
    }
  });

  const setCurrentClientId = useCallback((id: string | null) => {
    setCurrentClientIdState(id);
    try {
      if (id) localStorage.setItem(CURRENT_CLIENT_KEY, id);
      else localStorage.removeItem(CURRENT_CLIENT_KEY);
    } catch {
      /* noop */
    }
  }, []);

  // Auto-select if none chosen / invalid.
  useEffect(() => {
    if (!clients || clients.length === 0) return;
    const stillValid = currentClientId && clients.some((c) => c.id === currentClientId);
    if (!stillValid) setCurrentClientId(clients[0].id);
  }, [clients, currentClientId, setCurrentClientId]);

  const currentClient = useMemo(
    () => clients?.find((c) => c.id === currentClientId) ?? null,
    [clients, currentClientId]
  );

  const currentRole = roleForClient(accessList, currentClientId);

  return (
    <ClientContext.Provider
      value={{
        clients: clients ?? [],
        currentClientId,
        currentClient,
        setCurrentClientId,
        currentRole,
        loading: roleLoading || isLoading,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
}

export function useClient() {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("useClient must be used within ClientProvider");
  return ctx;
}
