# Android shell: deep links, App Links, Google via the system browser (ANDROID.md phase 2)

- `[android]` `[web]` `flow://signin?code=…`, `flow://invite/…` and
  `flow://join/…` open the app (`lib/deepLink.ts`); verified https App Links
  for the server's `/join/…` and `/invite/…` pages, host baked in per build.
  Google sign-in in the app opens the server's `/?native=google` handoff in a
  Chrome Custom Tab and returns as `flow://signin` — the same handoff the Mac
  and iPhone apps use.
- `[server]` `GET /.well-known/assetlinks.json`, served only when
  `FLOW_ANDROID_CERT_SHA256` lists the app's signing fingerprint(s)
  (`FLOW_ANDROID_PACKAGE` for a renamed fork); a JSON 404 otherwise.
