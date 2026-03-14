"use client";

import { useState } from "react";
import { Check, X, Clock, MessageSquare, User, FileCode } from "lucide-react";

interface ApprovalRequest {
  id: string;
  rule: string;
  requester: string;
  file: string;
  justification: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  expiresAt: string;
}

const mockRequests: ApprovalRequest[] = [
  {
    id: "apr_001",
    rule: "no-hardcoded-secrets",
    requester: "john@example.com",
    file: "src/config/api-keys.ts",
    justification: "Need to include test API key for local development. Will be replaced by env var in production.",
    status: "pending",
    createdAt: "2 hours ago",
    expiresAt: "in 22 hours",
  },
  {
    id: "apr_002",
    rule: "no-eval",
    requester: "sarah@example.com",
    file: "src/parsers/template.ts",
    justification: "Using eval for dynamic template parsing. Input is sanitized and only accepts predefined templates.",
    status: "pending",
    createdAt: "5 hours ago",
    expiresAt: "in 19 hours",
  },
  {
    id: "apr_003",
    rule: "require-approval",
    requester: "mike@example.com",
    file: "src/auth/bypass.ts",
    justification: "Temporary auth bypass for load testing. Will be removed after test.",
    status: "approved",
    createdAt: "1 day ago",
    expiresAt: "expired",
  },
];

export function ApprovalQueue() {
  const [requests, setRequests] = useState(mockRequests);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  const handleApprove = (id: string) => {
    setRequests(requests.map(r =>
      r.id === id ? { ...r, status: "approved" as const } : r
    ));
  };

  const handleReject = (id: string) => {
    setRequests(requests.map(r =>
      r.id === id ? { ...r, status: "rejected" as const } : r
    ));
  };

  const filteredRequests = filter === "all"
    ? requests
    : requests.filter(r => r.status === filter);

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="h-full flex">
      {/* Request List */}
      <div className="w-96 border-r bg-white overflow-auto">
        <div className="p-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">Approval Queue</h2>
          <p className="text-sm text-gray-500">{pendingCount} pending requests</p>

          <div className="flex gap-2 mt-3">
            {(["pending", "approved", "rejected", "all"] as const).map((f) => (
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
          {filteredRequests.map((request) => (
            <li
              key={request.id}
              onClick={() => setSelectedRequest(request)}
              className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                selectedRequest?.id === request.id ? "bg-aim-50 border-l-2 border-aim-500" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      request.status === "pending" ? "bg-yellow-500" :
                      request.status === "approved" ? "bg-green-500" :
                      "bg-red-500"
                    }`} />
                    <span className="font-medium text-sm">{request.rule}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 font-mono truncate">
                    {request.file}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    <User size={12} />
                    <span>{request.requester}</span>
                    <span>•</span>
                    <Clock size={12} />
                    <span>{request.createdAt}</span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Request Detail */}
      <div className="flex-1 p-6 overflow-auto">
        {selectedRequest ? (
          <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold">{selectedRequest.rule}</h3>
                <p className="text-sm text-gray-500">
                  Requested by {selectedRequest.requester}
                </p>
              </div>

              {selectedRequest.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReject(selectedRequest.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <X size={16} />
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(selectedRequest.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors"
                  >
                    <Check size={16} />
                    Approve
                  </button>
                </div>
              )}

              {selectedRequest.status !== "pending" && (
                <span className={`px-3 py-1 rounded-full text-sm ${
                  selectedRequest.status === "approved"
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}>
                  {selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1)}
                </span>
              )}
            </div>

            <div className="space-y-6">
              {/* File Info */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <FileCode size={16} className="text-gray-500" />
                  <span className="font-medium text-sm">Affected File</span>
                </div>
                <code className="text-sm font-mono">{selectedRequest.file}</code>
              </div>

              {/* Justification */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare size={16} className="text-gray-500" />
                  <span className="font-medium text-sm">Justification</span>
                </div>
                <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">
                  {selectedRequest.justification}
                </p>
              </div>

              {/* Timeline */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={16} className="text-gray-500" />
                  <span className="font-medium text-sm">Timeline</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Created</span>
                    <span>{selectedRequest.createdAt}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Expires</span>
                    <span>{selectedRequest.expiresAt}</span>
                  </div>
                </div>
              </div>

              {/* Add Comment */}
              {selectedRequest.status === "pending" && (
                <div className="border-t pt-4">
                  <label className="block font-medium text-sm mb-2">
                    Add Comment (optional)
                  </label>
                  <textarea
                    placeholder="Add context for your decision..."
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500"
                    rows={3}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-lg">Select a request to review</p>
              <p className="text-sm mt-1">{pendingCount} pending approvals</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
