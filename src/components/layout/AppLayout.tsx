import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { LanguageDirectionController } from "@/components/i18n/LanguageDirectionController";

export function AppLayout() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <LanguageDirectionController />
      <AppSidebar />
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
