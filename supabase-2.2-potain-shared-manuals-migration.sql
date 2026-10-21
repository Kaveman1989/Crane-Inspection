-- Crane Inspection 2.2 — shared Potain manuals portal
-- Run after supabase-2.1-technician-parts-lookup-migration.sql.
-- One brand-wide reference is shown for every Potain crane; it is not a replacement
-- for serial-specific operator, service, or parts manuals.

insert into public.crane_model_catalog
  (model_key, manufacturer, model_name, aliases, identity_status, verification_note)
values
  ('potain-all-models', 'Potain', 'All Potain Models', array['Potain Tower Crane Manuals'], 'verify_nameplate', 'Shared manufacturer portal reference only; identify the crane by its nameplate when selecting a manual.')
on conflict (model_key) do update set
  manufacturer = excluded.manufacturer,
  model_name = excluded.model_name,
  aliases = excluded.aliases,
  identity_status = excluded.identity_status,
  verification_note = excluded.verification_note,
  updated_at = now();

insert into public.crane_reference_documents
  (model_key, document_type, title, language, verification_status, source_url, notes)
select
  'potain-all-models',
  'other',
  'Manitowoc Manuals Portal — all Potain models',
  'MULTI',
  'reference_only',
  'https://www.manitowoc.com/manuals',
  'Shared portal for available Potain operator, service, and parts documents. Select the exact model and verify document revision and crane serial range. Portal materials are reference-only unless confirmed against the crane.'
where not exists (
  select 1
  from public.crane_reference_documents d
  where d.model_key = 'potain-all-models'
    and d.source_url = 'https://www.manitowoc.com/manuals'
);
