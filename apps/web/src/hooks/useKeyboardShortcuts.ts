import { useEffect } from 'react';
import { usePlayer } from '../stores/player';
import { useUi } from '../stores/ui';
import { next, prev, seek, togglePlay } from '../player/playback';

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const { paletteOpen, setPalette } = useUi.getState();
        setPalette(!paletteOpen);
        return;
      }
      if (isTyping()) return;
      const s = usePlayer.getState();
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          seek(Math.max(0, s.positionMs - 5000));
          break;
        case 'ArrowRight':
          seek(s.positionMs + 5000);
          break;
        case 'ArrowUp':
          e.preventDefault();
          s.setVolume(Math.min(1, s.volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          s.setVolume(Math.max(0, s.volume - 0.05));
          break;
        case 'n':
        case 'N':
          next();
          break;
        case 'p':
        case 'P':
          prev();
          break;
        case 'm':
        case 'M':
          s.toggleMute();
          break;
        case 's':
        case 'S':
          s.toggleShuffle();
          break;
        case 'r':
        case 'R':
          s.cycleRepeat();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
