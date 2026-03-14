"use client";

import { useState } from "react";
import { Calendar, Download, Filter, TrendingUp, TrendingDown, Minus } from "lucide-react";

// Mock data for the dashboard
const mockSummary = {
  totalEvents: 1247,
  violations: 89,
  blocked: 12,
  transforms: 34,
  approvals: 8,
  trend: "improving" as const,
  changePercent: -15,
};

const mockByRule = [
  { name: "no-console-log", count: 34, severity: "warning" },
  { name: "no-eval", count: 12, severity: "critical" },
  { name: "no-any-type", count: 23, severity: "warning" },
  { name: "clean-architecture", count: 8, severity: "warning" },
  { name: "no-hardcoded-secrets", count: 5, severity: "critical" },
];

const mockRecentEvents = [
  { id: "1", type: "violation", rule: "no-console-log", file: "src/utils/logger.ts", time: "2 min ago" },
  { id: "2", type: "blocked", rule: "no-eval", file: "src/parsers/dynamic.ts", time: "15 min ago" },
  { id: "3", type: "transform", rule: "strip-console-logs", file: "src/api/client.ts", time: "1 hr ago" },
  { id: "4", type: "approved", rule: "require-approval", file: "src/config/secrets.ts", time: "2 hrs ago" },
];

export function AuditDashboard() {
  const [timeRange, setTimeRange] = useState("7d");

  const TrendIcon = mockSummary.trend === "improving"
    ? TrendingDown
    : mockSummary.trend === "degrading"
    ? TrendingUp
    : Minus;

  const trendColor = mockSummary.trend === "improving"
    ? "text-green-600"
    : mockSummary.trend === "degrading"
    ? "text-red-600"
    : "text-gray-600";

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Audit Dashboard</h2>
          <p className="text-gray-500">Governance analytics and compliance metrics</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>

          <button className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            <Filter size={16} />
            Filters
          </button>

          <button className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border">
          <p className="text-sm text-gray-500">Total Events</p>
          <p className="text-2xl font-bold">{mockSummary.totalEvents.toLocaleString()}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border">
          <p className="text-sm text-gray-500">Violations</p>
          <p className="text-2xl font-bold text-yellow-600">{mockSummary.violations}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border">
          <p className="text-sm text-gray-500">Blocked</p>
          <p className="text-2xl font-bold text-red-600">{mockSummary.blocked}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border">
          <p className="text-sm text-gray-500">Transforms</p>
          <p className="text-2xl font-bold text-blue-600">{mockSummary.transforms}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border">
          <p className="text-sm text-gray-500">Trend</p>
          <div className={`flex items-center gap-1 text-lg font-semibold ${trendColor}`}>
            <TrendIcon size={20} />
            {Math.abs(mockSummary.changePercent)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Top Rules */}
        <div className="bg-white p-6 rounded-xl border">
          <h3 className="text-lg font-semibold mb-4">Top Violated Rules</h3>
          <div className="space-y-3">
            {mockByRule.map((rule, i) => (
              <div key={rule.name} className="flex items-center">
                <span className="w-6 text-gray-400 text-sm">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{rule.name}</span>
                    <span className="text-sm text-gray-500">{rule.count} violations</span>
                  </div>
                  <div className="mt-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${rule.severity === "critical" ? "bg-red-500" : "bg-yellow-500"}`}
                      style={{ width: `${(rule.count / mockByRule[0].count) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Events */}
        <div className="bg-white p-6 rounded-xl border">
          <h3 className="text-lg font-semibold mb-4">Recent Events</h3>
          <div className="space-y-3">
            {mockRecentEvents.map((event) => (
              <div key={event.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className={`w-2 h-2 mt-2 rounded-full ${
                  event.type === "blocked" ? "bg-red-500" :
                  event.type === "violation" ? "bg-yellow-500" :
                  event.type === "transform" ? "bg-blue-500" :
                  "bg-green-500"
                }`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{event.rule}</span>
                    <span className="text-xs text-gray-400">{event.time}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{event.file}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
