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
import Worklist from "@/pages/Worklist";
import PursuitBoard from "@/pages/PursuitBoard";
import TimelinePage from "@/pages/TimelinePage";
import PoliciesList from "@/pages/PoliciesList";
import PolicyDetail from "@/pages/PolicyDetail";
import PlaybooksList from "@/pages/PlaybooksList";
import PlaybookDetail from "@/pages/PlaybookDetail";
import TemplatesList from "@/pages/TemplatesList";
import PolicyRulesList from "@/pages/PolicyRulesList";
import ContactsList from "@/pages/ContactsList";
import ConnectorsList from "@/pages/ConnectorsList";
import SuppressionList from "@/pages/SuppressionList";
import SchedulerHealth from "@/pages/SchedulerHealth";
import BillingUsage from "@/pages/BillingUsage";
import RevenueDesk from "@/pages/RevenueDesk";
import ClientBoard from "@/pages/ClientBoard";
import ApprovalsQueue from "@/pages/ApprovalsQueue";
import Index from "@/pages/Index";
import { Hero } from "@/components/Hero";
import HeroStory from "@/components/HeroStory";
import Consult from "@/pages/Consult";
import ConsultThankYou from "@/pages/ConsultThankYou";
import Debrief from "@/pages/Debrief";
import DebriefThankYou from "@/pages/DebriefThankYou";
import NextStep from "@/pages/NextStep";
import NotFound from "@/pages/NotFound";
import RespondPage from "@/pages/RespondPage";
import StyleGuide from "@/pages/StyleGuide";
import Dossier from "@/pages/Dossier";
import OAuthConsent from "@/pages/OAuthConsent";
import OAuthLogin from "@/pages/OAuthLogin";
import ResetPassword from "@/pages/ResetPassword";
import BuildView from "@/pages/BuildView";
import BuildsAdmin from "@/pages/BuildsAdmin";
import { ThemeOverridesProvider } from "@/lib/theme-overrides";
import { MotionPreferenceProvider } from "@/lib/motion-preference";
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
    <ThemeOverridesProvider>
      <MotionPreferenceProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/*
              Routing convention:
              - Top-level routes (/, /how, /pricing, /about, /security, /consult)
                are PUBLIC marketing surfaces. No AuthGate, no AppLayout chrome.
              - The product lives under /app/* behind AuthGate + WorkspaceProvider
                + AppLayout. Future marketing routes follow the same split.
            */}
            <Route path="/" element={<Hero />} />
            <Route path="/hero-story" element={<HeroStory />} />
            <Route path="/consult" element={<Consult />} />
            <Route path="/consult/thank-you" element={<ConsultThankYou />} />
            <Route path="/debrief" element={<Debrief />} />
            <Route path="/debrief/thank-you" element={<DebriefThankYou />} />
            <Route path="/next-step" element={<NextStep />} />
            <Route path="/style-guide" element={<StyleGuide />} />
            <Route path="/dossier" element={<Dossier />} />
            <Route path="/respond/:token" element={<RespondPage />} />
            <Route path="/oauth/consent" element={<OAuthConsent />} />
            <Route path="/login" element={<OAuthLogin />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/builds/:token" element={<BuildView />} />
          <Route path="/app" element={
            <AuthGate>
              <WorkspaceProvider>
                <AppLayout />
              </WorkspaceProvider>
            </AuthGate>
          }>
            <Route index element={<Index />} />
            <Route path="accounts" element={<AccountsList />} />
            <Route path="accounts/:id" element={<AccountDetail />} />
            <Route path="items" element={<ItemsList />} />
            <Route path="items/:id" element={<ItemDetail />} />
            <Route path="board" element={<PursuitBoard />} />
            <Route path="worklist" element={<Worklist />} />
            <Route path="actions" element={<ActionsQueue />} />
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="policies" element={<PoliciesList />} />
            <Route path="policies/:id" element={<PolicyDetail />} />
            <Route path="playbooks" element={<PlaybooksList />} />
            <Route path="playbooks/:id" element={<PlaybookDetail />} />
            <Route path="templates" element={<TemplatesList />} />
            <Route path="policy-rules" element={<PolicyRulesList />} />
            <Route path="contacts" element={<ContactsList />} />
            <Route path="connectors" element={<ConnectorsList />} />
            <Route path="suppression" element={<SuppressionList />} />
            <Route path="scheduler-health" element={<SchedulerHealth />} />
            <Route path="billing" element={<BillingUsage />} />
            <Route path="revenue" element={<RevenueDesk />} />
            <Route path="clients" element={<ClientBoard />} />
            <Route path="approvals" element={<ApprovalsQueue />} />
            <Route path="builds" element={<BuildsAdmin />} />
          </Route>
          {/* Legacy product paths → redirect into /app/* */}
          <Route path="/accounts/*" element={<Navigate to="/app/accounts" replace />} />
          <Route path="/items/*" element={<Navigate to="/app/items" replace />} />
          <Route path="/actions" element={<Navigate to="/app/actions" replace />} />
          <Route path="/timeline" element={<Navigate to="/app/timeline" replace />} />
          <Route path="/policies/*" element={<Navigate to="/app/policies" replace />} />
          <Route path="/playbooks/*" element={<Navigate to="/app/playbooks" replace />} />
          <Route path="/templates" element={<Navigate to="/app/templates" replace />} />
          <Route path="/policy-rules" element={<Navigate to="/app/policy-rules" replace />} />
          <Route path="/contacts" element={<Navigate to="/app/contacts" replace />} />
          <Route path="/connectors" element={<Navigate to="/app/connectors" replace />} />
          <Route path="/suppression" element={<Navigate to="/app/suppression" replace />} />
          <Route path="/scheduler-health" element={<Navigate to="/app/scheduler-health" replace />} />
          <Route path="/billing" element={<Navigate to="/app/billing" replace />} />
          <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </MotionPreferenceProvider>
    </ThemeOverridesProvider>
  </QueryClientProvider>
);

export default App;
