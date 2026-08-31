CRANE INSPECTION 1.3 — ROLE-BASED EXECUTIVE PACKAGE

This build separates the application into three workspaces:

1) index.html — secure portal / role chooser
2) operator.html — operator workspace: only assigned cranes, daily inspection, sign-off, cloud save
3) executive.html — executive workspace: all cranes, operators, assignments, fleet status, action register, reports

BACKEND: SUPABASE

The browser app is designed to use Supabase Auth + Postgres Row Level Security.
Run supabase-schema.sql in the Supabase SQL Editor, then fill config.js with the project's URL and publishable/anon key.

IMPORTANT SECURITY
- Never put a Supabase service_role key in this project.
- The browser should only use the publishable/anon key.
- RLS policies are the security boundary.

OPERATOR FLOW
- Operator signs in.
- Operator sees only cranes actively assigned to that account.
- Operator chooses an assigned crane.
- Daily inspection data syncs to the inspection table.

EXECUTIVE FLOW
- Executive signs in.
- Executive sees all active cranes and inspections.
- Executive can add cranes and assign/unassign operators.
- Executive dashboard aggregates completion, pass rate, faults and open follow-ups.
- Executive reports can be printed/saved as PDF.

USER CREATION
Create operator/executive accounts in Supabase Auth. New users receive an operator profile automatically.
Promote selected accounts to executive by updating public.profiles.role to 'executive' in the Supabase Table Editor.

DEMO MODE
If config.js is blank, the portal opens in local demo mode so the UI can be tested. Demo mode is not shared between devices and is not production security.

NEXT PRODUCTION STEPS
- Add an Edge Function for executive operator invitations/password reset workflows.
- Sync signatures/photos to Supabase Storage.
- Add audit trail and immutable inspection history.
- Add multi-company tenancy if multiple clients will use the system.


ACCOUNT CREATION / EXECUTIVE OPERATOR ACCESS
- The executive app includes Create User. It calls the Supabase Edge Function at /functions/v1/create-account.
- Deploy supabase/functions/create-account/index.ts as an Edge Function named create-account.
- The function uses the built-in SUPABASE_SERVICE_ROLE_KEY on the server; never place that secret in config.js or GitHub.
- Executives can open the operator workspace and inspect/submit from any active crane.
- If you re-run the SQL schema on an existing project, the inspection insert policy is updated to allow executive-mode submissions.
