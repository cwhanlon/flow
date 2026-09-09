// Push in the packaged app (ANDROID.md phase 3): channels, registration with
// the server, taps, and sign-out — against a fake of the Capacitor plugin.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApiBaseForTests } from './apiBase';
import { ANDROID_CHANNELS, disablePush, enablePush, parsePushTap, pushPlugin, setPendingTap, takePendingTap, PUSH_TOKEN_KEY } from './push';
import { setStore, type KeyValueStore } from './storage';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => { if (v === null) data.delete(k); else data.set(k, v); } };
}

type Listener = (arg: never) => void;

function fakePlugin(permission = 'granted') {
  const listeners = new Map<string, Listener>();
  const channels: string[] = [];
  const plugin = {
    requestPermissions: vi.fn(async () => ({ receive: permission })),
    register: vi.fn(async () => {}),
    createChannel: vi.fn(async (c: { id: string }) => { channels.push(c.id); }),
    addListener: vi.fn(async (event: string, cb: Listener) => {
      listeners.set(event, cb);
      return { remove: vi.fn(async () => { listeners.delete(event); }) };
    }),
  };
  return { plugin, listeners, channels };
}

let store: ReturnType<typeof memoryStore>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store = memoryStore();
  setStore(store);
  resetApiBaseForTests();
  store.set('flow.token', 'sess');
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  vi.stubGlobal('fetch', fetchMock);
  setPendingTap(null);
});

afterEach(() => {
  setStore();
  resetApiBaseForTests();
  vi.unstubAllGlobals();
});

describe('parsePushTap', () => {
  it('reads the routing keys FCM data carries, all strings', () => {
    expect(parsePushTap({ workspaceId: 'w', channelId: 'c', messageId: 'm', threadRootId: 't', notificationId: 'n', badge: '3', kind: '0' }))
      .toEqual({ workspaceId: 'w', channelId: 'c', messageId: 'm', threadRootId: 't', notificationId: 'n' });
    expect(parsePushTap({ workspaceId: 'w', channelId: 'c', messageId: 'm' }))
      .toEqual({ workspaceId: 'w', channelId: 'c', messageId: 'm', threadRootId: null, notificationId: null });
  });

  it('rejects anything without the three keys a jump needs', () => {
    expect(parsePushTap({ workspaceId: 'w', channelId: 'c' })).toBeNull();
    expect(parsePushTap({ workspaceId: 'w', channelId: 'c', messageId: 42 })).toBeNull();
    expect(parsePushTap(null)).toBeNull();
    expect(parsePushTap('x')).toBeNull();
  });
});

describe('pending tap', () => {
  it('is handed over only to the workspace it points at, and only once', () => {
    setPendingTap({ workspaceId: 'w1', channelId: 'c', messageId: 'm', threadRootId: null, notificationId: null });
    expect(takePendingTap('w2')).toBeNull();
    expect(takePendingTap('w1')?.channelId).toBe('c');
    expect(takePendingTap('w1')).toBeNull();
  });
});

describe('enablePush', () => {
  it('is a no-op in a browser tab', async () => {
    expect(pushPlugin()).toBeNull();
    const off = await enablePush(() => {});
    off();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates every channel the server may name, then registers and sends the token to the server', async () => {
    const { plugin, listeners, channels } = fakePlugin();
    vi.stubGlobal('Capacitor', { Plugins: { PushNotifications: plugin } });
    await enablePush(() => {});
    expect(channels.sort()).toEqual([...ANDROID_CHANNELS].map((c) => c.id).sort());
    expect(plugin.register).toHaveBeenCalledOnce();
    (listeners.get('registration') as (t: { value: string }) => void)({ value: 'fcm:TOKEN_1' });
    await new Promise((r) => setTimeout(r, 0));
    expect(store.get(PUSH_TOKEN_KEY)).toBe('fcm:TOKEN_1');
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/devices', expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'fcm:TOKEN_1', platform: 'android' }) }));
  });

  it('does not register when permission is refused', async () => {
    const { plugin } = fakePlugin('denied');
    vi.stubGlobal('Capacitor', { Plugins: { PushNotifications: plugin } });
    await enablePush(() => {});
    expect(plugin.register).not.toHaveBeenCalled();
  });

  it('turns a tap into a jump, and tears its listeners down', async () => {
    const { plugin, listeners } = fakePlugin();
    vi.stubGlobal('Capacitor', { Plugins: { PushNotifications: plugin } });
    const taps: unknown[] = [];
    const off = await enablePush((t) => taps.push(t));
    (listeners.get('pushNotificationActionPerformed') as (a: { notification: { data: unknown } }) => void)({
      notification: { data: { workspaceId: 'w', channelId: 'c', messageId: 'm' } },
    });
    expect(taps).toEqual([{ workspaceId: 'w', channelId: 'c', messageId: 'm', threadRootId: null, notificationId: null }]);
    off();
    await new Promise((r) => setTimeout(r, 0));
    expect(listeners.size).toBe(0);
  });
});

describe('disablePush', () => {
  it('tells the server to forget the token, then forgets it locally; nothing to do without one', async () => {
    await disablePush();
    expect(fetchMock).not.toHaveBeenCalled();
    store.set(PUSH_TOKEN_KEY, 'fcm:TOKEN_1');
    await disablePush();
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/devices/fcm%3ATOKEN_1', expect.objectContaining({ method: 'DELETE' }));
    expect(store.get(PUSH_TOKEN_KEY)).toBeNull();
  });
});
