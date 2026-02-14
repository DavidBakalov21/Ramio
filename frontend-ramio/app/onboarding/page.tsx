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

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError('Please enter a username');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await api.post<User>('/me/onboarding', {
        role,
        username: trimmedUsername,
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-2xl bg-white/70 px-6 py-3 text-sm text-slate-600 shadow-sm backdrop-blur">
          Loading your profile…
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-4">
      <div className="relative flex w-full max-w-3xl flex-col items-center space-y-8 rounded-[1.9rem] bg-white/85 p-6 shadow-xl backdrop-blur-sm ring-1 ring-white/60 min-h-[80vh]">
        {/* Logout Button - Top Right */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="absolute right-4 top-4 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          title="Logout"
        >
          {isLoggingOut ? 'Logging out...' : 'Logout'}
        </button>

        <div className="flex max-w-xl flex-col space-y-2 pt-2 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
            Almost there
          </p>
          <h1 className="text-2xl font-semibold leading-snug text-slate-900">
            Choose how you’ll use Ramio
          </h1>
          <p className="text-sm text-slate-500">
            Pick your role and add a display name. You can start learning or teaching in seconds.
          </p>
        </div>

        {error && (
          <div className="w-full max-w-md rounded-xl bg-red-50/90 p-3 text-center text-xs text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col space-y-6">
          {/* Role Selection */}
          <div className="w-full">
            <label className="mb-2 block text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              I am joining as
            </label>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
              <button
                type="button"
                onClick={() => setRole('TEACHER')}
                className={`rounded-xl px-3 py-3 text-center text-sm font-semibold transition-all ${
                  role === 'TEACHER'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:bg-slate-200/70'
                }`}
              >
                Teacher
              </button>
              <button
                type="button"
                onClick={() => setRole('STUDENT')}
                className={`rounded-xl px-3 py-3 text-center text-sm font-semibold transition-all ${
                  role === 'STUDENT'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:bg-slate-200/70'
                }`}
              >
                Student
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              This cannot be changed later
            </p>
          </div>

          {/* Username Input */}
          <div className="w-full">
            <label
              htmlFor="username"
              className="mb-1.5 block text-center text-xs font-medium text-slate-600"
            >
              Username <span className="text-red-500">*</span>
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={50}
              className="block w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-inner shadow-white/60 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
              placeholder="How should we call you?"
            />
            <p className="mt-1 text-center text-[11px] text-slate-400">
              This will be visible to your teachers and classmates.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !role || !username.trim()}
            className="w-full rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

