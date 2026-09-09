# Android push over FCM (ANDROID.md phase 3)

- `[server]` An FCM HTTP v1 driver behind the existing `PushSender` seam,
  selected per device platform beside the APNs driver: same recipient set,
  same mute/DND gate, same payload — translated on the way out. On when
  `FLOW_FCM_SERVICE_ACCOUNT` names a Firebase service-account key; the dev
  driver otherwise. `device_tokens` accepts `'android'` rows (APNs-only
  columns become optional; migration 0045). The push payload carries `kind`.
- `[android]` `[web]` The app registers its FCM token on sign-in and drops it
  on sign-out, creates a notification channel per kind (per-kind mute lives in
  system settings), and a tap on a notification lands in the conversation.

## Feature

- **Android notifications.** Mentions, direct messages, thread replies and
  reactions reach your Android phone even when Flow is closed, and tapping one
  takes you straight to the message.
