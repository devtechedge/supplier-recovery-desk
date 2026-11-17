'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

export function PublicHeader() {
  const router = useRouter();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleOpenDemo() {
    setLoadingDemo(true);
    try {
      const res = await fetch('/api/auth/session', { method: 'POST' });
      if (res.ok) {
        router.push('/app');
        router.refresh();
      }
    } finally {
      setLoadingDemo(false);
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-8 px-6 py-4">
        <Link
          href="/"
          className="font-display text-lg font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Supplier Recovery Desk
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <Link href="/features" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
            Features
          </Link>
          <Link href="/#workflow" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
            Workflow
          </Link>
          <Link href="/pricing" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
            Pricing
          </Link>
          <Link href="/auth/signin" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
            Sign in
          </Link>
        </nav>

        <div className="hidden md:flex items-center shrink-0">
          <button
            type="button"
            onClick={handleOpenDemo}
            disabled={loadingDemo}
            className="rounded-md bg-[#0F172A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E293B] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            {loadingDemo ? 'Opening Demo...' : 'Open Live Demo'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
          className="md:hidden p-2 text-slate-700 hover:text-slate-950"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-6 py-4 flex flex-col gap-3 text-sm font-medium text-slate-700">
          <Link href="/features" onClick={() => setMobileOpen(false)} className="py-1.5">
            Features
          </Link>
          <Link href="/#workflow" onClick={() => setMobileOpen(false)} className="py-1.5">
            Workflow
          </Link>
          <Link href="/pricing" onClick={() => setMobileOpen(false)} className="py-1.5">
            Pricing
          </Link>
          <Link href="/auth/signin" onClick={() => setMobileOpen(false)} className="py-1.5">
            Sign in
          </Link>
          <button
            type="button"
            onClick={handleOpenDemo}
            disabled={loadingDemo}
            className="mt-1 rounded-md bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white text-center"
          >
            {loadingDemo ? 'Opening Demo...' : 'Open Live Demo'}
          </button>
        </div>
      )}
    </header>
  );
}
