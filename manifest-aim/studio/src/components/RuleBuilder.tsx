"use client";

import { useState } from "react";
import { Plus, Trash2, Play, AlertTriangle, Ban, Info } from "lucide-react";

interface Rule {
  id: string;
  name: string;
  description: string;
  enforcement: "static" | "semantic" | "injected";
  action: "block" | "warn" | "require_approval" | "transform" | "log";
  severity: "critical" | "error" | "warning" | "info";
  pattern?: string;
}

const defaultRules: Rule[] = [
  {
    id: "1",
    name: "no-eval",
    description: "Prevent dynamic code execution functions",
    enforcement: "static",
    action: "block",
    severity: "critical",
    pattern: "\\beval\\s*\\(",
  },
  {
    id: "2",
    name: "no-console-log",
    description: "Remove console.log from production code",
    enforcement: "static",
    action: "warn",
    severity: "warning",
    pattern: "console\\.log\\(",
  },
];

const severityColors = {
  critical: "bg-red-100 text-red-800 border-red-200",
  error: "bg-orange-100 text-orange-800 border-orange-200",
  warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
  info: "bg-blue-100 text-blue-800 border-blue-200",
};

const actionIcons = {
  block: Ban,
  warn: AlertTriangle,
  require_approval: Info,
  transform: Info,
  log: Info,
};

export function RuleBuilder() {
  const [rules, setRules] = useState<Rule[]>(defaultRules);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);

  const handleAddRule = () => {
    const newRule: Rule = {
      id: Date.now().toString(),
      name: "new-rule",
      description: "New governance rule",
      enforcement: "static",
      action: "warn",
      severity: "warning",
    };
    setRules([...rules, newRule]);
    setSelectedRule(newRule);
  };

  const handleDeleteRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
    if (selectedRule?.id === id) {
      setSelectedRule(null);
    }
  };

  const handleUpdateRule = (updated: Rule) => {
    setRules(rules.map((r) => (r.id === updated.id ? updated : r)));
    setSelectedRule(updated);
  };

  return (
    <div className="h-full flex">
      {/* Rule List */}
      <div className="w-80 border-r bg-white overflow-auto">
        <div className="p-4 border-b sticky top-0 bg-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Rules</h2>
            <button
              onClick={handleAddRule}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Plus size={20} />
            </button>
          </div>
          <p className="text-sm text-gray-500">{rules.length} rules configured</p>
        </div>

        <ul className="divide-y">
          {rules.map((rule) => {
            const ActionIcon = actionIcons[rule.action];
            return (
              <li
                key={rule.id}
                onClick={() => setSelectedRule(rule)}
                className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedRule?.id === rule.id ? "bg-aim-50 border-l-2 border-aim-500" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <ActionIcon size={14} className="text-gray-500" />
                      <span className="font-medium text-sm">{rule.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {rule.description}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded border ${severityColors[rule.severity]}`}
                  >
                    {rule.severity}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Rule Editor */}
      <div className="flex-1 p-6 overflow-auto">
        {selectedRule ? (
          <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold">Edit Rule</h3>
              <button
                onClick={() => handleDeleteRule(selectedRule.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Name
                </label>
                <input
                  type="text"
                  value={selectedRule.name}
                  onChange={(e) =>
                    handleUpdateRule({ ...selectedRule, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={selectedRule.description}
                  onChange={(e) =>
                    handleUpdateRule({ ...selectedRule, description: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500"
                />
              </div>

              {/* Enforcement */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enforcement Type
                </label>
                <select
                  value={selectedRule.enforcement}
                  onChange={(e) =>
                    handleUpdateRule({
                      ...selectedRule,
                      enforcement: e.target.value as Rule["enforcement"],
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500"
                >
                  <option value="static">Static (Pattern Matching)</option>
                  <option value="semantic">Semantic (LLM-as-Judge)</option>
                  <option value="injected">Injected (Guidelines)</option>
                </select>
              </div>

              {/* Pattern (for static rules) */}
              {selectedRule.enforcement === "static" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Regex Pattern
                  </label>
                  <input
                    type="text"
                    value={selectedRule.pattern || ""}
                    onChange={(e) =>
                      handleUpdateRule({ ...selectedRule, pattern: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-aim-500"
                    placeholder="e.g., console\.log\("
                  />
                </div>
              )}

              {/* Action & Severity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Action
                  </label>
                  <select
                    value={selectedRule.action}
                    onChange={(e) =>
                      handleUpdateRule({
                        ...selectedRule,
                        action: e.target.value as Rule["action"],
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500"
                  >
                    <option value="block">Block</option>
                    <option value="warn">Warn</option>
                    <option value="require_approval">Require Approval</option>
                    <option value="transform">Transform</option>
                    <option value="log">Log</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Severity
                  </label>
                  <select
                    value={selectedRule.severity}
                    onChange={(e) =>
                      handleUpdateRule({
                        ...selectedRule,
                        severity: e.target.value as Rule["severity"],
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500"
                  >
                    <option value="critical">Critical</option>
                    <option value="error">Error</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                  </select>
                </div>
              </div>

              {/* Test Button */}
              <div className="pt-4 border-t">
                <button className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
                  <Play size={16} />
                  Test Rule
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-lg">Select a rule to edit</p>
              <p className="text-sm mt-1">or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
