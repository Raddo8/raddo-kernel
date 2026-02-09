import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { seedCaseyPack } from "@/lib/seed-casey";
import { Navigate } from "react-router-dom";

export default function Index() {
  const { workspace, loading } = useWorkspace();
  const [seeding, setSeeding] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!workspace || seeding || done) return;
    setSeeding(true);
    seedCaseyPack(workspace.id).then(() => {
      setDone(true);
      setSeeding(false);
    });
  }, [workspace]);

  if (loading || seeding) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="font-mono font-bold text-2xl text-primary mb-2">RADDO</h1>
          <p className="text-sm text-muted-foreground">Setting up your workspace...</p>
        </div>
      </div>
    );
  }

  return <Navigate to="/accounts" replace />;
}
