-- Run once in Supabase SQL Editor after enabling Google Auth. This schema is private by default.
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 48),
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.tracker_personal_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 1 and 48),
  created_by uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')), joined_at timestamptz not null default now(), primary key(group_id,user_id)
);
create table if not exists public.group_invites (
  code text primary key default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)), group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade, expires_at timestamptz, max_uses integer not null default 100 check(max_uses > 0), uses integer not null default 0 check(uses >= 0), created_at timestamptz not null default now()
);
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(), requester_id uuid not null references auth.users(id) on delete cascade, recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted')), created_at timestamptz not null default now(),
  unique(requester_id,recipient_id), check(requester_id <> recipient_id)
);
create table if not exists public.sharing_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade, share_consistency boolean not null default false,
  share_tasks boolean not null default false, share_files boolean not null default false, updated_at timestamptz not null default now()
);
create table if not exists public.shared_snapshots (user_id uuid primary key references auth.users(id) on delete cascade, snapshot jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table if not exists public.shared_tasks (user_id uuid primary key references auth.users(id) on delete cascade, tasks jsonb not null default '[]'::jsonb, updated_at timestamptz not null default now());
create table if not exists public.shared_files (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null check(char_length(file_name) between 1 and 180), storage_path text not null unique, created_at timestamptz not null default now()
);

-- These narrowly scoped helpers prevent recursive RLS checks. They are not callable by anonymous users.
create or replace function private.is_group_member(target_group uuid) returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(select 1 from public.group_members where group_id=target_group and user_id=(select auth.uid()))
$$;
create or replace function private.is_group_owner(target_group uuid) returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(select 1 from public.group_members where group_id=target_group and user_id=(select auth.uid()) and role='owner')
$$;
create or replace function private.can_view_shared(owner uuid, item text) returns boolean language sql stable security definer set search_path = public, auth as $$
  select owner=(select auth.uid()) or (exists(select 1 from public.sharing_preferences p where p.user_id=owner and case item when 'consistency' then p.share_consistency when 'tasks' then p.share_tasks when 'files' then p.share_files end) and exists(select 1 from public.friendships f where f.status='accepted' and ((f.requester_id=owner and f.recipient_id=(select auth.uid())) or (f.recipient_id=owner and f.requester_id=(select auth.uid())))))
$$;
revoke all on function private.is_group_member(uuid), private.is_group_owner(uuid), private.can_view_shared(uuid,text) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_group_member(uuid), private.is_group_owner(uuid), private.can_view_shared(uuid,text) to authenticated;

-- Secure invitation redemption; callers only supply a code and can join once.
create or replace function public.accept_group_invite(invite_code text) returns void language plpgsql security definer set search_path = public, auth as $$
declare invitation public.group_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into invitation from public.group_invites where code=upper(trim(invite_code)) for update;
  if not found or (invitation.expires_at is not null and invitation.expires_at < now()) or invitation.uses >= invitation.max_uses then raise exception 'Invitation is invalid or expired'; end if;
  insert into public.group_members(group_id,user_id) values(invitation.group_id,auth.uid()) on conflict do nothing;
  update public.group_invites set uses=uses+1 where code=invitation.code;
end $$;
revoke all on function public.accept_group_invite(text) from public;
grant execute on function public.accept_group_invite(text) to authenticated;

alter table public.profiles enable row level security; alter table public.tracker_personal_state enable row level security;
alter table public.groups enable row level security; alter table public.group_members enable row level security; alter table public.group_invites enable row level security;
alter table public.friendships enable row level security; alter table public.sharing_preferences enable row level security;
alter table public.shared_snapshots enable row level security; alter table public.shared_tasks enable row level security; alter table public.shared_files enable row level security;
revoke all on table public.profiles, public.tracker_personal_state, public.groups, public.group_members, public.group_invites, public.friendships, public.sharing_preferences, public.shared_snapshots, public.shared_tasks, public.shared_files from anon;
grant select,insert,update,delete on table public.profiles, public.tracker_personal_state, public.groups, public.group_members, public.group_invites, public.friendships, public.sharing_preferences, public.shared_snapshots, public.shared_tasks, public.shared_files to authenticated;

create policy "authenticated profiles" on public.profiles for select to authenticated using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check((select auth.uid())=id);
create policy "own profile update" on public.profiles for update to authenticated using((select auth.uid())=id) with check((select auth.uid())=id);
create policy "own state" on public.tracker_personal_state for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "group members read groups" on public.groups for select to authenticated using(private.is_group_member(id));
create policy "create groups" on public.groups for insert to authenticated with check((select auth.uid())=created_by);
create policy "group members read" on public.group_members for select to authenticated using(private.is_group_member(group_id));
create policy "creator adds owner" on public.group_members for insert to authenticated with check(((select auth.uid())=user_id and role='owner' and exists(select 1 from public.groups where id=group_id and created_by=(select auth.uid()))) or private.is_group_owner(group_id));
create policy "owners manage members" on public.group_members for delete to authenticated using(private.is_group_owner(group_id));
create policy "owners manage invites" on public.group_invites for all to authenticated using(private.is_group_owner(group_id)) with check(private.is_group_owner(group_id));
create policy "friends read own requests" on public.friendships for select to authenticated using((select auth.uid()) in (requester_id,recipient_id));
create policy "request friendship" on public.friendships for insert to authenticated with check((select auth.uid())=requester_id and status='pending');
create policy "recipient accepts" on public.friendships for update to authenticated using((select auth.uid())=recipient_id) with check((select auth.uid())=recipient_id and status='accepted');
create policy "participants remove" on public.friendships for delete to authenticated using((select auth.uid()) in (requester_id,recipient_id));
create policy "own preferences" on public.sharing_preferences for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "shared snapshot read" on public.shared_snapshots for select to authenticated using(private.can_view_shared(user_id,'consistency'));
create policy "own snapshot write" on public.shared_snapshots for insert to authenticated with check((select auth.uid())=user_id);
create policy "own snapshot update" on public.shared_snapshots for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "shared tasks read" on public.shared_tasks for select to authenticated using(private.can_view_shared(user_id,'tasks'));
create policy "own tasks write" on public.shared_tasks for insert to authenticated with check((select auth.uid())=user_id);
create policy "own tasks update" on public.shared_tasks for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "shared files read" on public.shared_files for select to authenticated using(private.can_view_shared(user_id,'files'));
create policy "own files write" on public.shared_files for insert to authenticated with check((select auth.uid())=user_id);
create policy "own files update" on public.shared_files for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "own files delete" on public.shared_files for delete to authenticated using((select auth.uid())=user_id);

insert into storage.buckets(id,name,public,file_size_limit) values('shared-files','shared-files',false,15728640) on conflict(id) do nothing;
create policy "owners upload shared files" on storage.objects for insert to authenticated with check(bucket_id='shared-files' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy "owners manage shared files" on storage.objects for update to authenticated using(bucket_id='shared-files' and owner_id=(select auth.uid()::text)) with check(bucket_id='shared-files' and owner_id=(select auth.uid()::text));
create policy "owners delete shared files" on storage.objects for delete to authenticated using(bucket_id='shared-files' and owner_id=(select auth.uid()::text));
create policy "owners or friends read shared files" on storage.objects for select to authenticated using(bucket_id='shared-files' and private.can_view_shared(((storage.foldername(name))[1])::uuid,'files'));

create index if not exists group_members_user_id_idx on public.group_members(user_id);
create index if not exists friendships_requester_idx on public.friendships(requester_id);
create index if not exists friendships_recipient_idx on public.friendships(recipient_id);
create index if not exists shared_files_user_id_idx on public.shared_files(user_id);
