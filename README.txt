Crane Inspection 1.4.2 — Assigned Crane Fix

This version fixes the remaining operator-side assigned-crane issue by adding a Supabase SECURITY DEFINER RPC named get_my_assigned_cranes().

1. Replace the GitHub files with this package.
2. In Supabase SQL Editor, run the COMPLETE supabase-schema.sql from this package. It is safe to run the added CREATE OR REPLACE FUNCTION / GRANT statements; if your existing tables/policies are already installed, do not worry if earlier CREATE POLICY statements report that they already exist—run the new RPC statements at the bottom if needed.
3. In particular, make sure this has run:
   create or replace function public.get_my_assigned_cranes() ...
   grant execute on function public.get_my_assigned_cranes() to authenticated;
4. Deploy/publish GitHub Pages and then hard refresh the operator browser (Ctrl+F5). If the PWA is open on a phone, close it and reopen it.

The operator page now asks Supabase for the assigned crane through the trusted RPC, including the assignment dates and crane details. This prevents RLS from filtering the crane out after the assignment exists.
