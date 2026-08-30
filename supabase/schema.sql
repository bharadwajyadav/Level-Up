-- Run this once in Supabase: SQL Editor > New query.
create table if not exists public.tracker_rooms (
  code text primary key check (char_length(code) between 4 and 12),
  created_at timestamptz not null default now()
);
create table if not exists public.tracker_members (
  room_code text not null references public.tracker_rooms(code) on delete cascade,
  client_id text not null,
  display_name text not null check (char_length(display_name) between 1 and 32),
  joined_at timestamptz not null default now(),
  primary key (room_code, client_id)
);
create table if not exists public.tracker_activity (
  room_code text not null references public.tracker_rooms(code) on delete cascade,
  client_id text not null,
  day_key text not null,
  done jsonb not null default '[]'::jsonb,
  pending jsonb not null default '[]'::jsonb,
  intensity numeric not null default 0 check (intensity between 0 and 1),
  updated_at timestamptz not null default now(),
  primary key (room_code, client_id, day_key),
  foreign key (room_code, client_id) references public.tracker_members(room_code, client_id) on delete cascade
);
alter table public.tracker_rooms enable row level security;
alter table public.tracker_members enable row level security;
alter table public.tracker_activity enable row level security;
-- No public policies: only Vercel's server-side service key can access these tables.
