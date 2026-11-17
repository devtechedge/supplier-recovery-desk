'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PublicHeader } from '@/components/public-header';

export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, organizationName, jobTitle, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create workspace');
        return;
      }
      router.push('/app');
      router.refresh();
    } catch {
      setError('Network error during sign-up');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <PublicHeader />
      <main className="mx-auto max-w-md px-6 py-14">
        <div className="rounded-lg border border-slate-200 bg-white p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Create Organization Workspace
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Provisions an isolated multi-tenant workspace with you as Owner.
          </p>

          {error && (
            <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="signup-name" className="block text-xs font-medium text-slate-700">
                Full name
              </label>
              <input
                id="signup-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jordan Mercer"
                className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="signup-org" className="block text-xs font-medium text-slate-700">
                Organization / Company name
              </label>
              <input
                id="signup-org"
                type="text"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Midwest Precision Machining Inc."
                className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="signup-title" className="block text-xs font-medium text-slate-700">
                Role / Title (optional)
              </label>
              <input
                id="signup-title"
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Finance Controller / Purchasing Manager"
                className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="signup-email" className="block text-xs font-medium text-slate-700">
                Work email
              </label>
              <input
                id="signup-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@company.example"
                className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="signup-password" className="block text-xs font-medium text-slate-700">
                Password (min. 8 characters)
              </label>
              <input
                id="signup-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1E293B] disabled:opacity-60 cursor-pointer"
            >
              {loading ? 'Provisioning workspace...' : 'Create workspace'}
            </button>
          </form>

          <p className="mt-6 text-xs text-slate-600 text-center">
            Already have an account?{' '}
            <Link href="/auth/signin" className="font-medium text-sky-700 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
