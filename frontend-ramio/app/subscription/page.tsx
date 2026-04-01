'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/axios';
import { Navbar } from '@/app/components/Navbar';
import { User, UserSubscriptionTier } from '@/app/interfaces/User';

const tierInfo: Record<UserSubscriptionTier, { title: string; badgeClass: string; note: string }> = {
  FREE: {
    title: 'Free',
    badgeClass: 'bg-slate-100 text-slate-700',
    note: 'You are currently using the free plan.',
  },
  PRO: {
    title: 'Pro',
    badgeClass: 'bg-violet-100 text-violet-700',
    note: 'You have an active Ramio Pro subscription.',
  },
  PREMIUM: {
    title: 'Premium',
    badgeClass: 'bg-amber-100 text-amber-800',
    note: 'You have an active Ramio Premium subscription.',
  },
};

export default function SubscriptionPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get<User & { needsOnboarding?: boolean }>('/me');
        const currentUser = res.data;
        if (currentUser.needsOnboarding) {
          router.push('/onboarding');
          return;
        }
        setUser(currentUser);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [router]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await api.post('/auth/logout');
      router.push('/login');
    } catch {
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const tier = useMemo<UserSubscriptionTier>(() => {
    return user?.subscriptionTier ?? 'FREE';
  }, [user?.subscriptionTier]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 px-4 py-8">
        <section className="w-full rounded-[1.9rem] bg-white/85 p-8 shadow-xl ring-1 ring-white/60 backdrop-blur-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Your subscription</h1>
          <p className="mt-2 text-sm text-slate-600">
            This page shows your current Ramio plan based on synced Stripe webhook data.
          </p>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
            <p className="text-xs uppercase tracking-wider text-slate-500">Current plan</p>
            <div className="mt-2 flex items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tierInfo[tier].badgeClass}`}>
                {tierInfo[tier].title}
              </span>
              <p className="text-sm text-slate-600">{tierInfo[tier].note}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/support"
              className="rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
            >
              Manage via support page
            </Link>
            <Link
              href="/courses"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Back to courses
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
