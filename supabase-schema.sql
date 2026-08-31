-- Crane Inspection Executive Package 1.3
-- Run this in Supabase SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'operator' check (role in ('operator','executive')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cranes (
  id uuid primary key default gen_random_uuid(),
  owner text not null default '',
  lessee text not null default '',
  project text not null default '',
  site_address text not null default '',
  make text not null default '',
  model text not null default '',
  serial text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.crane_assignments (
  id uuid primary key default gen_random_uuid(),
  crane_id uuid not null references public.cranes(id) on delete cascade,
  operator_id uuid not null references public.profiles(id) on delete cascade,
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (crane_id, operator_id)
);

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  crane_id uuid not null references public.cranes(id) on delete cascade,
  operator_id uuid not null references public.profiles(id) on delete restrict,
  inspection_date date not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'incomplete' check (status in ('incomplete','complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (crane_id, inspection_date)
);

create index if not exists crane_assignments_operator_idx on public.crane_assignments(operator_id);
create index if not exists inspections_crane_date_idx on public.inspections(crane_id, inspection_date);
create index if not exists inspections_operator_idx on public.inspections(operator_id);

alter table public.profiles enable row level security;
alter table public.cranes enable row level security;
alter table public.crane_assignments enable row level security;
alter table public.inspections enable row level security;

-- Helper: executive users can see everything.
create or replace function public.is_executive()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'executive' and p.active); $$;

-- Profiles
create policy "profiles self read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_executive());
create policy "profiles executive manage" on public.profiles for all to authenticated using (public.is_executive()) with check (public.is_executive());

-- Cranes: executives see/manage all; operators see active assigned cranes.
create policy "cranes read assigned" on public.cranes for select to authenticated
using (public.is_executive() or exists(select 1 from public.crane_assignments a where a.crane_id = id and a.operator_id = auth.uid() and a.active));
create policy "cranes executive manage" on public.cranes for all to authenticated using (public.is_executive()) with check (public.is_executive());

-- Assignments: executives manage; operators can read their own assignments.
create policy "assignments read" on public.crane_assignments for select to authenticated
using (public.is_executive() or operator_id = auth.uid());
create policy "assignments executive manage" on public.crane_assignments for all to authenticated using (public.is_executive()) with check (public.is_executive());

-- Inspections: executives see/manage all; operators only assigned cranes and their own rows.
create policy "inspections read" on public.inspections for select to authenticated
using (public.is_executive() or (operator_id = auth.uid() and exists(select 1 from public.crane_assignments a where a.crane_id = inspections.crane_id and a.operator_id = auth.uid() and a.active)));
create policy "inspections insert operator" on public.inspections for insert to authenticated
with check (public.is_executive() or (operator_id = auth.uid() and exists(select 1 from public.crane_assignments a where a.crane_id = inspections.crane_id and a.operator_id = auth.uid() and a.active)));
create policy "inspections update" on public.inspections for update to authenticated
using (public.is_executive() or (operator_id = auth.uid() and exists(select 1 from public.crane_assignments a where a.crane_id = inspections.crane_id and a.operator_id = auth.uid() and a.active)))
with check (public.is_executive() or (operator_id = auth.uid() and exists(select 1 from public.crane_assignments a where a.crane_id = inspections.crane_id and a.operator_id = auth.uid() and a.active)));
create policy "inspections executive delete" on public.inspections for delete to authenticated using (public.is_executive());

-- Create profile row automatically for new auth users as operators.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin insert into public.profiles(id, full_name, role) values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'operator') on conflict (id) do nothing; return new; end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
