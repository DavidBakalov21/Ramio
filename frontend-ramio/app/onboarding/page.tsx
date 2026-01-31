'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { User } from '@/app/interfaces/User';

type UserRole = 'STUDENT' | 'TEACHER';

export default function OnboardingPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    
    const checkAuth = async () => {
      try {
        const response = await api.get<User>('/me');
        const user = response.data;
        
       
        if (user.role && user.username) {
          router.push('/');
          return;
        }
      } catch (err) {
        router.push('/login');
        return;
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!role) {
      setError('Please select a role');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await api.post<User>('/me/onboarding', {
        role,
        username: username.trim() || undefined,
      });

      
      router.push('/');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'An error occurred');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

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

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-zinc-600 dark:text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-lg dark:bg-zinc-900 relative">
        {/* Logout Button - Top Right */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="absolute top-4 right-4 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          title="Logout"
        >
          {isLoggingOut ? 'Logging out...' : 'Logout'}
        </button>

        <div className="text-center">
          <h1 className="text-3xl font-bold text-black dark:text-zinc-50">
            Complete Your Profile
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Tell us a bit about yourself to get started
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              I am a <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('TEACHER')}
                className={`rounded-lg border-2 px-4 py-3 text-center font-medium transition-all ${
                  role === 'TEACHER'
                    ? 'border-black bg-black text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-black'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-600'
                }`}
              >
                Teacher
              </button>
              <button
                type="button"
                onClick={() => setRole('STUDENT')}
                className={`rounded-lg border-2 px-4 py-3 text-center font-medium transition-all ${
                  role === 'STUDENT'
                    ? 'border-black bg-black text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-black'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-600'
                }`}
              >
                Student
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              This cannot be changed later
            </p>
          </div>

          {/* Username Input */}
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              Username (optional)
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={50}
              className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
              placeholder="Choose a username"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              You can set this later if you prefer
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !role}
            className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
          >
            {isLoading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

