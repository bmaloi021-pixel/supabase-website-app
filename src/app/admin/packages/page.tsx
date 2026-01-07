'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';

type Role = 'admin' | 'user' | 'merchant' | 'accounting';

type PackageRow = {
  id: string;
  name: string;
  description: string;
  price: number;
  commission_rate: number;
  level: number;
  max_referrals: number | null;
  maturity_days: number;
  maturity_minutes: number | null;
  is_active: boolean;
};

const emptyPackage = {
  name: '',
  description: '',
  price: '',
  commission_rate: '',
  level: '',
  max_referrals: '',
  maturity_days: '',
};

export default function AdminPackagesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newPackage, setNewPackage] = useState(emptyPackage);
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const { data: profile } = (await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()) as { data: { role: Role } | null };

      if (!profile || profile.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      await fetchPackages();
      setLoading(false);
    };

    bootstrap();
  }, [router, supabase]);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchPackages = async () => {
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/packages', { headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to load packages');
      }
      const data = await res.json();
      setPackages((data?.packages ?? []) as PackageRow[]);
    } catch (err) {
      setError((err as any)?.message ?? 'Failed to load packages');
      setPackages([]);
    }
  };

  const toggleActive = async (pkg: PackageRow) => {
    setSavingId(pkg.id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/packages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ id: pkg.id, is_active: !pkg.is_active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to update package');
      }
      await fetchPackages();
    } catch (err) {
      setError((err as any)?.message ?? 'Failed to update package');
    } finally {
      setSavingId(null);
    }
  };

  const deletePackage = async (pkg: PackageRow) => {
    if (!confirm(`Delete package ${pkg.name}?`)) return;
    setDeletingId(pkg.id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/packages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ id: pkg.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to delete package');
      }
      await fetchPackages();
    } catch (err) {
      setError((err as any)?.message ?? 'Failed to delete package');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreate = async () => {
    setAddError(null);
    if (!newPackage.name.trim()) {
      setAddError('Package name is required');
      return;
    }

    const toNumber = (value: string) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    setAddLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          name: newPackage.name,
          description: newPackage.description,
          price: toNumber(newPackage.price),
          commission_rate: toNumber(newPackage.commission_rate),
          level: toNumber(newPackage.level),
          max_referrals: newPackage.max_referrals ? toNumber(newPackage.max_referrals) : null,
          maturity_days: toNumber(newPackage.maturity_days),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to create package');
      }
      setNewPackage(emptyPackage);
      setIsAddOpen(false);
      await fetchPackages();
    } catch (err) {
      setAddError((err as any)?.message ?? 'Failed to create package');
    } finally {
      setAddLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 2,
    }).format(value ?? 0);

  if (loading) {
    return (
      <AdminLayout>
        <div className="min-h-[60vh] flex items-center justify-center text-[#9fc3c1] text-sm tracking-[0.3em] uppercase">
          Loading packages…
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-10 space-y-8">
        <div className="rounded-[24px] border border-[#1c2f3f] bg-gradient-to-r from-[#0b2533] via-[#0c1c2d] to-[#0a1621] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[#7eb3b0]">Admin Space</p>
              <h1 className="text-3xl font-semibold text-white">Investment Packages</h1>
              <p className="text-[#9fc3c1]">Create, activate, and monitor membership packages.</p>
            </div>
            <button
              onClick={() => setIsAddOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#d4b673] px-4 py-2 text-sm font-semibold text-[#d4b673] hover:bg-[#d4b673]/10 transition"
            >
              Add Package
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="rounded-[26px] border border-[#1b2c34] bg-[#0b1f2a] p-6 shadow-[0_15px_35px_rgba(0,0,0,0.35)] space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.4em] text-[#7eb3b0]">Package</p>
                  <h3 className="text-2xl font-semibold text-white">{pkg.name}</h3>
                  <p className="text-sm text-[#9fc3c1]">{pkg.description}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${
                    pkg.is_active ? 'bg-[#173d2c] text-[#8ee4b8]' : 'bg-[#3a1d22] text-[#f4a7b4]'
                  }`}
                >
                  {pkg.is_active ? 'Active' : 'Disabled'}
                </span>
              </div>

              <div className="space-y-2 text-sm text-[#9fc3c1]">
                <div className="flex items-center justify-between">
                  <span>Price</span>
                  <span className="text-xl font-semibold text-white">{formatCurrency(pkg.price)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Commission</span>
                  <span className="text-white">{pkg.commission_rate}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Level</span>
                  <span className="text-white">{pkg.level}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Max referrals</span>
                  <span className="text-white">{pkg.max_referrals ?? 'Unlimited'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Maturity</span>
                  <span className="text-white">{pkg.maturity_days} days</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => toggleActive(pkg)}
                  disabled={savingId === pkg.id}
                  className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] ${
                    pkg.is_active
                      ? 'border border-[#d87f7f]/60 text-[#f4a7b4] hover:bg-[#2a1d22]'
                      : 'bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] text-[#0a1217]'
                  } disabled:opacity-60`}
                >
                  {savingId === pkg.id ? 'Saving…' : pkg.is_active ? 'Disable' : 'Activate'}
                </button>
                <button
                  onClick={() => deletePackage(pkg)}
                  disabled={deletingId === pkg.id}
                  className="rounded-xl border border-[#f26b6b]/40 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-[#f6b6b6] hover:bg-[#361b1d] disabled:opacity-60"
                >
                  {deletingId === pkg.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {packages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#1c2f3f] bg-[#091520] px-6 py-12 text-center text-[#7eb3b0]">
            No packages yet. Click “Add Package” to create one.
          </div>
        )}
      </div>

      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setIsAddOpen(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl border border-[#1c2f3f] bg-[#0a1621] p-6 shadow-[0_25px_55px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-[#7eb3b0]">Add Package</p>
                <h2 className="text-2xl font-semibold text-white">Create a new package</h2>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="rounded-full p-2 text-[#9fc3c1] hover:bg-[#0b1f2a]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm text-[#9fc3c1]" htmlFor="name">Name</label>
                <input
                  type="text"
                  id="name"
                  value={newPackage.name}
                  onChange={(e) => setNewPackage({ ...newPackage, name: e.target.value })}
                  className="w-full rounded-xl border border-[#1c2f3f] bg-[#0b1f2a] py-2 pl-10 text-sm text-white"
                  placeholder="Enter package name"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#9fc3c1]" htmlFor="description">Description</label>
                <textarea
                  id="description"
                  value={newPackage.description}
                  onChange={(e) => setNewPackage({ ...newPackage, description: e.target.value })}
                  className="w-full rounded-xl border border-[#1c2f3f] bg-[#0b1f2a] py-2 pl-10 text-sm text-white"
                  placeholder="Enter package description"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#9fc3c1]" htmlFor="price">Price</label>
                <input
                  type="number"
                  id="price"
                  value={newPackage.price}
                  onChange={(e) => setNewPackage({ ...newPackage, price: e.target.value })}
                  className="w-full rounded-xl border border-[#1c2f3f] bg-[#0b1f2a] py-2 pl-10 text-sm text-white"
                  placeholder="Enter package price"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#9fc3c1]" htmlFor="commission_rate">
                  Commission Rate
                </label>
                <input
                  type="number"
                  id="commission_rate"
                  value={newPackage.commission_rate}
                  onChange={(e) => setNewPackage({ ...newPackage, commission_rate: e.target.value })}
                  className="w-full rounded-xl border border-[#1c2f3f] bg-[#0b1f2a] py-2 pl-10 text-sm text-white"
                  placeholder="Enter commission rate"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#9fc3c1]" htmlFor="level">Level</label>
                <input
                  type="number"
                  id="level"
                  value={newPackage.level}
                  onChange={(e) => setNewPackage({ ...newPackage, level: e.target.value })}
                  className="w-full rounded-xl border border-[#1c2f3f] bg-[#0b1f2a] py-2 pl-10 text-sm text-white"
                  placeholder="Enter package level"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#9fc3c1]" htmlFor="max_referrals">
                  Max Referrals
                </label>
                <input
                  type="number"
                  id="max_referrals"
                  value={newPackage.max_referrals}
                  onChange={(e) => setNewPackage({ ...newPackage, max_referrals: e.target.value })}
                  className="w-full rounded-xl border border-[#1c2f3f] bg-[#0b1f2a] py-2 pl-10 text-sm text-white"
                  placeholder="Enter max referrals"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#9fc3c1]" htmlFor="maturity_days">
                  Maturity Days
                </label>
                <input
                  type="number"
                  id="maturity_days"
                  value={newPackage.maturity_days}
                  onChange={(e) => setNewPackage({ ...newPackage, maturity_days: e.target.value })}
                  className="w-full rounded-xl border border-[#1c2f3f] bg-[#0b1f2a] py-2 pl-10 text-sm text-white"
                  placeholder="Enter maturity days"
                />
              </div>

              {addError && (
                <div className="rounded-2xl border border-red-500/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
                  {addError}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={addLoading}
                className={`rounded-xl px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] ${
                  addLoading
                    ? 'bg-[#0b1f2a] text-[#9fc3c1] opacity-60'
                    : 'bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] text-[#0a1217]'
                }`}
              >
                {addLoading ? 'Saving…' : 'Create Package'}
              </button>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
