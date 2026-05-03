import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Inbox,
  ClipboardCheck,
  Users,
  Building,
  FolderKanban,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OrgSwitcher } from "./OrgSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import { useClient } from "@/contexts/ClientContext";
import { Button } from "@/components/ui/button";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: string; // optional clients.config.features.<key>
};

const universal: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/my-invoices", label: "My Invoices", icon: FileText },
  { to: "/all-invoices", label: "All Invoices", icon: Inbox },
  { to: "/needs-review", label: "Needs Review", icon: ClipboardCheck },
  { to: "/vendors", label: "Vendors", icon: Building },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/members", label: "Members", icon: Users },
];

export function AppSidebar() {
  const { user, signOut } = useAuth();
  const { currentClient } = useClient();

  const features = (currentClient?.config as { features?: Record<string, boolean> } | null)?.features ?? {};
  const items = universal.filter((i) => !i.feature || features[i.feature]);

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-e bg-card">
      <div className="border-b p-3">
        <OrgSwitcher />
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t p-3 space-y-2">
        <div className="px-2 py-1 text-xs text-muted-foreground truncate">
          {user?.email}
        </div>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )
          }
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </NavLink>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
