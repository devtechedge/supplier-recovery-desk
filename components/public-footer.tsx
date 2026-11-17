import Link from 'next/link';

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white mt-20">
      <div className="mx-auto max-w-[1280px] px-6 py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-sm text-slate-600">
        <div>
          <p className="font-display font-semibold text-slate-900">Supplier Recovery Desk</p>
          <p className="mt-1 text-xs text-slate-500">
            Evidence-backed supplier cost recovery and claims reconciliation for manufacturers and industrial distributors.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-slate-600">
          <Link href="/features" className="hover:text-slate-950">Features</Link>
          <Link href="/pricing" className="hover:text-slate-950">Pricing</Link>
          <Link href="/auth/signin" className="hover:text-slate-950">Sign in</Link>
          <Link href="/auth/signup" className="hover:text-slate-950">Create workspace</Link>
          <Link href="/legal/privacy" className="hover:text-slate-950">Privacy Draft</Link>
          <Link href="/legal/terms" className="hover:text-slate-950">Terms Draft</Link>
        </div>
      </div>
    </footer>
  );
}
