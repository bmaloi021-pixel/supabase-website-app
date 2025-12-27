'use client';

import { useEffect, useMemo, useState, useMemo as useMemoReact } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';

type CashflowEntry = {
  id: string;
  user_id: string | null;
  amount: number;
  status: string;
  status_notes?: string | null;
  payment_method_type?: string | null;
  username?: string | null;
  created_at: string;
  processed_at?: string | null;
};

type ViewType = 'topups' | 'withdrawals';
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export default function AdminCashflowPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState<ViewType>('topups');
  const [entries, setEntries] = useState<CashflowEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (!profileData || profileData.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      setLoading(false);
    };

    checkAuth();
  }, [supabase, router]);

  const authHeaders = async (): Promise<HeadersInit> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchEntries = async () => {
    setFetching(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const params = new URLSearchParams({ type: viewType, limit: '500' });
      if (dateFilter) {
        const start = new Date(`${dateFilter}T00:00:00.000Z`).toISOString();
        const endDate = new Date(dateFilter);
        endDate.setUTCDate(endDate.getUTCDate() + 1);
        params.set('start', start);
        params.set('end', endDate.toISOString());
      }
      const res = await fetch(`/api/admin/cashflow?${params.toString()}`, {
        headers,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to load cashflow entries');
      }
      const data = await res.json();
      setEntries((data?.entries ?? []) as CashflowEntry[]);
    } catch (err) {
      setError((err as any)?.message ?? 'Failed to load cashflow entries');
      setEntries([]);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!loading) {
      fetchEntries();
    }
  }, [viewType, dateFilter, loading]);

  const filteredEntries = useMemoReact(() => {
    return entries.filter((entry) => {
      const matchesStatus =
        statusFilter === 'all' ? true : entry.status?.toLowerCase() === statusFilter;
      const matchesSearch = searchTerm
        ? (entry.username ?? '')
            .toLowerCase()
            .includes(searchTerm.trim().toLowerCase())
        : true;
      return matchesStatus && matchesSearch;
    });
  }, [entries, statusFilter, searchTerm]);

  const stats = useMemoReact(() => {
    const base = {
      pending: { count: 0, amount: 0 },
      approved: { count: 0, amount: 0 },
      rejected: { count: 0, amount: 0 },
    };
    for (const entry of entries) {
      const normalized = entry.status?.toLowerCase() as keyof typeof base;
      if (!normalized || !base[normalized]) continue;
      base[normalized].count += 1;
      base[normalized].amount += Number(entry.amount ?? 0);
    }
    return base;
  }, [entries]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="min-h-[60vh] flex items-center justify-center text-[#9fc3c1] text-sm tracking-[0.3em] uppercase">
          Loading cashflow center…
        </div>
      </AdminLayout>
    );
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 2,
    }).format(value ?? 0);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const statusOptions: StatusFilter[] = ['all', 'pending', 'approved', 'rejected'];

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-10 space-y-8">
        <div className="rounded-[24px] border border-[#1c2f3f] bg-gradient-to-r from-[#0f2431] via-[#101b2a] to-[#0a161f] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[#7eb3b0]">Finance Desk</p>
              <h1 className="text-3xl font-semibold text-white">Cashflow Center</h1>
              <p className="text-[#9fc3c1]">
                View transaction logs for top-ups and withdrawals.
              </p>
            </div>
            <div className="flex rounded-full border border-[#1c2f3f] bg-[#0b1f2a]">
              <button
                onClick={() => setViewType('topups')}
                className={`px-5 py-2 text-sm font-semibold transition ${
                  viewType === 'topups'
                    ? 'rounded-full bg-gradient-to-r from-[#2c6fef] to-[#54bbff] text-white shadow-lg'
                    : 'text-[#9fc3c1]'
                }`}
              >
                Top-ups
              </button>
              <button
                onClick={() => setViewType('withdrawals')}
                className={`px-5 py-2 text-sm font-semibold transition ${
                  viewType === 'withdrawals'
                    ? 'rounded-full bg-gradient-to-r from-[#23c17e] to-[#61e0a7] text-[#0b1f2a] shadow-lg'
                    : 'text-[#9fc3c1]'
                }`}
              >
                Withdrawals
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-[20px] border border-[#1c2f3f] bg-[#0b1823] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-[#9fc3c1] text-sm flex items-center gap-2">
              <span>Date</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="rounded-xl border border-[#1c2f3f] bg-[#08131b] px-3 py-2 text-sm text-white focus:border-[#0f5d63] focus:outline-none"
              />
            </label>
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7eb3b0] hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
          <div className="text-xs text-[#9fc3c1]">
            Showing {filteredEntries.length} of {entries.length} records
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[20px] border border-[#2f1f07] bg-gradient-to-r from-[#b86f11] to-[#f0a238] p-5 text-white shadow-[0_15px_35px_rgba(0,0,0,0.35)]">
            <p className="text-xs uppercase tracking-[0.3em] opacity-80">
              Pending
            </p>
            <div className="mt-2 text-4xl font-semibold">
              {stats.pending.count}
            </div>
            <p className="text-sm opacity-80">
              {formatCurrency(stats.pending.amount || 0)}
            </p>
          </div>
          <div className="rounded-[20px] border border-[#0d391f] bg-gradient-to-r from-[#1ec27b] to-[#5fe8b1] p-5 text-[#06141f] shadow-[0_15px_35px_rgba(0,0,0,0.35)]">
            <p className="text-xs uppercase tracking-[0.3em] opacity-80">
              Approved
            </p>
            <div className="mt-2 text-4xl font-semibold">
              {stats.approved.count}
            </div>
            <p className="text-sm opacity-80">
              {formatCurrency(stats.approved.amount || 0)}
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-[#1c2f3f] bg-[#091520] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.4)] space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 rounded-full border border-[#1c2f3f] bg-[#0b1f2a] px-4 py-2 text-sm text-[#9fc3c1]">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5a7 7 0 105.196 12.196l3.304 3.304" />
              </svg>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by username…"
                className="bg-transparent text-sm text-white placeholder:text-[#4b6670] focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setStatusFilter(opt)}
                  className={`rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${
                    statusFilter === opt
                      ? 'bg-gradient-to-r from-[#1b73f1] to-[#52d4ff] text-white shadow-lg'
                      : 'border border-[#1c2f3f] text-[#9fc3c1]'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-[20px] border border-[#1c2f3f]">
            <table className="min-w-full divide-y divide-[#1c2f3f] text-sm text-[#9fc3c1]">
              <thead className="bg-[#0f1f2e] text-[11px] uppercase tracking-[0.35em] text-[#6c8d99]">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Payment Method</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">{viewType === 'topups' ? 'Date' : 'Requested At'}</th>
                  {viewType === 'withdrawals' && (
                    <th className="px-4 py-3 text-left">Processed At</th>
                  )}
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c2f3f]">
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={viewType === 'withdrawals' ? 7 : 6} className="px-4 py-8 text-center text-[#5f7983]">
                      No {viewType === 'topups' ? 'top-up' : 'withdrawal'} records found.
                    </td>
                  </tr>
                )}
                {filteredEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-white">{entry.username ?? '—'}</td>
                    <td className="px-4 py-3">{entry.payment_method_type ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-white">{formatCurrency(entry.amount)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${
                          entry.status?.toLowerCase() === 'approved'
                            ? 'bg-[#173d2c] text-[#8ee4b8]'
                            : entry.status?.toLowerCase() === 'pending'
                            ? 'bg-[#3a2a0b] text-[#f4d18c]'
                            : 'bg-[#3a1d22] text-[#f6b6b6]'
                        }`}
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatDate(entry.created_at)}</td>
                    {viewType === 'withdrawals' && (
                      <td className="px-4 py-3">
                        {entry.processed_at ? formatDate(entry.processed_at) : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs text-[#7eb3b0] italic">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
