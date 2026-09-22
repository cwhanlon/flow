// Saving fetched files (ANDROID.md phase 1): the host's save when it offers
// one, the anchor everywhere else.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowDesktopBridge } from '@flow/shared';
import { blobToBase64, downloadObjectUrl, saveThroughHost } from './download';
import { __setHost, getHost } from './host';

const bytes = (...b: number[]) => new Blob([new Uint8Array(b)], { type: 'application/pdf' });
const fetchBlob = (blob: Blob) => vi.fn(async () => ({ blob: async () => blob }) as unknown as Response);

function hostWith(saveBytes: (file: { name: string; mimeType: string; data: string }) => Promise<void>) {
  vi.stubGlobal('window', {
    flowDesktop: {
      info: { platform: 'android', version: '0', profile: null, defaultServerOrigin: 'https://s' },
      secrets: { available: true, get: () => null, set: () => {}, delete: () => {} },
      links: { openExternal: () => {}, onDeepLink: () => () => {} },
      window: { isFocused: () => true, onFocusChange: () => () => {}, setTitle: () => {} },
      zoom: { get: () => 0, set: () => {} },
      notifications: { show: () => {}, onClick: () => () => {}, clearDelivered: () => {} },
      badge: { set: () => {} },
      downloads: { saveBytes },
    } satisfies FlowDesktopBridge,
  });
  __setHost(null);
}

beforeEach(() => { __setHost(null); vi.stubGlobal('window', {}); });
afterEach(() => { vi.unstubAllGlobals(); __setHost(null); });

describe('blobToBase64', () => {
  it('encodes the bytes, not a data: prefix', async () => {
    expect(await blobToBase64(bytes(0x68, 0x69))).toBe('aGk='); // "hi"
    expect(await blobToBase64(new Blob([]))).toBe('');
  });

  it('survives a blob larger than one String.fromCharCode call', async () => {
    const big = new Uint8Array(100_000).fill(0x41);
    const out = await blobToBase64(new Blob([big]));
    expect(out.length).toBe(Math.ceil(100_000 / 3) * 4);
    expect(out.startsWith('QUFB')).toBe(true);
  });
});

describe('saveThroughHost', () => {
  it('declines when the host offers no save, so the caller uses the anchor', async () => {
    expect(getHost().downloads.saveBytes).toBeUndefined();
    expect(await saveThroughHost('blob:x', 'a.pdf', 'application/pdf', fetchBlob(bytes(1)))).toBe(false);
  });

  it('hands name, mime type and base64 bytes to the host', async () => {
    const saveBytes = vi.fn(async () => {});
    hostWith(saveBytes);
    expect(await saveThroughHost('blob:x', 'a.pdf', 'application/pdf', fetchBlob(bytes(0x68, 0x69)))).toBe(true);
    expect(saveBytes).toHaveBeenCalledWith({ name: 'a.pdf', mimeType: 'application/pdf', data: 'aGk=' });
  });

  it("uses the blob's own type when the caller has none, and a safe default after that", async () => {
    const saveBytes = vi.fn(async () => {});
    hostWith(saveBytes);
    await saveThroughHost('blob:x', 'a', undefined, fetchBlob(bytes(1)));
    expect(saveBytes).toHaveBeenLastCalledWith(expect.objectContaining({ mimeType: 'application/pdf' }));
    await saveThroughHost('blob:x', 'a', undefined, fetchBlob(new Blob([new Uint8Array([1])])));
    expect(saveBytes).toHaveBeenLastCalledWith(expect.objectContaining({ mimeType: 'application/octet-stream' }));
  });

  it('reports a refusal as "not saved" so the anchor gets its turn', async () => {
    hostWith(vi.fn(async () => { throw new Error('no storage'); }));
    expect(await saveThroughHost('blob:x', 'a.pdf', 'application/pdf', fetchBlob(bytes(1)))).toBe(false);
  });
});

describe('downloadObjectUrl', () => {
  it('clicks an anchor with the object URL and the real name when the host has no save', async () => {
    const a = { href: '', download: '', click: vi.fn() };
    vi.stubGlobal('document', { createElement: () => a });
    await downloadObjectUrl('blob:https://x/1', 'report.pdf', 'application/pdf');
    expect(a).toMatchObject({ href: 'blob:https://x/1', download: 'report.pdf' });
    expect(a.click).toHaveBeenCalledTimes(1);
  });
});
