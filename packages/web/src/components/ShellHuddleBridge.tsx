import { useEffect, useRef } from 'react';
import { useHuddle } from '../huddle';
import { huddleServiceAction, setHuddleActive } from '../lib/huddleShell';
import { isPackagedShell } from '../lib/shell';

/**
 * Renders nothing; tells the Android shell when a huddle starts and ends
 * (docs/design/ANDROID.md phase 4), so it can hold a foreground service —
 * the call survives switching apps — and route audio to the speaker.
 * Mounted inside HuddleProvider by Main; a no-op in a browser tab.
 */
export default function ShellHuddleBridge() {
  const huddle = useHuddle();
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (!isPackagedShell()) return;
    const action = huddleServiceAction(prev.current, huddle.channelId);
    prev.current = huddle.channelId;
    if (action === 'start') void setHuddleActive(true);
    else if (action === 'stop') void setHuddleActive(false);
  }, [huddle.channelId]);
  return null;
}
