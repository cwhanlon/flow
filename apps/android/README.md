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
# 1. web dist for the target server
VITE_API_BASE=https://app.freeflow.im pnpm --filter @flow/web build

# 2. sync + assemble
pnpm --filter @flow/android apk:debug
# → apps/android/android/app/build/outputs/apk/debug/app-debug.apk
```

Then `adb install -r app-debug.apk`. The server must list the app's origin:
`FLOW_CORS_ORIGINS=https://localhost` (see `docs/ops/DEPLOYMENT.md`).

### Against a plain-http dev server on the LAN

A release-shaped WebView refuses cleartext and mixed content, so a dev build
against e.g. `http://192.168.86.20:8787` needs the relaxed config:

```sh
VITE_API_BASE=http://192.168.86.20:8787 pnpm --filter @flow/web build
pnpm --filter @flow/android apk:debug:dev     # FLOW_ANDROID_DEV=1
```

`FLOW_ANDROID_DEV=1` turns on `server.cleartext`, `android.allowMixedContent`
and remote WebView inspection (`chrome://inspect`). Dev builds only.

## Phone over Wi-Fi from the build VM

Hyper-V has no USB passthrough. Android 11+: Developer options → Wireless
debugging → *Pair device with pairing code*, then on the VM
`adb pair <ip>:<pair-port>` and `adb connect <ip>:<port>`.
