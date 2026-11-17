'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PublicHeader } from '@/components/public-header';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Sign in failed');
        return;
      }
      router.push('/app');
      router.refresh();
    } catch {
      setError('Network error while signing in');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/session', { method: 'POST' });
      if (res.ok) {
        router.push('/app');
        router.refresh();
      } else {
        setError('Unable to enter demo workspace');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <PublicHeader />
      <main className="mx-auto max-w-md px-6 py-16">
        <div className="rounded-lg border border-slate-200 bg-white p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Sign in to Supplier Recovery Desk
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Access your organization workspace or explore the seeded demo environment.
          </p>

          {error && (
            <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="signin-email" className="block text-xs font-medium text-slate-700">
                Work email
              </label>
              <input
                id="signin-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="controller@company.example"
                className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="signin-password" className="block text-xs font-medium text-slate-700">
                Password
              </label>
              <input
                id="signin-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1E293B] disabled:opacity-60 cursor-pointer"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="my-6 border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={handleDemo}
              disabled={loading}
              className="w-full rounded-md border border-sky-700 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-900 hover:bg-sky-100 cursor-pointer disabled:opacity-60"
            >
              Enter Demo Organization (Apex Precision Components)
            </button>
            <p className="mt-2 text-xs text-slate-500 text-center">
              Synthetic DEMO DATA · Pre-populated suppliers, discrepancies, dossiers &amp; settlements
            </p>
          </div>

          <p className="text-xs text-slate-600 text-center">
            Need a new organization workspace?{' '}
            <Link href="/auth/signup" className="font-medium text-sky-700 hover:underline">
              Create account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
