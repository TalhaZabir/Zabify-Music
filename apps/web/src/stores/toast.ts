import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  kind: 'info' | 'success' | 'error';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: Toast['kind']) => void;
  dismiss: (id: string) => void;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, kind }] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(message: string, kind: Toast['kind'] = 'info'): void {
  useToasts.getState().push(message, kind);
}
