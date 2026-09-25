# Project Memory

## Core
Use #db252d as primary; supplied pen-check logo transparent except enlarged on white Android/iOS splash screens.
Disable all haptic and vibration feedback across the entire app, including navigation, buttons, sheets, gestures, and reminders.
AI features NEVER gated by subscription/trial/RevenueCat/Stripe. Only sign-in + daily cap + concurrency lock. `src/utils/aiFeatureGuard.ts` is locked.
Markdown shortcuts in notes editor body must always be active — never gate on the settings toggle.
No-argument slash shortcuts in notes editor should auto-run when complete, especially on mobile.

## Memories
- [AI guard locked](mem://constraints/ai-guard-locked) — aiFeatureGuard.ts is the single truth; hasPaidAi always true; no billing hooks
- [Web clipper full page capture](mem://preferences/web-clipper-clean-article) — full page, start-to-finish, read-only embed; never excerpt-only or editable
- [Sketch tool persistence](mem://features/sketch-editor/tool-persistence) — sketch editor state
- [Markdown always on](mem://preferences/markdown-shortcuts-always-on) — RichTextEditor markdown shortcuts must not depend on the settings toggle
- [Slash shortcuts auto-run](mem://preferences/slash-shortcuts-auto-run) — RichTextEditor slash commands should not require extra Space/Enter when complete
- [Flowist red brand system](mem://design-brand-refresh) — Red primary, pen-check logo, transparent placements, white native splash screens
