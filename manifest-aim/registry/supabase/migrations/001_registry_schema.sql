-- Manifest Registry Schema
-- Supabase PostgreSQL migration

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";  -- For fuzzy search

-- ── Manifest Packages ──
-- Each row is a unique manifest package (e.g., "enterprise-typescript")
create table public.manifests (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  display_name text,
  description text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  repository_url text,
  homepage_url text,
  license text,
  tags text[] default '{}',
  domain text,                          -- software-engineering, devops, content-creation, etc.
  downloads integer default 0,
  stars integer default 0,
  is_official boolean default false,    -- Vaspera-published manifests
  is_verified boolean default false,    -- Community-reviewed manifests
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Manifest Versions ──
-- Each row is a published version of a manifest
create table public.manifest_versions (
  id uuid primary key default uuid_generate_v4(),
  manifest_id uuid not null references public.manifests(id) on delete cascade,
  version text not null,                -- semver (e.g., "1.2.3")
  aim_version text not null default '1.0',
  content jsonb not null,               -- Full manifest YAML parsed as JSON
  readme text,                          -- Markdown README for this version
  changelog text,                       -- What changed in this version

  -- Computed metadata (extracted from content for fast queries)
  rule_count integer default 0,
  capability_count integer default 0,
  knowledge_count integer default 0,
  enforcement_types text[] default '{}', -- ['static', 'semantic', 'injected']

  -- Quality signals
  schema_valid boolean default true,
  checksum text not null,               -- SHA-256 of the manifest content

  -- Dependency tracking
  dependencies jsonb default '[]',      -- [{name, version_constraint}]

  published_at timestamptz default now(),

  unique(manifest_id, version)
);

-- ── Downloads tracking ──
create table public.downloads (
  id uuid primary key default uuid_generate_v4(),
  manifest_id uuid not null references public.manifests(id) on delete cascade,
  version_id uuid references public.manifest_versions(id) on delete set null,
  downloaded_at timestamptz default now(),
  user_agent text,
  cli_version text
);

-- ── Stars / Favorites ──
create table public.stars (
  user_id uuid not null references auth.users(id) on delete cascade,
  manifest_id uuid not null references public.manifests(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, manifest_id)
);

-- ── API Keys for CLI authentication ──
create table public.api_keys (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_hash text not null unique,        -- bcrypt hash of the key
  key_prefix text not null,             -- First 8 chars for identification
  scopes text[] default '{publish,install}',
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- ── Indexes ──

-- Full-text search on manifest name, description, and tags
create index idx_manifests_search on public.manifests using gin (
  (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(display_name, '')))
);

-- Tag-based filtering
create index idx_manifests_tags on public.manifests using gin (tags);

-- Domain filtering
create index idx_manifests_domain on public.manifests (domain);

-- Popular manifests (for homepage/trending)
create index idx_manifests_downloads on public.manifests (downloads desc);
create index idx_manifests_stars on public.manifests (stars desc);

-- Version lookup
create index idx_versions_manifest on public.manifest_versions (manifest_id, version);
create index idx_versions_published on public.manifest_versions (published_at desc);

-- Download analytics
create index idx_downloads_manifest on public.downloads (manifest_id, downloaded_at);

-- API key lookup
create index idx_api_keys_user on public.api_keys (user_id);

-- ── Row Level Security ──

alter table public.manifests enable row level security;
alter table public.manifest_versions enable row level security;
alter table public.downloads enable row level security;
alter table public.stars enable row level security;
alter table public.api_keys enable row level security;

-- Manifests: anyone can read, only owner can modify
create policy "Manifests are publicly readable"
  on public.manifests for select
  using (true);

create policy "Users can create manifests"
  on public.manifests for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update their manifests"
  on public.manifests for update
  using (auth.uid() = owner_id);

create policy "Owners can delete their manifests"
  on public.manifests for delete
  using (auth.uid() = owner_id);

-- Versions: anyone can read, only manifest owner can publish
create policy "Versions are publicly readable"
  on public.manifest_versions for select
  using (true);

create policy "Manifest owners can publish versions"
  on public.manifest_versions for insert
  with check (
    exists (
      select 1 from public.manifests
      where id = manifest_id and owner_id = auth.uid()
    )
  );

-- Downloads: anyone can record, only aggregated reads
create policy "Anyone can record downloads"
  on public.downloads for insert
  with check (true);

-- Stars: authenticated users can star/unstar
create policy "Stars are publicly readable"
  on public.stars for select
  using (true);

create policy "Users can star manifests"
  on public.stars for insert
  with check (auth.uid() = user_id);

create policy "Users can unstar manifests"
  on public.stars for delete
  using (auth.uid() = user_id);

-- API keys: only owner can see/manage their keys
create policy "Users can see their own keys"
  on public.api_keys for select
  using (auth.uid() = user_id);

create policy "Users can create keys"
  on public.api_keys for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their keys"
  on public.api_keys for delete
  using (auth.uid() = user_id);

-- ── Functions ──

-- Increment download count atomically
create or replace function public.record_download(
  p_manifest_name text,
  p_version text default null,
  p_user_agent text default null,
  p_cli_version text default null
) returns void as $$
declare
  v_manifest_id uuid;
  v_version_id uuid;
begin
  select id into v_manifest_id from public.manifests where name = p_manifest_name;
  if v_manifest_id is null then
    raise exception 'Manifest not found: %', p_manifest_name;
  end if;

  if p_version is not null then
    select id into v_version_id
    from public.manifest_versions
    where manifest_id = v_manifest_id and version = p_version;
  end if;

  insert into public.downloads (manifest_id, version_id, user_agent, cli_version)
  values (v_manifest_id, v_version_id, p_user_agent, p_cli_version);

  update public.manifests set downloads = downloads + 1 where id = v_manifest_id;
end;
$$ language plpgsql security definer;

-- Search manifests with full-text + tag filtering
create or replace function public.search_manifests(
  p_query text default null,
  p_tags text[] default null,
  p_domain text default null,
  p_limit integer default 20,
  p_offset integer default 0
) returns table (
  id uuid,
  name text,
  description text,
  tags text[],
  domain text,
  downloads integer,
  stars integer,
  latest_version text,
  is_official boolean,
  owner_id uuid
) as $$
begin
  return query
  select
    m.id, m.name, m.description, m.tags, m.domain,
    m.downloads, m.stars,
    (select mv.version from public.manifest_versions mv
     where mv.manifest_id = m.id
     order by mv.published_at desc limit 1) as latest_version,
    m.is_official,
    m.owner_id
  from public.manifests m
  where
    (p_query is null or to_tsvector('english', coalesce(m.name, '') || ' ' || coalesce(m.description, '')) @@ plainto_tsquery('english', p_query))
    and (p_tags is null or m.tags @> p_tags)
    and (p_domain is null or m.domain = p_domain)
  order by
    m.is_official desc,
    m.downloads desc
  limit p_limit
  offset p_offset;
end;
$$ language plpgsql security definer;

-- Update star count trigger
create or replace function public.update_star_count() returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update public.manifests set stars = stars + 1 where id = NEW.manifest_id;
  elsif TG_OP = 'DELETE' then
    update public.manifests set stars = stars - 1 where id = OLD.manifest_id;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger on_star_change
  after insert or delete on public.stars
  for each row execute function public.update_star_count();

-- Auto-update updated_at
create or replace function public.update_updated_at() returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

create trigger manifests_updated_at
  before update on public.manifests
  for each row execute function public.update_updated_at();
