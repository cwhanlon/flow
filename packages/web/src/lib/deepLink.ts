// Links that open the app (docs/design/ANDROID.md phase 2). Two shapes reach
// the shell: the `flow://` scheme every native client already understands
// (flow://signin?code=… from the web-to-app handoff, flow://invite/<token>),
// and verified https App Links for the server's own /join/… and /invite/…
// pages. Both are reduced here to the same three intents the web client
// already knows how to act on, so the rest of the client is untouched.
import type { AuthResponse } from '@flow/shared';
import { api } from './api';
import { parseJoinPath } from './joinLink';

export type DeepLink =
  | { kind: 'signin'; code: string }
  | { kind: 'invite'; token: string }
  | { kind: 'join'; token: string };

const TOKEN = /^[A-Za-z0-9_-]+$/;

export function parseDeepLink(raw: string): DeepLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol === 'flow:') {
    // A non-special scheme parses as host = the first segment: flow://signin
    // → "signin", flow://invite/abc → "invite" + "/abc".
    const kind = url.hostname.toLowerCase();
    const segments = url.pathname.split('/').filter(Boolean);
    if (kind === 'signin') {
      const code = url.searchParams.get('code');
      return code ? { kind: 'signin', code } : null;
    }
    if (kind === 'invite') {
      const token = segments[0];
      return token && TOKEN.test(token) ? { kind: 'invite', token } : null;
    }
    if (kind === 'join') {
      const token = parseJoinPath(`/join/${segments.join('/')}`);
      return token ? { kind: 'join', token } : null;
    }
    return null;
  }
  if (url.protocol === 'https:' || url.protocol === 'http:') {
    const invite = url.pathname.match(/^\/invite\/([A-Za-z0-9_-]+)\/?$/);
    if (invite) return { kind: 'invite', token: invite[1]! };
    const join = parseJoinPath(url.pathname);
    if (join) return { kind: 'join', token: join };
    return null;
  }
  return null;
}

/** What the shell calls for a link that arrives while the page is already up
 * (MainActivity.onNewIntent). Returns true so the shell knows it was taken. */
export function installOpenUrlBridge(handler: (url: string) => void, target: object = globalThis): void {
  (target as { __flowOpenUrl?: (url: string) => boolean }).__flowOpenUrl = (url) => {
    handler(url);
    return true;
  };
}

/** The web-to-app handoff's second half: a one-time code becomes a session. */
export function exchangeSigninCode(code: string): Promise<AuthResponse> {
  return api<AuthResponse>('POST', '/v1/auth/app-link/exchange', { code });
}

/** Where the app sends someone to sign in with Google: the server's own
 * handoff page, in the system browser, since Google will not run inside a
 * WebView. It mints a code and comes back as flow://signin. */
export function nativeGoogleUrl(apiBase: string): string {
  return `${apiBase.replace(/\/+$/, '')}/?native=google`;
}
