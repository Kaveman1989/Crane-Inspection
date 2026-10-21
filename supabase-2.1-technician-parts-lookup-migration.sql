-- Crane Inspection 2.1 — technician crane lookup and parts requests
-- Additive migration. Run in Supabase SQL Editor before deploying technician.html.
-- No part numbers or serial-specific manuals are seeded by this migration.

alter table public.profiles
  add column if not exists can_technician boolean not null default false;

create or replace function public.is_fleet_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and (p.can_manage = true or p.role in ('executive', 'manager'))
  );
$$;

create or replace function public.is_technician()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and (p.can_technician = true or p.can_manage = true or p.role in ('executive', 'manager'))
  );
$$;

revoke all on function public.is_fleet_manager() from public, anon;
revoke all on function public.is_technician() from public, anon;
grant execute on function public.is_fleet_manager() to authenticated;
grant execute on function public.is_technician() to authenticated;

create table if not exists public.crane_model_catalog (
  model_key text primary key,
  manufacturer text not null,
  model_name text not null,
  aliases text[] not null default '{}',
  identity_status text not null default 'verify_nameplate'
    check (identity_status in ('confirmed_name', 'verify_nameplate')),
  verification_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.crane_model_catalog
  (model_key, manufacturer, model_name, aliases, identity_status, verification_note)
values
  ('potain-igo-t-85-a', 'Potain', 'Igo T 85 A', array['Igo T 85', 'Igo T85', 'Igo T85A'], 'confirmed_name', 'Potain product listing uses Igo T 85 A. Confirm serial-specific configuration before ordering parts.'),
  ('potain-igo-t-130', 'Potain', 'Igo T 130', array['Igo T130'], 'confirmed_name', 'Confirm serial-specific configuration before ordering parts.'),
  ('potain-mr-130', 'Potain', 'MR 130', array['MR130'], 'verify_nameplate', 'Confirm the exact model designation from the crane nameplate before using this catalog key.'),
  ('potain-mdt-219', 'Potain', 'MDT 219', array['MDT219'], 'verify_nameplate', 'Confirm the exact model, jib/control configuration, and serial number before using this catalog key.')
on conflict (model_key) do nothing;

create or replace function public.resolve_crane_model_key(p_make text, p_model text)
returns text
language sql
stable
set search_path = public
as $$
  select m.model_key
  from public.crane_model_catalog m
  where regexp_replace(lower(coalesce(p_make, '')), '[^a-z0-9]', '', 'g') =
        regexp_replace(lower(m.manufacturer), '[^a-z0-9]', '', 'g')
    and exists (
      select 1
      from unnest(m.aliases || array[m.model_name]) as aliases(alias_name)
      where regexp_replace(lower(coalesce(p_model, '')), '[^a-z0-9]', '', 'g') =
        regexp_replace(lower(alias_name), '[^a-z0-9]', '', 'g')
    )
  order by length(m.model_name) desc
  limit 1;
$$;

grant execute on function public.resolve_crane_model_key(text, text) to authenticated;

create table if not exists public.crane_reference_documents (
  id uuid primary key default gen_random_uuid(),
  model_key text not null references public.crane_model_catalog(model_key) on update cascade,
  document_type text not null check (document_type in ('operator_manual', 'service_manual', 'parts_catalog', 'diagram', 'other')),
  title text not null,
  revision text not null default '',
  serial_range text not null default '',
  language text not null default '',
  verification_status text not null default 'awaiting_review'
    check (verification_status in ('serial_specific', 'reference_only', 'awaiting_review')),
  source_url text not null default '',
  storage_path text not null default '',
  notes text not null default '',
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crane_reference_documents_model_idx
  on public.crane_reference_documents(model_key, document_type);

insert into public.crane_reference_documents
  (model_key, document_type, title, language, verification_status, source_url, notes)
select refs.model_key, refs.document_type, refs.title, refs.language,
       'reference_only', refs.source_url, refs.notes
from (values
  ('potain-igo-t-85-a', 'other', 'Igo T 85 A Product Guide', 'MULTI', 'https://www.manitowoc.com/media/13106/download', 'Manufacturer product guide; not a serial-specific service or parts manual.'),
  ('potain-igo-t-85-a', 'other', 'Igo T 85 A Metric Data Sheet', 'MULTI', 'https://www.manitowoc.com/media/13107/download', 'Manufacturer data sheet; not a serial-specific service or parts manual.'),
  ('potain-igo-t-85-a', 'other', 'Igo T 85 A ASME Data Sheet', 'MULTI', 'https://www.manitowoc.com/media/13108/download', 'Manufacturer data sheet; not a serial-specific service or parts manual.'),
  ('potain-igo-t-130', 'other', 'Igo T 130 Metric Data Sheet', 'MULTI', 'https://www.manitowoc.com/media/13118/download', 'Manufacturer data sheet; not a serial-specific service or parts manual.'),
  ('potain-igo-t-130', 'other', 'Igo T 130 ASME Data Sheet', 'MULTI', 'https://www.manitowoc.com/media/13119/download', 'Manufacturer data sheet; not a serial-specific service or parts manual.'),
  ('potain-mr-130', 'other', 'Manitowoc Manuals Portal', '', 'https://www.manitowoc.com/manuals', 'MR 130 was not found in the current public Potain model list. Confirm exact nameplate model and request serial-specific documents.'),
  ('potain-mdt-219', 'other', 'Manitowoc Manuals Portal', '', 'https://www.manitowoc.com/manuals', 'Confirm jib/control configuration and serial number; portal documents are reference-only unless verified against the crane.')
) as refs(model_key, document_type, title, language, source_url, notes)
where not exists (
  select 1 from public.crane_reference_documents existing
  where existing.model_key = refs.model_key and existing.source_url = refs.source_url
);

create table if not exists public.crane_parts_catalog (
  id uuid primary key default gen_random_uuid(),
  model_key text not null references public.crane_model_catalog(model_key) on update cascade,
  part_number text not null,
  description text not null,
  system_name text not null default '',
  fitment_status text not null default 'unverified'
    check (fitment_status in ('verified', 'unverified')),
  serial_range text not null default '',
  applicable_serials text[] not null default '{}',
  source_reference text not null default '',
  source_document_id uuid references public.crane_reference_documents(id) on delete set null,
  notes text not null default '',
  active boolean not null default true,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crane_parts_catalog_model_idx
  on public.crane_parts_catalog(model_key, active, fitment_status);
create index if not exists crane_parts_catalog_number_idx
  on public.crane_parts_catalog(part_number);

create table if not exists public.parts_requests (
  id uuid primary key default gen_random_uuid(),
  crane_id uuid not null references public.cranes(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'submitted'
    check (status in ('submitted', 'reviewing', 'ordered', 'fulfilled', 'closed', 'cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists parts_requests_crane_idx on public.parts_requests(crane_id, created_at desc);
create index if not exists parts_requests_requester_idx on public.parts_requests(requested_by, created_at desc);

create table if not exists public.parts_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.parts_requests(id) on delete cascade,
  catalog_part_id uuid references public.crane_parts_catalog(id) on delete set null,
  part_number text not null default '',
  description text not null,
  quantity integer not null check (quantity > 0),
  notes text not null default '',
  fitment_verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists parts_request_items_request_idx on public.parts_request_items(request_id);

alter table public.crane_model_catalog enable row level security;
alter table public.crane_reference_documents enable row level security;
alter table public.crane_parts_catalog enable row level security;
alter table public.parts_requests enable row level security;
alter table public.parts_request_items enable row level security;

drop policy if exists "technicians read crane model catalog" on public.crane_model_catalog;
create policy "technicians read crane model catalog" on public.crane_model_catalog
  for select to authenticated using (public.is_technician());
drop policy if exists "managers manage crane model catalog" on public.crane_model_catalog;
create policy "managers manage crane model catalog" on public.crane_model_catalog
  for all to authenticated using (public.is_fleet_manager()) with check (public.is_fleet_manager());

drop policy if exists "technicians read crane reference documents" on public.crane_reference_documents;
create policy "technicians read crane reference documents" on public.crane_reference_documents
  for select to authenticated using (public.is_technician());
drop policy if exists "managers manage crane reference documents" on public.crane_reference_documents;
create policy "managers manage crane reference documents" on public.crane_reference_documents
  for all to authenticated using (public.is_fleet_manager()) with check (public.is_fleet_manager());

drop policy if exists "technicians read crane parts catalog" on public.crane_parts_catalog;
create policy "technicians read crane parts catalog" on public.crane_parts_catalog
  for select to authenticated using (public.is_technician());
drop policy if exists "managers manage crane parts catalog" on public.crane_parts_catalog;
create policy "managers manage crane parts catalog" on public.crane_parts_catalog
  for all to authenticated using (public.is_fleet_manager()) with check (public.is_fleet_manager());

drop policy if exists "technicians read active fleet for lookup" on public.cranes;
create policy "technicians read active fleet for lookup" on public.cranes
  for select to authenticated using (public.is_technician() and active = true);

drop policy if exists "requesters and managers read parts requests" on public.parts_requests;
create policy "requesters and managers read parts requests" on public.parts_requests
  for select to authenticated using (requested_by = auth.uid() or public.is_fleet_manager());
drop policy if exists "managers manage parts requests" on public.parts_requests;
create policy "managers manage parts requests" on public.parts_requests
  for all to authenticated using (public.is_fleet_manager()) with check (public.is_fleet_manager());
drop policy if exists "requesters and managers read parts request items" on public.parts_request_items;
create policy "requesters and managers read parts request items" on public.parts_request_items
  for select to authenticated using (
    public.is_fleet_manager() or exists (
      select 1 from public.parts_requests r
      where r.id = request_id and r.requested_by = auth.uid()
    )
  );
drop policy if exists "managers manage parts request items" on public.parts_request_items;
create policy "managers manage parts request items" on public.parts_request_items
  for all to authenticated using (public.is_fleet_manager()) with check (public.is_fleet_manager());

grant select on public.crane_model_catalog, public.crane_reference_documents,
  public.crane_parts_catalog, public.cranes, public.parts_requests,
  public.parts_request_items to authenticated;
grant insert, update, delete on public.crane_model_catalog,
  public.crane_reference_documents, public.crane_parts_catalog,
  public.parts_requests, public.parts_request_items to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('technician-reference-files', 'technician-reference-files', false, 104857600, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "technicians read reference files" on storage.objects;
create policy "technicians read reference files" on storage.objects
  for select to authenticated using (
    bucket_id = 'technician-reference-files' and public.is_technician()
  );
drop policy if exists "managers add reference files" on storage.objects;
create policy "managers add reference files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'technician-reference-files' and public.is_fleet_manager()
  );
drop policy if exists "managers update reference files" on storage.objects;
create policy "managers update reference files" on storage.objects
  for update to authenticated using (
    bucket_id = 'technician-reference-files' and public.is_fleet_manager()
  ) with check (
    bucket_id = 'technician-reference-files' and public.is_fleet_manager()
  );
drop policy if exists "managers delete reference files" on storage.objects;
create policy "managers delete reference files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'technician-reference-files' and public.is_fleet_manager()
  );

create or replace function public.create_parts_request(
  p_crane_id uuid,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_uuid uuid;
  item record;
  crane_make text;
  crane_model text;
  crane_serial text;
  resolved_model_key text;
  catalog_part public.crane_parts_catalog%rowtype;
begin
  if not public.is_technician() then
    raise exception 'Technician permission required';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Parts list must be an array';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception 'Parts list must contain between 1 and 50 items';
  end if;

  select c.make, c.model, c.serial into crane_make, crane_model, crane_serial
  from public.cranes c
  where c.id = p_crane_id and c.active = true;
  if not found then
    raise exception 'Active crane not found';
  end if;
  resolved_model_key := public.resolve_crane_model_key(crane_make, crane_model);

  insert into public.parts_requests (crane_id, requested_by, notes)
  values (p_crane_id, auth.uid(), coalesce(p_notes, ''))
  returning id into request_uuid;

  for item in
    select * from jsonb_to_recordset(p_items) as x(
      catalog_part_id uuid,
      part_number text,
      description text,
      quantity integer,
      notes text
    )
  loop
    if item.quantity is null or item.quantity < 1 or nullif(trim(coalesce(item.description, '')), '') is null then
      raise exception 'Every item needs a description and positive quantity';
    end if;
    if item.catalog_part_id is not null and not exists (
      select 1 from public.crane_parts_catalog p
      where p.id = item.catalog_part_id
        and p.model_key = resolved_model_key
        and p.active = true
        and p.fitment_status = 'verified'
        and (
          p.applicable_serials @> array[coalesce(crane_serial, '')]::text[]
          or p.applicable_serials @> array['*']::text[]
        )
    ) then
      raise exception 'Catalog item is not verified for this crane model';
    end if;

    if item.catalog_part_id is not null then
      select * into catalog_part
      from public.crane_parts_catalog p
      where p.id = item.catalog_part_id;
    end if;

    insert into public.parts_request_items (
      request_id, catalog_part_id, part_number, description, quantity, notes, fitment_verified
    ) values (
      request_uuid, item.catalog_part_id,
      case when item.catalog_part_id is null then coalesce(item.part_number, '') else catalog_part.part_number end,
      case when item.catalog_part_id is null then trim(item.description) else catalog_part.description end,
      item.quantity, coalesce(item.notes, ''), item.catalog_part_id is not null
    );
  end loop;

  return request_uuid;
end;
$$;

revoke all on function public.create_parts_request(uuid, text, jsonb) from public, anon;
grant execute on function public.create_parts_request(uuid, text, jsonb) to authenticated;
