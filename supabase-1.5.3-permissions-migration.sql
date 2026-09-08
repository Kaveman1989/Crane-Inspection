-- Crane Inspection 1.5.3
-- Explicit workspace permissions. Safe to run on the existing schema.

alter table public.profiles
  add column if not exists can_inspect boolean not null default true;

alter table public.profiles
  add column if not exists can_manage boolean not null default false;

update public.profiles
set can_inspect = coalesce(can_inspect, true),
    can_manage = case
      when role in ('executive','manager') then true
      else coalesce(can_manage, false)
    end;

create or replace function public.is_executive()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active = true
      and (can_manage = true or role in ('executive','manager'))
  );
$$;

grant execute on function public.is_executive() to authenticated;

-- Ensure an executive/manager can also enter the inspection workspace.
-- Existing operator/inspection policies remain unchanged.
