// Saving a file the client fetched itself (docs/design/ANDROID.md phase 1).
//
// File bytes come through an authenticated fetch and reach the page as a
// blob: object URL. In a browser, `<a download>` on that URL is a download.
// In the packaged app it is not: the WebView hands blob: URLs to a download
// listener that can only fetch http(s) on its own. So the shell exposes a
// tiny native plugin, FlowShell.saveFile, that takes the bytes and writes
// them to the device's Downloads; this module hands over to it when it is
// there and falls back to the anchor when it is not.
import { blobUrl } from './api';
import { flowShellPlugin, type FlowShellPlugin } from './flowShell';
import { isPackagedShell } from './shell';

/** The native side, when this page is inside the Android shell and it can save. */
export function shellPlugin(): Pick<FlowShellPlugin, 'saveFile'> | null {
  const p = flowShellPlugin();
  return p && typeof p.saveFile === 'function' ? (p as Pick<FlowShellPlugin, 'saveFile'>) : null;
}

/** Standard base64 of the blob's bytes — the plugin boundary is JSON, so this
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

/** Try the shell. `false` = no shell, or it declined — use the anchor. */
export async function saveThroughShell(
  objectUrl: string,
  name: string,
  mimeType?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const plugin = shellPlugin();
  if (!plugin) return false;
  try {
    const blob = await (await fetchImpl(objectUrl)).blob();
    await plugin.saveFile({
      name,
      mimeType: mimeType || blob.type || 'application/octet-stream',
      data: await blobToBase64(blob),
    });
    return true;
  } catch {
    return false;
  }
}

/** Save the file behind an authenticated API path under its real name. */
export async function downloadFile(path: string, name: string, mimeType?: string): Promise<void> {
  const url = await blobUrl(path);
  if (isPackagedShell() && (await saveThroughShell(url, name, mimeType))) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}
