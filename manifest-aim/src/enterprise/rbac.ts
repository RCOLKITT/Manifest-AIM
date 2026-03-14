/**
 * Role-Based Access Control (RBAC) for AIM
 *
 * Provides permission checking and role management.
 */

import type { Permission, Role, User, Team, BUILT_IN_ROLES } from "./types.js";

export interface RBACConfig {
  roles: Role[];
  users: User[];
  teams: Team[];
}

export class RBACManager {
  private roles: Map<string, Role> = new Map();
  private users: Map<string, User> = new Map();
  private teams: Map<string, Team> = new Map();

  constructor(config?: Partial<RBACConfig>) {
    // Initialize with built-in roles
    this.initializeBuiltInRoles();

    // Load custom config
    if (config) {
      this.loadConfig(config);
    }
  }

  private initializeBuiltInRoles(): void {
    const builtInRoles: Role[] = [
      {
        id: "viewer",
        name: "Viewer",
        description: "Read-only access to manifests and audits",
        permissions: ["manifest:read", "audit:read"],
      },
      {
        id: "developer",
        name: "Developer",
        description: "Can create and modify manifests, request approvals",
        permissions: [
          "manifest:read",
          "manifest:write",
          "approval:request",
          "audit:read",
        ],
      },
      {
        id: "reviewer",
        name: "Reviewer",
        description: "Can review and approve/reject requests",
        permissions: [
          "manifest:read",
          "approval:review",
          "approval:approve",
          "approval:reject",
          "audit:read",
        ],
      },
      {
        id: "admin",
        name: "Admin",
        description: "Full access to all features",
        permissions: [
          "manifest:read",
          "manifest:write",
          "manifest:publish",
          "manifest:delete",
          "rule:override",
          "approval:request",
          "approval:review",
          "approval:approve",
          "approval:reject",
          "audit:read",
          "audit:export",
          "team:manage",
          "settings:manage",
          "escalation:configure",
        ],
      },
    ];

    for (const role of builtInRoles) {
      this.roles.set(role.id, role);
    }
  }

  loadConfig(config: Partial<RBACConfig>): void {
    if (config.roles) {
      for (const role of config.roles) {
        this.roles.set(role.id, role);
      }
    }

    if (config.users) {
      for (const user of config.users) {
        this.users.set(user.id, user);
      }
    }

    if (config.teams) {
      for (const team of config.teams) {
        this.teams.set(team.id, team);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Role Management
  // ──────────────────────────────────────────────────────────────────────────

  getRole(roleId: string): Role | undefined {
    return this.roles.get(roleId);
  }

  getAllRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  addRole(role: Role): void {
    this.roles.set(role.id, role);
  }

  removeRole(roleId: string): boolean {
    // Don't allow removing built-in roles
    if (["viewer", "developer", "reviewer", "admin"].includes(roleId)) {
      throw new Error(`Cannot remove built-in role: ${roleId}`);
    }
    return this.roles.delete(roleId);
  }

  /**
   * Get all permissions for a role, including inherited permissions
   */
  getRolePermissions(roleId: string): Permission[] {
    const role = this.roles.get(roleId);
    if (!role) {
      return [];
    }

    const permissions = new Set<Permission>(role.permissions);

    // Add inherited permissions
    if (role.inherits) {
      for (const inheritedRoleId of role.inherits) {
        const inheritedPermissions = this.getRolePermissions(inheritedRoleId);
        for (const perm of inheritedPermissions) {
          permissions.add(perm);
        }
      }
    }

    return Array.from(permissions);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // User Management
  // ──────────────────────────────────────────────────────────────────────────

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  getUserByEmail(email: string): User | undefined {
    return Array.from(this.users.values()).find((u) => u.email === email);
  }

  addUser(user: User): void {
    this.users.set(user.id, user);
  }

  removeUser(userId: string): boolean {
    return this.users.delete(userId);
  }

  updateUserRoles(userId: string, roles: string[]): void {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    user.roles = roles;
  }

  /**
   * Get all permissions for a user (from all their roles)
   */
  getUserPermissions(userId: string): Permission[] {
    const user = this.users.get(userId);
    if (!user) {
      return [];
    }

    const permissions = new Set<Permission>();

    // Get permissions from user's roles
    for (const roleId of user.roles) {
      const rolePermissions = this.getRolePermissions(roleId);
      for (const perm of rolePermissions) {
        permissions.add(perm);
      }
    }

    // Get permissions from user's teams
    for (const teamId of user.teams) {
      const team = this.teams.get(teamId);
      if (team?.defaultRole) {
        const teamPermissions = this.getRolePermissions(team.defaultRole);
        for (const perm of teamPermissions) {
          permissions.add(perm);
        }
      }
    }

    return Array.from(permissions);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Team Management
  // ──────────────────────────────────────────────────────────────────────────

  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }

  getAllTeams(): Team[] {
    return Array.from(this.teams.values());
  }

  addTeam(team: Team): void {
    this.teams.set(team.id, team);
  }

  removeTeam(teamId: string): boolean {
    return this.teams.delete(teamId);
  }

  addUserToTeam(userId: string, teamId: string): void {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    if (!team.members.includes(userId)) {
      team.members.push(userId);
    }

    const user = this.users.get(userId);
    if (user && !user.teams.includes(teamId)) {
      user.teams.push(teamId);
    }
  }

  removeUserFromTeam(userId: string, teamId: string): void {
    const team = this.teams.get(teamId);
    if (team) {
      team.members = team.members.filter((id) => id !== userId);
    }

    const user = this.users.get(userId);
    if (user) {
      user.teams = user.teams.filter((id) => id !== teamId);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Permission Checking
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Check if a user has a specific permission
   */
  hasPermission(userId: string, permission: Permission): boolean {
    const permissions = this.getUserPermissions(userId);
    return permissions.includes(permission);
  }

  /**
   * Check if a user has all of the specified permissions
   */
  hasAllPermissions(userId: string, permissions: Permission[]): boolean {
    const userPermissions = this.getUserPermissions(userId);
    return permissions.every((p) => userPermissions.includes(p));
  }

  /**
   * Check if a user has any of the specified permissions
   */
  hasAnyPermission(userId: string, permissions: Permission[]): boolean {
    const userPermissions = this.getUserPermissions(userId);
    return permissions.some((p) => userPermissions.includes(p));
  }

  /**
   * Check if a user has a specific role
   */
  hasRole(userId: string, roleId: string): boolean {
    const user = this.users.get(userId);
    if (!user) {
      return false;
    }
    return user.roles.includes(roleId);
  }

  /**
   * Check if a user is a member of a specific team
   */
  isTeamMember(userId: string, teamId: string): boolean {
    const team = this.teams.get(teamId);
    if (!team) {
      return false;
    }
    return team.members.includes(userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Authorization Middleware
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Create an authorization check function for a specific permission
   */
  requirePermission(permission: Permission): (userId: string) => void {
    return (userId: string) => {
      if (!this.hasPermission(userId, permission)) {
        throw new AuthorizationError(
          `User ${userId} lacks permission: ${permission}`,
        );
      }
    };
  }

  /**
   * Create an authorization check function for multiple permissions (all required)
   */
  requireAllPermissions(permissions: Permission[]): (userId: string) => void {
    return (userId: string) => {
      if (!this.hasAllPermissions(userId, permissions)) {
        throw new AuthorizationError(
          `User ${userId} lacks required permissions: ${permissions.join(", ")}`,
        );
      }
    };
  }

  /**
   * Create an authorization check function for role membership
   */
  requireRole(roleId: string): (userId: string) => void {
    return (userId: string) => {
      if (!this.hasRole(userId, roleId)) {
        throw new AuthorizationError(
          `User ${userId} does not have role: ${roleId}`,
        );
      }
    };
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

// Export a default instance for convenience
export const rbac = new RBACManager();
