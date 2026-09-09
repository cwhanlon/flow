// The share target (ANDROID.md phase 5): payload from the shell → draft and
// files for a composer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeShare,
  contentFileUrl,
  fetchSharedFile,
  installShareBridge,
  parseSharePayload,
  resetShareStateForTests,
  setPendingShare,
  shareDraftText,
  shareSummary,
  splitBySize,
  stageForComposer,
  subscribePendingShare,
  subscribeStaged,
  takePendingShare,
  takeStaged,
} from './share';

const photo = { uri: 'content://media/external/images/1', name: 'IMG_1.jpg', mimeType: 'image/jpeg', size: 1234 };

beforeEach(() => resetShareStateForTests());
afterEach(() => vi.unstubAllGlobals());

describe('parseSharePayload', () => {
  it('reads the shell payload, as an object or as JSON text', () => {
    const p = { text: 'https://example.com', subject: 'Example', files: [photo] };
    expect(parseSharePayload(p)).toEqual(p);
    expect(parseSharePayload(JSON.stringify(p))).toEqual(p);
  });

  it('is null for nothing to share', () => {
    expect(parseSharePayload(null)).toBeNull();
    expect(parseSharePayload('not json')).toBeNull();
    expect(parseSharePayload({})).toBeNull();
    expect(parseSharePayload({ text: '   ', files: [] })).toBeNull();
    expect(parseSharePayload({ subject: 'only a subject' })).toBeNull();
  });

  it('drops malformed files and fills in what a provider left out', () => {
    const p = parseSharePayload({
      files: [
        { uri: 'file:///etc/passwd', name: 'x' }, // only content:// is a granted URI
        'junk',
        { uri: 'content://docs/7' },
      ],
    });
    expect(p).toEqual({
      text: null,
      subject: null,
      files: [{ uri: 'content://docs/7', name: 'shared-file', mimeType: 'application/octet-stream', size: -1 }],
    });
  });
});

describe('shareDraftText', () => {
  it('posts a browser share as title then URL', () => {
    expect(shareDraftText({ text: 'https://example.com/a', subject: 'Example page' })).toBe('Example page\nhttps://example.com/a');
  });
  it('does not repeat a subject the text already carries', () => {
    expect(shareDraftText({ text: 'Example page\nhttps://example.com/a', subject: 'Example page' })).toBe('Example page\nhttps://example.com/a');
  });
  it('is the text alone, or the subject alone', () => {
    expect(shareDraftText({ text: ' hello ', subject: null })).toBe('hello');
    expect(shareDraftText({ text: null, subject: 'Subject' })).toBe('Subject');
    expect(shareDraftText({ text: null, subject: null })).toBe('');
  });
});

describe('shareSummary', () => {
  it('counts what is being shared', () => {
    const video = { ...photo, mimeType: 'video/mp4' };
    const pdf = { ...photo, mimeType: 'application/pdf' };
    expect(shareSummary({ text: null, subject: null, files: [photo] })).toBe('a photo');
    expect(shareSummary({ text: null, subject: null, files: [photo, photo, video] })).toBe('2 photos and a video');
    expect(shareSummary({ text: null, subject: null, files: [video, pdf, pdf] })).toBe('a video and 2 files');
    expect(shareSummary({ text: 'https://x.y/z', subject: null, files: [] })).toBe('a link');
    expect(shareSummary({ text: 'hi there', subject: null, files: [photo] })).toBe('a photo and some text');
  });
});

describe('contentFileUrl', () => {
  it("maps content:// onto Capacitor's local server path", () => {
    expect(contentFileUrl('content://media/external/images/1', 'https://localhost')).toBe(
      'https://localhost/_capacitor_content_/media/external/images/1',
    );
    expect(contentFileUrl('https://example.com/x', 'https://localhost')).toBeNull();
  });
  it("prefers the runtime's own conversion when the shell provides one", () => {
    vi.stubGlobal('Capacitor', { convertFileSrc: (p: string) => `https://localhost/_capacitor_content_/converted${p.slice('content:/'.length)}` });
    expect(contentFileUrl('content://docs/7', 'https://localhost')).toBe('https://localhost/_capacitor_content_/converted/docs/7');
  });
});

describe('fetchSharedFile', () => {
  it('reads the bytes into a File named and typed as the provider said', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(['abc']), { status: 200 }));
    const f = await fetchSharedFile(photo, fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledWith('https://localhost/_capacitor_content_/media/external/images/1');
    expect(f.name).toBe('IMG_1.jpg');
    expect(f.type).toBe('image/jpeg');
    expect(f.size).toBe(3);
  });
  it('fails loudly when the provider will not serve it', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    await expect(fetchSharedFile(photo, fetchMock as unknown as typeof fetch)).rejects.toThrow(/IMG_1.jpg/);
  });
});

describe('splitBySize', () => {
  it('says which files the server would refuse, and why, before uploading', () => {
    const big = { ...photo, name: 'movie.mp4', size: 600 * 1024 * 1024 };
    const unknown = { ...photo, size: -1 };
    const r = splitBySize([photo, big, unknown], 500 * 1024 * 1024);
    expect(r.ok).toEqual([photo, unknown]);
    expect(r.rejected).toEqual(['movie.mp4 is 600 MB. Flow accepts files up to 500 MB.']);
  });
});

describe('delivery from the shell', () => {
  it('parks a share until the main pane takes it, and tells a listener at once', () => {
    const seen: unknown[] = [];
    subscribePendingShare((p) => seen.push(p));
    const target: { __flowShare?: (raw: unknown) => boolean } = {};
    installShareBridge(target);
    expect(target.__flowShare!({ text: 'hi', files: [] })).toBe(true);
    expect(target.__flowShare!({ files: [] })).toBe(false);
    expect(seen).toHaveLength(1);
    expect(takePendingShare()).toEqual({ text: 'hi', subject: null, files: [] });
    expect(takePendingShare()).toBeNull();
  });

  it('collects the launch share from the plugin, or nothing outside the shell', async () => {
    expect(await consumeShare()).toBeNull();
    vi.stubGlobal('Capacitor', {
      Plugins: { FlowShell: { consumeShare: async () => ({ payload: { text: 'x', files: [photo] } }) } },
    });
    expect(await consumeShare()).toEqual({ text: 'x', subject: null, files: [photo] });
    setPendingShare(null);
  });
});

describe('staging into a composer', () => {
  it('holds the draft for a composer that mounts later', () => {
    const draft = { text: 'hello', files: [] };
    stageForComposer('c1', draft);
    expect(takeStaged('c2')).toBeNull();
    expect(takeStaged('c1')).toBe(draft);
    expect(takeStaged('c1')).toBeNull();
  });
  it('hands it straight to a composer that is already up', () => {
    const got: unknown[] = [];
    const off = subscribeStaged('c1', (d) => got.push(d));
    const draft = { text: 'now', files: [] };
    stageForComposer('c1', draft);
    expect(got).toEqual([draft]);
    expect(takeStaged('c1')).toBeNull();
    off();
    stageForComposer('c1', draft);
    expect(got).toHaveLength(1);
    expect(takeStaged('c1')).toBe(draft);
  });
});
