// "Share to Flow" (docs/design/ANDROID.md phase 5): the picker shown when
// another app shares text, a link or files into the packaged app. Mirrors the
// iOS share extension (#214/#221) — workspace and channel, then the composer,
// where the user adds a caption and sends. Nothing is posted from here.
import { useEffect, useMemo, useState } from 'react';
import type { ChannelDTO } from '@flow/shared';
import { dmTitle, isSelfDm } from '../lib/channelTitle';
import { publicConfig } from '../lib/google';
import { fetchSharedFile, shareDraftText, shareSummary, splitBySize, stageForComposer, type SharePayload } from '../lib/share';
import { useAuth, useSelection } from '../state';
import { useChannels, useNameMap, useWorkspaces } from '../hooks';
import { Modal } from './modals';

const DEFAULT_MAX_FILE_BYTES = 500 * 1024 * 1024; // the server default, for a server predating maxFileBytes

export default function ShareSheet({
  payload,
  onClose,
  onPicked,
}: {
  payload: SharePayload;
  onClose: () => void;
  /** The channel is selected and the draft staged; the caller reveals the composer. */
  onPicked: () => void;
}) {
  const auth = useAuth();
  const sel = useSelection();
  const workspaces = useWorkspaces();
  const [wsId, setWsId] = useState<string | null>(sel.workspaceId);
  useEffect(() => {
    if (!wsId && workspaces.data?.[0]) setWsId(workspaces.data[0].id);
  }, [wsId, workspaces.data]);
  const channels = useChannels(wsId);
  const names = useNameMap(wsId);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const rows = useMemo(() => {
    const all = (channels.data ?? []).filter((c) => c.isMember && !c.archivedAt);
    const me = auth.user.id;
    const label = (c: ChannelDTO) => (c.kind === 'standard' ? `#${c.name ?? ''}` : dmTitle(c, names, me));
    const standard = all.filter((c) => c.kind === 'standard').sort((a, b) => label(a).localeCompare(label(b)));
    const dms = all.filter((c) => c.kind !== 'standard' && !isSelfDm(c, me)).sort((a, b) => label(a).localeCompare(label(b)));
    const q = filter.trim().toLowerCase();
    return [...standard, ...dms]
      .map((c) => ({ id: c.id, label: label(c), dm: c.kind !== 'standard' }))
      .filter((r) => !q || r.label.toLowerCase().includes(q));
  }, [channels.data, names, auth.user.id, filter]);

  const pick = async (channelId: string, label: string) => {
    if (busy) return;
    setBusy(channelId);
    setErrors([]);
    const problems: string[] = [];
    const files: File[] = [];
    try {
      const cfg = await publicConfig().catch(() => null);
      const max = cfg && typeof cfg.maxFileBytes === 'number' ? cfg.maxFileBytes : DEFAULT_MAX_FILE_BYTES;
      const { ok, rejected } = splitBySize(payload.files, max);
      problems.push(...rejected);
      for (const f of ok) {
        try {
          files.push(await fetchSharedFile(f));
        } catch (err) {
          problems.push(err instanceof Error ? err.message : `could not read ${f.name}`);
        }
      }
    } finally {
      setBusy(null);
    }
    const text = shareDraftText(payload);
    if (!text && files.length === 0) {
      setErrors(problems.length ? problems : ['Nothing here that Flow can post.']);
      return;
    }
    if (wsId && wsId !== sel.workspaceId) sel.selectWorkspace(wsId);
    sel.selectChannel(channelId);
    stageForComposer(channelId, { text, files });
    if (problems.length) console.warn(`share to ${label}: ${problems.join('; ')}`);
    onPicked();
    onClose();
  };

  const wsList = workspaces.data ?? [];
  return (
    <Modal onClose={onClose} testid="share-sheet">
      <h2 className="text-base font-semibold">Share to Flow</h2>
      <p className="mt-0.5 text-sm text-faint">Sharing {shareSummary(payload)}. Pick where it goes.</p>
      {wsList.length > 1 && (
        <select
          data-testid="share-workspace"
          className="mt-3 w-full rounded-md border border-hairline2 bg-white px-2 py-1.5 text-sm"
          value={wsId ?? ''}
          onChange={(e) => { setWsId(e.target.value || null); setFilter(''); }}
        >
          {wsList.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      )}
      {wsList.length === 0 && workspaces.data && (
        <p className="mt-3 text-sm text-red-600">Join a workspace first, then share again.</p>
      )}
      <input
        data-testid="share-filter"
        className="mt-3 w-full rounded-md border border-hairline2 px-2 py-1.5 text-sm outline-none focus:border-accent/40"
        placeholder="Find a channel or person"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        autoFocus
      />
      {errors.map((e) => (
        <p key={e} className="mt-2 text-xs text-red-600">{e}</p>
      ))}
      <div className="mc-scroll mt-2 max-h-[50dvh] overflow-y-auto">
        {rows.length === 0 && channels.data && <p className="px-2 py-3 text-sm text-faint">No matches.</p>}
        {rows.map((r) => (
          <button
            key={r.id}
            data-testid={`share-target-${r.id}`}
            disabled={busy !== null}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-hover disabled:opacity-60"
            onClick={() => void pick(r.id, r.label)}
          >
            <span className="truncate">{r.label}</span>
            {busy === r.id && <span className="ml-auto text-xs text-faint">Preparing…</span>}
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button className="rounded-md px-3 py-1.5 text-sm text-faint hover:text-ink" onClick={onClose} disabled={busy !== null}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
