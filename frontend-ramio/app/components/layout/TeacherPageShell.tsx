'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Navbar } from '@/app/components/Navbar';
import type { User } from '@/app/interfaces/User';

interface TeacherPageShellProps {
  user: User;
  isLoggingOut: boolean;
  onLogout: () => Promise<void>;
  children: ReactNode;
  maxWidthClassName?: string;
  paddingClassName?: string;
}

export function TeacherPageShell({
  user,
  isLoggingOut,
  onLogout,
  children,
  maxWidthClassName = 'max-w-6xl',
  paddingClassName = 'px-4 py-6',
}: TeacherPageShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      <Navbar user={user} onLogout={onLogout} isLoggingOut={isLoggingOut} />
      <main className={`flex flex-1 items-center justify-center ${paddingClassName}`}>
        <motion.main
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className={`relative flex w-full flex-col rounded-[1.9rem] bg-white/90 p-6 shadow-xl ring-1 ring-white/60 ${maxWidthClassName}`}
        >
          {children}
        </motion.main>
      </main>
    </div>
  );
}

