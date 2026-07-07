import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  FileText,
  Zap,
  Clock,
  Shield,
  BookOpen,
  ListFilter,
  LayoutTemplate,
  LayoutGrid,
  CheckSquare,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldOff,
  Users,
  Plug,
  HeartPulse,
  BarChart3,
  Check,
  ChevronsUpDown,
  DollarSign,
  BellRing,
  Boxes,
  Hammer,
  Receipt,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { pendingApprovalCount } from "@/lib/approvals";
import { cn } from "@/lib/utils";
import { useLabels } from "@/lib/labels-context";
import { useWorkspace } from "@/lib/workspace-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AppSidebar() {
  const labels = useLabels();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const { workspace, workspaces, userEmail, userRole, switchWorkspace } = useWorkspace();
  const [approvalCount, setApprovalCount] = useState(0);

  useEffect(() => {
    if (!workspace?.id) { setApprovalCount(0); return; }
    let cancelled = false;
    const refresh = () => pendingApprovalCount(workspace.id).then(n => { if (!cancelled) setApprovalCount(n); }).catch(() => {});
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [workspace?.id]);

  const isBd = (workspace as any)?.slug === "cob-hq-bd";
  const navItems: Array<{ to: string; label: string; icon: any; end?: boolean; badge?: number }> = [
    { to: "/app", label: "Dashboard", icon: BarChart3, end: true },
    ...(isBd ? [
      { to: "/app/board", label: "Pursuit Board", icon: LayoutGrid },
      { to: "/app/clients", label: "Client Board", icon: Users },
      { to: "/app/onboarding/kernel", label: "Kernel Build", icon: Boxes },
      { to: "/app/onboarding/builds", label: "Project Builds", icon: Hammer },
      { to: "/app/worklist", label: "Worklist", icon: CheckSquare },
      { to: "/app/approvals", label: "Approvals", icon: BellRing, badge: approvalCount },
      { to: "/app/revenue", label: "Revenue", icon: DollarSign },
      { to: "/app/invoices", label: "Invoices", icon: Receipt },
    ] : []),
    { to: "/app/accounts", label: labels.accounts, icon: Building2 },
    { to: "/app/contacts", label: "Contacts", icon: Users },
    { to: "/app/items", label: labels.items, icon: FileText },
    { to: "/app/actions", label: "Actions", icon: Zap },
    { to: "/app/timeline", label: "Timeline", icon: Clock },
    { to: "/app/policies", label: "Policies", icon: Shield },
    { to: "/app/policy-rules", label: "Rules", icon: ListFilter },
    { to: "/app/playbooks", label: "Playbooks", icon: BookOpen },
    { to: "/app/templates", label: "Templates", icon: LayoutTemplate },
    { to: "/app/connectors", label: "Connectors", icon: Plug },
    { to: "/app/suppression", label: "Suppressions", icon: ShieldOff },
    { to: "/app/scheduler-health", label: "Health", icon: HeartPulse },
    { to: "/app/billing", label: "Usage", icon: BarChart3 },
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/app");
  };

  const initials = (userEmail ?? "?").slice(0, 2).toUpperCase();

  return (
    <aside
      className={cn(
        "flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
        {!collapsed && (
          <span className="font-mono font-bold text-sidebar-primary text-lg tracking-tight">
            COB
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto text-sidebar-foreground hover:text-sidebar-accent-foreground transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Workspace switcher */}
      {!collapsed && (
        <div className="px-3 py-3 border-b border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm rounded border border-sidebar-border bg-sidebar hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground transition-colors">
              <Building2 size={14} className="shrink-0" />
              <span className="flex-1 truncate font-mono text-xs">
                {workspace?.name ?? "No workspace"}
              </span>
              <ChevronsUpDown size={12} className="shrink-0 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs font-mono uppercase tracking-wider opacity-70">
                Workspaces
              </DropdownMenuLabel>
              {workspaces.length === 0 && (
                <DropdownMenuItem disabled>No memberships</DropdownMenuItem>
              )}
              {workspaces.map((w) => (
                <DropdownMenuItem key={w.id} onClick={() => switchWorkspace(w.id)}>
                  <span className="flex-1 truncate">{w.name}</span>
                  {workspace?.id === w.id && <Check size={14} className="ml-2" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <nav className="flex-1 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end, badge }, idx) => {
          const active = end ? location.pathname === to : location.pathname.startsWith(to);
          const showOnboardingLabel = !collapsed && to === "/app/onboarding/kernel";
          return (
            <div key={to}>
              {showOnboardingLabel && (
                <div className="px-4 pt-3 pb-1 text-[9px] font-mono uppercase tracking-wider text-sidebar-foreground/50">
                  Onboarding
                </div>
              )}
              <NavLink
                to={to}
                className={cn(
                  "flex items-center gap-3 px-4 py-2 text-sm transition-colors relative",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground border-r-2 border-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon size={18} />
                {!collapsed && <span className="flex-1">{label}</span>}
                {badge != null && badge > 0 && (
                  <span className={cn(
                    "text-[10px] font-mono min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 bg-dossier-brass text-background",
                    collapsed && "absolute top-1 right-1"
                  )}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </NavLink>
            </div>
          );
        })}
      </nav>

      {/* Account chrome */}
      <div className="border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
            <div className="w-7 h-7 rounded-full bg-sidebar-primary/20 text-sidebar-primary flex items-center justify-center text-xs font-mono shrink-0">
              {initials}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <div className="truncate text-xs font-mono">{userEmail ?? "…"}</div>
                {userRole && (
                  <div className="truncate text-[10px] uppercase tracking-wider opacity-60">
                    {userRole}
                  </div>
                )}
              </div>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuLabel className="text-xs">
              <div className="font-mono truncate">{userEmail}</div>
              {workspace && (
                <div className="opacity-60 font-normal truncate mt-0.5">
                  {workspace.name}
                </div>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut size={14} className="mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
