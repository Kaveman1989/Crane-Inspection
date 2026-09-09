Crane Inspection 1.9 — Action Register

Major changes:
- Management Action Register is now a real status workflow instead of a flat list:
  New -> Acknowledged -> In Progress -> Resolved -> Closed.
- Each faulted checklist item becomes its own tracked deficiency (not bundled per
  inspection the way the old register worked), with priority, assigned-to, due date,
  management notes, and a full history log of who acknowledged/resolved/closed it and when.
- Resolved is not the same as gone: a resolved item stays visible in the active register
  with a Close action, and only moves into the separate Action History section once
  closed. Anything in History can be reopened.
- Crane File has a new Deficiencies tab showing that crane's open and closed items directly,
  plus an Open Deficiencies count in the crane's overview stats.
- operator.html: re-applied the Save Inspection button fix and hardened every listener in
  bindStaticListeners() so a missing element degrades gracefully instead of silently
  breaking the signature pad and photo buttons again (this had regressed twice).

Setup:
1. Upload executive.html and operator.html to the GitHub Pages repo, replacing the existing ones.
2. Run supabase-1.9-action-register-migration.sql in the Supabase SQL Editor. It is
   additive/idempotent and safe to re-run. It creates management_actions, backfills
   existing faults already in your inspection history, and installs a trigger so new
   faults are tracked automatically going forward.
3. Deploy/wait for GitHub Pages, then hard refresh both pages.

Notes:
- The old per-inspection "Management review" panel (Follow-up / Action owner / Management
  notes, on the Inspection records side) is untouched and still works the same way for a
  whole day's sign-off. The new register tracks each deficiency separately and is the
  place to work going forward for anything that needs follow-up.
- Old action_owner/follow-up data on existing inspections was not migrated into the new
  table — there's no clean one-to-one mapping from a whole-day field to individual
  deficiencies. The backfill instead reconstructs fresh entries directly from each
  inspection's fault checkmarks, so anything already flagged shows up in the new register
  starting at "New."
