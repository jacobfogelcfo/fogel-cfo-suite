import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { UserRoleProvider } from "@/contexts/UserRoleContext";
import { ClientProvider } from "@/contexts/ClientContext";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import AuthPage from "./pages/Auth";
import ResetPasswordPage from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import SettingsPage from "./pages/Settings";
import MyInvoices from "./pages/MyInvoices";
import AllInvoices from "./pages/AllInvoices";
import NeedsReview from "./pages/NeedsReview";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

const Stub = ({ title }: { title: string }) => (
  <div className="p-8">
    <h1 className="text-2xl font-semibold">{title}</h1>
    <p className="mt-2 text-sm text-muted-foreground">Coming next.</p>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <UserRoleProvider>
            <ClientProvider>
              <Routes>
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route
                  element={
                    <RequireAuth>
                      <AppLayout />
                    </RequireAuth>
                  }
                >
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/my-invoices" element={<MyInvoices />} />
                  <Route path="/all-invoices" element={<AllInvoices />} />
                  <Route path="/needs-review" element={<NeedsReview />} />
                  <Route path="/vendors" element={<Stub title="Vendors" />} />
                  <Route path="/projects" element={<Stub title="Projects" />} />
                  <Route path="/members" element={<Stub title="Members" />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ClientProvider>
          </UserRoleProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
