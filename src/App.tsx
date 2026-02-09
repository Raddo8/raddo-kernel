import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { WorkspaceProvider } from "@/lib/workspace-context";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import AccountsList from "@/pages/AccountsList";
import AccountDetail from "@/pages/AccountDetail";
import ItemsList from "@/pages/ItemsList";
import ItemDetail from "@/pages/ItemDetail";
import ActionsQueue from "@/pages/ActionsQueue";
import TimelinePage from "@/pages/TimelinePage";
import PoliciesList from "@/pages/PoliciesList";
import PolicyDetail from "@/pages/PolicyDetail";
import PlaybooksList from "@/pages/PlaybooksList";
import PlaybookDetail from "@/pages/PlaybookDetail";
import TemplatesList from "@/pages/TemplatesList";
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <Auth />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthGate>
          <WorkspaceProvider>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Index />} />
                <Route path="/accounts" element={<AccountsList />} />
                <Route path="/accounts/:id" element={<AccountDetail />} />
                <Route path="/items" element={<ItemsList />} />
                <Route path="/items/:id" element={<ItemDetail />} />
                <Route path="/actions" element={<ActionsQueue />} />
                <Route path="/timeline" element={<TimelinePage />} />
                <Route path="/policies" element={<PoliciesList />} />
                <Route path="/policies/:id" element={<PolicyDetail />} />
                <Route path="/playbooks" element={<PlaybooksList />} />
                <Route path="/playbooks/:id" element={<PlaybookDetail />} />
                <Route path="/templates" element={<TemplatesList />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </WorkspaceProvider>
        </AuthGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
