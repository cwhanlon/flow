// First-run server picker logic (docs/design/ANDROID.md phase 1). The
// property that matters most: a browser tab never sees the picker.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApiBaseForTests, setApiBase } from './apiBase';
import {
  DEFAULT_SERVER,
  describeProbeFailure,
  displayServer,
  normalizeServerUrl,
  probeServer,
  shouldShowServerPicker,
  suggestedServer,
} from './serverPicker';
import { setStore, type KeyValueStore } from './storage';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    get: (k) => data.get(k) ?? null,
    set: (k, v) => { if (v === null) data.delete(k); else data.set(k, v); },
  };
}

beforeEach(() => {
  setStore(memoryStore());
  resetApiBaseForTests();
  vi.stubEnv('VITE_FLOW_SHELL', '');
  vi.stubEnv('VITE_API_BASE', '');
});

afterEach(() => {
  setStore();
  resetApiBaseForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('shouldShowServerPicker', () => {
  it('never shows in a browser tab, chosen server or not', () => {
    expect(shouldShowServerPicker()).toBe(false);
    setApiBase('https://flow.example.org');
    expect(shouldShowServerPicker()).toBe(false);
  });

  it('shows in the shell until a server has been chosen, even with a build-time default', () => {
    vi.stubEnv('VITE_FLOW_SHELL', 'android');
    vi.stubEnv('VITE_API_BASE', 'https://app.freeflow.im');
    expect(shouldShowServerPicker()).toBe(true);
    setApiBase('https://app.freeflow.im');
    expect(shouldShowServerPicker()).toBe(false);
  });
});

describe('suggestedServer', () => {
  it('prefers the build-time default, else the hosted service', () => {
    expect(suggestedServer()).toBe(DEFAULT_SERVER);
    vi.stubEnv('VITE_API_BASE', 'http://192.168.1.10:8787/');
    resetApiBaseForTests();
    expect(suggestedServer()).toBe('http://192.168.1.10:8787');
  });
});

describe('normalizeServerUrl', () => {
  it('adds https:// when there is no scheme and keeps the port', () => {
    expect(normalizeServerUrl('flow.example.org')).toEqual({ ok: true, url: 'https://flow.example.org', insecure: false });
    expect(normalizeServerUrl('flow.example.org:8443')).toEqual({ ok: true, url: 'https://flow.example.org:8443', insecure: false });
  });

  it('reduces a pasted page URL to its origin', () => {
    expect(normalizeServerUrl('https://app.freeflow.im/join/abc?x=1#y')).toEqual({ ok: true, url: 'https://app.freeflow.im', insecure: false });
    expect(normalizeServerUrl('  https://app.freeflow.im/  ')).toEqual({ ok: true, url: 'https://app.freeflow.im', insecure: false });
  });

  it('allows plain http but flags it', () => {
    expect(normalizeServerUrl('http://192.168.86.20:8787')).toEqual({ ok: true, url: 'http://192.168.86.20:8787', insecure: true });
  });

  it('rejects empty, unparsable, and non-http input', () => {
    expect(normalizeServerUrl('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeServerUrl('not a url')).toEqual({ ok: false, reason: 'invalid' });
    expect(normalizeServerUrl('ftp://files.example')).toEqual({ ok: false, reason: 'scheme' });
    expect(normalizeServerUrl('flow://signin')).toEqual({ ok: false, reason: 'scheme' });
  });
});

describe('probeServer', () => {
  const json = (body: unknown, status = 200) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

  it('accepts a Flow /v1/config answer', async () => {
    const fetchMock = vi.fn(async () => json({ google: false, apple: false, maxFileBytes: 1, huddles: false }));
    await expect(probeServer('https://flow.example.org', fetchMock)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('https://flow.example.org/v1/config', expect.anything());
  });

  it('reports a network or CORS failure as unreachable', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(probeServer('https://flow.example.org', fetchMock)).resolves.toEqual({ ok: false, reason: 'unreachable' });
  });

  it('reports a non-2xx as an http error with the status', async () => {
    const fetchMock = vi.fn(async () => json({ error: 'nope' }, 404));
    await expect(probeServer('https://flow.example.org', fetchMock)).resolves.toEqual({ ok: false, reason: 'http-error', status: 404 });
  });

  it('reports a server that answers but is not Flow', async () => {
    const html = { ok: true, status: 200, json: async () => { throw new SyntaxError('<!doctype'); } } as unknown as Response;
    await expect(probeServer('https://example.org', vi.fn(async () => html))).resolves.toEqual({ ok: false, reason: 'not-flow' });
    const wrongShape = vi.fn(async () => json({ version: '1.0' }));
    await expect(probeServer('https://example.org', wrongShape)).resolves.toEqual({ ok: false, reason: 'not-flow' });
  });
});

describe('describeProbeFailure', () => {
  it('mentions CORS for a secure server and cleartext for a plain-http one', () => {
    expect(describeProbeFailure({ ok: false, reason: 'unreachable' }, false)).toContain('FLOW_CORS_ORIGINS');
    expect(describeProbeFailure({ ok: false, reason: 'unreachable' }, true)).toContain('plain http');
    expect(describeProbeFailure({ ok: false, reason: 'http-error', status: 502 }, false)).toContain('502');
  });
});

describe('displayServer', () => {
  it('shows the host, keeps a port, and keeps a plain-http scheme visible', () => {
    expect(displayServer('https://app.freeflow.im')).toBe('app.freeflow.im');
    expect(displayServer('https://flow.example.org:8443')).toBe('flow.example.org:8443');
    expect(displayServer('http://192.168.86.20:8787')).toBe('http://192.168.86.20:8787');
    expect(displayServer('garbage')).toBe('garbage');
  });
});
