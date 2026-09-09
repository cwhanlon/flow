# Android shell: share target (ANDROID.md phase 5)

- `[android]` `[web]` Flow appears in every app's share sheet (`ACTION_SEND` /
  `ACTION_SEND_MULTIPLE`, any type). The shell describes the shared files and
  hands text, subject and files to the page; a **Share to Flow** picker
  (workspace, channel or person) stages them into that channel's composer —
  text as the draft, files through the ordinary upload — for a caption and
  Send. Over-size files are refused against `/v1/config`'s `maxFileBytes`
  before any upload, as the iOS share extension does.

## Feature

- **Share into Flow from any app (Android).** Pick a page, photo, video or
  document in another app, choose Flow from the share sheet, then the channel
  or person it goes to. It lands in the composer with a caption box, ready to
  send.
