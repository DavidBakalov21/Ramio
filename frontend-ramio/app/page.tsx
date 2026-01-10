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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await api.get<User>('/me');
        console.log(response);
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
      // Redirect to login page after logout
      router.push('/login');
    } catch (err) {
      // Even if logout fails, redirect to login (cookies might already be cleared)
      console.error('Logout error:', err);
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSettingPassword(true);
    setPasswordError('');
    setPasswordSuccess(false);

    // Validation
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      setIsSettingPassword(false);
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      setIsSettingPassword(false);
      return;
    }

    try {
      await api.post('/auth/set-password', { password });
      setPasswordSuccess(true);
      setPassword('');
      setConfirmPassword('');
      // Clear success message after 3 seconds
      setTimeout(() => {
        setPasswordSuccess(false);
      }, 3000);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to set password. Please try again.';
      setPasswordError(errorMessage);
    } finally {
      setIsSettingPassword(false);
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
    return null; // Will redirect
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start relative">
        {/* Logout Button - Top Right */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="absolute top-8 right-8 rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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

          {/* Set Password Form */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Set Password
            </h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Set a password to enable email/password login for your account.
            </p>

            <form onSubmit={handleSetPassword} className="space-y-4">
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
                  placeholder="At least 8 characters"
                  disabled={isSettingPassword}
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
                  placeholder="Confirm your password"
                  disabled={isSettingPassword}
                />
              </div>

              {passwordError && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-400">
                  Password set successfully! You can now log in with email and password.
                </div>
              )}

              <button
                type="submit"
                disabled={isSettingPassword}
                className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus:ring-zinc-400"
              >
                {isSettingPassword ? 'Setting Password...' : 'Set Password'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
