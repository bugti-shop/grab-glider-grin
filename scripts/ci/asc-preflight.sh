#!/usr/bin/env bash
# App Store Connect preflight:
#   1. Query the latest App Store version + build number for $BUNDLE_ID.
#   2. Refuse to reuse a closed train — bump CFBundleShortVersionString to
#      the next valid value greater than the latest approved version.
#   3. Always increment CFBundleVersion so a build code is never reused.
#
# Required env: BUNDLE_ID
# Optional: app-store-connect CLI on PATH (Codemagic provides it when the
# `app_store_connect` integration is configured).

set -euo pipefail

INFO_PLIST="ios/App/App/Info.plist"
PBXPROJ="ios/App/App.xcodeproj/project.pbxproj"

: "${BUNDLE_ID:?BUNDLE_ID must be set}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
bump_patch() {
  local v="$1"
  local major minor patch
  major=$(awk -F. '{print ($1==""?0:$1)}' <<<"$v")
  minor=$(awk -F. '{print ($2==""?0:$2)}' <<<"$v")
  patch=$(awk -F. '{print ($3==""?0:$3)}' <<<"$v")
  patch=$((patch + 1))
  echo "${major}.${minor}.${patch}"
}

# Returns -1 / 0 / 1 for a<b / a==b / a>b.
vercmp() {
  python3 - "$1" "$2" <<'PY'
import sys
def parse(v):
    return [int(x) for x in (v or "").split('.') if x.isdigit()]
a, b = parse(sys.argv[1]), parse(sys.argv[2])
n = max(len(a), len(b))
a += [0] * (n - len(a))
b += [0] * (n - len(b))
print(-1 if a < b else (1 if a > b else 0))
PY
}

# ---------------------------------------------------------------------------
# Query App Store Connect (best-effort)
# ---------------------------------------------------------------------------
LATEST_APPSTORE_VERSION=""
LATEST_BUILD_NUMBER=""

if command -v app-store-connect >/dev/null 2>&1; then
  echo "==> Querying App Store Connect for $BUNDLE_ID..."

  LATEST_BUILD_NUMBER=$(app-store-connect get-latest-build-number "$BUNDLE_ID" 2>/dev/null || true)

  ASC_APPS_JSON=$(app-store-connect apps list --bundle-id-identifier "$BUNDLE_ID" --json 2>/dev/null || true)
  if [ -n "$ASC_APPS_JSON" ]; then
    APP_ID=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
    items = d if isinstance(d, list) else d.get('data', [])
    print(items[0]['id'] if items else '')
except Exception:
    print('')
" "$ASC_APPS_JSON" 2>/dev/null || echo "")

    if [ -n "$APP_ID" ]; then
      VERSIONS_JSON=$(app-store-connect apps app-store-versions "$APP_ID" --json 2>/dev/null || true)
      if [ -n "$VERSIONS_JSON" ]; then
        LATEST_APPSTORE_VERSION=$(python3 -c "
import json, sys
from functools import cmp_to_key
def parse(v):
    return [int(x) for x in (v or '').split('.') if x.isdigit()]
def cmp(a, b):
    pa, pb = parse(a), parse(b)
    n = max(len(pa), len(pb))
    pa += [0] * (n - len(pa))
    pb += [0] * (n - len(pb))
    return -1 if pa < pb else (1 if pa > pb else 0)
try:
    d = json.loads(sys.argv[1])
    items = d if isinstance(d, list) else d.get('data', [])
    vers = [it.get('attributes', {}).get('versionString', '') for it in items]
    vers = [v for v in vers if v]
    vers.sort(key=cmp_to_key(cmp), reverse=True)
    print(vers[0] if vers else '')
except Exception:
    print('')
" "$VERSIONS_JSON" 2>/dev/null || echo "")
      fi
    fi
  fi
else
  echo "WARN: app-store-connect CLI not found — using local fallback bump."
fi

echo "    Latest App Store version: '${LATEST_APPSTORE_VERSION:-unknown}'"
echo "    Latest build number     : '${LATEST_BUILD_NUMBER:-unknown}'"

# ---------------------------------------------------------------------------
# Determine current project version
# ---------------------------------------------------------------------------
CURRENT_VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$INFO_PLIST" 2>/dev/null || echo "")
if [[ -z "$CURRENT_VERSION" || "$CURRENT_VERSION" == *MARKETING_VERSION* ]]; then
  CURRENT_VERSION=$(grep -m1 "MARKETING_VERSION = " "$PBXPROJ" | sed 's/.*MARKETING_VERSION = \([^;]*\);.*/\1/')
fi
CURRENT_VERSION=${CURRENT_VERSION:-1.0.0}
echo "    Current project version : '$CURRENT_VERSION'"

# ---------------------------------------------------------------------------
# Preflight: pick next valid short version
# ---------------------------------------------------------------------------
if [ -n "$LATEST_APPSTORE_VERSION" ]; then
  CMP=$(vercmp "$CURRENT_VERSION" "$LATEST_APPSTORE_VERSION")
  if [ "$CMP" != "1" ]; then
    NEW_VERSION=$(bump_patch "$LATEST_APPSTORE_VERSION")
    echo "==> Train '$LATEST_APPSTORE_VERSION' is closed for current value — bumping to '$NEW_VERSION'."
  else
    NEW_VERSION="$CURRENT_VERSION"
    echo "==> Current '$CURRENT_VERSION' is already higher than latest approved — keeping it."
  fi
else
  NEW_VERSION=$(bump_patch "$CURRENT_VERSION")
  echo "==> No App Store data available — bumping locally to '$NEW_VERSION'."
fi

# ---------------------------------------------------------------------------
# Always increment build number
# ---------------------------------------------------------------------------
if [[ "$LATEST_BUILD_NUMBER" =~ ^[0-9]+$ ]]; then
  NEW_BUILD=$((LATEST_BUILD_NUMBER + 1))
else
  NEW_BUILD=$(( $(date +%s) / 60 ))
fi

# ---------------------------------------------------------------------------
# Apply
# ---------------------------------------------------------------------------
sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = ${NEW_VERSION};/g" "$PBXPROJ"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString ${NEW_VERSION}" "$INFO_PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string ${NEW_VERSION}" "$INFO_PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${NEW_BUILD}" "$INFO_PLIST"

echo "==================================================="
echo " CFBundleShortVersionString -> $NEW_VERSION"
echo " CFBundleVersion            -> $NEW_BUILD"
echo "==================================================="