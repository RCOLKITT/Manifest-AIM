-- Enterprise Features Schema
-- Supabase PostgreSQL migration for RBAC, Approvals, Audit, and Escalation

-- ────────────────────────────────────────────────────────────────────────────
-- Teams & RBAC
-- ────────────────────────────────────────────────────────────────────────────

-- Custom roles (beyond built-in viewer/developer/reviewer/admin)
create table public.roles (
  id text primary key,
  name text not null,
  description text,
  permissions text[] default '{}',
  inherits text[] default '{}',  -- Role IDs to inherit from
  created_at timestamptz default now()
);

-- Seed built-in roles
insert into public.roles (id, name, description, permissions) values
  ('viewer', 'Viewer', 'Read-only access to manifests and audits',
   array['manifest:read', 'audit:read']),
  ('developer', 'Developer', 'Can create and modify manifests, request approvals',
   array['manifest:read', 'manifest:write', 'approval:request', 'audit:read']),
  ('reviewer', 'Reviewer', 'Can review and approve/reject requests',
   array['manifest:read', 'approval:review', 'approval:approve', 'approval:reject', 'audit:read']),
  ('admin', 'Admin', 'Full access to all features',
   array['manifest:read', 'manifest:write', 'manifest:publish', 'manifest:delete',
         'rule:override', 'approval:request', 'approval:review', 'approval:approve',
         'approval:reject', 'audit:read', 'audit:export', 'team:manage',
         'settings:manage', 'escalation:configure']);

-- Teams
create table public.teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text,
  default_role text references public.roles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Team membership
create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text references public.roles(id),
  joined_at timestamptz default now(),
  primary key (team_id, user_id)
);

-- User roles (direct role assignments, separate from team roles)
create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null references public.roles(id) on delete cascade,
  assigned_at timestamptz default now(),
  assigned_by uuid references auth.users(id),
  primary key (user_id, role_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- Approval Workflow
-- ────────────────────────────────────────────────────────────────────────────

-- Approval policies
create table public.approval_policies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  triggers jsonb not null default '[]',        -- [{type, ruleName, severity, etc.}]
  approvers jsonb not null,                    -- {type, userIds, roleIds, teamIds, etc.}
  settings jsonb not null default '{}',        -- {expiresIn, requireJustification, etc.}
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Approval requests
create table public.approval_requests (
  id uuid primary key default uuid_generate_v4(),
  policy_id uuid not null references public.approval_policies(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),

  -- Context
  context jsonb not null,                      -- {trigger, violation, code, metadata}

  -- Requester
  requester_id uuid not null references auth.users(id),
  justification text,

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz,
  resolved_at timestamptz
);

-- Approval decisions
create table public.approval_decisions (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null references public.approval_requests(id) on delete cascade,
  approver_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved', 'rejected')),
  comment text,
  created_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- Audit Logging
-- ────────────────────────────────────────────────────────────────────────────

create table public.audit_events (
  id uuid primary key default uuid_generate_v4(),
  type text not null,                          -- enforcement.violation, approval.approved, etc.
  timestamp timestamptz default now(),

  -- Actor
  actor_type text not null check (actor_type in ('user', 'system', 'agent')),
  actor_id uuid,
  actor_name text,
  actor_ip inet,

  -- Resource
  resource_type text,                          -- manifest, rule, approval, user, team
  resource_id text,
  resource_name text,

  -- Event details
  details jsonb default '{}',

  -- Violation info (if applicable)
  violation_rule_name text,
  violation_severity text,
  violation_message text,
  violation_file_path text,
  violation_line integer,

  -- Context
  manifest_name text,
  manifest_version text,
  environment text,
  git_branch text,
  git_commit text,

  -- Outcome
  outcome text not null check (outcome in ('success', 'failure', 'pending')),
  error text
);

-- Indexes for audit querying
create index idx_audit_timestamp on public.audit_events (timestamp desc);
create index idx_audit_type on public.audit_events (type);
create index idx_audit_actor on public.audit_events (actor_id);
create index idx_audit_resource on public.audit_events (resource_type, resource_id);
create index idx_audit_violation_rule on public.audit_events (violation_rule_name);
create index idx_audit_violation_severity on public.audit_events (violation_severity);
create index idx_audit_manifest on public.audit_events (manifest_name);

-- ────────────────────────────────────────────────────────────────────────────
-- Escalation
-- ────────────────────────────────────────────────────────────────────────────

-- Escalation contacts
create table public.escalation_contacts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  channel text not null check (channel in ('email', 'slack', 'pagerduty', 'webhook')),
  config jsonb not null,                       -- {email, slackChannel, webhookUrl, etc.}
  created_at timestamptz default now()
);

-- Escalation policies
create table public.escalation_policies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  triggers jsonb not null default '[]',        -- [{type, severity, threshold, etc.}]
  levels jsonb not null default '[]',          -- [{order, contacts, escalateAfter}]
  settings jsonb not null default '{}',        -- {repeatInterval, maxRepeats, etc.}
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Active escalation events
create table public.escalation_events (
  id uuid primary key default uuid_generate_v4(),
  policy_id uuid not null references public.escalation_policies(id),
  trigger_id text not null,
  current_level integer default 0,
  status text not null default 'active' check (status in ('active', 'acknowledged', 'resolved')),

  -- Trigger context
  trigger_context jsonb not null,              -- {type, details, violation}

  -- History
  history jsonb default '[]',                  -- [{level, contacts, sentAt, acknowledgedAt}]

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  resolved_at timestamptz
);

create index idx_escalation_status on public.escalation_events (status);
create index idx_escalation_policy on public.escalation_events (policy_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────────────────────

alter table public.roles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.user_roles enable row level security;
alter table public.approval_policies enable row level security;
alter table public.approval_requests enable row level security;
alter table public.approval_decisions enable row level security;
alter table public.audit_events enable row level security;
alter table public.escalation_contacts enable row level security;
alter table public.escalation_policies enable row level security;
alter table public.escalation_events enable row level security;

-- Roles are readable by all authenticated users
create policy "Roles are readable by authenticated users"
  on public.roles for select
  to authenticated using (true);

-- Teams are readable by members
create policy "Teams are readable by members"
  on public.teams for select
  to authenticated using (
    exists (
      select 1 from public.team_members
      where team_id = id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role_id = 'admin'
    )
  );

-- Approval requests are visible to requester and approvers
create policy "Approval requests are visible to relevant users"
  on public.approval_requests for select
  to authenticated using (
    requester_id = auth.uid()
    or exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role_id in ('reviewer', 'admin')
    )
  );

-- Audit events are readable by users with audit:read permission
create policy "Audit events are readable by authorized users"
  on public.audit_events for select
  to authenticated using (
    exists (
      select 1 from public.user_roles ur
      join public.roles r on ur.role_id = r.id
      where ur.user_id = auth.uid() and 'audit:read' = any(r.permissions)
    )
  );

-- System can insert audit events
create policy "System can insert audit events"
  on public.audit_events for insert
  to authenticated with check (true);

-- ────────────────────────────────────────────────────────────────────────────
-- Helper Functions
-- ────────────────────────────────────────────────────────────────────────────

-- Get all permissions for a user (from roles + teams)
create or replace function public.get_user_permissions(p_user_id uuid)
returns text[] as $$
declare
  v_permissions text[] := '{}';
  v_role_perms text[];
begin
  -- Direct role permissions
  for v_role_perms in
    select r.permissions
    from public.user_roles ur
    join public.roles r on ur.role_id = r.id
    where ur.user_id = p_user_id
  loop
    v_permissions := v_permissions || v_role_perms;
  end loop;

  -- Team role permissions
  for v_role_perms in
    select r.permissions
    from public.team_members tm
    join public.teams t on tm.team_id = t.id
    join public.roles r on coalesce(tm.role_id, t.default_role) = r.id
    where tm.user_id = p_user_id
  loop
    v_permissions := v_permissions || v_role_perms;
  end loop;

  -- Dedupe
  return array(select distinct unnest(v_permissions));
end;
$$ language plpgsql security definer;

-- Check if user has specific permission
create or replace function public.user_has_permission(p_user_id uuid, p_permission text)
returns boolean as $$
begin
  return p_permission = any(public.get_user_permissions(p_user_id));
end;
$$ language plpgsql security definer;

-- Auto-update updated_at for new tables
create trigger teams_updated_at
  before update on public.teams
  for each row execute function public.update_updated_at();

create trigger approval_policies_updated_at
  before update on public.approval_policies
  for each row execute function public.update_updated_at();

create trigger approval_requests_updated_at
  before update on public.approval_requests
  for each row execute function public.update_updated_at();

create trigger escalation_policies_updated_at
  before update on public.escalation_policies
  for each row execute function public.update_updated_at();

create trigger escalation_events_updated_at
  before update on public.escalation_events
  for each row execute function public.update_updated_at();
