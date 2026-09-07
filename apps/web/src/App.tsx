import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { Home } from './pages/Home';
import { Search } from './pages/Search';
import { Library } from './pages/Library';
import { Settings } from './pages/Settings';
import { Artist } from './pages/Artist';
import { Album } from './pages/Album';
import { Playlist } from './pages/Playlist';
import { LocalPlaylist } from './pages/LocalPlaylist';
import { LikedSongs } from './pages/LikedSongs';
import { History } from './pages/History';
import { MiniPlayer } from './components/MiniPlayer';
import { FullPlayer } from './components/FullPlayer';
import { QueuePanel } from './components/QueuePanel';
import { AddToPlaylistModal } from './components/AddToPlaylistModal';
import { CommandPalette } from './components/CommandPalette';
import { ContextMenuHost } from './components/ContextMenu';
import { Toasts } from './components/Toasts';
import { ErrorBoundary } from './components/ErrorBoundary';
import { bindAudioEngine } from './player/playback';
import { useDownloads } from './stores/downloads';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useMediaSession } from './hooks/useMediaSession';

function GlobalBindings() {
  useKeyboardShortcuts();
  useMediaSession();
  useEffect(() => {
    const unbind = bindAudioEngine();
    void useDownloads.getState().refresh();
    return unbind;
  }, []);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <GlobalBindings />
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/library" element={<Library />} />
            <Route path="/library/liked" element={<LikedSongs />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/artist/:id" element={<Artist />} />
            <Route path="/album/:id" element={<Album />} />
            <Route path="/playlist/:id" element={<Playlist />} />
            <Route path="/library/playlists/:id" element={<LocalPlaylist />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
        <MiniPlayer />
        <FullPlayer />
        <QueuePanel />
        <AddToPlaylistModal />
        <CommandPalette />
        <ContextMenuHost />
        <Toasts />
      </ErrorBoundary>
    </BrowserRouter>
  );
}
