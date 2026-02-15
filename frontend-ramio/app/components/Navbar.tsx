'use client';

import type { User } from '../interfaces/User';

interface NavbarProps {
  user: User;
  onLogout: () => void;
  isLoggingOut?: boolean;
}

export function Navbar({ user, onLogout, isLoggingOut = false }: NavbarProps) {
  const initial = user.username?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?';

  return (
    <nav className="sticky top-0 z-10 flex w-full items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10">
            <span className="text-sm font-semibold text-violet-600">{initial}</span>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              Welcome to
            </p>
            <p className="text-sm font-semibold text-slate-900">Ramio</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          disabled={isLoggingOut}
          className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          title="Logout"
        >
          {isLoggingOut ? 'Logging out…' : 'Logout'}
        </button>
      </div>
    </nav>
  );
}
