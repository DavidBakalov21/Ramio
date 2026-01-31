'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from './interfaces/User';
import { api } from '@/lib/axios';

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await api.get<User>('/me');
        const currentUser = response.data;
        setUser(currentUser);
        if (!currentUser.role || !currentUser.username) {
          router.push('/onboarding');
          return;
        }
      } catch {
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await api.post('/auth/logout');
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-zinc-600 dark:text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="relative flex min-h-screen w-full max-w-3xl flex-col items-center justify-between bg-white px-16 py-32 dark:bg-black sm:items-start">
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="absolute top-8 right-8 rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          title="Logout"
        >
          {isLoggingOut ? 'Logging out...' : 'Logout'}
        </button>

        <div className="flex w-full max-w-md flex-col gap-6">
          <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
            <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
              Welcome to Ramio, {user.username || user.email}!
            </h1>
            <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              You are logged in as a <strong>{user.role}</strong>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
