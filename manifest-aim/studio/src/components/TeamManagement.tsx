"use client";

import { useState } from "react";
import { Users, UserPlus, Shield, Trash2, Edit2 } from "lucide-react";

interface TeamMember {
  userId: string;
  email: string;
  name: string;
  role: string;
}

interface Team {
  id: string;
  name: string;
  description: string;
  members: TeamMember[];
}

const mockTeams: Team[] = [
  {
    id: "team-1",
    name: "Platform Engineering",
    description: "Core platform and infrastructure team",
    members: [
      { userId: "u1", email: "alice@company.com", name: "Alice Chen", role: "admin" },
      { userId: "u2", email: "bob@company.com", name: "Bob Smith", role: "developer" },
      { userId: "u3", email: "carol@company.com", name: "Carol Davis", role: "reviewer" },
    ],
  },
  {
    id: "team-2",
    name: "Security",
    description: "Security and compliance team",
    members: [
      { userId: "u4", email: "dave@company.com", name: "Dave Wilson", role: "admin" },
      { userId: "u5", email: "eve@company.com", name: "Eve Martinez", role: "reviewer" },
    ],
  },
];

const roles = [
  { id: "admin", name: "Admin", description: "Full access to all features", color: "bg-purple-100 text-purple-800" },
  { id: "reviewer", name: "Reviewer", description: "Can approve/reject requests", color: "bg-blue-100 text-blue-800" },
  { id: "developer", name: "Developer", description: "Can create and edit manifests", color: "bg-green-100 text-green-800" },
  { id: "viewer", name: "Viewer", description: "Read-only access", color: "bg-gray-100 text-gray-800" },
];

export function TeamManagement() {
  const [teams, setTeams] = useState(mockTeams);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);

  const getRoleColor = (roleId: string) => {
    return roles.find(r => r.id === roleId)?.color || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="h-full flex">
      {/* Team List */}
      <div className="w-80 border-r bg-white overflow-auto">
        <div className="p-4 border-b sticky top-0 bg-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Teams</h2>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <Users size={20} />
            </button>
          </div>
          <p className="text-sm text-gray-500">{teams.length} teams</p>
        </div>

        <ul className="divide-y">
          {teams.map((team) => (
            <li
              key={team.id}
              onClick={() => setSelectedTeam(team)}
              className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                selectedTeam?.id === team.id ? "bg-aim-50 border-l-2 border-aim-500" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-aim-100 rounded-lg flex items-center justify-center">
                  <Users size={20} className="text-aim-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">{team.name}</p>
                  <p className="text-xs text-gray-500">{team.members.length} members</p>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Role Reference */}
        <div className="p-4 border-t mt-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Shield size={16} />
            Role Reference
          </h3>
          <div className="space-y-2">
            {roles.map((role) => (
              <div key={role.id} className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded ${role.color}`}>
                  {role.name}
                </span>
                <span className="text-xs text-gray-500">{role.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Team Detail */}
      <div className="flex-1 p-6 overflow-auto">
        {selectedTeam ? (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold">{selectedTeam.name}</h3>
                <p className="text-gray-500">{selectedTeam.description}</p>
              </div>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Edit2 size={20} />
              </button>
            </div>

            {/* Members */}
            <div className="bg-white rounded-xl border">
              <div className="p-4 border-b flex items-center justify-between">
                <h4 className="font-semibold">Members</h4>
                <button
                  onClick={() => setShowAddMember(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-aim-600 hover:bg-aim-700 text-white rounded-lg text-sm transition-colors"
                >
                  <UserPlus size={16} />
                  Add Member
                </button>
              </div>

              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Member
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Role
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedTeam.members.map((member) => (
                    <tr key={member.userId} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium">
                            {member.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{member.name}</p>
                            <p className="text-xs text-gray-500">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={member.role}
                          onChange={() => {}}
                          className={`text-xs px-2 py-1 rounded border-0 ${getRoleColor(member.role)}`}
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Permissions Summary */}
            <div className="mt-6 bg-white rounded-xl border p-4">
              <h4 className="font-semibold mb-3">Team Permissions</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="font-medium text-green-700">Allowed</p>
                  <ul className="text-gray-600 space-y-0.5">
                    <li>manifest:read</li>
                    <li>manifest:create</li>
                    <li>manifest:edit</li>
                    <li>approval:create</li>
                  </ul>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-blue-700">Some Members</p>
                  <ul className="text-gray-600 space-y-0.5">
                    <li>approval:approve</li>
                    <li>approval:reject</li>
                    <li>audit:export</li>
                  </ul>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-red-700">Restricted</p>
                  <ul className="text-gray-600 space-y-0.5">
                    <li>rbac:manage</li>
                    <li>audit:purge</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Users size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg">Select a team to manage</p>
              <p className="text-sm mt-1">or create a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Team Member</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="user@company.com"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-aim-500">
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} - {role.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddMember(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowAddMember(false)}
                className="px-4 py-2 bg-aim-600 hover:bg-aim-700 text-white rounded-lg transition-colors"
              >
                Add Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
