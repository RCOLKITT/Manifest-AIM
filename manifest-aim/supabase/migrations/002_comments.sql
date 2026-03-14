-- Comments Schema for Manifest Pages
-- Allows authenticated users to discuss manifests

-- ── Comments Table ──
create table public.comments (
  id uuid primary key default uuid_generate_v4(),
  manifest_id uuid not null references public.manifests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade, -- For replies
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Indexes ──
create index idx_comments_manifest on public.comments (manifest_id, created_at desc);
create index idx_comments_user on public.comments (user_id);
create index idx_comments_parent on public.comments (parent_id);

-- ── Row Level Security ──
alter table public.comments enable row level security;

-- Anyone can read comments
create policy "Comments are publicly readable"
  on public.comments for select
  using (true);

-- Authenticated users can create comments
create policy "Authenticated users can comment"
  on public.comments for insert
  with check (auth.uid() = user_id);

-- Users can update their own comments
create policy "Users can update their comments"
  on public.comments for update
  using (auth.uid() = user_id);

-- Users can delete their own comments
create policy "Users can delete their comments"
  on public.comments for delete
  using (auth.uid() = user_id);

-- Auto-update updated_at
create trigger comments_updated_at
  before update on public.comments
  for each row execute function public.update_updated_at();

-- ── Function to get comments with user info ──
create or replace function public.get_manifest_comments(
  p_manifest_name text
) returns table (
  id uuid,
  content text,
  parent_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  user_id uuid,
  user_email text,
  user_name text,
  user_avatar text
) as $$
begin
  return query
  select
    c.id,
    c.content,
    c.parent_id,
    c.created_at,
    c.updated_at,
    c.user_id,
    u.email as user_email,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) as user_name,
    coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture') as user_avatar
  from public.comments c
  join auth.users u on c.user_id = u.id
  join public.manifests m on c.manifest_id = m.id
  where m.name = p_manifest_name
  order by c.created_at asc;
end;
$$ language plpgsql security definer;
