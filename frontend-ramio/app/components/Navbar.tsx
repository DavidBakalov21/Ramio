'use client';

import Link from 'next/link';
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
          <Link
            href="/profile"
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-violet-500/10 ring-1 ring-violet-200/50 transition hover:ring-violet-300"
          >
            {user.profilePictureUrl ? (
              <img
                src={user.profilePictureUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-semibold text-violet-600">{initial}</span>
            )}
          </Link>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              Welcome to
            </p>
            <p className="text-sm font-semibold text-slate-900">Ramio</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/profile"
            className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Profile
          </Link>
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
      </div>
    </nav>
  );
}
