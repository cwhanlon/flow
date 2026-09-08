// First-run server picker for the packaged app (docs/design/ANDROID.md,
// phase 1). A browser tab is served by its own server; the app is served from
// its own origin and has to be told where the server is. The default is the
// hosted service, editable — the same posture as the macOS and iOS apps — and
// the choice persists through apiBase's store so it survives restarts.
import { getApiBase } from './apiBase';
import { isPackagedShell } from './shell';
import { store } from './storage';

export const DEFAULT_SERVER = 'https://app.freeflow.im';

/** The store key apiBase.ts persists the runtime choice under. */
export const API_BASE_KEY = 'flow.apiBase';

/** Show the picker when this is the app and no server has been chosen yet.
 * A build-time default (VITE_API_BASE) prefills the field but does not skip
 * the screen — the doc's "default, editable". */
export function shouldShowServerPicker(): boolean {
  return isPackagedShell() && store().get(API_BASE_KEY) === null;
}

/** What to prefill: the build's default if it has one, else the hosted service. */
export function suggestedServer(): string {
  return getApiBase() || DEFAULT_SERVER;
}

export type NormalizedServer =
  | { ok: true; url: string; insecure: boolean }
  | { ok: false; reason: 'empty' | 'invalid' | 'scheme' };

/** Turn what someone typed into an origin: adds https:// when there is no
 * scheme, keeps a port, drops any path/query/hash and the trailing slash.
 * Plain http is allowed (a LAN dev server) but flagged so the UI can say so. */
export function normalizeServerUrl(input: string): NormalizedServer {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: 'empty' };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'scheme' };
  if (!url.hostname) return { ok: false, reason: 'invalid' };
  return { ok: true, url: url.origin, insecure: url.protocol === 'http:' };
}

export type ProbeResult =
  | { ok: true }
  | { ok: false; reason: 'unreachable' | 'http-error' | 'not-flow'; status?: number };

/** Ask the candidate for /v1/config — public, cheap, and served by every Flow
 * server — which also proves the CORS allowlist covers this app's origin: a
 * server that has it wrong fails here as `unreachable`, before sign-in. */
export async function probeServer(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  let res: Response;
  try {
    res = await fetchImpl(`${origin}/v1/config`, { headers: { accept: 'application/json' } });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (!res.ok) return { ok: false, reason: 'http-error', status: res.status };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: 'not-flow' };
  }
  const cfg = body as { maxFileBytes?: unknown; huddles?: unknown } | null;
  if (!cfg || typeof cfg !== 'object' || typeof cfg.maxFileBytes !== 'number') {
    return { ok: false, reason: 'not-flow' };
  }
  return { ok: true };
}

export function describeProbeFailure(r: Extract<ProbeResult, { ok: false }>, insecure: boolean): string {
  switch (r.reason) {
    case 'unreachable':
      return insecure
        ? "Couldn't reach that server. Check the address, and that the app is allowed plain http to it."
        : "Couldn't reach that server. Check the address and that it allows this app (FLOW_CORS_ORIGINS).";
    case 'http-error':
      return `That server answered ${r.status ?? 'with an error'} — is the address right?`;
    case 'not-flow':
      return "That address answers, but it doesn't look like a Flow server.";
  }
}

/** How the sign-in screen names the chosen server: the host (and port), with
 * a plain-http scheme kept visible because it is worth noticing. */
export function displayServer(origin: string): string {
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' ? `http://${u.host}` : u.host;
  } catch {
    return origin;
  }
}
