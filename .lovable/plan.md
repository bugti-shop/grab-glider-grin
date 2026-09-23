# Flowist brand refresh

## Goal
Replace the current blue brand system with red `#db252d`, use the supplied red-and-black Flowist logo everywhere, and give Android and iOS a white splash screen.

## Changes
- Create a tightly cropped transparent logo for the app, website, dashboards, email branding, favicon, and notification/launcher assets.
- Create separate Android and iOS splash artwork with the enlarged logo centered on pure white (`#FFFFFF`).
- Regenerate web/PWA icons, Android launcher icons, and the iOS app icon from the new logo.
- Change global primary brand tokens and remaining brand-blue buttons, selections, folders, sections, cards, highlights, widgets, paywall, landing page, and contact page to `#db252d`.
- Keep genuinely semantic colors intact where color communicates status, priority, sticky-note choice, or a named theme.
- Update website and native theme/background colors, then verify the landing page and signed-in interface at desktop and mobile sizes.

## Technical details
- Use a transparent PNG/WebP generated from the uploaded 1536×1536 logo, cropped to maximize its visible size without clipping.
- App icons retain an opaque white background because Android/iOS launcher icons require a complete square icon; all ordinary logo placements use transparency.
- Splash screens use white backgrounds and enlarged, safely inset logo artwork for portrait and landscape.
