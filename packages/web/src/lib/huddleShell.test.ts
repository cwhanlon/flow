// The one signal huddles send the shell (ANDROID.md phase 4).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { huddleServiceAction, setHuddleActive } from './huddleShell';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('huddleServiceAction', () => {
  it('starts on joining from nothing and stops on leaving to nothing', () => {
    expect(huddleServiceAction(null, 'c1')).toBe('start');
    expect(huddleServiceAction('c1', null)).toBe('stop');
  });

  it('keeps the service across a switch between huddles, and ignores everything else', () => {
    expect(huddleServiceAction('c1', 'c2')).toBe(null);
    expect(huddleServiceAction('c1', 'c1')).toBe(null);
    expect(huddleServiceAction(null, null)).toBe(null);
  });
});

describe('setHuddleActive', () => {
  it('is a no-op outside the shell or on an older shell', async () => {
    expect(await setHuddleActive(true)).toBe(false);
    vi.stubGlobal('Capacitor', { Plugins: { FlowShell: { saveFile: vi.fn() } } });
    expect(await setHuddleActive(true)).toBe(false);
  });

  it('hands the edge and the title to the shell, and survives a rejection', async () => {
    const set = vi.fn(async () => {});
    vi.stubGlobal('Capacitor', { Plugins: { FlowShell: { setHuddleActive: set } } });
    expect(await setHuddleActive(true, 'Huddle in #general')).toBe(true);
    expect(set).toHaveBeenCalledWith({ active: true, title: 'Huddle in #general' });
    expect(await setHuddleActive(false)).toBe(true);
    expect(set).toHaveBeenLastCalledWith({ active: false });
    vi.stubGlobal('Capacitor', { Plugins: { FlowShell: { setHuddleActive: vi.fn(async () => { throw new Error('x'); }) } } });
    expect(await setHuddleActive(true)).toBe(false);
  });
});
