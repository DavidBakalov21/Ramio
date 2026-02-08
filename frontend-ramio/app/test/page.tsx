'use client';

import { useState } from 'react';
import { api } from '@/lib/axios';

type RunResult = {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

export default function TestPage() {
  const [tests, setTests] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');

  const handleRun = async () => {
    setError('');
    setResult(null);
    setIsRunning(true);
    try {
      const { data } = await api.post<RunResult>('/code-test/run', {
        code,
        tests,
      });
      setResult(data);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : null;
      setError(msg || 'Failed to run tests');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 dark:bg-black">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-black dark:text-zinc-50">
            Run tests
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Enter your tests and the code to test, then run. Code is written to{' '}
            <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
              solution.py
            </code>
            , tests to{' '}
            <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
              test_solution.py
            </code>
            . Use <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">from solution import ...</code> in your tests.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="tests"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Tests
            </label>
            <textarea
              id="tests"
              value={tests}
              onChange={(e) => setTests(e.target.value)}
              placeholder={'import unittest\nfrom solution import add\n\nclass TestAdd(unittest.TestCase):\n    def test_add(self):\n        self.assertEqual(add(1, 2), 3)'}
              rows={16}
              className="block w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="code"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Code to test
            </label>
            <textarea
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={'def add(a, b):\n    return a + b'}
              rows={16}
              className="block w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <span
                className={
                  result.success
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }
              >
                {result.success ? 'All tests passed' : 'Tests failed'}
                {result.timedOut ? ' (timed out)' : ''}
              </span>
              <span className="text-xs text-zinc-500">
                exit code {result.exitCode}
              </span>
            </div>
            {result.stdout && (
              <pre className="max-h-64 overflow-auto rounded bg-zinc-100 p-3 font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                {result.stdout}
              </pre>
            )}
            {result.stderr && (
              <pre className="max-h-64 overflow-auto rounded bg-red-50 p-3 font-mono text-xs text-red-800 dark:bg-red-900/20 dark:text-red-200">
                {result.stderr}
              </pre>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning}
            className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
          >
            {isRunning ? 'Running…' : 'Run tests'}
          </button>
        </div>
      </div>
    </div>
  );
}
