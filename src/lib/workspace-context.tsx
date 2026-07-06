import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface MembershipWorkspace extends Workspace {
  role: string;
}

interface WorkspaceContextType {
  workspace: Workspace | null;
  workspaces: MembershipWorkspace[];
  loading: boolean;
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  switchWorkspace: (id: string) => void;
}

const ACTIVE_WORKSPACE_KEY = "cob-active-workspace-id";

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspace: null,
  workspaces: [],
  loading: true,
  userId: null,
  userEmail: null,
  userRole: null,
  switchWorkspace: () => {},
});

export const useWorkspace = () => useContext(WorkspaceContext);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<MembershipWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);
    setUserEmail(user.email ?? null);

    const { data } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces(id, name, slug)")
      .eq("user_id", user.id);

    const list: MembershipWorkspace[] = (data ?? [])
      .filter((r: any) => r.workspaces)
      .map((r: any) => ({ id: r.workspaces.id, name: r.workspaces.name, slug: r.workspaces.slug, role: r.role }));

    setWorkspaces(list);

    const stored = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_WORKSPACE_KEY) : null;
    const active = list.find((w) => w.id === stored) ?? list[0];
    if (active) {
      setWorkspace({ id: active.id, name: active.name, slug: active.slug });
      setUserRole(active.role);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { load(); });
    return () => subscription.unsubscribe();
  }, [load]);

  const switchWorkspace = useCallback((id: string) => {
    const next = workspaces.find((w) => w.id === id);
    if (!next) return;
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
    setWorkspace({ id: next.id, name: next.name, slug: next.slug });
    setUserRole(next.role);
  }, [workspaces]);

  return (
    <WorkspaceContext.Provider value={{ workspace, workspaces, loading, userId, userEmail, userRole, switchWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
