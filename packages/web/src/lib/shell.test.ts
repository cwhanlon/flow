// The shell contract (docs/design/ANDROID.md phase 1): detection, and the
// hardware-back handler stack that the Android activity consults.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backAction,
  handleBack,
  installBackBridge,
  isPackagedShell,
  registerBackHandler,
  resetBackHandlersForTests,
  shellPlatform,
} from './shell';

beforeEach(() => {
  resetBackHandlersForTests();
  vi.stubEnv('VITE_FLOW_SHELL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('shell detection', () => {
  it('is a plain browser tab by default — nothing about the web client changes', () => {
    expect(shellPlatform()).toBeNull();
    expect(isPackagedShell()).toBe(false);
  });

  it('trusts the build-time flag first', () => {
    vi.stubEnv('VITE_FLOW_SHELL', 'android');
    expect(shellPlatform()).toBe('android');
    expect(isPackagedShell()).toBe(true);
  });

  it('falls back to the Capacitor bridge object for a build that forgot the flag', () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true, getPlatform: () => 'android' });
    expect(shellPlatform()).toBe('android');
  });

  it('ignores the bridge object when it says it is the web platform', () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => false, getPlatform: () => 'web' });
    expect(shellPlatform()).toBeNull();
  });
});

describe('hardware back handlers', () => {
  it('reports nothing consumed when no view has anything to close', () => {
    expect(handleBack()).toBe(false);
  });

  it('runs newest-first and stops at the first handler that consumes the press', () => {
    const calls: string[] = [];
    registerBackHandler(() => { calls.push('channel'); return true; });
    registerBackHandler(() => { calls.push('thread'); return true; });
    expect(handleBack()).toBe(true);
    expect(calls).toEqual(['thread']);
  });

  it('falls through a handler that declines', () => {
    const calls: string[] = [];
    registerBackHandler(() => { calls.push('channel'); return true; });
    registerBackHandler(() => { calls.push('modal'); return false; });
    expect(handleBack()).toBe(true);
    expect(calls).toEqual(['modal', 'channel']);
  });

  it('unregisters cleanly and is idempotent per handler', () => {
    const h = vi.fn(() => true);
    const off = registerBackHandler(h);
    registerBackHandler(h); // duplicate registration is a no-op
    expect(handleBack()).toBe(true);
    expect(h).toHaveBeenCalledTimes(1);
    off();
    off(); // second unregister is harmless
    expect(handleBack()).toBe(false);
  });

  it('exposes the bridge the activity calls', () => {
    const target: { __flowBack?: () => boolean } = {};
    installBackBridge(target);
    registerBackHandler(() => true);
    expect(target.__flowBack?.()).toBe(true);
  });
});

describe('backAction — thread → panel → drawer → leave', () => {
  const base = { threadOpen: false, panelOpen: false, isMobile: true, drawerOpen: false };

  it('closes an open thread first', () => {
    expect(backAction({ ...base, threadOpen: true, panelOpen: true })).toBe('close-thread');
  });

  it('then a side panel', () => {
    expect(backAction({ ...base, panelOpen: true })).toBe('close-panel');
  });

  it('then opens the drawer on a phone-sized layout', () => {
    expect(backAction(base)).toBe('open-drawer');
  });

  it('leaves the app once the drawer is showing — the next press goes to the OS', () => {
    expect(backAction({ ...base, drawerOpen: true })).toBe('leave');
  });

  it('never opens the drawer on a wide layout, where the sidebar is always visible', () => {
    expect(backAction({ ...base, isMobile: false })).toBe('leave');
  });
});
