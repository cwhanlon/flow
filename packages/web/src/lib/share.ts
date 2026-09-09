// Share target (docs/design/ANDROID.md phase 5): something sent to Flow from
// another app's share sheet — text, a link, photos, a video, documents. The
// shell hands the page a payload; the page shows a channel picker and stages
// the result into that channel's composer, where it is sent the way a pasted
// draft with picked files would be. Files stay where the sending app put them
// (content:// URIs) until the composer uploads them, so nothing is copied.

import { flowShellPlugin } from './flowShell';

export interface SharedFile {
  /** The content:// URI the sending app granted us read access to. */
  uri: string;
  name: string;
  mimeType: string;
  /** Bytes, or -1 when the provider would not say. */
  size: number;
}

export interface SharePayload {
  text: string | null;
  subject: string | null;
  files: SharedFile[];
}

/**
 * The payload the shell builds (ShareIntents.java), checked field by field:
 * it crossed a JS bridge as JSON, and an unexpected shape must become "no
 * share" rather than a crash in the picker. `null` when there is nothing to
 * share at all — no text and no files.
 */
export function parseSharePayload(raw: unknown): SharePayload | null {
  const obj = typeof raw === 'string' ? tryJson(raw) : raw;
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const text = typeof o.text === 'string' && o.text.trim() ? o.text : null;
  const subject = typeof o.subject === 'string' && o.subject.trim() ? o.subject : null;
  const files: SharedFile[] = [];
  if (Array.isArray(o.files)) {
    for (const f of o.files) {
      if (!f || typeof f !== 'object') continue;
      const r = f as Record<string, unknown>;
      if (typeof r.uri !== 'string' || !r.uri.startsWith('content://')) continue;
      files.push({
        uri: r.uri,
        name: typeof r.name === 'string' && r.name ? r.name : 'shared-file',
        mimeType: typeof r.mimeType === 'string' && r.mimeType ? r.mimeType : 'application/octet-stream',
        size: typeof r.size === 'number' && Number.isFinite(r.size) ? r.size : -1,
      });
    }
  }
  if (!text && files.length === 0) return null;
  return { text, subject, files };
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * The draft a share becomes. A browser shares a page as subject = title and
 * text = URL; both are worth posting, title first. Text that already carries
 * the subject (some apps send "title\nurl") is left alone.
 */
export function shareDraftText(p: Pick<SharePayload, 'text' | 'subject'>): string {
  const text = (p.text ?? '').trim();
  const subject = (p.subject ?? '').trim();
  if (!subject || text.includes(subject)) return text;
  return text ? `${subject}\n${text}` : subject;
}

/** One line for the picker: "a link", "3 photos", "a video and 2 files". */
export function shareSummary(p: SharePayload): string {
  const parts: string[] = [];
  const photos = p.files.filter((f) => f.mimeType.startsWith('image/')).length;
  const videos = p.files.filter((f) => f.mimeType.startsWith('video/')).length;
  const others = p.files.length - photos - videos;
  if (photos) parts.push(count(photos, 'photo'));
  if (videos) parts.push(count(videos, 'video'));
  if (others) parts.push(count(others, 'file'));
  if (p.text) parts.push(/^https?:\/\/\S+$/.test(p.text.trim()) ? 'a link' : 'some text');
  if (parts.length === 0) return 'nothing';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function count(n: number, noun: string): string {
  return n === 1 ? `a ${noun}` : `${n} ${noun}s`;
}

/**
 * Where the page can fetch a content:// URI from: Capacitor's local server
 * streams it through the app's ContentResolver under `/_capacitor_content_/`
 * on the page's own origin (com.getcapacitor.AndroidProtocolHandler). The
 * runtime's own `convertFileSrc` is used when present; this is the same rule
 * written down so it is testable and survives a runtime without it.
 */
export function contentFileUrl(uri: string, origin?: string): string | null {
  if (!uri.startsWith('content://')) return null;
  const base = origin ?? (typeof location === 'undefined' ? 'https://localhost' : location.origin);
  const cap = (globalThis as { Capacitor?: { convertFileSrc?: (p: string) => string } }).Capacitor;
  if (typeof cap?.convertFileSrc === 'function') {
    const converted = cap.convertFileSrc(uri);
    if (typeof converted === 'string' && converted !== uri) return converted;
  }
  return `${base.replace(/\/$/, '')}/_capacitor_content_${uri.slice('content:/'.length)}`;
}

/** Read a shared file into a File the ordinary upload path accepts. */
export async function fetchSharedFile(f: SharedFile, fetchFn: typeof fetch = fetch): Promise<File> {
  const url = contentFileUrl(f.uri);
  if (!url) throw new Error(`not a shareable file: ${f.uri}`);
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`could not read ${f.name} (HTTP ${res.status})`);
  const blob = await res.blob();
  return new File([blob], f.name, { type: f.mimeType });
}

/** Pick the shared files the server will accept; the rest get a reason. */
export function splitBySize(files: SharedFile[], maxFileBytes: number): { ok: SharedFile[]; rejected: string[] } {
  const ok: SharedFile[] = [];
  const rejected: string[] = [];
  for (const f of files) {
    if (f.size > maxFileBytes) rejected.push(`${f.name} is ${formatMb(f.size)}. Flow accepts files up to ${formatMb(maxFileBytes)}.`);
    else ok.push(f);
  }
  return { ok, rejected };
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

// ---------------------------------------------------------------------------
// Delivery from the shell. A share the app was launched with is collected once
// at boot (FlowShell.consumeShare); one that arrives while the page is up
// comes through window.__flowShare. Either way it is parked here until the
// main pane is showing — the user may still be on the sign-in screen.

type ShareListener = (p: SharePayload) => void;
let pendingShare: SharePayload | null = null;
const shareListeners = new Set<ShareListener>();

export function setPendingShare(p: SharePayload | null): void {
  pendingShare = p;
  if (p) for (const l of Array.from(shareListeners)) l(p);
}

/** Hand over the parked share, once. */
export function takePendingShare(): SharePayload | null {
  const p = pendingShare;
  pendingShare = null;
  return p;
}

/** Be told when a share arrives while mounted. Returns the unsubscribe. */
export function subscribePendingShare(l: ShareListener): () => void {
  shareListeners.add(l);
  return () => {
    shareListeners.delete(l);
  };
}

/** What the shell calls for a share arriving while the page is up. Returns
 * true when the page took it, so the shell can park it otherwise. */
export function installShareBridge(target: object = globalThis): void {
  (target as { __flowShare?: (raw: unknown) => boolean }).__flowShare = (raw: unknown) => {
    const p = parseSharePayload(raw);
    if (!p) return false;
    setPendingShare(p);
    return true;
  };
}

/** The share the app was launched with, if any. Outside the shell: null. */
export async function consumeShare(): Promise<SharePayload | null> {
  const p = flowShellPlugin();
  if (!p || typeof p.consumeShare !== 'function') return null;
  try {
    const res = await p.consumeShare();
    return parseSharePayload(res?.payload ?? null);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// From the picker into a composer. The picker selects the channel and parks
// the draft here; that channel's composer takes it when it mounts, or at once
// when it is already up. Only the channel composer — never a thread's.

export interface StagedDraft {
  text: string;
  files: File[];
}

const staged = new Map<string, StagedDraft>();
const stagedListeners = new Map<string, Set<(d: StagedDraft) => void>>();

export function stageForComposer(channelId: string, draft: StagedDraft): void {
  const listeners = stagedListeners.get(channelId);
  if (listeners && listeners.size > 0) {
    for (const l of Array.from(listeners)) l(draft);
    return;
  }
  staged.set(channelId, draft);
}

export function takeStaged(channelId: string): StagedDraft | null {
  const d = staged.get(channelId) ?? null;
  staged.delete(channelId);
  return d;
}

export function subscribeStaged(channelId: string, l: (d: StagedDraft) => void): () => void {
  let set = stagedListeners.get(channelId);
  if (!set) {
    set = new Set();
    stagedListeners.set(channelId, set);
  }
  set.add(l);
  return () => {
    set!.delete(l);
    if (set!.size === 0) stagedListeners.delete(channelId);
  };
}

/** Test seam. */
export function resetShareStateForTests(): void {
  pendingShare = null;
  shareListeners.clear();
  staged.clear();
  stagedListeners.clear();
}
