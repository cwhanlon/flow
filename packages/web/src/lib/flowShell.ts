// The one native plugin the Android shell registers (apps/android/.../
// FlowShellPlugin.java), reached through the runtime object Capacitor injects
// so the web client never depends on Capacitor itself. Every method is
// optional on the web side: a browser tab has no plugin, an older shell may
// lack a newer method, and callers fall back accordingly.

export interface FlowShellPlugin {
  /** Write bytes the page holds into the device's Downloads (phase 1). */
  saveFile(options: { name: string; mimeType: string; data: string }): Promise<{ uri?: string }>;
  /** The link the app was launched with, handed over exactly once (phase 2). */
  consumeLaunchUrl(): Promise<{ url: string | null }>;
  /** Open an http(s) URL in the system browser — a Chrome Custom Tab (phase 2). */
  openExternal(options: { url: string }): Promise<void>;
  /** A huddle started (foreground service + speaker) or ended (phase 4). */
  setHuddleActive(options: { active: boolean; title?: string }): Promise<void>;
  /** Route call audio to the speaker or the earpiece (phase 4). */
  setSpeaker(options: { on: boolean }): Promise<void>;
  /** What another app shared into Flow at launch, handed over once (phase 5). */
  consumeShare(): Promise<{ payload: unknown }>;
}

interface CapacitorRuntime {
  Plugins?: { FlowShell?: Partial<FlowShellPlugin> };
  registerPlugin?: (name: string) => Partial<FlowShellPlugin>;
}

/** The plugin proxy, or `null` outside the shell. */
export function flowShellPlugin(): Partial<FlowShellPlugin> | null {
  const cap = (globalThis as { Capacitor?: CapacitorRuntime }).Capacitor;
  if (!cap) return null;
  let p = cap.Plugins?.FlowShell;
  if (!p && typeof cap.registerPlugin === 'function') {
    try {
      p = cap.registerPlugin('FlowShell');
    } catch {
      return null;
    }
  }
  return p ?? null;
}

/** Open a URL outside the WebView. `false` = no shell, or it could not. */
export async function openExternal(url: string): Promise<boolean> {
  const p = flowShellPlugin();
  if (!p || typeof p.openExternal !== 'function') return false;
  try {
    await p.openExternal({ url });
    return true;
  } catch {
    return false;
  }
}

/** The launch link, once. `null` when there was none or this is not the shell. */
export async function consumeLaunchUrl(): Promise<string | null> {
  const p = flowShellPlugin();
  if (!p || typeof p.consumeLaunchUrl !== 'function') return null;
  try {
    return (await p.consumeLaunchUrl()).url ?? null;
  } catch {
    return null;
  }
}
