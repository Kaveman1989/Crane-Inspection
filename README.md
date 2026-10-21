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

## Technician Lookup v2.1

The technician workspace adds active-fleet search, model-based references, a parts catalog, and parts requests. It recognizes Potain Igo T 85 A, Igo T 130, MR 130, and MDT 219 labels. MR 130 and MDT 219 require nameplate/configuration confirmation. The migration seeds only official product/reference links; it does not seed parts numbers or claim the public PDFs are serial-specific service manuals.

### Deployment

1. Run `supabase-2.1-technician-parts-lookup-migration.sql` in the Supabase SQL Editor. It adds the technician permission, lookup/catalog/request tables and policies, a private `technician-reference-files` Storage bucket, model aliases, official reference links, and a server-side parts-request function. It does not modify inspection records or the existing inspection-photo bucket.
2. Grant access only to intended profiles by setting `profiles.can_technician = true`. Executives/managers already qualify. For example:

	```sql
	update public.profiles
	set can_technician = true
	where id = (select id from auth.users where email = 'tech@example.com');
	```

3. Deploy `index.html`, `auth.js`, `technician.html`, `technician.js`, and `sw.js` with the existing app files. The service-worker cache name is bumped so clients fetch the new workspace.
4. Add only manufacturer/authorized documents to the private Storage bucket, then register the document in `crane_reference_documents` with its revision, serial range, and correct verification status. Store the object path (not a public URL) in `storage_path`.
5. Maintain model-specific parts in `crane_parts_catalog`. Mark `fitment_status` as `verified` only when supported by the correct serial/configuration-specific parts source. Technicians can submit typed requests without a part number; those request lines are explicitly unverified.
5. Maintain model-specific parts in `crane_parts_catalog`. Mark `fitment_status` as `verified` only when supported by the correct serial/configuration-specific parts source. Add the exact crane serial to `applicable_serials`, or use `*` only when the source confirms the part fits all serials for that model. Technicians can submit typed requests without a part number; those request lines are explicitly unverified.

Parts requests are created through `create_parts_request`, which verifies the active crane and, when a catalog item is selected, the model fitment and catalog values. The technician app cannot edit fleet, document, or catalog records. Managers can review requests and maintain catalog/storage records in Supabase. Keep using the crane's serial-specific manufacturer instructions for maintenance and repair decisions.
