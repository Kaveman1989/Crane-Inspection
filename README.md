# Crane Inspection — Master Management v1.8

This package is the current full production web/PWA package.

### Management changes
- Crane File remains the primary place to work with a crane's history.
- Photos were removed from the main management dashboard and remain inside each Crane File > Photos tab.
- Inspection records are visually limited to the latest 15 by default; management can choose 25, 50, or Show all.
- Crane File > Inspection History shows the latest 20 by default and can be expanded to all history.
- Administrator/management users can permanently delete an inspection and its attached photos.
- Individual photos can be deleted from Crane File > Photos.
- Delete actions require a confirmation dialog plus typing `DELETE`.
- Executive reports are generated on demand in a browser window and are not currently stored as database records, so there is no report row to delete.
- Service-worker cache was bumped to v1.8 so GitHub Pages is less likely to keep serving the older management page.

### Important
The deletion controls are intentionally restricted to users who can access the management side. Supabase RLS/storage policies remain the actual database/storage protection.
