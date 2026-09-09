-- Crane Inspection 1.9 — Action Register
-- Adds a dedicated, auditable workflow table for inspection deficiencies.
-- Additive and idempotent: safe to run alongside the existing schema.

create table if not exists public.management_actions (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  crane_id uuid not null references public.cranes(id) on delete cascade,
  item_index int not null,
  item_label text not null,
  inspection_date date not null,
  reported_by uuid references public.profiles(id) on delete set null,
  status text not null default 'new' check (status in ('new','acknowledged','in_progress','resolved','closed')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  assigned_to text not null default '',
  due_date date,
  notes text not null default '',
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, item_index)
);

create index if not exists management_actions_crane_idx on public.management_actions(crane_id);
create index if not exists management_actions_status_idx on public.management_actions(status);

alter table public.management_actions enable row level security;

drop policy if exists "management actions executive all" on public.management_actions;
create policy "management actions executive all" on public.management_actions
  for all to authenticated using (public.is_executive()) with check (public.is_executive());

-- Single source of truth for checklist item text, 0-indexed, shared by the trigger and the backfill below.
create or replace function public.checklist_item_label(idx int)
returns text
language sql immutable
as $$
  select (array[
    'Electrical power cords, main feed, junction box/splice',
    'Ground fault circuit interrupter (GFCI)',
    'ON/OFF switch (main disconnect)',
    'Crane base inspection',
    'Inspect walkways, handrails, guards, and ladders',
    'Inspect structure, pins, keepers, and mast bolts',
    'Ensure all doors, panels, and covers are in place and weather-tight',
    'Operator''s controls are functioning adequately',
    'Load moment hoist limit',
    'Load moment trolley limit',
    'Maximum load (line pull)',
    'Trolley out',
    'Trolley in',
    'Hoist up deceleration limit',
    'Hoist upper limit',
    'Hoist down limit or slack line',
    'Ensure all audio/visual indicators are functioning properly',
    'Anemometer',
    'Hoist brake is functioning',
    'Slewing brake is functioning',
    'Trolley brake (when applicable)',
    'Visually inspect load block and hook',
    'Travel brake (to rail)',
    'Rail travel forward and reverse',
    'Inspect tracks for loose connections, proper drainage, subsidence and bogie wear on travelling cranes, rail clamps, and end stops',
    'Base level (as per manufacturer''s specifications)',
    'Foundation condition (as per engineer''s specifications)',
    'Housekeeping: concrete debris, rebar dowels, signage, lights, access/egress, etc.',
    'Supervisor notified of defects or faults'
  ])[idx + 1];
$$;

-- Auto-creates a 'new' action row the first time a checklist item comes back faulted on a given
-- inspection. ON CONFLICT DO NOTHING means re-saving the same inspection (autosave, edits, etc.)
-- never resets or duplicates an action that management is already working.
create or replace function public.sync_management_actions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kv record;
  idx int;
begin
  for kv in select * from jsonb_each_text(coalesce(new.data->'day'->'checks', '{}'::jsonb)) as t(key, value)
  loop
    if kv.value = 'fault' then
      idx := kv.key::int;
      insert into public.management_actions
        (inspection_id, crane_id, item_index, item_label, inspection_date, reported_by)
      values
        (new.id, new.crane_id, idx, coalesce(public.checklist_item_label(idx), 'Checklist item ' || (idx + 1)), new.inspection_date, new.operator_id)
      on conflict (inspection_id, item_index) do nothing;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_sync_management_actions on public.inspections;
create trigger trg_sync_management_actions
after insert or update of data on public.inspections
for each row execute function public.sync_management_actions();

-- One-time backfill so existing faults already in the system show up immediately, not just new ones.
insert into public.management_actions (inspection_id, crane_id, item_index, item_label, inspection_date, reported_by)
select i.id, i.crane_id, (kv.key)::int,
       coalesce(public.checklist_item_label((kv.key)::int), 'Checklist item ' || ((kv.key)::int + 1)),
       i.inspection_date, i.operator_id
from public.inspections i
cross join lateral jsonb_each_text(coalesce(i.data->'day'->'checks', '{}'::jsonb)) as kv(key, value)
where kv.value = 'fault'
on conflict (inspection_id, item_index) do nothing;

grant execute on function public.checklist_item_label(int) to authenticated;
