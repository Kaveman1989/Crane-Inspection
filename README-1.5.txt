Crane Inspection 1.5

Major changes:
- Operator side is inspection-only: assigned crane, date/calendar, 29-point checklist, remarks, initials, signature, inspection photos.
- Management/Executive side now owns management review, action owner/status/notes, reports, master inspection review, CSV export, photo review, assignments, accounts, and fleet administration.
- Operator inspection records save to Supabase by crane + inspection date. Save errors are displayed instead of being hidden.
- Operator local storage is namespaced by authenticated user + crane to prevent cross-crane/date collisions.
- Private Supabase Storage bucket inspection-photos and inspection_photos metadata support inspection images.

Setup:
1. Upload the files to the GitHub Pages repo.
2. Run supabase-1.5-management-migration.sql in Supabase SQL Editor. It is additive/idempotent.
3. Deploy/wait for GitHub Pages.
4. Hard refresh the operator and management pages.
