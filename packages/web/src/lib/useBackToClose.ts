import { useEffect } from 'react';
import { isPackagedShell, registerBackHandler } from './shell';

/**
 * The hardware back button as Escape (docs/design/ANDROID.md phase 1): while
 * the calling component is mounted, a back press in the packaged app closes
 * it instead of backgrounding the app. Registered on mount, so an overlay
 * that opened after the main pane sits above it in the handler stack and
 * wins — the same newest-first rule as everything else in lib/shell.ts.
 * A no-op in a browser tab.
 */
export function useBackToClose(onClose: () => void): void {
  useEffect(() => {
    if (!isPackagedShell()) return;
    return registerBackHandler(() => {
      onClose();
      return true;
    });
  }, [onClose]);
}
