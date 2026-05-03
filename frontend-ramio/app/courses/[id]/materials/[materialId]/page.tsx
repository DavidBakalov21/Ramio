'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { api } from '@/lib/axios';
import type { CourseMaterial } from '@/app/interfaces/Material';
import { Navbar } from '@/app/components/Navbar';
import { User } from '@/app/interfaces/User';
import { useToast } from '@/app/components/utility/toast';

function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    return host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com';
  } catch {
    return false;
  }
}

function toYouTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch') {
        const id = u.searchParams.get('v');
        return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
      }
      const m = u.pathname.match(/^\/embed\/([^/]+)/);
      if (m?.[1]) return `https://www.youtube.com/embed/${encodeURIComponent(m[1])}`;
    }
    return null;
  } catch {
    return null;
  }
}

export default function CourseMaterialViewerPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const courseId = params.id as string;
  const materialId = params.materialId as string;

  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [material, setMaterial] = useState<CourseMaterial | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
    void fetchUser();
  }, [router]);

  useEffect(() => {
    if (!courseId || !materialId || !user?.role) return;
    const fetchMaterial = async () => {
      setLoading(true);
      try {
        const res = await api.get<CourseMaterial>(
          `/course/${courseId}/materials/${materialId}`,
        );
        setMaterial(res.data);
      } catch {
        setMaterial(null);
      } finally {
        setLoading(false);
      }
    };
    void fetchMaterial();
  }, [courseId, materialId, user?.role]);

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

  const linkRedirectUrl = useMemo(() => {
    if (!material || material.type !== 'LINK') return null;
    if (isYouTubeUrl(material.url)) return null;
    return material.url;
  }, [material]);

  useEffect(() => {
    if (!linkRedirectUrl) return;
    showToast('Opening link…', 'success');
    window.location.href = linkRedirectUrl;
  }, [linkRedirectUrl, showToast]);

  const embed = useMemo(() => {
    if (!material) return null;

    if (material.type === 'PDF' || material.mimeType === 'application/pdf') {
      return (
        <iframe
          src={material.url}
          className="h-[84vh] w-full rounded-2xl border border-slate-200 bg-white"
          title={material.title}
        />
      );
    }

    if (material.type === 'VIDEO' || (material.mimeType ?? '').startsWith('video/')) {
      return (
        <video
          src={material.url}
          controls
          className="h-[82vh] w-full rounded-2xl border border-slate-200 bg-black"
        />
      );
    }

    if (material.type === 'LINK') {
      const embedUrl = toYouTubeEmbedUrl(material.url);
      if (embedUrl) {
        return (
          <iframe
            src={embedUrl}
            className="h-[82vh] w-full rounded-2xl border border-slate-200 bg-white"
            title={material.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        );
      }
      return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 text-sm text-slate-600">
          Redirecting to link…
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6">
        <p className="text-sm text-slate-700">
          This file type can’t be embedded here.
        </p>
        <a
          href={material.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Open / download
        </a>
      </div>
    );
  }, [material]);

  if (loadingUser) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="text-sm text-slate-500"
        >
          Loading…
        </motion.div>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />
      <main className="flex flex-1 items-center justify-center px-3 py-3">
        <motion.main
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative flex w-full max-w-[96vw] flex-col rounded-[1.9rem] bg-white/85 p-5 pb-6 shadow-xl backdrop-blur-sm ring-1 ring-white/60"
        >
          <header className="mb-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => router.push(`/courses/${courseId}`)}
              className="self-start text-xs font-medium text-slate-500 transition hover:text-slate-700"
            >
              ← Back to course
            </button>
            <h1 className="text-lg font-semibold text-slate-900">
              {material?.title ?? 'Material'}
            </h1>
            {!!material?.name && (
              <p className="text-xs text-slate-500">{material.name}</p>
            )}
          </header>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-5 text-center text-sm text-slate-500">
              Loading material…
            </div>
          ) : !material ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-5 text-center text-sm text-slate-500">
              Material not found (or you don’t have access).
            </div>
          ) : (
            embed
          )}
        </motion.main>
      </main>
    </div>
  );
}

