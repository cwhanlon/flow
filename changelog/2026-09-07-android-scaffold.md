# Android shell scaffold + debug-APK workflow (ANDROID.md phase 0)

- `[android]` New `apps/android`: Capacitor 8 shell around `packages/web`
  (app id `im.freeflow.app`), joins the pnpm workspace with no `build` script
  so `pnpm -r build` stays SDK-free. `apk:debug` builds; `FLOW_ANDROID_DEV=1`
  relaxes the WebView for a plain-http LAN server.
- `[qa]` `.github/workflows/android.yml`: debug APK as an artifact on PRs
  touching `apps/android/**` or the web client. Reports, does not block.
