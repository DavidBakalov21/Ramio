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
  const [proLoading, setProLoading] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const support = searchParams.get('support');
    const sub = searchParams.get('subscription');
    if (support === 'thanks' || support === 'cancelled') {
      const flagKey = `ramio-support-page-${support}`;
      const already =
        typeof window !== 'undefined' && sessionStorage.getItem(flagKey);
      if (!already && typeof window !== 'undefined') {
        sessionStorage.setItem(flagKey, '1');
        showToast(support === 'thanks' ? 'Thank you for your support!' : 'Payment was cancelled.', support === 'thanks' ? 'success' : 'info');
      }
      router.replace('/support', { scroll: false });
      return;
    }
    if (sub === 'success' || sub === 'cancelled') {
      const flagKey = `ramio-support-sub-${sub}`;
      const already =
        typeof window !== 'undefined' && sessionStorage.getItem(flagKey);
      if (!already && typeof window !== 'undefined') {
        sessionStorage.setItem(flagKey, '1');
        showToast(sub === 'success' ? 'Subscription activated!' : 'Subscription cancelled.', sub === 'success' ? 'success' : 'info');
      }
      if (sub === 'success') {
        api.get<User>('/me').then((res) => setUser(res.data)).catch(() => {});
      }
      router.replace('/support', { scroll: false });
    }
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

  const handleSubscriptionCheckout = async (tier: 'PRO' | 'PREMIUM') => {
    const setLoading = tier === 'PRO' ? setProLoading : setPremiumLoading;
    setLoading(true);
    try {
      const { data } = await api.post<{ url: string }>('/stripe/subscription-checkout', { tier });
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      showToast((msg as string) || 'Could not start subscription', 'error');
    } finally {
      setLoading(false);
    }
  };

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
            One-time contribution or upgrade to Ramio Pro. Payments are processed securely by Stripe.
          </p>

          {user.subscriptionTier === 'PRO' || user.subscriptionTier === 'PREMIUM' ? (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50/70 px-4 py-3 text-sm text-green-900">
              <p className="font-semibold">
                You have Ramio {user.subscriptionTier === 'PREMIUM' ? 'Premium' : 'Pro'}
              </p>
              <p className="mt-1 text-xs text-green-700">Thank you for your support.</p>
              {user.subscriptionTier === 'PRO' && (
                <button
                  type="button"
                  onClick={() => handleSubscriptionCheckout('PREMIUM')}
                  disabled={premiumLoading}
                  className="mt-3 text-xs font-medium text-violet-700 hover:underline disabled:opacity-60"
                >
                  {premiumLoading ? 'Opening…' : 'Upgrade to Premium'}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-violet-200/80 bg-violet-50/50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">Ramio Pro</p>
                <p className="mt-1 text-xs text-slate-600">Monthly subscription.</p>
                <button
                  type="button"
                  onClick={() => handleSubscriptionCheckout('PRO')}
                  disabled={proLoading}
                  className="mt-4 w-full rounded-full bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {proLoading ? 'Opening checkout…' : 'Upgrade to Pro'}
                </button>
              </div>
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">Ramio Premium</p>
                <p className="mt-1 text-xs text-slate-600">Full access with premium benefits.</p>
                <button
                  type="button"
                  onClick={() => handleSubscriptionCheckout('PREMIUM')}
                  disabled={premiumLoading}
                  className="mt-4 w-full rounded-full bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {premiumLoading ? 'Opening checkout…' : 'Upgrade to Premium'}
                </button>
              </div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-200/80">
            <p className="text-sm font-medium text-slate-700">One-time contribution</p>
            <p className="mt-1 text-xs text-slate-600">Support our work with a single payment.</p>
            <button
              type="button"
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className="mt-3 w-full rounded-full border border-violet-300 bg-white px-4 py-2.5 text-sm font-medium text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checkoutLoading ? 'Opening checkout…' : 'Support us'}
            </button>
          </div>
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
