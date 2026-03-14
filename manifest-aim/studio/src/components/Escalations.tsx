"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle, Clock, Bell, User, ChevronRight } from "lucide-react";

interface EscalationEvent {
  id: string;
  policyName: string;
  status: "active" | "acknowledged" | "resolved";
  currentLevel: number;
  maxLevel: number;
  violation: {
    ruleName: string;
    severity: string;
    message: string;
    filePath?: string;
  };
  history: Array<{
    level: number;
    contacts: string[];
    sentAt: string;
    acknowledgedAt?: string;
    acknowledgedBy?: string;
  }>;
  createdAt: string;
}

const mockEscalations: EscalationEvent[] = [
  {
    id: "esc-1",
    policyName: "Critical Violations",
    status: "active",
    currentLevel: 1,
    maxLevel: 3,
    violation: {
      ruleName: "no-hardcoded-secrets",
      severity: "critical",
      message: "API key found in source code",
      filePath: "src/config/api.ts",
    },
    history: [
      { level: 0, contacts: ["oncall@company.com"], sentAt: "10 min ago" },
      { level: 1, contacts: ["security-lead@company.com"], sentAt: "5 min ago" },
    ],
    createdAt: "10 min ago",
  },
  {
    id: "esc-2",
    policyName: "Approval Timeout",
    status: "acknowledged",
    currentLevel: 0,
    maxLevel: 2,
    violation: {
      ruleName: "require-approval",
      severity: "warning",
      message: "Approval request pending for 4 hours",
    },
    history: [
      { level: 0, contacts: ["manager@company.com"], sentAt: "2 hours ago", acknowledgedAt: "1 hour ago", acknowledgedBy: "manager@company.com" },
    ],
    createdAt: "2 hours ago",
  },
  {
    id: "esc-3",
    policyName: "Critical Violations",
    status: "resolved",
    currentLevel: 2,
    maxLevel: 3,
    violation: {
      ruleName: "no-eval",
      severity: "critical",
      message: "Dynamic code execution detected",
      filePath: "src/utils/parser.ts",
    },
    history: [
      { level: 0, contacts: ["oncall@company.com"], sentAt: "1 day ago", acknowledgedAt: "1 day ago", acknowledgedBy: "oncall@company.com" },
      { level: 1, contacts: ["security-lead@company.com"], sentAt: "23 hours ago" },
      { level: 2, contacts: ["cto@company.com"], sentAt: "22 hours ago", acknowledgedAt: "22 hours ago", acknowledgedBy: "cto@company.com" },
    ],
    createdAt: "1 day ago",
  },
];

const statusColors = {
  active: "bg-red-100 text-red-800",
  acknowledged: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
};

const severityColors = {
  critical: "bg-red-500",
  error: "bg-orange-500",
  warning: "bg-yellow-500",
  info: "bg-blue-500",
};

export function Escalations() {
  const [escalations] = useState(mockEscalations);
  const [selectedEscalation, setSelectedEscalation] = useState<EscalationEvent | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "acknowledged" | "resolved">("all");

  const filteredEscalations = filter === "all"
    ? escalations
    : escalations.filter(e => e.status === filter);

  const activeCount = escalations.filter(e => e.status === "active").length;

  return (
    <div className="h-full flex">
      {/* Escalation List */}
      <div className="w-96 border-r bg-white overflow-auto">
        <div className="p-4 border-b sticky top-0 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-red-500" size={20} />
            <h2 className="text-lg font-semibold">Escalations</h2>
            {activeCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {activeCount} active
              </span>
            )}
          </div>

          <div className="flex gap-2 mt-3">
            {(["all", "active", "acknowledged", "resolved"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  filter === f
                    ? "bg-aim-600 text-white"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <ul className="divide-y">
          {filteredEscalations.map((escalation) => (
            <li
              key={escalation.id}
              onClick={() => setSelectedEscalation(escalation)}
              className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                selectedEscalation?.id === escalation.id ? "bg-aim-50 border-l-2 border-aim-500" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${severityColors[escalation.violation.severity as keyof typeof severityColors] || severityColors.info}`} />
                    <span className="font-medium text-sm">{escalation.violation.ruleName}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                    {escalation.violation.message}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${statusColors[escalation.status]}`}>
                      {escalation.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      Level {escalation.currentLevel + 1}/{escalation.maxLevel}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Escalation Detail */}
      <div className="flex-1 p-6 overflow-auto">
        {selectedEscalation ? (
          <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-semibold">{selectedEscalation.violation.ruleName}</h3>
                  <span className={`text-sm px-2 py-0.5 rounded ${statusColors[selectedEscalation.status]}`}>
                    {selectedEscalation.status}
                  </span>
                </div>
                <p className="text-gray-500 mt-1">{selectedEscalation.policyName}</p>
              </div>

              {selectedEscalation.status === "active" && (
                <div className="flex gap-2">
                  <button className="flex items-center gap-2 px-4 py-2 bg-yellow-50 text-yellow-600 hover:bg-yellow-100 rounded-lg transition-colors">
                    <Bell size={16} />
                    Acknowledge
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors">
                    <CheckCircle size={16} />
                    Resolve
                  </button>
                </div>
              )}
            </div>

            {/* Violation Details */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-red-800 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} />
                Violation Details
              </h4>
              <p className="text-red-700">{selectedEscalation.violation.message}</p>
              {selectedEscalation.violation.filePath && (
                <code className="block mt-2 text-sm font-mono text-red-600">
                  {selectedEscalation.violation.filePath}
                </code>
              )}
            </div>

            {/* Escalation Progress */}
            <div className="bg-white rounded-lg border p-4 mb-6">
              <h4 className="font-medium mb-4 flex items-center gap-2">
                <ChevronRight size={16} />
                Escalation Progress
              </h4>
              <div className="flex items-center gap-2 mb-4">
                {Array.from({ length: selectedEscalation.maxLevel }).map((_, i) => (
                  <div key={i} className="flex-1 flex items-center">
                    <div className={`w-full h-2 rounded-full ${
                      i <= selectedEscalation.currentLevel ? "bg-red-500" : "bg-gray-200"
                    }`} />
                    {i < selectedEscalation.maxLevel - 1 && <div className="w-2" />}
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500">
                Currently at level {selectedEscalation.currentLevel + 1} of {selectedEscalation.maxLevel}
              </p>
            </div>

            {/* History Timeline */}
            <div className="bg-white rounded-lg border p-4">
              <h4 className="font-medium mb-4 flex items-center gap-2">
                <Clock size={16} />
                Notification History
              </h4>
              <div className="space-y-4">
                {selectedEscalation.history.map((entry, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${
                        entry.acknowledgedAt ? "bg-green-500" : "bg-yellow-500"
                      }`} />
                      {i < selectedEscalation.history.length - 1 && (
                        <div className="w-0.5 h-full bg-gray-200 mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">Level {entry.level + 1}</span>
                        <span className="text-xs text-gray-400">{entry.sentAt}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                        <User size={14} />
                        {entry.contacts.join(", ")}
                      </div>
                      {entry.acknowledgedAt && (
                        <p className="text-xs text-green-600 mt-1">
                          Acknowledged {entry.acknowledgedAt} by {entry.acknowledgedBy}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <AlertTriangle size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg">Select an escalation to view details</p>
              <p className="text-sm mt-1">{activeCount} active escalations</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
