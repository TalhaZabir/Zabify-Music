import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS, type BackgroundMode, type StreamQuality } from '@zabify/shared';
import { normalizeBase, setApiBases } from '../lib/apiClient';

interface SettingsState {
  accent: string;
  background: BackgroundMode;
  animations: boolean;
  compactMode: boolean;
  volume: number;
  quality: StreamQuality;
  fadeSec: number;
  gapless: boolean;
  autoplay: boolean;
  apiPrimary: string;
  apiFallback: string;
  customApi: string;
  useCustomApi: boolean;
  sidebarCollapsed: boolean;
  setAccent: (v: string) => void;
  setBackground: (v: BackgroundMode) => void;
  setVolume: (v: number) => void;
  setQuality: (v: StreamQuality) => void;
  setFadeSec: (v: number) => void;
  setGapless: (v: boolean) => void;
  setAutoplay: (v: boolean) => void;
  setApi: (patch: Partial<Pick<SettingsState, 'apiPrimary' | 'apiFallback' | 'customApi' | 'useCustomApi'>>) => void;
  resetApi: () => void;
  toggleSidebar: () => void;
}

export function effectiveBases(s: Pick<SettingsState, 'apiPrimary' | 'apiFallback' | 'customApi' | 'useCustomApi'>): string[] {
  if (s.useCustomApi) {
    const c = normalizeBase(s.customApi);
    return c ? [c] : [];
  }
  const out: string[] = [];
  const p = normalizeBase(s.apiPrimary);
  const f = normalizeBase(s.apiFallback);
  if (p) out.push(p);
  if (f && f !== p) out.push(f);
  return out;
}

export function applyApiBases(s: Pick<SettingsState, 'apiPrimary' | 'apiFallback' | 'customApi' | 'useCustomApi'>): void {
  setApiBases(effectiveBases(s));
}

function applyTheme(accent: string, background: BackgroundMode): void {
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-soft', `${accent}24`);
  root.dataset.background = background;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0a0a0a');
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      accent: DEFAULT_SETTINGS.accent,
      background: DEFAULT_SETTINGS.background,
      animations: true,
      compactMode: false,
      volume: DEFAULT_SETTINGS.volume,
      quality: DEFAULT_SETTINGS.quality,
      fadeSec: 0,
      gapless: true,
      autoplay: true,
      apiPrimary: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api',
      apiFallback: '',
      customApi: '',
      useCustomApi: false,
      sidebarCollapsed: false,
      setAccent: (v) => {
        set({ accent: v });
        applyTheme(v, get().background);
      },
      setBackground: (v) => {
        set({ background: v });
        applyTheme(get().accent, v);
      },
      setVolume: (v) => set({ volume: Math.min(1, Math.max(0, v)) }),
      setQuality: (quality) => set({ quality }),
      setFadeSec: (fadeSec) => set({ fadeSec: Math.min(8, Math.max(0, Math.round(fadeSec))) }),
      setGapless: (gapless) => set({ gapless }),
      setAutoplay: (autoplay) => set({ autoplay }),
      setApi: (patch) =>
        set((s) => {
          const next = { ...s, ...patch };
          applyApiBases(next);
          return next;
        }),
      resetApi: () =>
        set((s) => {
          const next = {
            ...s,
            apiPrimary: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api',
            apiFallback: '',
            customApi: '',
            useCustomApi: false,
          };
          applyApiBases(next);
          return next;
        }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: 'zabify-settings',
      version: 1,
      // Migration for Render redeploys: the baked VITE_API_BASE_URL is fixed
      // AFTER the first deploy (static hosts bake it at build time), but the
      // old wrong value (usually "/api") is already persisted in browsers.
      // Without this, fixing the env + redeploying never fixes existing
      // browsers — they keep hitting the stale base until "Reset to defaults".
      migrate: (persisted: unknown) => {
        const baked = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
        const state = (persisted as { state?: Record<string, unknown> } | null)?.state;
        if (state && typeof state.apiPrimary === 'string') {
          const stored = state.apiPrimary.trim();
          // Stored relative "/api" is only correct when served same-origin
          // (Docker nginx). On a static host (Render) with an absolute baked
          // URL, the stored relative value is stale from the first deploy.
          if (stored === '/api' && baked.startsWith('http')) {
            state.apiPrimary = baked;
          }
        }
        return persisted as never;
      },
      onRehydrateStorage: () => (s) => {
        if (s) {
          applyTheme(s.accent, s.background);
          // Same stale-base guard for stores that bypass migrate (same version).
          const baked = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
          if (s.apiPrimary.trim() === '/api' && baked.startsWith('http') && !s.useCustomApi) {
            s.apiPrimary = baked;
          }
          applyApiBases(s);
        }
      },
    },
  ),
);

export function initThemeFromStorage(): void {
  try {
    const raw = localStorage.getItem('zabify-settings');
    if (!raw) return;
    const parsed = JSON.parse(raw) as { state?: { accent?: string; background?: BackgroundMode } };
    applyTheme(parsed.state?.accent ?? DEFAULT_SETTINGS.accent, parsed.state?.background ?? 'near-black');
  } catch {
    applyTheme(DEFAULT_SETTINGS.accent, 'near-black');
  }
}
