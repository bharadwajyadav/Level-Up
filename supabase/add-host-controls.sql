-- Run this once in Supabase SQL Editor after the original schema.sql.
alter table public.tracker_rooms add column if not exists host_token text;
create table if not exists public.tracker_bans (
  room_code text not null references public.tracker_rooms(code) on delete cascade,
  client_id text not null,
  removed_at timestamptz not null default now(),
  primary key (room_code, client_id)
);
alter table public.tracker_bans enable row level security;
-- No public policies: Vercel's server-side key alone manages bans.
