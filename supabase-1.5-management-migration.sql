-- Crane Inspection 1.5 migration
-- IMPORTANT: This is intentionally additive/idempotent. It does not recreate or delete your existing tables.

create table if not exists public.inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  crane_id uuid not null references public.cranes(id) on delete cascade,
  operator_id uuid not null references public.profiles(id) on delete cascade,
  inspection_date date not null,
  storage_path text not null,
  file_name text not null default '',
  mime_type text not null default '',
  created_at timestamptz not null default now()
);

alter table public.inspection_photos enable row level security;

drop policy if exists "inspection photos executive read" on public.inspection_photos;
create policy "inspection photos executive read" on public.inspection_photos for select to authenticated using (public.is_executive());

drop policy if exists "inspection photos operator read own" on public.inspection_photos;
create policy "inspection photos operator read own" on public.inspection_photos for select to authenticated using (operator_id = auth.uid());

drop policy if exists "inspection photos operator insert" on public.inspection_photos;
create policy "inspection photos operator insert" on public.inspection_photos for insert to authenticated
with check (operator_id = auth.uid() and exists(select 1 from public.crane_assignments a where a.crane_id = inspection_photos.crane_id and a.operator_id = auth.uid() and a.active));

drop policy if exists "inspection photos executive delete" on public.inspection_photos;
create policy "inspection photos executive delete" on public.inspection_photos for delete to authenticated using (public.is_executive());

-- Private Storage bucket for inspection images.
insert into storage.buckets (id,name,public)
values ('inspection-photos','inspection-photos',false)
on conflict (id) do nothing;

drop policy if exists "inspection photos storage read" on storage.objects;
create policy "inspection photos storage read" on storage.objects for select to authenticated
using (bucket_id = 'inspection-photos');

drop policy if exists "inspection photos storage insert" on storage.objects;
create policy "inspection photos storage insert" on storage.objects for insert to authenticated
with check (bucket_id = 'inspection-photos');

drop policy if exists "inspection photos storage delete executive" on storage.objects;
create policy "inspection photos storage delete executive" on storage.objects for delete to authenticated
using (bucket_id = 'inspection-photos' and public.is_executive());

-- Keep the reliable assigned-crane RPC current.
create or replace function public.get_my_assigned_cranes()
returns table (assignment_id uuid, crane_id uuid, starts_on date, ends_on date, assignment_active boolean, owner text, lessee text, project text, site_address text, make text, model text, serial text, crane_active boolean)
language sql stable security definer set search_path = public
as $$
  select a.id,c.id,a.starts_on,a.ends_on,a.active,c.owner,c.lessee,c.project,c.site_address,c.make,c.model,c.serial,c.active
  from public.crane_assignments a join public.cranes c on c.id=a.crane_id
  where a.operator_id=auth.uid() and a.active=true and c.active=true
    and (a.starts_on is null or a.starts_on<=current_date)
    and (a.ends_on is null or a.ends_on>=current_date)
  order by c.project;
$$;
grant execute on function public.get_my_assigned_cranes() to authenticated;
