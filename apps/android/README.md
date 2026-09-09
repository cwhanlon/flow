# Flow for Android

`packages/web` in a Capacitor 8 shell — the route proposed in
[`docs/design/ANDROID.md`](../../docs/design/ANDROID.md). This is phase 0:
the app builds, installs, signs in and chats against a Flow server over CORS.
No push, deep links, share target or huddle plumbing yet — those are the
later phases in that doc.

## Layout

- `capacitor.config.ts` — app id `im.freeflow.app`, name `Flow`, web assets
  from `../../packages/web/dist`.
- `android/` — the Gradle project Capacitor generated (`npx cap add android`).
  Committed, like any native project; `android/app/build/` is not.
- `android/app/debug.keystore` — a committed **debug** keystore (the
  conventional `android`/`androiddebugkey` credentials, no secret in it) so
  every debug APK, from CI or a dev box, carries the same signature and
  installs over the previous one. Release signing will be a separate,
  uncommitted keystore (phase 6).
- `assets/` — icon sources (`icon-only.png` is the iOS 1024px icon,
  `icon-background.png` the brand purple); `npx @capacitor/assets generate
  --android` regenerates `android/app/src/main/res/`.
- This package has **no `build` script**, so `pnpm -r build` (CI, Railway)
  never needs an Android SDK. The APK comes from `apk:debug` or the
  `android.yml` workflow.

## Requirements

JDK 21, Android SDK Platform 36 + Build-Tools 36, `ANDROID_HOME` set. On
SWISS that is the `flowbuild01vm` box, not the workstation
(`Documents\Claude\Misc\flowbuild-vm`). Gradle itself comes via the wrapper.

## Build a debug APK

The web bundle has to know where the server is *before* it is synced into the
APK — the shell serves it from `https://localhost`, so the same-origin default
would point at the phone itself.

```sh
# 1. web dist for the shell. VITE_FLOW_SHELL turns on the app-only behaviour
#    (server picker, hardware back, no "open the desktop app" banner);
#    VITE_API_BASE is the server the first-run picker is prefilled with.
VITE_FLOW_SHELL=android VITE_API_BASE=https://app.freeflow.im pnpm --filter @flow/web build

# 2. sync + assemble
pnpm --filter @flow/android apk:debug
# → apps/android/android/app/build/outputs/apk/debug/app-debug.apk
```

Then `adb install -r app-debug.apk`. The server must list the app's origin:
`FLOW_CORS_ORIGINS=https://localhost` (see `docs/ops/DEPLOYMENT.md`).

Version: `versionCode` is `1` for a local build; CI passes
`-PflowVersionCode=$(git rev-list --count HEAD)` — the same derivation as
`apps/ios/tools/release-ios.sh` — so nothing is ever bumped in a PR.

### Against a plain-http dev server on the LAN

A release-shaped WebView refuses cleartext and mixed content, so a dev build
against e.g. `http://192.168.86.20:8787` needs the relaxed config:

```sh
VITE_FLOW_SHELL=android VITE_API_BASE=http://192.168.86.20:8787 pnpm --filter @flow/web build
pnpm --filter @flow/android apk:debug:dev     # FLOW_ANDROID_DEV=1
```

`FLOW_ANDROID_DEV=1` turns on `server.cleartext`, `android.allowMixedContent`
and remote WebView inspection (`chrome://inspect`). Dev builds only.

## What the shell does (phase 1)

- **Server picker** on first run — prefilled with the build's default, editable,
  checked against `/v1/config` before it is kept; "Change" on the sign-in
  screen reopens it. The choice persists in the app's storage, so the server
  baked into the build is only a default.
- **Hardware back**: thread → side panel → drawer, then the app goes to the
  background (never exits). `MainActivity` asks the page (`window.__flowBack`)
  and only backgrounds when the page has nothing to close. Overlays close on
  BACK the way they close on Escape (`useBackToClose`): the shared `Modal`,
  the help viewer, the lightbox. A bespoke overlay that handles its own
  Escape should call the same hook.
- **Keyboard**: `adjustResize`, so the composer rises with the IME.
- **Downloads**: http(s) links go to Downloads/ via DownloadManager with a
  notification. Files the web client fetches with its own auth (`/v1/files`,
  `blob:` URLs in the page) go through the shell's one plugin,
  `FlowShell.saveFile` — MediaStore Downloads on Android 10+, the app's own
  external Downloads folder on 7–9 (no storage permission either way). The
  page calls it via `lib/download.ts` and falls back to `<a download>` in a
  browser.
- **Reconnect**: the WebSocket reconnects the moment the OS reports the network
  back, on top of the existing watchdog.
- **Status bar** in the workspace purple (static; per-workspace tint needs a
  plugin call the web client does not make yet).
- **File chooser**: Capacitor's WebView handles `<input type=file>` with the
  system picker; `CAMERA` is declared so `capture` can offer the camera.

## Links that open the app (phase 2)

- `flow://signin?code=…` — the web-to-app handoff every native client uses;
  the page exchanges the code for a session. `flow://invite/<token>` and
  `flow://join/<slug>/<token>` land on the same invite/join paths the web
  client has for those URLs.
- **Verified App Links** for `https://<server>/join/…` and `/invite/…`. The
  host is baked in at build time (`-PflowAppLinkHost`, CI derives it from
  `ANDROID_API_BASE`), and the server has to publish
  `/.well-known/assetlinks.json` with this build's signing fingerprint —
  `FLOW_ANDROID_CERT_SHA256` (see `docs/ops/DEPLOYMENT.md`). The debug
  keystore's fingerprint: `keytool -list -v -keystore android/app/debug.keystore
  -storepass android | grep SHA256`. Without it the scheme links still work;
  the https ones open in the browser.
- **Google sign-in** cannot run in a WebView, so the app's button opens the
  server's `/?native=google` page in a Chrome Custom Tab; that page mints a
  code and comes back as `flow://signin`. Needs `GOOGLE_CLIENT_ID` on the
  server, like everywhere else.
- Delivery: a link the app is launched with is parked in the plugin and
  collected once at boot (`FlowShell.consumeLaunchUrl`); one arriving while
  the page is up is pushed through `window.__flowOpenUrl` (`MainActivity.onNewIntent`).

## Push (phase 3)

- Transport is FCM, via Capacitor's `PushNotifications` plugin; the app's
  `google-services.json` (committed, not secret) names the Firebase project
  and the server's `FLOW_FCM_SERVICE_ACCOUNT` (secret) is the matching key.
  Both must come from the same project.
- On sign-in the app asks for permission, creates one notification channel
  per kind (`lib/push.ts` `ANDROID_CHANNELS` — the server's FCM driver names
  the same ids), registers with FCM and `POST /v1/me/devices` with
  `platform: 'android'`; on sign-out it `DELETE`s the token.
- The server sends the same payload it builds for iOS; the FCM driver
  translates it (title/body → tray notification on the kind's channel,
  routing keys → `data`). Muted and badge-only pushes are data-only.
- A tap opens the app and jumps to the message; a tap from a cold start is
  parked until the workspace is showing.

## Huddles and mini apps (phase 4)

- **Microphone**: Capacitor turns the page's `getUserMedia` into the Android
  prompt because `RECORD_AUDIO` is declared; nothing else to do.
- **Background call**: when a huddle starts the page tells the shell
  (`ShellHuddleBridge` → `FlowShell.setHuddleActive`), which runs
  `HuddleService` — a foreground service with the `microphone` type and an
  ongoing "In a huddle" notification — and routes audio to the speaker
  (`MODE_IN_COMMUNICATION`). Both are undone when the huddle ends.
  `FlowShell.setSpeaker` flips the route by hand.
- **Popups**: `window.open` from the page or a mini-app iframe reaches
  `FlowWebChromeClient.onCreateWindow` and goes to the system browser (Custom
  Tab); same-origin and non-web targets are dropped (`PopupPolicy`). Mini apps
  otherwise render inline in the side panel's sandboxed iframe, as on iOS.
- Debug builds export `HuddleService` so it can be driven from adb without a
  live huddle:
  `adb shell am start-foreground-service -n im.freeflow.app/.HuddleService -a im.freeflow.app.huddle.START --es title "Huddle in #general"`
  and `adb shell am startservice -n im.freeflow.app/.HuddleService -a im.freeflow.app.huddle.STOP`.
- Not in this phase: a ring while the app is closed. The server has no push
  for huddle invites yet (rings ride the WebSocket for every client); when it
  does, the `huddle` notification channel and a full-screen intent are the
  Android half.

## Share target (phase 5)

Flow is in every app's share sheet (`ACTION_SEND` / `ACTION_SEND_MULTIPLE`,
any type). `MainActivity.deliverShare` describes each shared file — display
name, type, size, from its provider — and hands text, subject and files to the
page as one payload (`ShareIntents`), parked like a launch link when the page
is not up (`FlowShell.consumeShare`) or through `window.__flowShare` when it
is. The page (`lib/share.ts`) shows **Share to Flow** — workspace, channel or
person — and stages the result into that channel's composer: the text as the
draft, the files uploaded the way picked files are. The user adds a caption
and sends; nothing is posted from the picker. Mirrors the iOS share extension
(#214/#221), including the size check against `/v1/config`'s `maxFileBytes`
before any upload.

Files are never copied: the composer reads them through Capacitor's local
server (`https://localhost/_capacitor_content_/…` → the app's ContentResolver)
while the sending app's URI grant lasts, which is the life of the activity.
The read does buffer the whole file in the WebView before the presigned PUT,
so a video near the 500 MB cap is at the mercy of the device's memory — a
native streaming upload is the fix if that bites.

Try it without another app:

```
adb shell "am start -a android.intent.action.SEND -t text/plain \
  -e android.intent.extra.SUBJECT 'Example Domain' -e android.intent.extra.TEXT https://example.com/ \
  -n im.freeflow.app/.MainActivity"
```

A file shared this way from `adb shell` fails to read (the shell's URI grant
does not reach a MediaStore item, and the sheet says so); share from the
Files or Photos app to exercise the real grant.

## Performance notes (phase 5 pass)

Measured on a Moto G Power (2020, Snapdragon 665, Android 11), debug APK,
LAN server. Repeat before a release and after a WebView-heavy change:

| What | How | Result |
| --- | --- | --- |
| Cold start to first frame | `adb shell am start -W -n im.freeflow.app/.MainActivity` after `am force-stop`, 3 runs | 1.43-1.48 s |
| Scroll through 300+ messages | `dumpsys gfxinfo im.freeflow.app reset`, 24 flings, `dumpsys gfxinfo im.freeflow.app` | 1.6 % janky frames, p50 10 ms, p99 17 ms |
| Memory, channel open | `dumpsys meminfo im.freeflow.app` | ~130 MB PSS |
| Push in Doze | `dumpsys battery unplug` + `dumpsys deviceidle force-idle`, then a mention from another user | notification in 6 s while deep-idle |

Doze needs no code: the FCM driver sends alert pushes at high priority, which
is what wakes a dozing device; the WebSocket is dead in Doze by design and
reconnects on foreground (phase 1). `dumpsys deviceidle unforce` and
`dumpsys battery reset` afterwards.

Unit tests: `pnpm --filter @flow/android test` (JUnit, JVM only) and the web
side's `shell.test.ts` / `serverPicker.test.ts` / `deepLink.test.ts` /
`push.test.ts` / `huddleShell.test.ts` / `share.test.ts` / `ws.test.ts`.

## CI: `.github/workflows/android.yml`

- Every PR touching `apps/android/**` or the web client gets a debug APK as
  a workflow artifact (login required to download). Reports, does not block.
- A push to `main` or a `feat/android-*` branch **also attaches the APK to a
  rolling pre-release** when the repository variable `ANDROID_DEV_RELEASE_TAG`
  is set — a stable, login-free link for testers:
  `https://github.com/<owner>/flow/releases/download/<tag>/flow-android-debug.apk`.
  Unset = no release is touched (upstream's default).
- Which server the APK talks to is the variable `ANDROID_API_BASE`
  (default `https://app.freeflow.im`); `ANDROID_DEV_BUILD=1` makes it a dev
  build for a plain-http target. An APK is only usable against a server that
  lists `https://localhost` in `FLOW_CORS_ORIGINS`.

## Release (phase 6)

Releasing is a separate act from merging (BUILD.md). One command, from `main`:

```
apps/android/tools/release-android.sh                # internal testing track
apps/android/tools/release-android.sh --track beta   # alpha / beta / production
apps/android/tools/release-android.sh --dry-run      # the plan, no build
```

The version code is **one more than the largest on any live Play track**
(`tools/play.mjs latest-code`), never a number in the repo; the script builds
a signed bundle with it, uploads it (`play.mjs upload`), and tags
`android-v<code>` only after the upload succeeds. `VERSION` is the marketing
version only — bump it when the product does. `android-release.yml` runs the
same script from a manual dispatch.

What it needs, and where it comes from:

| Env | What |
| --- | --- |
| `FLOW_ANDROID_KEYSTORE`, `_KEYSTORE_PASSWORD`, `_KEY_ALIAS`, `_KEY_PASSWORD` | The **upload** keystore. Generate once (`keytool -genkeypair -keyalg RSA -keysize 4096 -validity 10000`), keep it out of the repo, back it up; losing it means a key-reset request to Google. |
| `FLOW_PLAY_SERVICE_ACCOUNT` | Path to a service-account JSON key that Play Console lists as a user with release permission on the app. |
| `FLOW_ANDROID_API_BASE` | The server the build talks to (default `https://app.freeflow.im`), baked into the web bundle. |

Play Console, once per app (the human half):

1. **Create the app** in Play Console (`im.freeflow.app`), pay the developer
   registration if the account is new.
2. **Play App Signing** is on by default for a new app: when the first bundle
   is uploaded Google generates the app-signing key and registers our key as
   the upload key. Nothing to configure unless the app existed before.
3. **Service account**: Google Cloud Console → IAM → service account → JSON
   key; then Play Console → Users and permissions → invite that account's
   email with *Release to testing tracks* (and *production* when ready) on
   the app. The Publishing API must be enabled on the Cloud project.
4. **Internal testing track**: add the testers' emails; the first release
   also needs the store listing basics (name, short description, icon,
   screenshots, content rating questionnaire, privacy policy URL) before Play
   accepts a rollout. Play's UGC policy also wants in-app reporting and user
   blocking before a production listing — Flow lacks both (ANDROID.md, Risks).
5. **App Links after signing**: the server's `FLOW_ANDROID_CERT_SHA256` must
   carry Google's *app signing* certificate fingerprint (Play Console → Setup
   → App integrity → App signing key certificate), not the upload key's — a
   Play-installed build is signed with Google's key.

Local, one-off: `pnpm --filter @flow/android test:tools` runs the tooling's
unit tests (`node --test`); `--dry-run` works without any credentials.

## Phone over Wi-Fi from the build VM

Hyper-V has no USB passthrough. Android 11+: Developer options → Wireless
debugging → *Pair device with pairing code*, then on the VM
`adb pair <ip>:<pair-port>` and `adb connect <ip>:<port>`.
