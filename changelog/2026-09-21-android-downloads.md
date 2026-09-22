# Android shell: downloads (ANDROID.md phase 1)

- `[android]` `[web]` Saving a file works in the Android app. The WebView
  cannot download the blob: URLs the client's authenticated fetches produce,
  so the host seam gains an optional `downloads.saveBytes` the Android shell
  provides (`FlowShell.saveFile` → the device's Downloads, via MediaStore);
  the four download buttons go through one `downloadObjectUrl` that uses it
  when present and the `<a download>` anchor otherwise, so a browser and the
  desktop are unchanged. Plain http(s) downloads from the WebView go to
  Android's DownloadManager.

## Feature

- **Downloads on Android.** The download buttons on files, message
  attachments and artifacts now save to the phone's Downloads folder, with a
  notification when done.
