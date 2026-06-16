#!/usr/bin/env bash
# Audit installed CocoaPods for PrivacyInfo.xcprivacy.
#
# Behavior:
#   - Reads known-pods.txt (Apple's commonly-used third-party SDK list we track).
#   - For each tracked Pod actually installed under ios/App/Pods/:
#       * if PrivacyInfo.xcprivacy is present anywhere in the Pod tree -> OK
#       * else, if we ship a local patch named PrivacyInfo-<PodName>.xcprivacy -> auto-copy + OK
#       * else -> FAIL (exit 1) so CI / pod install stops before App Store upload.
#   - Untracked Pods are reported but do NOT fail the build.
#
# Usage:  bash ios-privacy-patches/audit-privacy-manifests.sh [path/to/ios/App]
set -euo pipefail

ROOT="${1:-ios/App}"
PODS="$ROOT/Pods"
SRC="$(cd "$(dirname "$0")" && pwd)"
KNOWN="$SRC/known-pods.txt"

if [ ! -d "$PODS" ]; then
  echo "audit: Pods folder not found at $PODS — run 'pod install' first." >&2
  exit 1
fi
if [ ! -f "$KNOWN" ]; then
  echo "audit: known-pods.txt not found at $KNOWN" >&2
  exit 1
fi

fail=0
patched=0
ok=0
missing_unknown=()

# Read tracked pod names (skip blanks/comments)
tracked=()
while IFS= read -r line; do
  name="${line%%#*}"
  name="$(echo "$name" | xargs || true)"
  [ -z "$name" ] && continue
  tracked+=("$name")
done < "$KNOWN"

for pod in "${tracked[@]}"; do
  pod_dir="$PODS/$pod"
  [ -d "$pod_dir" ] || continue   # not installed, skip

  if find "$pod_dir" -type f -name "PrivacyInfo.xcprivacy" -print -quit | grep -q .; then
    ok=$((ok+1))
    continue
  fi

  patch_file="$SRC/PrivacyInfo-$pod.xcprivacy"
  if [ -f "$patch_file" ]; then
    cp "$patch_file" "$pod_dir/PrivacyInfo.xcprivacy"
    echo "audit: patched $pod (local manifest copied)"
    patched=$((patched+1))
    continue
  fi

  echo "audit: MISSING manifest for tracked pod '$pod' and no local patch found." >&2
  missing_unknown+=("$pod")
  fail=1
done

if [ $fail -ne 0 ]; then
  echo "" >&2
  echo "==========================================================" >&2
  echo "ITMS-91061 RISK: ye pods missing PrivacyInfo.xcprivacy hain:" >&2
  for p in "${missing_unknown[@]}"; do echo "  - $p" >&2; done
  echo "" >&2
  echo "Fix steps:" >&2
  echo "  1. ios-privacy-patches/PrivacyInfo-<PodName>.xcprivacy banayein" >&2
  echo "  2. known-pods.txt mein pod ka naam confirm karein" >&2
  echo "  3. Podfile post_install hook update karein agar zaroori ho" >&2
  echo "  4. cd ios/App && pod install --repo-update" >&2
  echo "==========================================================" >&2
  exit 1
fi

echo "audit: OK — $ok pods already shipped manifests, $patched patched locally."