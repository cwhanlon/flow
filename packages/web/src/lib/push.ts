// Push notifications in the packaged app (docs/design/ANDROID.md phase 3).
//
// The shell ships Capacitor's PushNotifications plugin (FCM underneath); this
// module reaches it through the runtime object Capacitor injects, the same way
// lib/flowShell.ts reaches our own plugin, so the web client still depends on
// nothing native. Three jobs: create the per-kind notification channels the
// server's FCM driver names (packages/server/src/push/fcmSender.ts
// ANDROID_CHANNELS — the two lists must agree), register the device token with
// the server on sign-in and forget it on sign-out, and turn a tap on a
// notification into "open that message".
import { api } from './api';
import { store } from './storage';

export const PUSH_TOKEN_KEY = 'flow.pushToken';

/**
 * Notification channels, one per NotificationKind. Android surfaces these in
 * the app's system settings as per-kind switches — that is the "mute UI for
 * free" the design doc counts on. Importance 4 = heads-up banner, 3 = sound,
 * 2 = silent in the shade. Names are user-facing.
 */
export const ANDROID_CHANNELS = [
  { id: 'dms', name: 'Direct messages', description: 'Messages sent directly to you', importance: 4 },
  { id: 'mentions', name: 'Mentions', description: 'When someone @-mentions you', importance: 4 },
  { id: 'threads', name: 'Thread replies', description: 'Replies in threads you are part of', importance: 3 },
  { id: 'invites', name: 'Channel invites', description: 'When someone adds you to a channel', importance: 3 },
  { id: 'reactions', name: 'Reactions', description: 'Reactions to your messages', importance: 2 },
  { id: 'channels', name: 'Channel activity', description: 'Activity in channels you follow', importance: 2 },
  { id: 'general', name: 'Other', description: 'Everything else', importance: 3 },
] as const;

/** The routing keys a push carries (the same ones the macOS banner and the
 * iOS tap path use — see the server's payload builder). */
export interface PushTap {
  workspaceId: string;
  channelId: string;
  messageId: string;
  threadRootId: string | null;
  notificationId: string | null;
}

interface ListenerHandle {
  remove(): Promise<void> | void;
}

/** The slice of Capacitor's PushNotifications plugin this module uses. */
export interface PushPlugin {
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  createChannel(channel: (typeof ANDROID_CHANNELS)[number]): Promise<void>;
  addListener(
    event: 'registration',
    cb: (token: { value: string }) => void,
  ): Promise<ListenerHandle> | ListenerHandle;
  addListener(
    event: 'pushNotificationActionPerformed',
    cb: (action: { notification?: { data?: unknown } }) => void,
  ): Promise<ListenerHandle> | ListenerHandle;
}

interface CapacitorRuntime {
  Plugins?: { PushNotifications?: Partial<PushPlugin> };
  registerPlugin?: (name: string) => Partial<PushPlugin>;
}

/** The plugin proxy, or `null` outside the shell (or in a shell without it). */
export function pushPlugin(): PushPlugin | null {
  const cap = (globalThis as { Capacitor?: CapacitorRuntime }).Capacitor;
  if (!cap) return null;
  let p = cap.Plugins?.PushNotifications;
  if (!p && typeof cap.registerPlugin === 'function') {
    try {
      p = cap.registerPlugin('PushNotifications');
    } catch {
      return null;
    }
  }
  return p && typeof p.register === 'function' && typeof p.addListener === 'function' ? (p as PushPlugin) : null;
}

/** FCM data is string-only; a tap's payload is whatever the driver put there. */
export function parsePushTap(data: unknown): PushTap | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === 'string' && d[k] ? (d[k] as string) : null);
  const workspaceId = str('workspaceId');
  const channelId = str('channelId');
  const messageId = str('messageId');
  if (!workspaceId || !channelId || !messageId) return null;
  return { workspaceId, channelId, messageId, threadRootId: str('threadRootId'), notificationId: str('notificationId') };
}

// A tap can arrive before the workspace it points at is mounted (a cold start
// from the notification tray). It is parked here and taken by the main pane
// once it is showing that workspace.
let pendingTap: PushTap | null = null;
export function setPendingTap(tap: PushTap | null): void {
  pendingTap = tap;
}
export function takePendingTap(workspaceId: string): PushTap | null {
  if (!pendingTap || pendingTap.workspaceId !== workspaceId) return null;
  const tap = pendingTap;
  pendingTap = null;
  return tap;
}

/**
 * Ask for permission, create the channels, register with FCM, and hand the
 * token to the server. Called after sign-in; re-registering on every launch is
 * deliberate, as it is on iOS — tokens rotate silently. Returns the teardown.
 * A no-op outside the shell.
 */
export async function enablePush(onTap: (tap: PushTap) => void): Promise<() => void> {
  const plugin = pushPlugin();
  if (!plugin) return () => {};
  await Promise.all(ANDROID_CHANNELS.map((c) => plugin.createChannel(c).catch(() => {})));
  const perm = await plugin.requestPermissions().catch(() => ({ receive: 'denied' }));
  if (perm.receive !== 'granted') return () => {};
  const registration = await plugin.addListener('registration', ({ value }) => {
    store().set(PUSH_TOKEN_KEY, value);
    void api('POST', '/v1/me/devices', { token: value, platform: 'android' }).catch((err: unknown) => {
      console.warn(`push registration failed: ${(err as Error).message}`);
    });
  });
  const tapped = await plugin.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const tap = parsePushTap(notification?.data);
    if (tap) onTap(tap);
  });
  await plugin.register();
  return () => {
    void registration.remove();
    void tapped.remove();
  };
}

/** Sign-out: the server forgets this device, then so do we. Idempotent. */
export async function disablePush(): Promise<void> {
  const token = store().get(PUSH_TOKEN_KEY);
  if (!token) return;
  await api('DELETE', `/v1/me/devices/${encodeURIComponent(token)}`).catch(() => {});
  store().set(PUSH_TOKEN_KEY, null);
}
