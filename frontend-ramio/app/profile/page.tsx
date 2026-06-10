'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { api } from '@/lib/axios';
import { User } from '@/app/interfaces/User';
import { ApiToken, CreatedApiToken } from '@/app/interfaces/ApiToken';
import { useToast } from '@/app/components/utility/toast';

export default function ProfilePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [username, setUsername] = useState('');
  const [aboutMe, setAboutMe] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([]);
  const [apiTokensLoading, setApiTokensLoading] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const [createdToken, setCreatedToken] = useState<CreatedApiToken | null>(null);
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get<User & { needsOnboarding?: boolean }>('/me');
        const u = res.data;
        if (u.needsOnboarding) {
          router.push('/onboarding');
          return;
        }
        setUser(u);
        setUsername(u.username ?? '');
        setAboutMe(u.aboutMe ?? '');
        setBirthdate(u.birthdate ? u.birthdate.toString().slice(0, 10) : '');

        if (u.role === 'TEACHER') {
          setApiTokensLoading(true);
          try {
            const tokensRes = await api.get<ApiToken[]>('/me/api-tokens');
            setApiTokens(tokensRes.data);
          } catch {
            showToast('Failed to load API tokens.', 'error');
          } finally {
            setApiTokensLoading(false);
          }
        }
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const res = await api.patch<User>('/me', {
        username: username.trim() || undefined,
        aboutMe: aboutMe.trim() || undefined,
        birthdate: birthdate || undefined,
      });
      setUser(res.data);
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

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newTokenName.trim();
    if (!name) {
      showToast('Token name is required.', 'error');
      return;
    }

    setCreatingToken(true);
    try {
      const res = await api.post<CreatedApiToken>('/me/api-tokens', { name });
      setCreatedToken(res.data);
      setApiTokens((current) => [
        {
          id: res.data.id,
          name: res.data.name,
          tokenPrefix: res.data.tokenPrefix,
          lastUsedAt: res.data.lastUsedAt,
          expiresAt: res.data.expiresAt,
          createdAt: res.data.createdAt,
        },
        ...current,
      ]);
      setNewTokenName('');
      showToast('API token created. Copy it now — it will not be shown again.', 'success');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : null;
      showToast((msg as string) || 'Failed to create API token.', 'error');
    } finally {
      setCreatingToken(false);
    }
  };

  const handleRevokeToken = async (tokenId: string) => {
    setRevokingTokenId(tokenId);
    try {
      await api.delete(`/me/api-tokens/${tokenId}`);
      setApiTokens((current) => current.filter((token) => token.id !== tokenId));
      showToast('API token revoked.', 'success');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : null;
      showToast((msg as string) || 'Failed to revoke API token.', 'error');
    } finally {
      setRevokingTokenId(null);
    }
  };

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      showToast('Token copied to clipboard.', 'success');
    } catch {
      showToast('Failed to copy token.', 'error');
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
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
      const res = await api.post<User>('/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUser(res.data);
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="text-sm text-slate-500"
        >
          Loading...
        </motion.div>
      </div>
    );
  }
  if (!user) return null;

  const initial =
    user.username?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?';

  const ProfileAvatar = ({ className = '' }: { className?: string }) =>
    user.profilePictureUrl ? (
      <img
        src={user.profilePictureUrl}
        alt=""
        className={className}
        referrerPolicy="no-referrer"
      />
    ) : (
      <span className="text-2xl font-semibold text-violet-600">{initial}</span>
    );

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-xl rounded-[1.9rem] bg-white/85 p-6 shadow-xl backdrop-blur-sm ring-1 ring-white/60"
      >
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-xs font-medium text-slate-500 transition hover:text-slate-700"
            >
              ← Back to home
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-slate-900">
              Profile
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {editMode ? 'Edit your profile' : 'How others see you'}
            </p>
          </div>
          {!editMode ? (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
            >
              Edit
            </button>
          ) : null}
        </header>

        {!editMode ? (
          <motion.div
            key="view-mode"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-violet-500/10 ring-2 ring-violet-200">
                <ProfileAvatar className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {user.username || 'No username'}
                </p>
                <p className="text-sm text-slate-500">{user.email}</p>
              </div>
            </div>
            {user.aboutMe ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  About me
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {user.aboutMe}
                </p>
              </div>
            ) : null}
            {user.birthdate ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Birthdate
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {new Date(user.birthdate).toLocaleDateString()}
                </p>
              </div>
            ) : null}

            {user.role === 'TEACHER' ? (
              <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    API tokens
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Use tokens to call the Ramio API from scripts or integrations.
                    Send them as{' '}
                    <code className="rounded bg-white px-1 py-0.5 text-xs text-slate-700">
                      Authorization: Bearer ramio_...
                    </code>
                  </p>
                </div>

                {createdToken ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-medium text-amber-900">
                      Copy your new token now
                    </p>
                    <p className="mt-1 text-xs text-amber-800">
                      This is the only time the full token will be shown.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <code className="flex-1 break-all rounded-lg bg-white px-3 py-2 text-xs text-slate-800 ring-1 ring-amber-200">
                        {createdToken.token}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyToken(createdToken.token)}
                        className="rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700"
                      >
                        Copy
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCreatedToken(null)}
                      className="mt-3 text-xs font-medium text-amber-800 transition hover:text-amber-900"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}

                <form onSubmit={handleCreateToken} className="mt-4 flex gap-2">
                  <input
                    type="text"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                    maxLength={100}
                    placeholder="Token name, e.g. Grading script"
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                  <button
                    type="submit"
                    disabled={creatingToken}
                    className="rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
                  >
                    {creatingToken ? 'Creating…' : 'Create'}
                  </button>
                </form>

                <div className="mt-4 space-y-2">
                  {apiTokensLoading ? (
                    <p className="text-sm text-slate-500">Loading tokens…</p>
                  ) : apiTokens.length === 0 ? (
                    <p className="text-sm text-slate-500">No active tokens yet.</p>
                  ) : (
                    apiTokens.map((token) => (
                      <div
                        key={token.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {token.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {token.tokenPrefix}… · Created{' '}
                            {new Date(token.createdAt).toLocaleDateString()}
                            {token.lastUsedAt
                              ? ` · Last used ${new Date(token.lastUsedAt).toLocaleDateString()}`
                              : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRevokeToken(token.id)}
                          disabled={revokingTokenId === token.id}
                          className="shrink-0 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          {revokingTokenId === token.id ? 'Revoking…' : 'Revoke'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}
          </motion.div>
        ) : (
          <motion.form
            key="edit-mode"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onSubmit={handleSave}
            className="space-y-6"
          >
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-violet-500/10 ring-2 ring-violet-200 transition hover:ring-violet-300 disabled:opacity-60"
              >
                <ProfileAvatar className="h-full w-full object-cover" />
                {uploadingAvatar && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                    <span className="text-xs text-slate-600">Uploading…</span>
                  </div>
                )}
              </button>
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Profile photo
                </p>
                <p className="text-xs text-slate-500">
                  JPEG, PNG, GIF or WebP.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-slate-700"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={100}
                placeholder="Your display name"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>

            <div>
              <label
                htmlFor="aboutMe"
                className="block text-sm font-medium text-slate-700"
              >
                About me
              </label>
              <textarea
                id="aboutMe"
                value={aboutMe}
                onChange={(e) => setAboutMe(e.target.value)}
                maxLength={5000}
                rows={4}
                placeholder="Tell others about yourself"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
              <p className="mt-1 text-xs text-slate-500">
                {aboutMe.length}/5000
              </p>
            </div>

            <div>
              <label
                htmlFor="birthdate"
                className="block text-sm font-medium text-slate-700"
              >
                Birthdate
              </label>
              <input
                id="birthdate"
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

            <div className="flex gap-3 pt-2">
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
        )}
      </motion.main>
    </div>
  );
}
