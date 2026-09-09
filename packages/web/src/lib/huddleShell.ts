// Huddles in the packaged app (docs/design/ANDROID.md phase 4): what the
// shell needs to know, reduced to one signal. The WebView handles the media
// itself (livekit-client, with Capacitor turning getUserMedia into the
// microphone prompt); the shell's job is to keep the call alive when the app
// is backgrounded — a foreground service with the `microphone` type — and to
// route audio to the speaker for its duration. Both hang off "a huddle
// started" / "a huddle ended", decided here from the huddle state's channel.
import { flowShellPlugin } from './flowShell';

export type HuddleServiceAction = 'start' | 'stop' | null;

/**
 * `prev` and `next` are the huddle's channel id before and after a state
 * change. Only the edges matter: joining from nothing starts the service,
 * leaving to nothing stops it. Switching straight from one huddle to another
 * keeps the service — the mic is still live — and every other change (mute,
 * camera, a tile joining) is none of the shell's business.
 */
export function huddleServiceAction(prev: string | null, next: string | null): HuddleServiceAction {
  if (!prev && next) return 'start';
  if (prev && !next) return 'stop';
  return null;
}

/** Tell the shell. `false` = no shell, or an older one without the method. */
export async function setHuddleActive(active: boolean, title?: string): Promise<boolean> {
  const p = flowShellPlugin();
  if (!p || typeof p.setHuddleActive !== 'function') return false;
  try {
    await p.setHuddleActive({ active, ...(title ? { title } : {}) });
    return true;
  } catch {
    return false;
  }
}
