// Links that open the app (ANDROID.md phase 2), reduced to the three intents
// the web client already handles.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installOpenUrlBridge, nativeGoogleUrl, parseDeepLink } from './deepLink';
import { consumeLaunchUrl, flowShellPlugin, openExternal } from './flowShell';

const TOKEN = 'AbC-123_xyz'.repeat(4); // 44 chars: join tokens are 16–128 of [A-Za-z0-9_-]

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseDeepLink — flow:// scheme', () => {
  it('reads the sign-in handoff code', () => {
    expect(parseDeepLink('flow://signin?code=k9x')).toEqual({ kind: 'signin', code: 'k9x' });
    expect(parseDeepLink('flow://signin?code=a%2Fb')).toEqual({ kind: 'signin', code: 'a/b' });
    expect(parseDeepLink('flow://signin')).toBeNull();
    expect(parseDeepLink('flow://signin?code=')).toBeNull();
  });

  it('reads an invite token', () => {
    expect(parseDeepLink(`flow://invite/${TOKEN}`)).toEqual({ kind: 'invite', token: TOKEN });
    expect(parseDeepLink('flow://invite/')).toBeNull();
    expect(parseDeepLink('flow://invite/bad%20token')).toBeNull();
  });

  it('reads a join link, slug and all', () => {
    expect(parseDeepLink(`flow://join/acme/${TOKEN}`)).toEqual({ kind: 'join', token: TOKEN });
    expect(parseDeepLink(`flow://join/acme/${TOKEN}/`)).toEqual({ kind: 'join', token: TOKEN });
    expect(parseDeepLink('flow://join/acme')).toBeNull();
  });

  it('ignores anything else on the scheme', () => {
    expect(parseDeepLink('flow://settings')).toBeNull();
    expect(parseDeepLink('flow://')).toBeNull();
  });
});

describe('parseDeepLink — https App Links', () => {
  it('reads the server\'s own invite and join pages', () => {
    expect(parseDeepLink(`https://app.freeflow.im/invite/${TOKEN}`)).toEqual({ kind: 'invite', token: TOKEN });
    expect(parseDeepLink(`https://app.freeflow.im/join/acme/${TOKEN}?utm=x`)).toEqual({ kind: 'join', token: TOKEN });
    expect(parseDeepLink(`http://192.168.86.20:8787/join/acme/${TOKEN}`)).toEqual({ kind: 'join', token: TOKEN });
  });

  it('ignores every other page and every other scheme', () => {
    expect(parseDeepLink('https://app.freeflow.im/')).toBeNull();
    expect(parseDeepLink('https://app.freeflow.im/download/mac')).toBeNull();
    expect(parseDeepLink('mailto:x@y')).toBeNull();
    expect(parseDeepLink('not a url')).toBeNull();
  });
});

describe('installOpenUrlBridge', () => {
  it('exposes a function the shell can call, which reports the link as taken', () => {
    const seen: string[] = [];
    const target: { __flowOpenUrl?: (u: string) => boolean } = {};
    installOpenUrlBridge((u) => seen.push(u), target);
    expect(target.__flowOpenUrl?.('flow://signin?code=1')).toBe(true);
    expect(seen).toEqual(['flow://signin?code=1']);
  });
});

describe('nativeGoogleUrl', () => {
  it('points at the server\'s handoff page, without doubling slashes', () => {
    expect(nativeGoogleUrl('https://app.freeflow.im')).toBe('https://app.freeflow.im/?native=google');
    expect(nativeGoogleUrl('http://192.168.86.20:8787/')).toBe('http://192.168.86.20:8787/?native=google');
  });
});

describe('flowShell plugin access', () => {
  it('is absent in a browser tab, and every helper degrades', async () => {
    expect(flowShellPlugin()).toBeNull();
    expect(await openExternal('https://x')).toBe(false);
    expect(await consumeLaunchUrl()).toBeNull();
  });

  it('hands over the launch url once and opens external urls through the shell', async () => {
    const consume = vi.fn(async () => ({ url: 'flow://signin?code=1' }));
    const open = vi.fn(async () => {});
    vi.stubGlobal('Capacitor', { Plugins: { FlowShell: { consumeLaunchUrl: consume, openExternal: open } } });
    expect(await consumeLaunchUrl()).toBe('flow://signin?code=1');
    expect(await openExternal('https://app.freeflow.im/?native=google')).toBe(true);
    expect(open).toHaveBeenCalledWith({ url: 'https://app.freeflow.im/?native=google' });
  });

  it('tolerates an older shell that lacks a method', async () => {
    vi.stubGlobal('Capacitor', { Plugins: { FlowShell: { saveFile: vi.fn() } } });
    expect(await consumeLaunchUrl()).toBeNull();
    expect(await openExternal('https://x')).toBe(false);
  });
});
