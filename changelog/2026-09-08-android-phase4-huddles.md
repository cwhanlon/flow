# Android shell: huddles in the background, mini-app popups (ANDROID.md phase 4)

- `[android]` `[web]` A huddle keeps running when the app is backgrounded:
  the page signals start/end (`ShellHuddleBridge` → `FlowShell.setHuddleActive`)
  and the shell holds a `microphone` foreground service with an ongoing
  notification, routing audio to the speaker for the call. `RECORD_AUDIO`
  declared so the WebView's `getUserMedia` becomes the OS prompt.
- `[android]` `window.open` from the page or a mini-app iframe opens in the
  system browser (`FlowWebChromeClient.onCreateWindow`); same-origin and
  non-web targets are dropped.
