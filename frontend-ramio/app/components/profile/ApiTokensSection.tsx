'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/axios';
import { ApiToken, CreatedApiToken } from '@/app/interfaces/ApiToken';
import { useToast } from '@/app/components/utility/toast';

export function ApiTokensSection() {
  const { showToast } = useToast();
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([]);
  const [apiTokensLoading, setApiTokensLoading] = useState(true);
  const [newTokenName, setNewTokenName] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const [createdToken, setCreatedToken] = useState<CreatedApiToken | null>(null);
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadTokens = async () => {
      setApiTokensLoading(true);
      try {
        const res = await api.get<ApiToken[]>('/me/api-tokens');
        if (!cancelled) setApiTokens(res.data);
      } catch {
        if (!cancelled) showToast('Failed to load API tokens.', 'error');
      } finally {
        if (!cancelled) setApiTokensLoading(false);
      }
    };

    void loadTokens();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

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
      showToast('API token created. Copy it now - it will not be shown again.', 'success');
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

  return (
    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">API tokens</h2>
        <p className="mt-1 text-sm text-slate-500">
          Use tokens to call the Ramio API from scripts or integrations. Send them
          as{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-700">
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
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
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
  );
}
