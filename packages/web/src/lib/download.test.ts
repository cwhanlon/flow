// Saving fetched files (ANDROID.md phase 1): the shell path when the native
// plugin is there, the anchor path everywhere else.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobToBase64, downloadFile, saveThroughShell, shellPlugin } from './download';

const bytes = (...b: number[]) => new Blob([new Uint8Array(b)], { type: 'application/pdf' });

beforeEach(() => {
  vi.stubEnv('VITE_FLOW_SHELL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

describe('shellPlugin', () => {
  it('is absent in a browser tab', () => {
    expect(shellPlugin()).toBeNull();
  });

  it('finds the plugin on Capacitor.Plugins, or registers it', () => {
    const saveFile = vi.fn();
    vi.stubGlobal('Capacitor', { Plugins: { FlowShell: { saveFile } } });
    expect(shellPlugin()?.saveFile).toBe(saveFile);
    vi.stubGlobal('Capacitor', { registerPlugin: (n: string) => (n === 'FlowShell' ? { saveFile } : {}) });
    expect(shellPlugin()?.saveFile).toBe(saveFile);
  });

  it('ignores a runtime without the plugin', () => {
    vi.stubGlobal('Capacitor', { Plugins: { App: {} } });
    expect(shellPlugin()).toBeNull();
  });
});

describe('saveThroughShell', () => {
  const fetchBlob = (blob: Blob) => vi.fn(async () => ({ blob: async () => blob }) as unknown as Response);

  it('declines without a plugin, so the caller uses the anchor', async () => {
    expect(await saveThroughShell('blob:x', 'a.pdf', 'application/pdf', fetchBlob(bytes(1)))).toBe(false);
  });

  it('hands name, mime type and base64 bytes to the plugin', async () => {
    const saveFile = vi.fn(async () => ({ uri: 'content://downloads/1' }));
    vi.stubGlobal('Capacitor', { Plugins: { FlowShell: { saveFile } } });
    expect(await saveThroughShell('blob:x', 'a.pdf', 'application/pdf', fetchBlob(bytes(0x68, 0x69)))).toBe(true);
    expect(saveFile).toHaveBeenCalledWith({ name: 'a.pdf', mimeType: 'application/pdf', data: 'aGk=' });
  });

  it("uses the blob's own type when the caller has none, and a safe default after that", async () => {
    const saveFile = vi.fn(async () => ({}));
    vi.stubGlobal('Capacitor', { Plugins: { FlowShell: { saveFile } } });
    await saveThroughShell('blob:x', 'a', undefined, fetchBlob(bytes(1)));
    expect(saveFile).toHaveBeenLastCalledWith(expect.objectContaining({ mimeType: 'application/pdf' }));
    await saveThroughShell('blob:x', 'a', undefined, fetchBlob(new Blob([new Uint8Array([1])])));
    expect(saveFile).toHaveBeenLastCalledWith(expect.objectContaining({ mimeType: 'application/octet-stream' }));
  });

  it('declines when the plugin rejects, rather than losing the download', async () => {
    vi.stubGlobal('Capacitor', { Plugins: { FlowShell: { saveFile: vi.fn(async () => { throw new Error('denied'); }) } } });
    expect(await saveThroughShell('blob:x', 'a.pdf', 'application/pdf', fetchBlob(bytes(1)))).toBe(false);
  });
});

describe('downloadFile', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, blob: async () => bytes(1, 2, 3) })));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:mock' }));
  });

  it('clicks an anchor under the real filename in a browser tab', async () => {
    const click = vi.fn();
    const anchor: { href?: string; download?: string; click: () => void } = { click };
    vi.stubGlobal('document', { createElement: () => anchor });
    await downloadFile('/v1/files/f1', 'report.pdf', 'application/pdf');
    expect(anchor.download).toBe('report.pdf');
    expect(anchor.href).toBe('blob:mock');
    expect(click).toHaveBeenCalledOnce();
  });

  it('prefers the shell in the app, and never clicks the anchor then', async () => {
    vi.stubEnv('VITE_FLOW_SHELL', 'android');
    const saveFile = vi.fn(async () => ({}));
    vi.stubGlobal('Capacitor', { Plugins: { FlowShell: { saveFile } } });
    const click = vi.fn();
    vi.stubGlobal('document', { createElement: () => ({ click }) });
    await downloadFile('/v1/files/f2', 'photo.jpg', 'image/jpeg');
    expect(saveFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'photo.jpg', mimeType: 'image/jpeg' }));
    expect(click).not.toHaveBeenCalled();
  });
});
