// Capacitor shell around packages/web (docs/design/ANDROID.md, phase 0).
//
// The web client is bundled into the APK from `webDir` at `cap sync` time and
// served from the WebView's own origin, https://localhost — a secure context,
// so crypto.randomUUID and friends work — and talks to the Flow server the
// bundle was built with: `VITE_API_BASE=<server> pnpm --filter @flow/web build`
// before syncing (see README.md). That origin is what the server's
// FLOW_CORS_ORIGINS must list.
//
// FLOW_ANDROID_DEV=1 relaxes the WebView for a dev build against a plain-http
// server on the LAN (mixed content + cleartext + remote inspection). Never
// for a release build: the shipped app talks https only.
import type { CapacitorConfig } from '@capacitor/cli';

const dev = process.env.FLOW_ANDROID_DEV === '1';

const config: CapacitorConfig = {
  appId: 'im.freeflow.app', // same id as the iOS app
  appName: 'Flow',
  webDir: '../../packages/web/dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    cleartext: dev,
  },
  android: {
    allowMixedContent: dev,
    webContentsDebuggingEnabled: dev,
  },
};

export default config;
