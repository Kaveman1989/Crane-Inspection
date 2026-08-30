# Tower Crane Inspection App

This is the converted standalone Progressive Web App (PWA).

## What changed
- Installable as an app on supported phones/tablets/desktops.
- Works offline after the first load.
- Inspection data and signatures save locally on the device.
- Keeps the existing checklist, calendar, remarks, initials, operator name, and signature features.

## Important
A PWA must be served from HTTPS (or localhost) for service-worker/offline installation to work. Opening `index.html` directly from the Files app will still display the form, but the install/offline features require a web host.

## iPhone
Open the hosted app in Safari, tap Share, then **Add to Home Screen**.

## Android
Open the hosted app in Chrome and use **Install app** / **Add to Home screen** when offered.
