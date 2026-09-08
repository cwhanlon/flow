import { useEffect, useState } from 'react';
import type { PublicConfigDTO } from '@flow/shared';
import { getApiBase } from '../lib/apiBase';
import { nativeGoogleUrl } from '../lib/deepLink';
import { openExternal } from '../lib/flowShell';
import { publicConfig } from '../lib/google';

/**
 * "Continue with Google" for the packaged app (docs/design/ANDROID.md phase 2).
 * Google refuses to run its sign-in inside a WebView, so the app does what the
 * Mac and iPhone apps do: open the server's own handoff page (`/?native=google`)
 * in the system browser — a Chrome Custom Tab — where Google Identity runs for
 * real. That page mints a one-time app-link code and bounces to
 * flow://signin?code=…, which the shell delivers back to this page
 * (lib/deepLink.ts) and becomes a session. Hidden, like GoogleButton, when the
 * deployment has no Google client id.
 */
export default function ShellGoogleButton({ showDivider }: { showDivider: boolean }) {
  const [config, setConfig] = useState<PublicConfigDTO | null>(null);
  useEffect(() => {
    let alive = true;
    void publicConfig().then((cfg) => { if (alive) setConfig(cfg); });
    return () => { alive = false; };
  }, []);

  if (!config?.google) return null;

  const go = () => {
    const url = nativeGoogleUrl(getApiBase());
    void openExternal(url).then((opened) => {
      if (!opened) window.open(url, '_blank');
    });
  };

  return (
    <div data-testid="auth-google-shell">
      {showDivider && (
        <div className="my-3 flex items-center gap-2 text-xs text-faint">
          <span className="h-px flex-1 bg-hairline2" />
          or
          <span className="h-px flex-1 bg-hairline2" />
        </div>
      )}
      <button
        type="button"
        onClick={go}
        className="mb-2 w-full rounded border border-hairline2 py-2 text-sm font-semibold text-ink hover:bg-accent/[0.06]"
      >
        Continue with Google
      </button>
      <p className="mb-1 text-center text-xs text-faint">Opens in your browser and comes straight back.</p>
    </div>
  );
}
