import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSettings } from '../stores/settings';
import { useLibrary } from '../stores/library';
import { usePlaylists } from '../stores/playlists';
import { useIntegrations } from '../stores/integrations';
import { toast } from '../stores/toast';
import { buildExport, downloadJson, parseLibraryImport } from '../lib/libraryIO';
import { apiFetch, apiPost, getActiveBase, normalizeBase, testBase } from '../lib/apiClient';
import type { BackgroundMode, StreamQuality } from '@zabify/shared';

const accents = ['#2dd4bf', '#38bdf8', '#a78bfa', '#f472b6', '#fbbf24', '#a3e635'];
const backgrounds: BackgroundMode[] = ['pure-black', 'near-black', 'dark-gray', 'glass'];
const qualities: { id: StreamQuality; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Best available' },
  { id: 'high', label: 'High', hint: '~256 kbps opus' },
  { id: 'medium', label: 'Medium', hint: '~128 kbps' },
  { id: 'low', label: 'Low', hint: 'Saves data' },
];

export function Settings() {
  const s = useSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <section className="rounded-xl border border-white/10 bg-base-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-secondary">Appearance</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent color">
          {accents.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Accent ${c}`}
              onClick={() => s.setAccent(c)}
              className={`h-9 w-9 rounded-full border ${s.accent === c ? 'border-white' : 'border-white/20'}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor="accent-custom" className="text-xs text-ink-secondary">
            Custom
          </label>
          <input
            id="accent-custom"
            type="color"
            value={s.accent}
            onChange={(e) => s.setAccent(e.target.value)}
            className="h-9 w-14 cursor-pointer rounded bg-transparent"
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {backgrounds.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => s.setBackground(b)}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${s.background === b ? 'border-accent' : 'border-white/10 hover:bg-white/5'}`}
            >
              {b}
            </button>
          ))}
        </div>
      </section>

      <LibrarySection />

      <ApiSection />

      <IntegrationsSection />

      <section className="rounded-xl border border-white/10 bg-base-900 p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink-secondary">Playback</h2>
        <p className="mb-3 text-xs text-ink-tertiary">Quality applies to the next track you play.</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Stream quality">
          {qualities.map((q) => (
            <button
              key={q.id}
              type="button"
              role="radio"
              aria-checked={s.quality === q.id}
              onClick={() => s.setQuality(q.id)}
              className={`rounded-lg border px-3 py-2 text-left ${s.quality === q.id ? 'border-accent' : 'border-white/10 hover:bg-white/5'}`}
            >
              <span className="block text-sm font-medium">{q.label}</span>
              <span className="block text-xs text-ink-tertiary">{q.hint}</span>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <label htmlFor="fade" className="mb-1 flex justify-between text-xs text-ink-secondary">
            <span>Fade in / out</span>
            <span>{s.fadeSec === 0 ? 'Off' : `${s.fadeSec}s`}</span>
          </label>
          <input
            id="fade"
            type="range"
            min={0}
            max={8}
            step={1}
            value={s.fadeSec}
            onChange={(e) => s.setFadeSec(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2.5">
          <span>
            <span className="block text-sm">Gapless preload</span>
            <span className="block text-xs text-ink-tertiary">Resolve the next track early for seamless transitions.</span>
          </span>
          <input
            type="checkbox"
            checked={s.gapless}
            onChange={(e) => s.setGapless(e.target.checked)}
            aria-label="Gapless preload"
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>
        <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2.5">
          <span>
            <span className="block text-sm">Autoplay suggestions</span>
            <span className="block text-xs text-ink-tertiary">Extend the queue automatically with related tracks.</span>
          </span>
          <input
            type="checkbox"
            checked={s.autoplay}
            onChange={(e) => s.setAutoplay(e.target.checked)}
            aria-label="Autoplay suggestions"
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>
        <p className="mt-3 text-xs text-ink-tertiary">
          Note: spectrum visualizer and EQ need Web Audio access, which stream hosts block (no CORS headers) —
          enabling them would silence playback, so they&apos;re intentionally omitted.
        </p>
      </section>
    </div>
  );
}

function ApiSection() {
  const apiPrimary = useSettings((s) => s.apiPrimary);
  const apiFallback = useSettings((s) => s.apiFallback);
  const customApi = useSettings((s) => s.customApi);
  const useCustomApi = useSettings((s) => s.useCustomApi);
  const setApi = useSettings((s) => s.setApi);
  const resetApi = useSettings((s) => s.resetApi);
  const [results, setResults] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [active, setActive] = useState('');

  useEffect(() => {
    setActive(getActiveBase());
    const t = window.setInterval(() => setActive(getActiveBase()), 2000);
    return () => window.clearInterval(t);
  }, []);

  async function test(key: string, value: string): Promise<void> {
    const base = normalizeBase(value);
    if (!base) {
      setResults((r) => ({ ...r, [key]: 'Invalid URL' }));
      return;
    }
    setTesting(key);
    const res = await testBase(base);
    setTesting(null);
    setResults((r) => ({ ...r, [key]: res.ok ? `OK · ${res.latencyMs}ms` : `Failed · ${res.message}` }));
  }

  const field = (
    key: string,
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder: string,
  ): ReactNode => (
    <div>
      <label htmlFor={`api-${key}`} className="mb-1 block text-xs text-ink-secondary">{label}</label>
      <div className="flex gap-2">
        <input
          id={`api-${key}`}
          value={value}
          onChange={(e) => set(e.target.value)}
          placeholder={placeholder}
          inputMode="url"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-base-950 px-3 py-2 text-sm outline-none placeholder:text-ink-tertiary focus:border-accent"
        />
        <button
          type="button"
          disabled={testing === key || !value.trim()}
          onClick={() => void test(key, value)}
          className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40"
        >
          {testing === key ? '…' : 'Test'}
        </button>
      </div>
      {results[key] ? <p className="mt-1 text-xs text-ink-tertiary">{results[key]}</p> : null}
    </div>
  );

  return (
    <section className="rounded-xl border border-white/10 bg-base-900 p-4">
      <h2 className="mb-1 text-sm font-semibold text-ink-secondary">API instances</h2>
      <p className="mb-3 text-xs text-ink-tertiary">
        Active: <span className="font-medium text-ink">{active || '…'}</span>
        <br />
        Only public music queries are sent to these servers — never credentials or private data.
      </p>
      <div className="space-y-3">
        {field('primary', 'Primary API', apiPrimary, (v) => setApi({ apiPrimary: v }), '/api or https://host/api')}
        {field('fallback', 'Fallback API (optional)', apiFallback, (v) => setApi({ apiFallback: v }), 'https://backup-host/api')}
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2.5">
          <span className="text-sm">Developer mode: use custom backend</span>
          <input
            type="checkbox"
            checked={useCustomApi}
            onChange={(e) => setApi({ useCustomApi: e.target.checked })}
            aria-label="Use custom backend"
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>
        {useCustomApi ? field('custom', 'Custom backend URL', customApi, (v) => setApi({ customApi: v }), 'https://example.com/api') : null}
        <button
          type="button"
          onClick={() => {
            resetApi();
            setResults({});
            toast('API settings reset');
          }}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
        >
          Reset to defaults
        </button>
      </div>
    </section>
  );
}

function IntegrationsSection() {
  const lastfmUser = useIntegrations((s) => s.lastfmUser);
  const lastfmSk = useIntegrations((s) => s.lastfmSk);
  const setLastfm = useIntegrations((s) => s.setLastfm);
  const clearLastfm = useIntegrations((s) => s.clearLastfm);
  const lbToken = useIntegrations((s) => s.listenbrainzToken);
  const setLb = useIntegrations((s) => s.setListenbrainz);
  const clearLb = useIntegrations((s) => s.clearListenbrainz);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lbStatus, setLbStatus] = useState('');

  async function lastfmStart(): Promise<void> {
    setBusy(true);
    try {
      const res = await apiFetch('/integrations/lastfm/token');
      const json = (await res.json()) as { token?: string; url?: string; error?: { message?: string } };
      if (!res.ok || !json.token || !json.url) throw new Error(json.error?.message ?? 'Last.fm is not configured on this server.');
      setPendingToken(json.token);
      window.open(json.url, '_blank', 'noopener');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Last.fm failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function lastfmFinish(): Promise<void> {
    if (!pendingToken) return;
    setBusy(true);
    try {
      const r = await apiPost('/integrations/lastfm/session', { token: pendingToken });
      const json = (await r.json()) as { sk?: string; username?: string; error?: { message?: string } };
      if (!r.ok || !json.sk) throw new Error(json.error?.message ?? 'Not authorized yet.');
      setLastfm(json.sk, json.username ?? '');
      setPendingToken(null);
      toast(`Connected as ${json.username}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Last.fm failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function lbTest(): Promise<void> {
    if (!lbToken) return;
    setLbStatus('Checking…');
    try {
      const r = await fetch(`https://api.listenbrainz.org/1/validate-token?token=${encodeURIComponent(lbToken)}`);
      const json = (await r.json()) as { valid?: boolean; user_name?: string };
      setLbStatus(json.valid ? `Valid · ${json.user_name ?? 'ok'}` : 'Invalid token');
    } catch {
      setLbStatus('Unreachable');
    }
  }

  return (
    <section className="rounded-xl border border-white/10 bg-base-900 p-4">
      <h2 className="mb-1 text-sm font-semibold text-ink-secondary">Integrations</h2>
      <p className="mb-3 text-xs text-ink-tertiary">Optional scrobbling. Credentials stay on this device (Last.fm signing happens server-side).</p>
      <div className="space-y-3">
        <div className="rounded-lg border border-white/10 p-3">
          <p className="text-sm font-medium">Last.fm</p>
          {lastfmSk ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-ink-secondary">Connected{lastfmUser ? ` as ${lastfmUser}` : ''}</span>
              <button
                type="button"
                onClick={() => {
                  clearLastfm();
                  toast('Last.fm disconnected');
                }}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10"
              >
                Disconnect
              </button>
            </div>
          ) : pendingToken ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void lastfmFinish()}
                className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
              >
                I&apos;ve approved Zabify — connect
              </button>
              <button
                type="button"
                onClick={() => setPendingToken(null)}
                className="rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void lastfmStart()}
              className="mt-2 rounded-lg border border-white/15 px-4 py-2 text-xs hover:bg-white/10 disabled:opacity-40"
            >
              Connect Last.fm
            </button>
          )}
        </div>
        <div className="rounded-lg border border-white/10 p-3">
          <p className="text-sm font-medium">ListenBrainz</p>
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={lbToken}
              onChange={(e) => setLb(e.target.value)}
              placeholder="User token from listenbrainz.org"
              aria-label="ListenBrainz token"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-base-950 px-3 py-2 text-sm outline-none placeholder:text-ink-tertiary focus:border-accent"
            />
            <button
              type="button"
              onClick={() => void lbTest()}
              disabled={!lbToken}
              className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40"
            >
              Test
            </button>
            {lbToken ? (
              <button
                type="button"
                onClick={() => {
                  clearLb();
                  setLbStatus('');
                }}
                className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10"
              >
                Clear
              </button>
            ) : null}
          </div>
          {lbStatus ? <p className="mt-1.5 text-xs text-ink-tertiary">{lbStatus}</p> : null}
        </div>
        <p className="text-xs text-ink-tertiary">Discord Rich Presence isn&apos;t possible from a browser tab — no local bridge is bundled, so it&apos;s intentionally omitted.</p>
      </div>
    </section>
  );
}

function LibrarySection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  function doExport(): void {
    const lib = useLibrary.getState();
    const pls = usePlaylists.getState();
    const settings = useSettings.getState();
    const data = buildExport({
      likedTracks: lib.likedTrackIds.flatMap((id) => {
        const t = lib.likedTracks[id];
        return t ? [t] : [];
      }),
      playlists: pls.playlists,
      albums: lib.savedAlbums.map((id) => ({ id, name: lib.savedMeta[id]?.name ?? id })),
      artists: lib.savedArtists.map((id) => ({ id, name: lib.savedMeta[id]?.name ?? id })),
      settings: { accent: settings.accent, quality: settings.quality },
    });
    downloadJson(`zabify-library-${new Date().toISOString().slice(0, 10)}.json`, data);
    toast('Library exported', 'success');
  }

  async function doImport(file: File): Promise<void> {
    setBusy(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const data = parseLibraryImport(parsed);
      const lib = useLibrary.getState();
      const pls = usePlaylists.getState();
      const settings = useSettings.getState();
      for (const t of data.likedTracks) {
        if (!lib.isLiked(t.id)) lib.toggleLike(t.id, t);
      }
      for (const p of data.playlists) {
        const created = pls.create(p.name);
        if (p.description) pls.setDescription(created.id, p.description);
        pls.addTracks(created.id, p.tracks);
      }
      for (const a of data.albums) {
        if (!lib.isSaved('album', a.id)) lib.toggleSave('album', a.id, a.name);
      }
      for (const a of data.artists) {
        if (!lib.isSaved('artist', a.id)) lib.toggleSave('artist', a.id, a.name);
      }
      if (data.settings.accent) settings.setAccent(data.settings.accent);
      if (data.settings.quality) settings.setQuality(data.settings.quality);
      toast(`Imported ${data.likedTracks.length} liked + ${data.playlists.length} playlists`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed', 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <section className="rounded-xl border border-white/10 bg-base-900 p-4">
      <h2 className="mb-1 text-sm font-semibold text-ink-secondary">Library</h2>
      <p className="mb-3 text-xs text-ink-tertiary">Export a portable backup, or import one. Imports merge — nothing is overwritten.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={doExport}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
        >
          Export library
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
        >
          {busy ? 'Importing…' : 'Import library'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Import library file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doImport(f);
          }}
        />
      </div>
    </section>
  );
}
