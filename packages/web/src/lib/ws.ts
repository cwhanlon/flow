// Thin WS client mirroring the macOS SocketClient (phase1.md §4): auth frame,
// ping→pong, reconnect with backoff. Online-only client: every reconnect is
// followed by query invalidation (the REST refetch IS the backfill).
import type { Event, ServerFrame } from '@flow/shared';
import { wsUrl } from './apiBase';

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting';

export interface SocketHandlers {
  onEvent(event: Event): void;
  onStatus(status: SocketStatus): void;
  /** The session id from `hello`. Identifies this *device* to the server, which
   * is how a DM ring answered here is told apart from the same ring answered on
   * your phone (#436). Fires again on every reconnect — the id is new each time. */
  onSession?(sessionId: string): void;
}

// How long silence from the server means the socket is dead (#271). The
// server heartbeats every 30s, but a connection that dies half-open — laptop
// asleep, Wi-Fi gone — reports nothing at all: no close event, no error, just
// nothing arriving. Silence is the only signal there is. Deadlines mirror the
// native clients (apps/macos/Sources/Flow/Networking/SocketClient.swift).
export const SOCKET_DEADLINE_MS = 70_000; // two missed heartbeats, plus slack
export const SOCKET_WAKE_DEADLINE_MS = 30_000; // a tab just restored: one is enough
const CHECK_INTERVAL_MS = 10_000;

export function isSocketDead(lastInboundAt: number, now: number, deadline = SOCKET_DEADLINE_MS): boolean {
  return now - lastInboundAt >= deadline;
}

export class SocketClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private backoff = 500;
  private lastInboundAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') this.dropIfSilent(SOCKET_WAKE_DEADLINE_MS);
  };
  // The OS knows before we do that the network is back (a phone leaving
  // airplane mode, Wi-Fi returning — ANDROID.md phase 1). A reconnect timer
  // set during the outage may still be many seconds out, and a socket that
  // died with the network looks fine until the watchdog notices. `online`
  // covers both: collapse the wait and start fresh, with the backoff reset.
  // A socket that is genuinely open is left alone — the watchdog is the judge
  // of health, not this event.
  private readonly onOnline = () => {
    if (this.stopped || this.ws?.readyState === WebSocket.OPEN) return;
    this.backoff = 500;
    this.dropAndReconnect(true);
  };

  constructor(
    private readonly token: string,
    private readonly handlers: SocketHandlers,
  ) {}

  start(): void {
    this.stopped = false;
    document.addEventListener('visibilitychange', this.onVisible);
    // `window` is absent under vitest's node environment; the tab-visibility
    // hook above is enough there.
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    document.removeEventListener('visibilitychange', this.onVisible);
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline);
    this.clearReconnectTimer();
    this.stopWatchdog();
    this.ws?.close();
    this.ws = null;
  }

  sendTyping(channelId: string, threadRootId?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: 'typing', channelId, ...(threadRootId ? { threadRootId } : {}) }));
    }
  }

  private connect(status?: SocketStatus): void {
    if (this.stopped) return;
    this.clearReconnectTimer();
    this.handlers.onStatus(status ?? (this.backoff === 500 ? 'connecting' : 'reconnecting'));
    const ws = new WebSocket(wsUrl('/v1/ws'));
    this.ws = ws;

    // Arm the watchdog from the attempt, not from `hello`: a socket that opens
    // and then says nothing is just as dead.
    this.lastInboundAt = Date.now();
    this.startWatchdog();

    ws.onopen = () => ws.send(JSON.stringify({ op: 'auth', token: this.token }));
    ws.onmessage = (msg) => {
      // Any frame is proof of life — pings included, and they are what keeps an
      // idle connection out of the watchdog's jaws.
      this.lastInboundAt = Date.now();
      let frame: ServerFrame;
      try {
        frame = JSON.parse(String(msg.data)) as ServerFrame;
      } catch {
        return;
      }
      if (frame.op === 'ping') {
        ws.send(JSON.stringify({ op: 'pong' }));
      } else if (frame.op === 'hello') {
        this.backoff = 500;
        this.handlers.onSession?.(frame.sessionId);
        this.handlers.onStatus('connected');
      } else if (frame.op === 'event') {
        this.handlers.onEvent(frame.event);
      }
    };
    ws.onclose = () => {
      this.stopWatchdog();
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.handlers.onStatus('reconnecting');
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 15_000);
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  // Nothing from the server for `deadline` ms: give up on this socket and
  // reconnect. We take the reconnect path ourselves rather than waiting for
  // `onclose`, because closing a half-open socket waits on a close handshake
  // the dead peer will never answer.
  private dropIfSilent(deadline: number): void {
    const ws = this.ws;
    if (!ws || !isSocketDead(this.lastInboundAt, Date.now(), deadline)) return;
    this.dropAndReconnect(false);
  }

  /** Abandon the current socket (if any) without waiting on a close handshake
   * the peer may never answer, then reconnect — right away, or on the backoff. */
  private dropAndReconnect(immediately: boolean): void {
    const ws = this.ws;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      ws.close();
      this.ws = null;
    }
    this.stopWatchdog();
    if (immediately) {
      this.connect('reconnecting');
    } else {
      this.scheduleReconnect();
    }
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdog = setInterval(() => this.dropIfSilent(SOCKET_DEADLINE_MS), CHECK_INTERVAL_MS);
  }

  private stopWatchdog(): void {
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
  }
}
