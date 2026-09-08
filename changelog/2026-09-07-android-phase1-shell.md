# Android shell: server picker, hardware back, keyboard, downloads, reconnect (ANDROID.md phase 1)

- `[web]` First-run server picker in the packaged app (`ServerPicker`), with
  "Server: … · Change" on the sign-in screen; checks `/v1/config` before
  keeping a choice. A browser tab never sees it. `lib/shell.ts` detects the
  shell and carries the hardware-back handler stack (thread → side panel →
  drawer → OS). The "open in desktop app" banner and button hide in the shell.
- `[web]` WebSocket reconnects immediately on the OS `online` event instead of
  waiting out the backoff; the reconnect timer is tracked so it never doubles.
- `[android]` `MainActivity` asks the page before backgrounding on back, sends
  http(s) downloads to Downloads/ via DownloadManager, `adjustResize` for the
  keyboard, edge-to-edge margins, purple status bar, camera permission for the
  composer's file input. JUnit tests for the shell's own logic run in
  `android.yml`.
