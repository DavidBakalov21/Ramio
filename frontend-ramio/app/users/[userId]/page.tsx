'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { api } from '@/lib/axios';
import { useRequireUser } from '@/app/hooks/useRequireUser';
import { Navbar } from '@/app/components/Navbar';
import { useToast } from '@/app/components/utility/toast';
import { ApiTokensSection } from '@/app/components/profile/ApiTokensSection';
import { motion } from 'framer-motion';

interface PublicCourse {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  teacherName?: string | null;
}

interface PublicProfile {
  id: string;
  username: string | null;
  role: 'TEACHER' | 'STUDENT' | null;
  aboutMe: string | null;
  profilePictureUrl: string | null;
  createdAt: string;
  courseCount: number;
  courses: PublicCourse[];
}

function Avatar({
  url,
  name,
  size = 88,
}: {
  url: string | null;
  name: string | null;
  size?: number;
}) {
  if (url) {
    return (
      <Image
        src={url}
        alt={name ?? 'User'}
        width={size}
        height={size}
        className="rounded-full object-cover ring-4 ring-white shadow-md"
        style={{ width: size, height: size }}
        unoptimized
      />
    );
  }
  const initial = (name ?? '?')[0].toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-full bg-slate-200 ring-4 ring-white shadow-md text-2xl font-bold text-slate-500 select-none"
      style={{ width: size, height: size }}
    >
      {initial}
    </div>
  );
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const userId = params.userId as string;

  const { user, loadingUser, isLoggingOut, handleLogout } = useRequireUser();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [username, setUsername] = useState('');
  const [aboutMe, setAboutMe] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user || !userId) return;
    api
      .get<PublicProfile>(`/user/${userId}`)
      .then((r) => {
        setProfile(r.data);
        setUsername(r.data.username ?? '');
        setAboutMe(r.data.aboutMe ?? '');
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [user, userId]);

  const isOwnProfile = user && String(user.id) === userId;

  useEffect(() => {
    if (!isOwnProfile || !user?.birthdate) return;
    setBirthdate(String(user.birthdate).slice(0, 10));
  }, [isOwnProfile, user?.birthdate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const res = await api.patch<{
        username: string | null;
        aboutMe: string | null;
        birthdate: string | null;
      }>('/me', {
        username: username.trim() || undefined,
        aboutMe: aboutMe.trim() || undefined,
        birthdate: birthdate || undefined,
      });
      setProfile((prev) =>
        prev
          ? { ...prev, username: res.data.username, aboutMe: res.data.aboutMe }
          : prev,
      );
      if (res.data.birthdate) {
        setBirthdate(String(res.data.birthdate).slice(0, 10));
      }
      setEditMode(false);
      showToast('Profile updated.', 'success');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : null;
      showToast((msg as string) || 'Failed to update profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      showToast('Invalid file type. Use JPEG, PNG, GIF, or WebP.', 'error');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      showToast('Avatar must be at most 3MB.', 'error');
      return;
    }
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<{ profilePictureUrl: string | null }>(
        '/me/avatar',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      );
      setProfile((prev) =>
        prev
          ? { ...prev, profilePictureUrl: res.data.profilePictureUrl }
          : prev,
      );
      showToast('Avatar updated.', 'success');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : null;
      showToast((msg as string) || 'Failed to upload avatar.', 'error');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loadingUser)
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      <Navbar user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} />

      <main className="flex flex-1 justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          {loading ? (
            <p className="text-sm text-slate-500">Loading profile…</p>
          ) : notFound || !profile ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <p className="text-sm font-semibold text-slate-800">
                User not found
              </p>
              <button
                type="button"
                onClick={() => router.back()}
                className="mt-4 text-xs font-medium text-violet-600 hover:text-violet-800"
              >
                ← Go back
              </button>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-5"
            >
              <div className="rounded-[1.6rem] border border-slate-200 bg-white p-6 shadow-sm">
                {editMode ? (
                  <motion.form
                    key="edit"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onSubmit={handleSave}
                    className="space-y-5"
                  >
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-4 ring-white shadow-md transition hover:opacity-80 disabled:opacity-60"
                        style={{ width: 88, height: 88 }}
                      >
                        <Avatar
                          url={profile.profilePictureUrl}
                          name={profile.username}
                          size={88}
                        />
                        {uploadingAvatar && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-white/80">
                            <span className="text-xs text-slate-600">…</span>
                          </div>
                        )}
                      </button>
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          Profile photo
                        </p>
                        <p className="text-xs text-slate-500">
                          JPEG, PNG, GIF or WebP · max 3 MB
                        </p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        Username
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        maxLength={100}
                        placeholder="Your display name"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        About me
                      </label>
                      <textarea
                        value={aboutMe}
                        onChange={(e) => setAboutMe(e.target.value)}
                        maxLength={5000}
                        rows={4}
                        placeholder="Tell others about yourself"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        {aboutMe.length}/5000
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        Birthdate
                      </label>
                      <input
                        type="date"
                        value={birthdate}
                        onChange={(e) => setBirthdate(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-500">
                        Email
                      </label>
                      <p className="mt-1 text-sm text-slate-600">{user.email}</p>
                      <p className="text-xs text-slate-400">
                        Email cannot be changed here.
                      </p>
                    </div>

                    <div className="flex gap-3 pt-1">
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
                      >
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditMode(false)}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.form>
                ) : (
                  <div className="flex items-start gap-5">
                    <Avatar
                      url={profile.profilePictureUrl}
                      name={profile.username}
                      size={88}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h1 className="text-xl font-semibold text-slate-900 truncate">
                          {profile.username ?? (
                            <span className="text-slate-400 italic">
                              No username
                            </span>
                          )}
                        </h1>
                        {isOwnProfile && (
                          <button
                            type="button"
                            onClick={() => setEditMode(true)}
                            className="shrink-0 rounded-full bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-violet-700"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {profile.role && (
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              profile.role === 'TEACHER'
                                ? 'bg-violet-100 text-violet-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {profile.role === 'TEACHER' ? 'Teacher' : 'Student'}
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          Joined{' '}
                          {new Date(profile.createdAt).toLocaleDateString(
                            undefined,
                            { year: 'numeric', month: 'long' },
                          )}
                        </span>
                      </div>
                      {profile.aboutMe && (
                        <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">
                          {profile.aboutMe}
                        </p>
                      )}
                      {isOwnProfile ? (
                        <div className="mt-3 space-y-2 text-sm text-slate-600">
                          <p>{user.email}</p>
                          {birthdate ? (
                            <p>
                              Born{' '}
                              {new Date(birthdate).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              {!editMode && (
                <>
                <div className="rounded-[1.6rem] border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-sm font-semibold text-slate-800">
                    {profile.role === 'TEACHER'
                      ? `Courses created (${profile.courseCount})`
                      : `Courses enrolled (${profile.courseCount})`}
                  </h2>

                  {profile.courses.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      {profile.role === 'TEACHER'
                        ? 'No courses created yet.'
                        : 'Not enrolled in any courses yet.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {profile.courses.map((course) => (
                        <button
                          key={course.id}
                          type="button"
                          onClick={() => router.push(`/courses/${course.id}`)}
                          className="flex w-full flex-col gap-0.5 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50/60"
                        >
                          <span className="text-sm font-medium text-slate-900">
                            {course.title}
                          </span>
                          {course.description && (
                            <span className="text-xs text-slate-500 line-clamp-1">
                              {course.description}
                            </span>
                          )}
                          {profile.role === 'STUDENT' && course.teacherName && (
                            <span className="text-xs text-slate-400">
                              by {course.teacherName}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {isOwnProfile && profile.role === 'TEACHER' ? (
                  <ApiTokensSection />
                ) : null}
                </>
              )}
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
