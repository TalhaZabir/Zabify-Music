import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMenu } from '../stores/menu';

export function ContextMenuHost() {
  const { open, x, y, items, close } = useMenu();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    const onClick = (): void => close();
    // Defer subscription by a tick: the click that opened the menu is
    // still bubbling when this effect runs, and would instantly close it.
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      window.addEventListener('keydown', onKey);
      window.addEventListener('click', onClick);
      window.addEventListener('scroll', onClick, true);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onClick, true);
    };
  }, [open, close]);

  const px = Math.min(x, window.innerWidth - 220);
  const py = Math.min(y, window.innerHeight - items.length * 40 - 90);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={ref}
          role="menu"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.12 }}
          className="z-menu fixed w-52 overflow-hidden rounded-lg border border-white/10 bg-base-800/95 p-1 shadow-lift backdrop-blur"
          style={{ left: px, top: py }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                item.run();
              }}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/10 ${
                item.danger ? 'text-red-400' : 'text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function menuFromEvent(e: React.MouseEvent): { x: number; y: number } {
  e.preventDefault();
  e.stopPropagation();
  return { x: e.clientX, y: e.clientY };
}
