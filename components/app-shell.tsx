'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  BarChart3,
  Building2,
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  RotateCcw,
  Settings,
  X,
} from 'lucide-react';

interface AppShellProps {
  user: {
    id: string;
    email: string;
    fullName: string;
    jobTitle: string | null;
  };
  organization: {
    id: string;
    name: string;
    isDemo: boolean;
  };
  role: string;
  organizations: Array<{
    id: string;
    name: string;
    is_demo: number;
    role: string;
  }>;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: '/app', label: 'Overview', icon: LayoutDashboard },
  { href: '/app/cases', label: 'Recovery cases', icon: FolderKanban },
  { href: '/app/suppliers', label: 'Suppliers', icon: Building2 },
  { href: '/app/imports', label: 'Imports and data', icon: FileSpreadsheet },
  { href: '/app/reports', label: 'Reports', icon: BarChart3 },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];

export function AppShell({
  user,
  organization,
  role,
  organizations,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);

  async function handleSwitchOrg(orgId: string) {
    setSwitching(true);
    try {
      await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switch_org', organizationId: orgId }),
      });
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  async function handleResetDemo() {
    setResettingDemo(true);
    try {
      await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_demo' }),
      });
      router.refresh();
    } finally {
      setResettingDemo(false);
    }
  }

  async function handleSignOut() {
    await fetch('/api/auth/session', { method: 'DELETE' });
    router.push('/auth/signin');
    router.refresh();
  }

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white border-r border-slate-200 px-4 py-5">
      <div>
        <Link href="/app" className="block px-2 font-display text-base font-bold tracking-tight text-slate-950">
          Supplier Recovery Desk
        </Link>

        <div className="mt-5 px-2">
          <label htmlFor="org-switcher" className="block text-[11px] font-medium text-slate-500">
            Active organization
          </label>
          <select
            id="org-switcher"
            value={organization.id}
            disabled={switching}
            onChange={(e) => handleSwitchOrg(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-sky-600 focus:outline-none"
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.role})
              </option>
            ))}
          </select>
        </div>

        <nav className="mt-6 space-y-1" aria-label="Workspace navigation">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === '/app'
                ? pathname === '/app'
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 pt-4 px-2">
        <p className="text-xs font-semibold text-slate-900 truncate">{user.fullName}</p>
        <p className="text-[11px] text-slate-500 truncate">
          {role} · {user.email}
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-950 cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[256px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="w-[264px] h-full bg-white shadow-xl">{sidebarContent}</div>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 bg-slate-950/40"
          />
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {organization.isDemo && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 sm:px-8 py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-xs text-amber-900">
            <p className="font-medium">
              DEMO DATA - Synthetic workspace ({organization.name}), strictly isolated from customer organizations.
            </p>
            <button
              type="button"
              onClick={handleResetDemo}
              disabled={resettingDemo}
              className="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span>{resettingDemo ? 'Resetting...' : 'Reset Demo Data'}</span>
            </button>
          </div>
        )}

        <header className="border-b border-slate-200 bg-white px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 rounded border border-slate-200 text-slate-700"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
              <span className="font-medium text-slate-900 truncate">{organization.name}</span>
              <span aria-hidden="true">/</span>
              <span className="capitalize">{role}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <ThemeToggle />
            <Link
              href="/app/imports"
              className="hidden sm:inline-flex rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Import CSV
            </Link>
            <Link
              href="/app/cases?new=1"
              className="rounded-md bg-[#0F172A] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#1E293B] whitespace-nowrap"
            >
              New Recovery Case
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1360px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
