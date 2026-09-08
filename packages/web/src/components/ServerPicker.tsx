import { useState } from 'react';
import { setApiBase } from '../lib/apiBase';
import { resetPublicConfig } from '../lib/google';
import {
  describeProbeFailure,
  normalizeServerUrl,
  probeServer,
  suggestedServer,
} from '../lib/serverPicker';

/**
 * First-run screen of the packaged app (docs/design/ANDROID.md phase 1): which
 * Flow server to talk to. Prefilled with the build's default or the hosted
 * service; a self-host types its own. The choice is checked against
 * /v1/config before it is kept, so a wrong address or a server that does not
 * allow this app fails here, with a reason, rather than as a silent sign-in
 * failure later. Never rendered in a browser tab — see shouldShowServerPicker.
 */
export default function ServerPicker({
  onChosen,
  onCancel,
}: {
  onChosen: () => void;
  /** Present when reopened from the sign-in screen to change servers. */
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(suggestedServer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeServerUrl(value);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalized.ok) {
      setError(
        normalized.reason === 'empty'
          ? 'Enter the address of your Flow server.'
          : normalized.reason === 'scheme'
            ? 'Use an https:// (or http://) address.'
            : "That doesn't look like a server address.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    const probe = await probeServer(normalized.url);
    setBusy(false);
    if (!probe.ok) {
      setError(describeProbeFailure(probe, normalized.insecure));
      return;
    }
    setApiBase(normalized.url);
    resetPublicConfig(); // the cached /v1/config belonged to the previous server
    onChosen();
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-hairline bg-surface p-6 shadow-sm"
        data-testid="server-picker"
      >
        <h1 className="mb-1 text-center text-2xl font-bold">Flow</h1>
        <p className="mb-4 text-center text-sm text-muted">Which server should this app connect to?</p>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-faint" htmlFor="server-url">
          Server
        </label>
        <input
          id="server-url"
          data-testid="server-url"
          className="mb-2 w-full rounded border border-hairline2 px-3 py-2 text-sm"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://app.freeflow.im"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
        />
        {normalized.ok && normalized.insecure && (
          <p className="mb-2 text-xs text-muted" data-testid="server-insecure">
            Plain http — fine for a server on your own network, not for anything public.
          </p>
        )}
        {error && (
          <p className="mb-2 text-sm text-danger" data-testid="server-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          data-testid="server-continue"
          className="w-full rounded bg-accent py-2 text-sm font-semibold text-white hover:bg-accent-deep disabled:opacity-50"
          disabled={busy}
        >
          {busy ? 'Checking…' : 'Continue'}
        </button>
        {onCancel && (
          <button
            type="button"
            className="mt-3 w-full text-center text-sm text-muted hover:text-accent-soft"
            onClick={onCancel}
            disabled={busy}
          >
            Keep the current server
          </button>
        )}
        <p className="mt-4 text-center text-xs text-faint">
          Self-hosting? Enter your own address. You can change it later from the sign-in screen.
        </p>
      </form>
    </div>
  );
}
