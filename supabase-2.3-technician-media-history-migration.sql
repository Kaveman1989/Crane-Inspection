-- Crane Inspection 2.3 — technician media access and parts-request history
-- Run after migrations 2.1 and 2.2.
-- Reuses existing inspection_photos records and inspection-photos Storage bucket for video.

create table if not exists public.parts_request_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.parts_requests(id) on delete cascade,
  crane_id uuid not null references public.cranes(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('created', 'status_changed', 'request_updated', 'migration_snapshot')),
  old_status text,
  new_status text,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists parts_request_history_crane_idx
  on public.parts_request_history(crane_id, created_at desc);
create index if not exists parts_request_history_request_idx
  on public.parts_request_history(request_id, created_at desc);

create or replace function public.log_parts_request_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  change_type text;
  detail text;
begin
  if tg_op = 'INSERT' then
    change_type := 'created';
    detail := coalesce(new.notes, '');
    insert into public.parts_request_history
      (request_id, crane_id, actor_id, event_type, old_status, new_status, notes)
    values
      (new.id, new.crane_id, auth.uid(), change_type, null, new.status, detail);
    return new;
  end if;

  if old.status is distinct from new.status then
    change_type := 'status_changed';
    detail := coalesce(new.notes, '');
  elsif old.notes is distinct from new.notes then
    change_type := 'request_updated';
    detail := coalesce(new.notes, '');
  else
    return new;
  end if;

  insert into public.parts_request_history
    (request_id, crane_id, actor_id, event_type, old_status, new_status, notes)
  values
    (new.id, new.crane_id, auth.uid(), change_type, old.status, new.status, detail);
  return new;
end;
$$;

revoke all on function public.log_parts_request_history() from public, anon, authenticated;

drop trigger if exists trg_parts_request_history on public.parts_requests;
create trigger trg_parts_request_history
after insert or update of status, notes on public.parts_requests
for each row execute function public.log_parts_request_history();

insert into public.parts_request_history
  (request_id, crane_id, actor_id, event_type, old_status, new_status, notes, created_at)
select r.id, r.crane_id, r.requested_by, 'migration_snapshot', null, r.status,
       coalesce(r.notes, ''), r.created_at
from public.parts_requests r
where not exists (
  select 1 from public.parts_request_history h
  where h.request_id = r.id
);

alter table public.parts_request_history enable row level security;

drop policy if exists "managers read parts request history" on public.parts_request_history;
create policy "managers read parts request history" on public.parts_request_history
  for select to authenticated using (public.is_fleet_manager());

drop policy if exists "technicians read active parts request history" on public.parts_request_history;
create policy "technicians read active parts request history" on public.parts_request_history
  for select to authenticated using (
    public.is_technician() and exists (
      select 1 from public.cranes c
      where c.id = crane_id and c.active = true
    )
  );

drop policy if exists "requesters read own parts request history" on public.parts_request_history;
create policy "requesters read own parts request history" on public.parts_request_history
  for select to authenticated using (
    exists (
      select 1 from public.parts_requests r
      where r.id = request_id and r.requested_by = auth.uid()
    )
  );

grant select on public.parts_request_history to authenticated;

create or replace function public.delete_parts_requests_for_crane()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.parts_requests where crane_id = old.id;
  return old;
end;
$$;

revoke all on function public.delete_parts_requests_for_crane() from public, anon, authenticated;

drop trigger if exists trg_delete_parts_requests_for_crane on public.cranes;
create trigger trg_delete_parts_requests_for_crane
before delete on public.cranes
for each row execute function public.delete_parts_requests_for_crane();

drop policy if exists "technicians read active crane inspections" on public.inspections;
create policy "technicians read active crane inspections" on public.inspections
  for select to authenticated using (
    public.is_technician() and exists (
      select 1 from public.cranes c
      where c.id = crane_id and c.active = true
    )
  );

drop policy if exists "technicians read active crane inspection media records" on public.inspection_photos;
create policy "technicians read active crane inspection media records" on public.inspection_photos
  for select to authenticated using (
    public.is_technician() and exists (
      select 1 from public.cranes c
      where c.id = crane_id and c.active = true
    )
  );

drop policy if exists "technicians read active crane parts requests" on public.parts_requests;
create policy "technicians read active crane parts requests" on public.parts_requests
  for select to authenticated using (
    public.is_technician() and exists (
      select 1 from public.cranes c
      where c.id = crane_id and c.active = true
    )
  );

drop policy if exists "technicians read active crane parts request items" on public.parts_request_items;
create policy "technicians read active crane parts request items" on public.parts_request_items
  for select to authenticated using (
    public.is_technician() and exists (
      select 1 from public.parts_requests r
      join public.cranes c on c.id = r.crane_id
      where r.id = request_id and c.active = true
    )
  );

grant select on public.inspections, public.inspection_photos,
  public.parts_requests, public.parts_request_items to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspection-photos', 'inspection-photos', false, 104857600,
  array['image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif',
        'video/mp4','video/quicktime','video/webm','video/x-m4v','video/3gpp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), excluded.file_size_limit),
  allowed_mime_types = (
    select array_agg(distinct mime_type)
    from unnest(coalesce(storage.buckets.allowed_mime_types, array[]::text[]) || excluded.allowed_mime_types) as mime_types(mime_type)
  );

drop policy if exists "technicians read active crane inspection media files" on storage.objects;
create policy "technicians read active crane inspection media files" on storage.objects
  for select to authenticated using (
    bucket_id = 'inspection-photos'
    and public.is_technician()
    and exists (
      select 1
      from public.inspection_photos media
      join public.cranes c on c.id = media.crane_id
      where media.storage_path = name and c.active = true
    )
  );
