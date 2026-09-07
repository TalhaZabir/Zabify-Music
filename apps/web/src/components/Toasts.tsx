import { AnimatePresence, motion } from 'framer-motion';
import { useToasts } from '../stores/toast';

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="z-toast pointer-events-none fixed bottom-24 right-3 flex w-[min(92vw,360px)] flex-col gap-2 md:bottom-24 md:right-5" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className={`pointer-events-auto rounded-lg border px-3.5 py-2.5 text-left text-sm shadow-lift backdrop-blur ${
              t.kind === 'error'
                ? 'border-red-500/30 bg-[#1c1111]/95'
                : t.kind === 'success'
                  ? 'border-emerald-500/25 bg-base-800/95'
                  : 'border-white/10 bg-base-800/95'
            }`}
          >
            {t.message}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
