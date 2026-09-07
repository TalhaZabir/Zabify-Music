import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface IntegrationsState {
  lastfmSk: string;
  lastfmUser: string;
  listenbrainzToken: string;
  setLastfm: (sk: string, user: string) => void;
  clearLastfm: () => void;
  setListenbrainz: (token: string) => void;
  clearListenbrainz: () => void;
}

export const useIntegrations = create<IntegrationsState>()(
  persist(
    (set) => ({
      lastfmSk: '',
      lastfmUser: '',
      listenbrainzToken: '',
      setLastfm: (lastfmSk, lastfmUser) => set({ lastfmSk, lastfmUser }),
      clearLastfm: () => set({ lastfmSk: '', lastfmUser: '' }),
      setListenbrainz: (listenbrainzToken) => set({ listenbrainzToken: listenbrainzToken.trim() }),
      clearListenbrainz: () => set({ listenbrainzToken: '' }),
    }),
    { name: 'zabify-integrations' },
  ),
);
