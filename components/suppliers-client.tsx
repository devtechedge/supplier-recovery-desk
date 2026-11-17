'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Building2, Plus, Search, X } from 'lucide-react';
import { formatCents } from '@/lib/domain/money';

export interface SupplierDirectoryRow {
  id: string;
  supplier_code: string;
  name: string;
  category: string;
  country: string;
  default_currency: string;
  payment_terms_days: number;
  case_count: number;
  submitted_cents: number;
  approved_cents: number;
  recovered_cents: number;
  primary_email: string | null;
}

export function SuppliersClient({
  initialSuppliers,
}: {
  initialSuppliers: SupplierDirectoryRow[];
}) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const [supplierCode, setSupplierCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Precision Machining');
  const [country, setCountry] = useState('US');
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [paymentTermsDays, setPaymentTermsDays] = useState('30');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [termsSummary, setTermsSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = suppliers.filter((s) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.supplier_code.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  });

  async function refreshList() {
    const res = await fetch('/api/suppliers');
    if (res.ok) {
      const data = await res.json();
      setSuppliers(data.suppliers ?? []);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierCode,
          name,
          category,
          country,
          defaultCurrency,
          paymentTermsDays: Number(paymentTermsDays) || 30,
          contactName: contactName || undefined,
          contactEmail: contactEmail || '',
          termsSummary: termsSummary || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add supplier');
        return;
      }
      setSupplierCode('');
      setName('');
      setContactName('');
      setContactEmail('');
      setTermsSummary('');
      setShowCreate(false);
      await refreshList();
      router.refresh();
    } catch {
      setError('Network error while adding supplier');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950">
            Suppliers
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Supplier claim contacts, supply terms, and recovery track records computed strictly from recorded cases in each supplier&apos;s currency.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E293B] cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Add Supplier</span>
        </button>
      </div>

      {showCreate && (
        <section className="rounded-lg border border-slate-300 bg-white p-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="font-display text-base font-semibold text-slate-950">
              Add Supplier Record
            </h2>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              aria-label="Close add supplier form"
              className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            {error && (
              <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label htmlFor="sup-code" className="block text-xs font-medium text-slate-700">
                  Supplier code
                </label>
                <input
                  id="sup-code"
                  type="text"
                  required
                  value={supplierCode}
                  onChange={(e) => setSupplierCode(e.target.value)}
                  placeholder="SUP-2040"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="sup-name" className="block text-xs font-medium text-slate-700">
                  Legal supplier name
                </label>
                <input
                  id="sup-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Midwest Castings & Tooling Inc."
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label htmlFor="sup-currency" className="block text-xs font-medium text-slate-700">
                  Default currency
                </label>
                <select
                  id="sup-currency"
                  value={defaultCurrency}
                  onChange={(e) => setDefaultCurrency(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="CAD">CAD</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="sup-category" className="block text-xs font-medium text-slate-700">
                  Commodity category
                </label>
                <input
                  id="sup-category"
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label htmlFor="sup-country" className="block text-xs font-medium text-slate-700">
                  Country (ISO-2)
                </label>
                <input
                  id="sup-country"
                  type="text"
                  maxLength={2}
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label htmlFor="sup-terms-days" className="block text-xs font-medium text-slate-700">
                  Payment terms (days)
                </label>
                <input
                  id="sup-terms-days"
                  type="number"
                  min={0}
                  max={180}
                  value={paymentTermsDays}
                  onChange={(e) => setPaymentTermsDays(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="sup-contact-name" className="block text-xs font-medium text-slate-700">
                  Primary claims contact name (optional)
                </label>
                <input
                  id="sup-contact-name"
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Jordan Reyes"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label htmlFor="sup-contact-email" className="block text-xs font-medium text-slate-700">
                  Primary claims contact email (optional)
                </label>
                <input
                  id="sup-contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="claims@supplier.example"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div>
              <label htmlFor="sup-terms-summary" className="block text-xs font-medium text-slate-700">
                Quality &amp; chargeback clause summary (optional)
              </label>
              <textarea
                id="sup-terms-summary"
                rows={2}
                value={termsSummary}
                onChange={(e) => setTermsSummary(e.target.value)}
                placeholder="e.g., Supplier liable for containment sorting, scrap, and expedite freight on non-conforming deliveries per MSA Section 8."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E293B] disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Saving...' : 'Save Supplier'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Search bar */}
      <div className="rounded-lg border border-slate-200 bg-white p-3.5">
        <div className="relative max-w-md">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search suppliers"
            placeholder="Search by supplier name, code, or commodity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-slate-300 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Building2 className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-slate-900">No suppliers match your search</p>
            <p className="mt-1 text-xs text-slate-500">
              Add a supplier manually or import a Suppliers CSV batch.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Primary contact</th>
                <th className="px-4 py-3 font-medium text-right">Cases</th>
                <th className="px-4 py-3 font-medium text-right">Submitted</th>
                <th className="px-4 py-3 font-medium text-right">Approved</th>
                <th className="px-4 py-3 font-medium text-right">Actual Recovered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold text-slate-700 whitespace-nowrap">
                    <Link href={`/app/suppliers/${s.id}`} className="text-sky-700 hover:underline">
                      {s.supplier_code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/app/suppliers/${s.id}`} className="font-medium text-slate-900 hover:underline">
                      {s.name}
                    </Link>
                    <span className="block text-[11px] text-slate-500">
                      {s.country} · Net {s.payment_terms_days} · {s.default_currency}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{s.category}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                    {s.primary_email ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                    {s.case_count}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                    {formatCents(Number(s.submitted_cents || 0), s.default_currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-sky-700 whitespace-nowrap">
                    {formatCents(Number(s.approved_cents || 0), s.default_currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-emerald-700 whitespace-nowrap">
                    {formatCents(Number(s.recovered_cents || 0), s.default_currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
