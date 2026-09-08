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
  and only backgrounds when the page has nothing to close.
- **Keyboard**: `adjustResize`, so the composer rises with the IME.
- **Downloads**: http(s) links go to Downloads/ via DownloadManager with a
  notification. Gap: files the web client fetches itself (authenticated
  `/v1/files`, handed to the WebView as `blob:` URLs) do not reach
  DownloadManager yet — they open in place; saving them is follow-up work.
- **Reconnect**: the WebSocket reconnects the moment the OS reports the network
  back, on top of the existing watchdog.
- **Status bar** in the workspace purple (static; per-workspace tint needs a
  plugin call the web client does not make yet).
- **File chooser**: Capacitor's WebView handles `<input type=file>` with the
  system picker; `CAMERA` is declared so `capture` can offer the camera.

Unit tests: `pnpm --filter @flow/android test` (JUnit, JVM only) and the web
side's `shell.test.ts` / `serverPicker.test.ts` / `ws.test.ts`.

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

## Phone over Wi-Fi from the build VM

Hyper-V has no USB passthrough. Android 11+: Developer options → Wireless
debugging → *Pair device with pairing code*, then on the VM
`adb pair <ip>:<pair-port>` and `adb connect <ip>:<port>`.
