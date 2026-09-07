import type { Track } from '@zabify/shared';

/** "Artist1, Artist2" — shared tiny helper for provider-side code. */
export function artistsLabelOf(track: Track): string {
  return track.artists.map((a) => a.name).join(', ') || 'Unknown';
}
