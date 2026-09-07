import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSettings } from '../stores/settings';
import { useUi } from '../stores/ui';
import { OnlineBadge } from '../components/OnlineBadge';

const links = [
  { to: '/', label: 'Home' },
  { to: '/search', label: 'Search' },
  { to: '/library', label: 'Library' },
  { to: '/history', label: 'History' },
  { to: '/settings', label: 'Settings' },
];

export function AppShell() {
  const collapsed = useSettings((s) => s.sidebarCollapsed);
  const toggle = useSettings((s) => s.toggleSidebar);
  const setPalette = useUi((s) => s.setPalette);
  const setQueue = useUi((s) => s.setQueue);
  const navigate = useNavigate();

  return (
    <div className="flex h-full bg-base-950 text-ink">
      <aside
        className={`${collapsed ? 'w-16' : 'w-60'} hidden shrink-0 flex-col gap-1 border-r border-white/5 bg-base-900 p-3 transition-all md:flex`}
        aria-label="Primary"
      >
        <button type="button" onClick={() => navigate('/')} className="mb-3 flex items-center gap-2 px-2 py-2 text-left">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent font-bold text-black">Z</span>
          {!collapsed && <span className="text-base font-semibold tracking-tight">Zabify</span>}
        </button>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm ${isActive ? 'bg-white/10 text-ink' : 'text-ink-secondary hover:bg-white/5 hover:text-ink'}`
            }
          >
            {collapsed ? l.label.slice(0, 1) : l.label}
          </NavLink>
        ))}
        <div className="mt-auto space-y-1">
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="w-full rounded-md px-3 py-2 text-left text-xs text-ink-tertiary hover:bg-white/5 hover:text-ink"
          >
            {collapsed ? '⌘K' : 'Command…  ⌘K'}
          </button>
          <button
            type="button"
            onClick={toggle}
            className="w-full rounded-md px-3 py-2 text-left text-xs text-ink-tertiary hover:bg-white/5"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-header flex items-center gap-2.5 border-b border-white/5 bg-base-950/80 px-4 py-2.5 backdrop-blur">
          <span className="text-sm font-semibold md:hidden">Zabify</span>
          <button
            type="button"
            onClick={() => navigate('/search')}
            aria-label="Search music"
            className="hidden max-w-md flex-1 items-center gap-2 rounded-lg border border-white/10 bg-base-900 px-3 py-1.5 text-left text-sm text-ink-tertiary hover:border-white/20 sm:flex"
          >
            <span aria-hidden>🔍</span>
            <span className="flex-1">Search songs, artists, albums…</span>
            <kbd className="rounded border border-white/10 px-1.5 py-0.5 text-[11px]">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <OnlineBadge />
            <button
              type="button"
              onClick={() => setPalette(true)}
              aria-label="Open command palette"
              className="rounded-md px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-white/10 hover:text-ink"
            >
              ⌘K
            </button>
            <button
              type="button"
              onClick={() => setQueue(true)}
              aria-label="Open queue"
              className="rounded-md px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-white/10 hover:text-ink"
            >
              Queue
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-40 pt-4 md:px-8">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-[76px] z-header flex justify-around border-t border-white/5 bg-base-900/95 px-2 py-2 backdrop-blur md:hidden" aria-label="Mobile">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) => `rounded-md px-3 py-1.5 text-xs ${isActive ? 'text-accent' : 'text-ink-secondary'}`}
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
