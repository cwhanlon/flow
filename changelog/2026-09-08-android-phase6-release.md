# Android release engineering (ANDROID.md phase 6)

- `[android]` `apps/android/tools/release-android.sh` builds a signed app
  bundle and uploads it to a Play track; the version code is one more than
  the largest on any live track (`play.mjs`, a dependency-free Publishing API
  client), and the commit is tagged `android-v<code>` only after the upload
  succeeds — the same tag-driven ruling as macOS and iOS. `apps/android/VERSION`
  is the marketing version only.
- `[android]` Release signing reads the upload keystore from the environment;
  `android-release.yml` runs the script from a manual dispatch with the
  keystore and Play service account as secrets. Nothing releases on push.
- `[qa]` `[android]` joins the changelog platform tags and the PR
  client-impact checklist; BUILD.md has the Android row; the Parity ledger
  records Android as online-only by design.
