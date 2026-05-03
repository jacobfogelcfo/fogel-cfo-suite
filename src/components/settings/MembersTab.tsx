import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/contexts/ClientContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { provenanceUser } from "@/lib/provenance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

type MemberRow = {
  id: string;
  user_email: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

type ManagerRow = {
  id: string;
  manager_email: string;
  is_active: boolean;
};

export function MembersTab() {
  const { currentClient, currentRole } = useClient();
  const { isSuperAdmin } = useUserRole();
  const { user } = useAuth();
  const qc = useQueryClient();

  const canManageManagers = isSuperAdmin || currentRole === "client_manager";

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "local_admin" | "client_manager">("member");
  const [busy, setBusy] = useState(false);

  const membersQ = useQuery({
    queryKey: ["client_members", currentClient?.id],
    enabled: !!currentClient,
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await supabase
        .from("client_members")
        .select("id, user_email, role, is_active, created_at")
        .eq("client_id", currentClient!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MemberRow[];
    },
  });

  const managersQ = useQuery({
    queryKey: ["client_managers", currentClient?.id],
    enabled: !!currentClient,
    queryFn: async (): Promise<ManagerRow[]> => {
      const { data, error } = await supabase
        .from("client_managers")
        .select("id, manager_email, is_active")
        .eq("client_id", currentClient!.id)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as ManagerRow[];
    },
  });

  if (!currentClient) return null;

  const addMember = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@")) return toast.error("Enter a valid email.");
    setBusy(true);
    if (role === "client_manager") {
      const { error } = await supabase.from("client_managers").insert({
        client_id: currentClient.id,
        manager_email: e,
        is_active: true,
        created_by: provenanceUser(user?.id ?? ""),
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success(`${e} added as client manager.`);
      qc.invalidateQueries({ queryKey: ["client_managers", currentClient.id] });
    } else {
      const { error } = await supabase.from("client_members").insert({
        client_id: currentClient.id,
        user_email: e,
        role,
        is_active: true,
        created_by: provenanceUser(user?.id ?? ""),
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success(`${e} added as ${role}.`);
      qc.invalidateQueries({ queryKey: ["client_members", currentClient.id] });
    }
    setEmail("");
    toast.message("Note: invited user must still sign in via /auth.", {
      description: "Account creation is via Supabase Auth — share the sign-in URL.",
    });
  };

  const removeMember = async (id: string, kind: "member" | "manager") => {
    const table = kind === "member" ? "client_members" : "client_managers";
    const { error } = await supabase
      .from(table)
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: provenanceUser(user?.id ?? ""),
        is_active: false,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed.");
    qc.invalidateQueries({ queryKey: [`client_${kind}s`, currentClient.id] });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add member</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px] space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2 w-[180px]">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="local_admin">Local admin</SelectItem>
                  {canManageManagers && (
                    <SelectItem value="client_manager">Client manager</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addMember} disabled={busy}>
              {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client managers</CardTitle>
        </CardHeader>
        <CardContent>
          {managersQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (managersQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No managers.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(managersQ.data ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.manager_email}</TableCell>
                    <TableCell>
                      <Badge variant={m.is_active ? "default" : "secondary"}>
                        {m.is_active ? "active" : "inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {canManageManagers && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeMember(m.id, "manager")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {membersQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (membersQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No members.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(membersQ.data ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.user_email}</TableCell>
                    <TableCell className="capitalize">{m.role}</TableCell>
                    <TableCell>
                      <Badge variant={m.is_active ? "default" : "secondary"}>
                        {m.is_active ? "active" : "inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeMember(m.id, "member")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
