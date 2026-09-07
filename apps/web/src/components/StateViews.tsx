export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <p className="text-base font-medium text-ink">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-ink-secondary">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <p className="text-base font-medium text-ink">Couldn&apos;t load this section.</p>
      <p className="max-w-sm text-sm text-ink-secondary">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
