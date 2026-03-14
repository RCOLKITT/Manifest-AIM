"use client";

import { useState } from "react";
import { Sidebar, type View } from "@/components/Sidebar";
import { ManifestEditor } from "@/components/ManifestEditor";
import { RuleBuilder } from "@/components/RuleBuilder";
import { AuditDashboard } from "@/components/AuditDashboard";
import { ApprovalQueue } from "@/components/ApprovalQueue";
import { TeamManagement } from "@/components/TeamManagement";
import { Escalations } from "@/components/Escalations";
import { Settings } from "@/components/Settings";

export default function Home() {
  const [currentView, setCurrentView] = useState<View>("editor");

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />

      <main className="flex-1 overflow-auto">
        {currentView === "editor" && <ManifestEditor />}
        {currentView === "rules" && <RuleBuilder />}
        {currentView === "audit" && <AuditDashboard />}
        {currentView === "approvals" && <ApprovalQueue />}
        {currentView === "teams" && <TeamManagement />}
        {currentView === "escalations" && <Escalations />}
        {currentView === "settings" && <Settings />}
      </main>
    </div>
  );
}
