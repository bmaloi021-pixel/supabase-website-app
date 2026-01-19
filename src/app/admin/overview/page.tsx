'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';

type Role = 'admin' | 'user' | 'merchant' | 'accounting';

type AdminStats = {
  totalPackageValue: number;
  totalEarnings: number;
  totalWithdrawn: number;
  directReferral: number;
  indirectReferral: number;
  activePackageCount: number;
  approvedWithdrawalsCount: number;
  approvedReceiptsCount: number;
  salesDifference: number;
  totalRegisteredUsers: number;
  totalActivatedPackages: number;
  totalReferrals: number;
};

export default function AdminOverviewPage() {
  const router = useRouter();
  const supabase = useMemo(() => createAdminClient(), []);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [filterDate, setFilterDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(value);
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const { data: profileData } = (await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()) as { data: { role: Role } & Record<string, any> | null };

      const role = String((profileData as any)?.role ?? '').trim().toLowerCase();
      if (!profileData || role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      setProfile(profileData);
      setLoading(false);
    };

    checkAuth();
  }, [supabase, router]);

  useEffect(() => {
    const fetchStats = async () => {
      if (!profile) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        
        const params = new URLSearchParams();
        if (filterDate) params.append('date', filterDate);
        
        const response = await fetch(`/api/admin/overview?${params.toString()}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }

        const data = await response.json();
        setStats(data.stats);
      } catch (err) {
        console.error('Error fetching stats:', err);
        setError('Failed to load statistics');
      }
    };

    fetchStats();
  }, [profile, filterDate, supabase]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-white">Loading...</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-[32px] border border-[#1f4e5a]/60 bg-gradient-to-br from-[#0c2735] via-[#0f3445] to-[#071720] p-8 shadow-[0_25px_45px_rgba(0,0,0,0.45)] mb-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#f3cc84]"></span>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#7eb3b0]">Admin Dashboard</p>
                </div>
                <h1 className="text-3xl font-semibold text-white">Welcome back, {profile?.first_name}!</h1>
                <p className="text-[#9fc3c1] mt-2">Monitor investments, approvals, and commissions at a glance.</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-[#9fc3c1]">Filter by date:</label>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="rounded-xl border border-[#1c3f4c] bg-[#08131b] px-4 py-2 text-sm text-white focus:border-[#0f5d63] focus:outline-none"
                  />
                </div>
                {filterDate && (
                  <button
                    onClick={() => setFilterDate('')}
                    className="text-sm text-[#8fbab9] hover:text-white transition"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Total Package */}
            <div className="rounded-2xl border border-[#1c3f4c]/60 bg-gradient-to-br from-[#0c2735] to-[#0a1f2c] p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#7eb3b0]">Total Package</p>
                <span className="inline-flex rounded-full bg-[#173d2c] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#8ee4b8]">
                  Active
                </span>
              </div>
              <p className="text-3xl font-bold text-white mb-2">{formatCurrency(stats?.totalPackageValue || 0)}</p>
              <p className="text-sm text-[#9fc3c1]">Total package value including expected profit</p>
            </div>

            {/* Total Earnings */}
            <div className="rounded-2xl border border-[#453310]/60 bg-gradient-to-br from-[#2a1f0d] to-[#1a1308] p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#c9a76b]">Total Earnings</p>
                <span className="inline-flex rounded-full bg-[#453310] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#f4cc7c]">
                  Revenue
                </span>
              </div>
              <p className="text-3xl font-bold text-white mb-2">{formatCurrency(stats?.totalEarnings || 0)}</p>
              <p className="text-sm text-[#c9a76b]">Total approved investment receipts</p>
            </div>

            {/* Total Withdraw */}
            <div className="rounded-2xl border border-[#1c2f4c]/60 bg-gradient-to-br from-[#0d1f35] to-[#081525] p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#7ea3c1]">Total Withdraw</p>
                <span className="inline-flex rounded-full bg-[#1c2f4c] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#8fb3d1]">
                  Payouts
                </span>
              </div>
              <p className="text-3xl font-bold text-white mb-2">{formatCurrency(stats?.totalWithdrawn || 0)}</p>
              <p className="text-sm text-[#7ea3c1]">Total approved withdrawal amount</p>
            </div>

            {/* Direct Referral */}
            <div className="rounded-2xl border border-[#2d1f3f]/60 bg-gradient-to-br from-[#1f1530] to-[#150d20] p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#a98fc1]">Direct Referral</p>
                <span className="inline-flex rounded-full bg-[#2d1f3f] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#c9aee1]">
                  Level 1
                </span>
              </div>
              <p className="text-3xl font-bold text-white mb-2">{formatCurrency(stats?.directReferral || 0)}</p>
              <p className="text-sm text-[#a98fc1]">First level referral commissions</p>
            </div>

            {/* Indirect Referral */}
            <div className="rounded-2xl border border-[#1c3f4c]/60 bg-gradient-to-br from-[#0c2735] to-[#0a1f2c] p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#7eb3b0]">Indirect Referral</p>
                <span className="inline-flex rounded-full bg-[#173042] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#8fbab9]">
                  Level 2+
                </span>
              </div>
              <p className="text-3xl font-bold text-white mb-2">{formatCurrency(stats?.indirectReferral || 0)}</p>
              <p className="text-sm text-[#7eb3b0]">Multi-level referral commissions</p>
            </div>

            {/* Active Package */}
            <div className="rounded-2xl border border-[#1c3f4c]/60 bg-gradient-to-br from-[#0c2735] to-[#0a1f2c] p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#7eb3b0]">Active Package</p>
                <span className="inline-flex rounded-full bg-[#173d2c] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#8ee4b8]">
                  Live
                </span>
              </div>
              <p className="text-3xl font-bold text-white mb-2">{stats?.activePackageCount || 0}</p>
              <p className="text-sm text-[#7eb3b0]">Number of activated packages</p>
            </div>

            {/* Approved Withdrawal */}
            <div className="rounded-2xl border border-[#1c2f4c]/60 bg-gradient-to-br from-[#0d1f35] to-[#081525] p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#7ea3c1]">Approved Withdrawal</p>
                <span className="inline-flex rounded-full bg-[#1c2f4c] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#8fb3d1]">
                  Approved
                </span>
              </div>
              <p className="text-3xl font-bold text-white mb-2">{stats?.approvedWithdrawalsCount || 0}</p>
              <p className="text-sm text-[#7ea3c1]">Number of approved withdrawals</p>
            </div>

            {/* Approved Receipts */}
            <div className="rounded-2xl border border-[#453310]/60 bg-gradient-to-br from-[#2a1f0d] to-[#1a1308] p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#c9a76b]">Approved Receipts</p>
                <span className="inline-flex rounded-full bg-[#453310] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#f4cc7c]">
                  Count
                </span>
              </div>
              <p className="text-3xl font-bold text-white mb-2">{stats?.approvedReceiptsCount || 0}</p>
              <p className="text-sm text-[#c9a76b]">Approved investment receipts</p>
            </div>

            {/* Sales Difference */}
            <div className="rounded-2xl border border-[#2d1f3f]/60 bg-gradient-to-br from-[#1f1530] to-[#150d20] p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#a98fc1]">Sales Difference</p>
                <span className="inline-flex rounded-full bg-[#2d1f3f] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#c9aee1]">
                  Delta
                </span>
              </div>
              <p className="text-3xl font-bold text-white mb-2">{formatCurrency(stats?.salesDifference || 0)}</p>
              <p className="text-sm text-[#a98fc1]">Difference between earnings and withdrawals</p>
            </div>

            {/* Total Registered */}
            <div className="rounded-2xl border border-[#1c3f4c]/60 bg-gradient-to-br from-[#0c2735] to-[#0a1f2c] p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#7eb3b0]">Total Registered</p>
                <span className="inline-flex rounded-full bg-[#173042] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#8fbab9]">
                  All Time
                </span>
              </div>
              <p className="text-3xl font-bold text-white mb-2">{stats?.totalRegisteredUsers || 0}</p>
              <p className="text-sm text-[#7eb3b0]">All time registered users</p>
            </div>

            {/* Total Activated Package */}
            <div className="rounded-2xl border border-[#1c3f4c]/60 bg-gradient-to-br from-[#0c2735] to-[#0a1f2c] p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#7eb3b0]">Total Activated Package</p>
                <span className="inline-flex rounded-full bg-[#173042] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#8fbab9]">
                  All Time
                </span>
              </div>
              <p className="text-3xl font-bold text-white mb-2">{stats?.totalActivatedPackages || 0}</p>
              <p className="text-sm text-[#7eb3b0]">Active packages on record</p>
            </div>

            {/* Total Referrals */}
            <div className="rounded-2xl border border-[#1c2f4c]/60 bg-gradient-to-br from-[#0d1f35] to-[#081525] p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs uppercase tracking-[0.25em] text-[#7ea3c1]">Total Referrals</p>
                <span className="inline-flex rounded-full bg-[#1c2f4c] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#8fb3d1]">
                  Network
                </span>
              </div>
              <p className="text-3xl font-bold text-white mb-2">{stats?.totalReferrals || 0}</p>
              <p className="text-sm text-[#7ea3c1]">People you've invited</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
