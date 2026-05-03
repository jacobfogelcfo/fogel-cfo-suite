import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useClient } from "@/contexts/ClientContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export function ProfileTab() {
  const { user, signOut } = useAuth();
  const { isSuperAdmin } = useUserRole();
  const { currentRole, currentClient } = useClient();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const role = isSuperAdmin ? "super_admin" : currentRole;

  const updatePassword = async () => {
    if (pw1.length < 8) return toast.error("Password must be at least 8 characters.");
    if (pw1 !== pw2) return toast.error("Passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(false);
    if (error) return toast.error(error.message);
    setPw1("");
    setPw2("");
    toast.success("Password updated.");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">Email</span>
            <span className="col-span-2 font-medium">{user?.email}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">Role (in {currentClient?.client_name ?? "—"})</span>
            <span className="col-span-2 font-medium">{role}</span>
          </div>
          <div className="pt-2">
            <Button variant="outline" onClick={signOut}>Sign out</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-w-sm">
          <div className="space-y-2">
            <Label htmlFor="np">New password</Label>
            <Input id="np" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np2">Confirm</Label>
            <Input id="np2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          <Button onClick={updatePassword} disabled={busy}>
            {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            Update password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
