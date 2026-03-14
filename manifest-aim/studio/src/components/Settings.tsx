"use client";

import { useState } from "react";
import { Save, RefreshCw, Server, Key, Bell, Database, Shield } from "lucide-react";

interface SettingsSection {
  id: string;
  name: string;
  icon: typeof Server;
}

const sections: SettingsSection[] = [
  { id: "api", name: "API Connection", icon: Server },
  { id: "auth", name: "Authentication", icon: Key },
  { id: "notifications", name: "Notifications", icon: Bell },
  { id: "storage", name: "Storage", icon: Database },
  { id: "security", name: "Security", icon: Shield },
];

export function Settings() {
  const [activeSection, setActiveSection] = useState("api");
  const [apiUrl, setApiUrl] = useState("http://localhost:4000");
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "checking">("disconnected");

  const checkConnection = async () => {
    setConnectionStatus("checking");
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (response.ok) {
        setConnectionStatus("connected");
      } else {
        setConnectionStatus("disconnected");
      }
    } catch {
      setConnectionStatus("disconnected");
    }
  };

  return (
    <div className="h-full flex">
      {/* Settings Navigation */}
      <div className="w-64 border-r bg-white overflow-auto">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="text-sm text-gray-500">Configure AIM Studio</p>
        </div>

        <nav className="p-2">
          {sections.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeSection === id
                  ? "bg-aim-50 text-aim-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon size={18} />
              {name}
            </button>
          ))}
        </nav>
      </div>

      {/* Settings Content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl">
          {/* API Connection */}
          {activeSection === "api" && (
            <div>
              <h3 className="text-xl font-semibold mb-6">API Connection</h3>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Server URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      placeholder="http://localhost:4000"
                      className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500"
                    />
                    <button
                      onClick={checkConnection}
                      disabled={connectionStatus === "checking"}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={16} className={connectionStatus === "checking" ? "animate-spin" : ""} />
                      Test
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    The URL of your manifest serve API server
                  </p>
                </div>

                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <div className={`w-3 h-3 rounded-full ${
                    connectionStatus === "connected" ? "bg-green-500" :
                    connectionStatus === "checking" ? "bg-yellow-500 animate-pulse" :
                    "bg-red-500"
                  }`} />
                  <span className="text-sm">
                    {connectionStatus === "connected" && "Connected to API server"}
                    {connectionStatus === "checking" && "Checking connection..."}
                    {connectionStatus === "disconnected" && "Not connected"}
                  </span>
                </div>

                <div className="border-t pt-6">
                  <h4 className="font-medium mb-3">Quick Start</h4>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm">
                    <p className="text-gray-400"># Start the API server</p>
                    <p>manifest serve --port 4000</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Authentication */}
          {activeSection === "auth" && (
            <div>
              <h3 className="text-xl font-semibold mb-6">Authentication</h3>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Key
                  </label>
                  <input
                    type="password"
                    placeholder="Enter your API key"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional: API key for authenticated endpoints
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Authentication Method
                  </label>
                  <div className="space-y-2">
                    {["None", "API Key", "OAuth 2.0", "JWT"].map((method) => (
                      <label key={method} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input
                          type="radio"
                          name="authMethod"
                          value={method}
                          defaultChecked={method === "None"}
                          className="text-aim-600"
                        />
                        <span className="text-sm">{method}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeSection === "notifications" && (
            <div>
              <h3 className="text-xl font-semibold mb-6">Notifications</h3>

              <div className="space-y-4">
                {[
                  { id: "violations", label: "Rule Violations", description: "Get notified when rules are violated" },
                  { id: "approvals", label: "Approval Requests", description: "Get notified about new approval requests" },
                  { id: "escalations", label: "Escalations", description: "Get notified about escalation events" },
                  { id: "blocked", label: "Blocked Actions", description: "Get notified when actions are blocked" },
                ].map(({ id, label, description }) => (
                  <label key={id} className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <div>
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-xs text-gray-500">{description}</p>
                    </div>
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-5 h-5 text-aim-600 rounded"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Storage */}
          {activeSection === "storage" && (
            <div>
              <h3 className="text-xl font-semibold mb-6">Storage</h3>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supabase URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://your-project.supabase.co"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supabase Service Key
                  </label>
                  <input
                    type="password"
                    placeholder="Enter your service key"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Required for persistent storage of audit logs, approvals, and escalations
                  </p>
                </div>

                <div className="border-t pt-6">
                  <h4 className="font-medium mb-3">Data Retention</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Audit Logs</label>
                      <select className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500">
                        <option value="30">30 days</option>
                        <option value="90">90 days</option>
                        <option value="365">1 year</option>
                        <option value="forever">Forever</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Approval History</label>
                      <select className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500">
                        <option value="30">30 days</option>
                        <option value="90">90 days</option>
                        <option value="365">1 year</option>
                        <option value="forever">Forever</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Security */}
          {activeSection === "security" && (
            <div>
              <h3 className="text-xl font-semibold mb-6">Security</h3>

              <div className="space-y-6">
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <h4 className="font-medium text-yellow-800 mb-1">Security Best Practices</h4>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    <li>Never commit secrets to version control</li>
                    <li>Use environment variables for sensitive configuration</li>
                    <li>Enable Row Level Security (RLS) in Supabase</li>
                    <li>Regularly rotate API keys</li>
                  </ul>
                </div>

                <div>
                  <label className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <div>
                      <p className="font-medium text-sm">Require MFA for Approvals</p>
                      <p className="text-xs text-gray-500">Require multi-factor authentication for approval actions</p>
                    </div>
                    <input
                      type="checkbox"
                      className="w-5 h-5 text-aim-600 rounded"
                    />
                  </label>
                </div>

                <div>
                  <label className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <div>
                      <p className="font-medium text-sm">Audit All Actions</p>
                      <p className="text-xs text-gray-500">Log all user actions for compliance</p>
                    </div>
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-5 h-5 text-aim-600 rounded"
                    />
                  </label>
                </div>

                <div>
                  <label className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <div>
                      <p className="font-medium text-sm">IP Allowlist</p>
                      <p className="text-xs text-gray-500">Restrict access to specific IP addresses</p>
                    </div>
                    <input
                      type="checkbox"
                      className="w-5 h-5 text-aim-600 rounded"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="mt-8 pt-6 border-t">
            <button className="flex items-center gap-2 px-4 py-2 bg-aim-600 hover:bg-aim-700 text-white rounded-lg transition-colors">
              <Save size={16} />
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
