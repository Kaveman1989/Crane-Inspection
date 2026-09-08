# Crane Inspection

Production GitHub Pages build for the Tower Crane Inspection PWA.

## Workspaces
- **Operator / Technician:** assigned crane inspection, dates, checklist, remarks, photos, signature, and save.
- **Executive / Management:** fleet, operators, assignments, inspections, reports, photos, and management review.

## Login behavior
An account with `role = executive` can enter **both** the Executive/Management workspace and the Operator Inspection workspace. An account with `role = operator` is restricted to the Operator workspace.

## Supabase
The browser uses the publishable Supabase key from `config.js`. Never place a service-role key in this repository.
