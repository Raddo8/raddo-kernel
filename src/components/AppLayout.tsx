import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import { LabelsProvider } from "@/lib/labels-context";

export default function AppLayout() {
  return (
    <LabelsProvider>
      <div className="flex h-screen bg-background dark">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </LabelsProvider>
  );
}
