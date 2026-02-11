import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface WorkspaceContextType {
  workspace: Workspace | null;
  loading: boolean;
  userId: string | null;
  userRole: string | null;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspace: null,
  loading: true,
  userId: null,
  userRole: null,
});

export const useWorkspace = () => useContext(WorkspaceContext);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data } = await supabase
        .from("workspace_members")
        .select("workspace_id, role, workspaces(id, name, slug)")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (data?.workspaces) {
        const ws = data.workspaces as any;
        setWorkspace({ id: ws.id, name: ws.name, slug: ws.slug });
        setUserRole(data.role);
      }
      setLoading(false);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { init(); });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <WorkspaceContext.Provider value={{ workspace, loading, userId, userRole }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
