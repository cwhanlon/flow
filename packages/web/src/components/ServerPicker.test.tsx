// The first-run server screen of the packaged app (ANDROID.md phase 1).
// Static-markup checks, like the other component tests: what the screen
// offers on first paint, and that the cancel affordance only exists when the
// picker was reopened from sign-in.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApiBaseForTests } from '../lib/apiBase';
import { setStore, type KeyValueStore } from '../lib/storage';
import ServerPicker from './ServerPicker';

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
  vi.stubEnv('VITE_API_BASE', '');
});

afterEach(() => {
  setStore();
  resetApiBaseForTests();
  vi.unstubAllEnvs();
});

describe('ServerPicker', () => {
  it('prefills the hosted service and offers Continue', () => {
    const html = renderToStaticMarkup(<ServerPicker onChosen={() => {}} />);
    expect(html).toContain('data-testid="server-picker"');
    expect(html).toContain('value="https://app.freeflow.im"');
    expect(html).toContain('Continue');
    expect(html).not.toContain('Keep the current server');
    expect(html).not.toContain('data-testid="server-insecure"');
  });

  it('prefills the build-time default when the app was built with one', () => {
    vi.stubEnv('VITE_API_BASE', 'http://192.168.86.20:8787');
    const html = renderToStaticMarkup(<ServerPicker onChosen={() => {}} />);
    expect(html).toContain('value="http://192.168.86.20:8787"');
    // …and says so when that default is plain http.
    expect(html).toContain('data-testid="server-insecure"');
  });

  it('offers a way back when reopened from the sign-in screen', () => {
    const html = renderToStaticMarkup(<ServerPicker onChosen={() => {}} onCancel={() => {}} />);
    expect(html).toContain('Keep the current server');
  });
});
