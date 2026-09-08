// The packaged-app shell (docs/design/ANDROID.md, phase 1): how the web client
// knows it is running inside the Capacitor app rather than a browser tab, and
// the one contract the shell drives it through — the hardware back button.
//
// Detection is build-time first: the shell's web build sets VITE_FLOW_SHELL.
// The runtime fallback is the bridge object Capacitor injects into every
// WebView it hosts, so a dev build that forgot the flag still behaves. A
// browser tab never has either, so nothing here changes the web client.

export type ShellPlatform = 'android';

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function capacitorGlobal(): CapacitorGlobal | undefined {
  return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** Which shell hosts this page, or `null` for an ordinary browser tab. */
export function shellPlatform(): ShellPlatform | null {
  const built = import.meta.env.VITE_FLOW_SHELL;
  if (built === 'android') return built;
  const cap = capacitorGlobal();
  if (cap?.isNativePlatform?.() && cap.getPlatform?.() === 'android') return 'android';
  return null;
}

export function isPackagedShell(): boolean {
  return shellPlatform() !== null;
}

// ---- hardware back ---------------------------------------------------------
//
// Android's MainActivity asks the page first — `window.__flowBack()` over
// evaluateJavascript — and only sends the app to the background when the page
// answers `false`. Handlers run newest-first and the first to return `true`
// wins; a view that has something to close registers while it is open and
// unregisters when it is gone, so the page never has to know the whole stack.

export type BackHandler = () => boolean;

const backHandlers: BackHandler[] = [];

/** Register a handler; returns the matching unregister. Idempotent per handler. */
export function registerBackHandler(handler: BackHandler): () => void {
  if (!backHandlers.includes(handler)) backHandlers.push(handler);
  return () => {
    const i = backHandlers.indexOf(handler);
    if (i >= 0) backHandlers.splice(i, 1);
  };
}

/** Run the handlers newest-first. `true` = the page consumed the press. */
export function handleBack(): boolean {
  for (let i = backHandlers.length - 1; i >= 0; i--) {
    if (backHandlers[i]!()) return true;
  }
  return false;
}

/** What the shell calls. Installed once at boot, only inside a shell. */
export function installBackBridge(target: object = globalThis): void {
  (target as { __flowBack?: () => boolean }).__flowBack = handleBack;
}

/** Test seam. */
export function resetBackHandlersForTests(): void {
  backHandlers.length = 0;
}

// ---- what back should do in the main pane ----------------------------------
//
// Pure so it is testable without React: the order is the doc's
// "thread → channel → drawer". A side panel (artifact, files) sits between the
// thread and the channel because it is the more recent thing the user opened.

export interface BackState {
  threadOpen: boolean;
  panelOpen: boolean;
  isMobile: boolean;
  drawerOpen: boolean;
}

export type BackAction = 'close-thread' | 'close-panel' | 'open-drawer' | 'leave';

export function backAction(s: BackState): BackAction {
  if (s.threadOpen) return 'close-thread';
  if (s.panelOpen) return 'close-panel';
  if (s.isMobile && !s.drawerOpen) return 'open-drawer';
  return 'leave';
}
