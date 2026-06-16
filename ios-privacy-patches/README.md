# iOS Privacy-Manifest Patch Kit

Fixes the three App Store Connect **ITMS-91061** warnings for
`GoogleSignIn`, `GTMSessionFetcher`, and `GTMAppAuth` **without upgrading
Capacitor**.

## What's here

| File | Purpose |
|---|---|
| `PrivacyInfo-GoogleSignIn.xcprivacy`      | Manifest for the GoogleSignIn framework |
| `PrivacyInfo-GTMSessionFetcher.xcprivacy` | Manifest for the GTMSessionFetcher framework |
| `PrivacyInfo-GTMAppAuth.xcprivacy`        | Manifest for the GTMAppAuth framework |
| `Podfile.snippet.rb`                      | Pod version pins + `post_install` hook (persistent) |
| `patch-privacy-manifests.sh`              | One-shot injector (run after `pod install`) |

The manifests declare the **Required Reason API** categories each SDK uses
(`UserDefaults / CA92.1`, `FileTimestamp / C617.1`, `DiskSpace / E174.1`,
`SystemBootTime / 35F9.1`) and assert no tracking and no collected data — the
same content Google now ships upstream.

## Recommended setup (persistent — survives every `pod install`)

1. Open `ios/App/Podfile`.
2. Inside `target 'App' do`, add:
   ```ruby
   pod 'GoogleSignIn',      '~> 7.1'
   pod 'GTMSessionFetcher', '~> 3.4'
   pod 'GTMAppAuth',        '~> 4.1'
   ```
   These are the first versions that ship `PrivacyInfo.xcprivacy` upstream,
   and they're ABI-compatible with Capacitor 5 and 6 — **no Capacitor upgrade
   required**.
3. Copy the `post_install do |installer| … end` block from
   `Podfile.snippet.rb` into the Podfile (merge with any existing
   `post_install`). It re-embeds the local manifests as a safety net in case
   a transitive dep pulls an older Pod.
4. Run:
   ```bash
   cd ios/App
   pod install --repo-update
   ```
5. Open `App.xcworkspace`, **Product → Clean Build Folder**, archive, upload.

## Quick fallback (one-shot, no Podfile edits)

If you just need to ship today:
```bash
cd ios/App && pod install
../../ios-privacy-patches/patch-privacy-manifests.sh
```
Then archive and upload. Re-run the script after each `pod install`.

## Verifying

After archiving, in the `.xcarchive` you should find:
```
Products/Applications/App.app/Frameworks/GoogleSignIn.framework/PrivacyInfo.xcprivacy
Products/Applications/App.app/Frameworks/GTMSessionFetcher.framework/PrivacyInfo.xcprivacy
Products/Applications/App.app/Frameworks/GTMAppAuth.framework/PrivacyInfo.xcprivacy
```
If those three files are present, App Store Connect will stop emitting
ITMS-91061 for them.

## Adding a NEW third-party SDK (preventing ITMS-91061 regressions)

The Podfile's `post_install` hook now runs `audit-privacy-manifests.sh`
after every `pod install`, and Codemagic runs it again in CI. If any pod
listed in `known-pods.txt` is installed **without** `PrivacyInfo.xcprivacy`
and we don't ship a local patch for it, the build **fails immediately** —
so an SDK can never sneak through to App Store Connect and trigger
ITMS-91061 silently.

When adding a new SDK that Apple flags as "commonly used":

1. Create `ios-privacy-patches/PrivacyInfo-<PodName>.xcprivacy` (copy an
   existing one and edit the `NSPrivacyAccessedAPITypes` to match the
   SDK's documented required-reason API usage).
2. Add `<PodName>` to `known-pods.txt` if it isn't already there.
3. (Optional) Extend the `manifests` hash in `ios/App/Podfile` if you want
   the framework to embed your patched manifest into its `.framework` (not
   just the app bundle).
4. Run `cd ios/App && pod install`. The audit script will auto-copy your
   new manifest and confirm everything is wired up.

If the audit prints `MISSING manifest for tracked pod 'X'`, follow steps
1–4 for that pod.
