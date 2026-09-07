import { Link } from 'react-router-dom';
import type { Artwork as ArtworkT } from '@zabify/shared';

export function bestArtwork(art: ArtworkT[] | undefined, size = 256): string | undefined {
  if (!art || art.length === 0) return undefined;
  const sorted = [...art].sort((a, b) => {
    const da = Math.abs((a.width ?? 0) - size);
    const db = Math.abs((b.width ?? 0) - size);
    return da - db;
  });
  return sorted[0]?.url;
}

export function Artwork({
  art,
  title,
  size = 256,
  className = '',
  rounded = 'rounded-lg',
}: {
  art: ArtworkT[] | undefined;
  title: string;
  size?: number;
  className?: string;
  rounded?: string;
}) {
  const url = bestArtwork(art, size);
  if (!url) {
    return (
      <div className={`grid shrink-0 place-items-center bg-gradient-to-br from-white/15 to-white/5 font-bold ${rounded} ${className}`} aria-hidden>
        {title.slice(0, 1)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      draggable={false}
      className={`shrink-0 bg-white/5 object-cover ${rounded} ${className}`}
    />
  );
}

export function EntityCard({
  to,
  title,
  subtitle,
  art,
}: {
  to: string;
  title: string;
  subtitle?: string;
  art: ArtworkT[] | undefined;
}) {
  return (
    <Link
      to={to}
      className="group w-36 shrink-0 snap-start rounded-xl p-2 text-left hover:bg-white/5 sm:w-44"
    >
      <Artwork art={art} title={title} className="aspect-square w-full text-3xl" rounded="rounded-xl" />
      <p className="mt-2 truncate text-sm font-medium group-hover:text-accent">{title}</p>
      {subtitle ? <p className="truncate text-xs text-ink-secondary">{subtitle}</p> : null}
    </Link>
  );
}

export function Carousel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold tracking-tight">{title}</h2>
      <div className="-mx-2 flex snap-x gap-1 overflow-x-auto px-2 pb-2">{children}</div>
    </section>
  );
}
