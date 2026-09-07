export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function artistsLabel(artists: { name: string }[]): string {
  return artists.map((a) => a.name).join(', ') || 'Unknown artist';
}
