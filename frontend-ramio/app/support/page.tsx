'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/axios';
import { User } from '@/app/interfaces/User';
import { Navbar } from '@/app/components/Navbar';
import { useToast } from '@/app/components/utility/toast';

function SupportPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const support = searchParams.get('support');
    if (support !== 'thanks' && support !== 'cancelled') return;
    const flagKey = `ramio-support-page-${support}`;
    const already =
      typeof window !== 'undefined' && sessionStorage.getItem(flagKey);
    if (!already && typeof window !== 'undefined') {
      sessionStorage.setItem(flagKey, '1');
      if (support === 'thanks') {
        showToast('Thank you for your support!', 'success');
      } else {
        showToast('Payment was cancelled.', 'info');
      }
    }
    router.replace('/support', { scroll: false });
  }, [searchParams, router, showToast]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get<User>('/me');
        const currentUser = res.data;
        if (!currentUser.role || !currentUser.username) {
          router.push('/onboarding');
          return;
        }
        setUser(currentUser);
      } catch {
        router.push('/login');
      } finally {
        setLoadingUser(false);
      }
    };
    fetchUser();
  }, [router]);

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const { data } = await api.post<{ url: string }>('/stripe/support-checkout', {});
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      showToast((msg as string) || 'Could not start checkout', 'error');
    } finally {
      setCheckoutLoading(false);
    }
  };

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

  if (loadingUser || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
        <div className="rounded-[1.9rem] bg-white/85 p-8 shadow-xl backdrop-blur-sm ring-1 ring-white/60">
          <Link
            href="/courses"
            className="mb-6 inline-block text-xs font-medium text-slate-500 transition hover:text-slate-700"
          >
            ← Back to courses
          </Link>
          <h1 className="text-xl font-semibold text-slate-900">Support Ramio</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            If Ramio helps you learn or teach, you can make a one-time contribution. Payments are
            processed securely by Stripe.
          </p>
          <button
            type="button"
            onClick={handleCheckout}
            disabled={checkoutLoading}
            className="mt-8 w-full rounded-full bg-violet-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {checkoutLoading ? 'Opening checkout…' : 'Support us'}
          </button>
        </div>
      </main>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="text-sm text-slate-500">Loading...</div>
        </div>
      }
    >
      <SupportPageContent />
    </Suspense>
  );
}
