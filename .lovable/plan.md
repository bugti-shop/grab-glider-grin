# Paywall, Haptics, and Task View Fixes

## Changes
- Replace the paywall throne artwork with the approved crowned Flowist logo version and remove the dark/black hero treatment obscuring it.
- Disable all haptic and vibration feedback globally, then remove direct native haptic calls that bypass the shared helper.
- Make Timeline Board the default Today Tasks view when no saved preference exists, while preserving a user's explicit saved choice.
- Render tasks with no priority using a neutral gray completion ring in every task layout.
- Verify the paywall and Today Tasks behavior in the browser, and check the current build diagnostics.

## Technical Notes
- Keep the existing premium purchase flow and pricing unchanged.
- Use the shared haptics utility as a no-op safety layer, plus remove direct `Haptics.impact` / `navigator.vibrate` calls.
- Change only the unset/default view value; existing persisted view selections remain respected.
