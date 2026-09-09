#!/bin/bash
# Build the Android app bundle and upload it to a Google Play track. One
# command, from the repo root:
#
#   apps/android/tools/release-android.sh                  # internal testing track
#   apps/android/tools/release-android.sh --track beta     # another track
#   apps/android/tools/release-android.sh --dry-run        # print the plan, build nothing
#   apps/android/tools/release-android.sh 57               # explicit version code (escape hatch)
#
# THE VERSION CODE COMES FROM THE LIVE PLAY TRACK, NOT FROM A FILE.
#
# Same ruling as release-ios.sh / release-macos.sh: a number in the repo
# records an intention, and the server that owns the number has run ahead of
# the repo before. So the script asks Play for the largest version code any
# track has carried (apps/android/tools/play.mjs latest-code), adds one,
# builds that commit with the number on the Gradle command line — which
# outranks anything in build.gradle, and nothing in the repo changes — and
# tags `android-v<code>` only after the upload succeeds. A tag therefore
# always means "this commit is on Play", and names the commit.
#
# apps/android/VERSION holds only the marketing version (the "0.1.0" a user
# reads); bump it when the product does, never per upload.
#
# Needs (see apps/android/README.md, "Release"):
#   FLOW_ANDROID_KEYSTORE / _KEYSTORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD
#       the *upload* key — Play App Signing holds the real one
#   FLOW_PLAY_SERVICE_ACCOUNT   path to a service account JSON key with
#       release rights on the app
#   FLOW_ANDROID_API_BASE       the server the build talks to (default
#       https://app.freeflow.im); baked into the web bundle
#   JDK 21, Android SDK 36 (ANDROID_HOME), Node 20+, pnpm
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
TOOLS="$REPO_ROOT/apps/android/tools"
GRADLE_DIR="$REPO_ROOT/apps/android/android"
AAB="$GRADLE_DIR/app/build/outputs/bundle/release/app-release.aab"
TAG_PREFIX=android-v
API_BASE=${FLOW_ANDROID_API_BASE:-https://app.freeflow.im}

fail() { echo "release-android: $*" >&2; exit 1; }
note() { echo "==> $*"; }

# --- Args --------------------------------------------------------------------
DRY_RUN=0
ASSUME_YES=0
ALLOW_DIRTY=0
DRAFT=0
TRACK=internal
EXPLICIT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --draft) DRAFT=1 ;;
    --track) shift; TRACK=${1:-}; [ -n "$TRACK" ] || fail "--track needs a value" ;;
    --track=*) TRACK=${1#--track=} ;;
    -*) fail "unknown flag: $1" ;;
    *) EXPLICIT="$1" ;;
  esac
  shift
done
case "$TRACK" in internal|alpha|beta|production) ;; *) fail "track must be internal, alpha, beta or production (got '$TRACK')" ;; esac

# --- Refuse to ship from a state you can't reason about later ----------------
cd "$REPO_ROOT"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$ALLOW_DIRTY" != 1 ]; then
  [ "$BRANCH" = "main" ] || fail "on branch '$BRANCH' — releases are cut from main (--allow-dirty to override)."
  [ -z "$(git status --porcelain)" ] || fail "working tree is dirty. Commit or stash first."
  git fetch origin --quiet
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
    || fail "main is not in sync with origin/main. Pull (or push) first."
fi

# --- Credentials, checked before any build time is spent -----------------------
for v in FLOW_ANDROID_KEYSTORE FLOW_ANDROID_KEYSTORE_PASSWORD FLOW_ANDROID_KEY_ALIAS FLOW_ANDROID_KEY_PASSWORD; do
  [ "$DRY_RUN" = 1 ] || [ -n "${!v:-}" ] || fail "$v is not set (the upload keystore; apps/android/README.md, Release)."
done
[ "$DRY_RUN" = 1 ] || [ -f "${FLOW_ANDROID_KEYSTORE:-/nonexistent}" ] || fail "keystore not found: ${FLOW_ANDROID_KEYSTORE:-}"
[ "$DRY_RUN" = 1 ] || [ -f "${FLOW_PLAY_SERVICE_ACCOUNT:-/nonexistent}" ] || fail "FLOW_PLAY_SERVICE_ACCOUNT is not a readable file."

# --- The version code -----------------------------------------------------------
MARKETING=$(tr -d '[:space:]' < apps/android/VERSION)
[ -n "$MARKETING" ] || fail "apps/android/VERSION is empty."
if [ -n "$EXPLICIT" ]; then
  printf '%s' "$EXPLICIT" | grep -Eq '^[0-9]+$' || fail "'$EXPLICIT' is not a whole number."
  CODE="$EXPLICIT"
elif [ "$DRY_RUN" = 1 ] && [ ! -f "${FLOW_PLAY_SERVICE_ACCOUNT:-/nonexistent}" ]; then
  CODE="<live track + 1>"
else
  LIVE=$(node "$TOOLS/play.mjs" latest-code) || fail "could not read the live track."
  CODE=$((LIVE + 1))
fi
HOST=$(printf '%s' "$API_BASE" | sed -E 's#^[a-z]+://##; s#[/:].*$##')
TAG="$TAG_PREFIX$CODE"

echo
note "Releasing $MARKETING ($CODE) to the $TRACK track from $(git rev-parse --short HEAD), talking to $API_BASE"
LAST_TAG=$(git tag -l "$TAG_PREFIX*" | sort -V | tail -1)
if [ -n "$LAST_TAG" ]; then
  echo "    $(git rev-list --count "$LAST_TAG..HEAD") commit(s) since $LAST_TAG:"
  git log --oneline "$LAST_TAG..HEAD" | sed 's/^/      /'
else
  echo "    No previous $TAG_PREFIX* tag — recent commits:"
  git log --oneline -8 | sed 's/^/      /'
fi
echo "    Tag to create: $TAG"
echo

if [ "$DRY_RUN" = 1 ]; then
  note "Dry run — nothing built, nothing uploaded."
  exit 0
fi

if [ "$ASSUME_YES" != 1 ]; then
  [ -t 0 ] || fail "not a terminal — pass --yes if you mean to upload unattended."
  read -r -p "Build and upload $MARKETING ($CODE) to the $TRACK track? [y/N] " reply
  case "$reply" in [yY]*) ;; *) fail "cancelled." ;; esac
fi

# --- Web bundle for this server, synced into the Gradle project ------------------
note "Building the web client for $API_BASE"
VITE_API_BASE="$API_BASE" VITE_FLOW_SHELL=android pnpm --filter @flow/shared build >/dev/null
VITE_API_BASE="$API_BASE" VITE_FLOW_SHELL=android pnpm --filter @flow/web build
# FLOW_ANDROID_DEV must be unset: a release never relaxes the WebView.
env -u FLOW_ANDROID_DEV pnpm --filter @flow/android sync

# --- Bundle, upload; bump and retry if Play already holds the number -------------
MAX_TRIES=4
for try in $(seq 1 $MAX_TRIES); do
  note "Bundling $MARKETING ($CODE)  [attempt $try]"
  (cd "$GRADLE_DIR" && ./gradlew --no-daemon -q bundleRelease \
      -PflowVersionCode="$CODE" \
      -PflowVersionName="$MARKETING" \
      -PflowAppLinkHost="${HOST:-app.freeflow.im}") || fail "bundle failed."
  [ -f "$AAB" ] || fail "no bundle at $AAB"

  note "Uploading to the $TRACK track"
  set +e
  node "$TOOLS/play.mjs" upload "$AAB" "$TRACK" "$MARKETING ($CODE)" $([ "$DRAFT" = 1 ] && echo --draft)
  rc=$?
  set -e
  if [ $rc -eq 0 ]; then
    note "Uploaded $MARKETING ($CODE)"
    break
  fi
  if [ $rc -eq 3 ]; then
    CODE=$((CODE + 1))
    TAG="$TAG_PREFIX$CODE"
    note "Play already holds that version code — retrying with $CODE"
    [ "$try" = "$MAX_TRIES" ] && fail "still clashing after $MAX_TRIES attempts."
    continue
  fi
  fail "upload failed, and not because of the version code."
done

# --- Tag it, but only now that it uploaded -----------------------------------------
note "Tagging $TAG"
git tag -a "$TAG" -m "Android $MARKETING ($CODE) → $TRACK"
git push origin "$TAG"

echo
note "Done. $MARKETING ($CODE) is on the $TRACK track$([ "$DRAFT" = 1 ] && echo ' as a draft release')."
echo "      Tag: $TAG -> $(git rev-parse --short HEAD)"
echo "      Play processes it for a few minutes; testers on the track get it after review, if the track needs one."
