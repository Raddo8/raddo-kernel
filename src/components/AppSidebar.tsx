import { NavLink, useLocation } from "react-router-dom";
import {
  Building2,
  FileText,
  Zap,
  Clock,
  Shield,
  BookOpen,
  ListFilter,
  LayoutTemplate,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Users,
  Plug,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLabels } from "@/lib/labels-context";

export default function AppSidebar() {
  const labels = useLabels();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { to: "/accounts", label: labels.accounts, icon: Building2 },
    { to: "/contacts", label: "Contacts", icon: Users },
    { to: "/items", label: labels.items, icon: FileText },
    { to: "/actions", label: "Actions", icon: Zap },
    { to: "/timeline", label: "Timeline", icon: Clock },
    { to: "/policies", label: "Policies", icon: Shield },
    { to: "/policy-rules", label: "Rules", icon: ListFilter },
    { to: "/playbooks", label: "Playbooks", icon: BookOpen },
    { to: "/templates", label: "Templates", icon: LayoutTemplate },
    { to: "/connectors", label: "Connectors", icon: Plug },
  ];
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
            RADDO
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto text-sidebar-foreground hover:text-sidebar-accent-foreground transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 py-2 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => {
          const active = location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-r-2 border-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon size={18} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <button
        onClick={() => supabase.auth.signOut()}
        className="flex items-center gap-3 px-4 py-3 text-sm text-sidebar-foreground hover:bg-sidebar-accent border-t border-sidebar-border transition-colors"
      >
        <LogOut size={18} />
        {!collapsed && <span>Sign out</span>}
      </button>
    </aside>
  );
}
