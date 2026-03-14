-- User Profiles and Auth Sessions for CLI Login
-- Run this after 001_registry_schema.sql

-- ── User Profiles ──
-- Extended user data beyond Supabase Auth
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  bio text,
  website_url text,
  github_username text,
  trust_tier text default 'community' check (trust_tier in ('verified', 'trusted', 'community', 'unverified')),
  manifests_published integer default 0,
  total_downloads integer default 0,
  is_banned boolean default false,
  ban_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── CLI Auth Sessions ──
-- Device flow for CLI authentication
create table public.cli_auth_sessions (
  id uuid primary key default uuid_generate_v4(),
  session_id text unique not null,  -- Random session code from CLI
  user_id uuid references auth.users(id) on delete cascade,
  status text default 'pending' check (status in ('pending', 'completed', 'expired')),
  api_key_id uuid references public.api_keys(id) on delete set null,
  temp_api_key text,  -- Temporary storage for plain API key (deleted after CLI retrieves it)
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '10 minutes')
);

-- ── Indexes ──
create index idx_user_profiles_username on public.user_profiles (username);
create index idx_user_profiles_github on public.user_profiles (github_username);
create index idx_cli_sessions_session_id on public.cli_auth_sessions (session_id);
create index idx_cli_sessions_status on public.cli_auth_sessions (status, expires_at);

-- ── Row Level Security ──
alter table public.user_profiles enable row level security;
alter table public.cli_auth_sessions enable row level security;

-- Profiles: anyone can read, only owner can modify
create policy "Profiles are publicly readable"
  on public.user_profiles for select
  using (true);

create policy "Users can update their own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

-- CLI sessions: only the user who completed auth can read their own
create policy "Users can see their own sessions"
  on public.cli_auth_sessions for select
  using (auth.uid() = user_id);

-- Service role can manage sessions (for Edge Functions)
create policy "Service can manage sessions"
  on public.cli_auth_sessions for all
  using (auth.role() = 'service_role');

-- ── Functions ──

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, display_name)
  values (NEW.id, NEW.raw_user_meta_data->>'full_name');
  return NEW;
end;
$$ language plpgsql security definer;

-- Trigger on auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Update user profile updated_at
create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.update_updated_at();

-- Increment manifest count for user
create or replace function public.increment_manifest_count(p_user_id uuid)
returns void as $$
begin
  update public.user_profiles
  set manifests_published = manifests_published + 1
  where id = p_user_id;
end;
$$ language plpgsql security definer;

-- Get user info for whoami
create or replace function public.get_user_info(p_user_id uuid)
returns json as $$
declare
  result json;
begin
  select json_build_object(
    'user_id', up.id,
    'email', u.email,
    'username', up.username,
    'display_name', up.display_name,
    'trust_tier', up.trust_tier,
    'manifests_published', up.manifests_published,
    'total_downloads', up.total_downloads,
    'created_at', up.created_at
  ) into result
  from public.user_profiles up
  join auth.users u on u.id = up.id
  where up.id = p_user_id;

  return result;
end;
$$ language plpgsql security definer;

-- Clean expired CLI sessions
create or replace function public.cleanup_expired_sessions()
returns void as $$
begin
  update public.cli_auth_sessions
  set status = 'expired'
  where status = 'pending' and expires_at < now();

  delete from public.cli_auth_sessions
  where created_at < now() - interval '1 day';
end;
$$ language plpgsql security definer;
