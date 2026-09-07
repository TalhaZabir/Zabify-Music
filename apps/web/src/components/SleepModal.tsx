import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { SLEEP_PRESETS, sleepLabel, useSleep } from '../stores/sleep';
import { toast } from '../stores/toast';

export function SleepModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const endsAt = useSleep((s) => s.endsAt);
  const endOfTrack = useSleep((s) => s.endOfTrack);
  const startMinutes = useSleep((s) => s.startMinutes);
  const startEndOfTrack = useSleep((s) => s.startEndOfTrack);
  const cancel = useSleep((s) => s.cancel);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [open ]);

  const active = endsAt !== null || endOfTrack;

  return (
    <Modal open={open} title="Sleep timer" onClose={onClose}>
      <p className="mb-3 text-sm text-ink-secondary">
        Current: <span className="font-medium text-ink">{sleepLabel(endsAt, endOfTrack)}</span>
      </p>
      <div className="grid grid-cols-3 gap-2">
        {SLEEP_PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              startMinutes(m);
              toast(`Sleep timer: ${m} min`, 'success');
              onClose();
            }}
            className="rounded-lg border border-white/10 px-3 py-2.5 text-sm hover:bg-white/10"
          >
            {m} min
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            startEndOfTrack();
            toast('Music stops at end of track', 'success');
            onClose();
          }}
          className="col-span-3 rounded-lg border border-white/10 px-3 py-2.5 text-sm hover:bg-white/10"
        >
          End of track
        </button>
      </div>
      {active ? (
        <button
          type="button"
          onClick={() => {
            cancel();
            toast('Sleep timer off');
            onClose();
          }}
          className="mt-3 w-full rounded-lg border border-red-500/30 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10"
        >
          Cancel timer
        </button>
      ) : null}
    </Modal>
  );
}
