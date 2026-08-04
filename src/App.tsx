import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { WorkspaceProvider } from "@/lib/workspace-context";
import AppLayout from "@/components/AppLayout";
import SignIn from "@/pages/SignIn";
import { SignUp } from "./pages/SignUp";
import SignInLanding from "@/pages/SignInLanding";
import { LegacyAppRedirect, PrefixRedirect } from "@/components/LegacyRedirect";
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
import InvoicesList from "@/pages/InvoicesList";
import ClientBoard from "@/pages/ClientBoard";
import KernelBoard from "@/pages/KernelBoard";
import ProjectBuildsBoard from "@/pages/ProjectBuildsBoard";
import ApprovalsQueue from "@/pages/ApprovalsQueue";
import Index from "@/pages/Index";
import { Hero } from "@/components/Hero";
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
import HqSurface from "@/pages/HqSurface";
import BlueprintsOS from "@/pages/BlueprintsOS";
import PanelSurface from "@/pages/PanelSurface";
import SurfacesAdmin from "@/pages/SurfacesAdmin";
import OnboardingIframe from "@/pages/onboarding/OnboardingIframe";
import StartGate from "@/pages/StartGate";
import SelectWorkspace from "@/pages/SelectWorkspace";
import { FleetOperatorGate } from "@/components/FleetOperatorGate";
import { ClientReadinessGate } from "@/components/ClientReadinessGate";
import OnboardingAdmin from "@/pages/onboarding/OnboardingAdmin";
import { HqNextClient, HqNextOperator } from "@/hq-next/routes";
import { ThemeOverridesProvider } from "@/lib/theme-overrides";

import { MotionPreferenceProvider } from "@/lib/motion-preference";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<unknown>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  // Preserve the door the visitor knocked on so sign-in returns them here.
  if (!session) return <SignIn nextPath={window.location.pathname + window.location.search} />;
  return <>{children}</>;
}


/** Operator chrome · AuthGate + workspace + sidebar, shared by every /control child zone. */
function ControlShell() {
  return (
    <AuthGate>
      <FleetOperatorGate>
        <WorkspaceProvider>
          <AppLayout />
        </WorkspaceProvider>
      </FleetOperatorGate>
    </AuthGate>
  );
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
              Zone convention · the first URL segment says who the door is for.
              Public = /, client = /hq, operator = /control,
              machines = /oauth and /r. The front door is /signin.
            */}

            {/* Public marketing */}
            <Route path="/" element={<Hero />} />
            <Route path="/consult" element={<Consult />} />
            <Route path="/consult/thank-you" element={<ConsultThankYou />} />
            <Route path="/debrief" element={<Debrief />} />
            <Route path="/debrief/thank-you" element={<DebriefThankYou />} />
            <Route path="/next-step" element={<NextStep />} />

            {/* Front door */}
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signin/new" element={<SignUp />} />
            <Route path="/signup" element={<Navigate to="/signin/new" replace />} />
            <Route path="/signin/landing" element={<SignInLanding />} />
            <Route path="/signin/reset" element={<ResetPassword />} />
            <Route path="/reset-password" element={<Navigate to="/signin/reset" replace />} />
            <Route path="/hq-next" element={<AuthGate><ClientReadinessGate><HqNextClient /></ClientReadinessGate></AuthGate>} />

            {/* Client zone */}
            <Route path="/hq" element={<AuthGate><ClientReadinessGate><HqSurface /></ClientReadinessGate></AuthGate>} />
            <Route path="/hq/blueprints" element={<AuthGate><ClientReadinessGate><BlueprintsOS /></ClientReadinessGate></AuthGate>} />

            {/* Operator zone · index is the full-viewport panel surface */}
            <Route path="/control" element={<AuthGate><FleetOperatorGate><PanelSurface /></FleetOperatorGate></AuthGate>} />
            <Route path="/panel" element={<Navigate to="/control" replace />} />

            <Route path="/control/desk" element={<ControlShell />}>
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
            </Route>

            <Route path="/control/money" element={<ControlShell />}>
              <Route index element={<Navigate to="revenue" replace />} />
              <Route path="revenue" element={<RevenueDesk />} />
              <Route path="invoices" element={<InvoicesList />} />
              <Route path="billing" element={<BillingUsage />} />
            </Route>

            <Route path="/control/fleet" element={<ControlShell />}>
              <Route index element={<Navigate to="clients" replace />} />
              <Route path="clients" element={<ClientBoard />} />
              <Route path="approvals" element={<ApprovalsQueue />} />
            </Route>

            <Route path="/control/builds" element={<ControlShell />}>
              <Route index element={<BuildsAdmin />} />
              <Route path="projects" element={<ProjectBuildsBoard />} />
            </Route>

            <Route path="/control/kernel" element={<ControlShell />}>
              <Route index element={<KernelBoard />} />
            </Route>

            <Route path="/control/hq-next" element={<ControlShell />}>
              <Route index element={<HqNextOperator />} />
            </Route>


            <Route path="/control/system" element={<ControlShell />}>
              <Route index element={<SchedulerHealth />} />
            </Route>

            <Route path="/control/publish" element={<ControlShell />}>
              <Route index element={<SurfacesAdmin />} />
            </Route>

            <Route path="/control/onboarding" element={<AuthGate><FleetOperatorGate><OnboardingAdmin /></FleetOperatorGate></AuthGate>} />

            <Route path="/control/brand/dossier" element={<AuthGate><FleetOperatorGate><Dossier /></FleetOperatorGate></AuthGate>} />
            <Route path="/control/brand/style" element={<AuthGate><FleetOperatorGate><StyleGuide /></FleetOperatorGate></AuthGate>} />
            <Route path="/dossier" element={<Navigate to="/control/brand/dossier" replace />} />
            <Route path="/style-guide" element={<Navigate to="/control/brand/style" replace />} />

            {/* Onboarding */}
            <Route path="/start" element={<AuthGate><StartGate><OnboardingIframe /></StartGate></AuthGate>} />
            <Route path="/start/select-workspace" element={<AuthGate><SelectWorkspace /></AuthGate>} />
            <Route path="/start/progress" element={<AuthGate><StartGate><OnboardingIframe initialHash="dashboard" requireRecord /></StartGate></AuthGate>} />
            <Route path="/onboarding" element={<Navigate to="/start" replace />} />
            <Route path="/onboarding/dashboard" element={<Navigate to="/start/progress" replace />} />
            <Route path="/onboarding/admin" element={<Navigate to="/control/onboarding" replace />} />

            {/* Machine doors */}
            <Route path="/oauth/authorize" element={<OAuthLogin />} />
            <Route path="/oauth/consent" element={<OAuthConsent />} />
            <Route path="/login" element={<PrefixRedirect from="/login" to="/oauth/authorize" />} />
            <Route path="/r/:token" element={<BuildView />} />
            <Route path="/builds/:token" element={<BuildView />} />
            <Route path="/respond/:token" element={<RespondPage />} />

            {/* Legacy product paths → /control */}
            <Route path="/app/*" element={<LegacyAppRedirect />} />
            <Route path="/app" element={<LegacyAppRedirect />} />
            <Route path="/accounts/*" element={<Navigate to="/control/desk/accounts" replace />} />
            <Route path="/items/*" element={<Navigate to="/control/desk/items" replace />} />
            <Route path="/actions" element={<Navigate to="/control/desk/actions" replace />} />
            <Route path="/timeline" element={<Navigate to="/control/desk/timeline" replace />} />
            <Route path="/policies/*" element={<Navigate to="/control/desk/policies" replace />} />
            <Route path="/playbooks/*" element={<Navigate to="/control/desk/playbooks" replace />} />
            <Route path="/templates" element={<Navigate to="/control/desk/templates" replace />} />
            <Route path="/policy-rules" element={<Navigate to="/control/desk/policy-rules" replace />} />
            <Route path="/contacts" element={<Navigate to="/control/desk/contacts" replace />} />
            <Route path="/connectors" element={<Navigate to="/control/desk/connectors" replace />} />
            <Route path="/suppression" element={<Navigate to="/control/desk/suppression" replace />} />
            <Route path="/scheduler-health" element={<Navigate to="/control/system" replace />} />
            <Route path="/billing" element={<Navigate to="/control/money/billing" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </MotionPreferenceProvider>
    </ThemeOverridesProvider>
  </QueryClientProvider>
);

export default App;
