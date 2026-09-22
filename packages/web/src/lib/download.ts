// Saving a file the client fetched itself (docs/design/ANDROID.md phase 1).
//
// File bytes come through an authenticated fetch and reach the page as a
// blob: object URL. In a browser and in the desktop shell, `<a download>` on
// that URL is a download. In the Android WebView it is not: the WebView hands
// blob: URLs to a download listener that can only fetch http(s) on its own.
// So a host that cannot download a blob: URL itself offers
// `host.downloads.saveBytes` (the Android shell, through FlowShell.saveFile,
// into the device's Downloads); this module hands the bytes over when it is
// there and falls back to the anchor when it is not.
import { getHost } from './host';

/** Standard base64 of the blob's bytes — the bridge boundary is JSON, so this
 * is how the bytes cross it. Chunked: String.fromCharCode(...) has an
 * argument-count ceiling well below a photo. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Try the host. `false` = it offers no save, or it declined — use the anchor. */
export async function saveThroughHost(
  objectUrl: string,
  name: string,
  mimeType?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const save = getHost().downloads.saveBytes;
  if (!save) return false;
  try {
    const blob = await (await fetchImpl(objectUrl)).blob();
    await save({ name, mimeType: mimeType || blob.type || 'application/octet-stream', data: await blobToBase64(blob) });
    return true;
  } catch {
    return false;
  }
}

/** Save the file behind an object URL under its real name. */
export async function downloadObjectUrl(objectUrl: string, name: string, mimeType?: string): Promise<void> {
  if (await saveThroughHost(objectUrl, name, mimeType)) return;
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = name;
  a.click();
}
