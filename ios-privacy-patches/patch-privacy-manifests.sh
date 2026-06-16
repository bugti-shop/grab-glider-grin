#!/usr/bin/env bash
# Inject PrivacyInfo.xcprivacy into GoogleSignIn / GTMSessionFetcher / GTMAppAuth
# Pod source trees. Re-run any time after `pod install` if you don't use the
# Podfile post_install hook. Idempotent.
#
# Usage:  ./ios-privacy-patches/patch-privacy-manifests.sh [path/to/ios/App]
set -euo pipefail

ROOT="${1:-ios/App}"
PODS="$ROOT/Pods"
SRC="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$PODS" ]; then
  echo "❌ Pods folder not found at $PODS. Run 'pod install' first." >&2
  exit 1
fi

inject() {
  local pod_name="$1"
  local manifest="$2"
  local pod_dir="$PODS/$pod_name"
  if [ ! -d "$pod_dir" ]; then
    echo "⚠️  $pod_name not installed — skipping"
    return
  fi
  # Drop the manifest next to the pod's source so resource_bundles pick it up.
  find "$pod_dir" -type d \( -name "Sources" -o -name "$pod_name" \) -print0 \
    | head -z -n 1 \
    | xargs -0 -I {} cp "$SRC/$manifest" "{}/PrivacyInfo.xcprivacy"
  # Also drop one at the pod root so framework-style bundling finds it.
  cp "$SRC/$manifest" "$pod_dir/PrivacyInfo.xcprivacy"
  echo "✅ Patched $pod_name"
}

inject "GoogleSignIn"       "PrivacyInfo-GoogleSignIn.xcprivacy"
inject "GTMSessionFetcher"  "PrivacyInfo-GTMSessionFetcher.xcprivacy"
inject "GTMAppAuth"         "PrivacyInfo-GTMAppAuth.xcprivacy"

echo "🎉 Done. Re-archive your iOS build."
