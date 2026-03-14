"use client";

import { FileText, Shield, BarChart3, CheckSquare, Settings, HelpCircle, Users, AlertTriangle } from "lucide-react";

export type View = "editor" | "rules" | "audit" | "approvals" | "teams" | "escalations" | "settings";

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const navItems: Array<{ id: View; label: string; icon: typeof FileText }> = [
  { id: "editor", label: "Manifest Editor", icon: FileText },
  { id: "rules", label: "Rule Builder", icon: Shield },
  { id: "audit", label: "Audit Dashboard", icon: BarChart3 },
  { id: "approvals", label: "Approvals", icon: CheckSquare },
  { id: "escalations", label: "Escalations", icon: AlertTriangle },
  { id: "teams", label: "Teams", icon: Users },
];

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span className="text-aim-400">⬡</span>
          AIM Studio
        </h1>
        <p className="text-xs text-gray-400 mt-1">Visual Manifest Builder</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                onClick={() => onNavigate(id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  currentView === id
                    ? "bg-aim-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700 space-y-2">
        <button
          onClick={() => onNavigate("settings")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            currentView === "settings"
              ? "bg-aim-600 text-white"
              : "text-gray-300 hover:bg-gray-800 hover:text-white"
          }`}
        >
          <Settings size={18} />
          Settings
        </button>
        <a
          href="https://github.com/manifest-aim/manifest"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <HelpCircle size={18} />
          Documentation
        </a>
      </div>
    </aside>
  );
}
