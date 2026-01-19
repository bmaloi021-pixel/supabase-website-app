'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';

type Role = 'admin' | 'user' | 'merchant' | 'accounting';

type MerchantRow = {
  id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  role?: Role;
  status?: 'online' | 'offline';
  created_at?: string;
};

export default function AdminMerchantsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createAdminClient(), []);
  const [loading, setLoading] = useState(true);
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'joined'>('name');

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const { data: profileData } = (await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()) as { data: { role: Role } | null };

      if (!profileData || profileData.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      await fetchMerchants();
      setLoading(false);
    };

    checkAuth();
  }, [supabase, router]);

  const fetchMerchants = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await fetch('/api/admin/users', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch merchants');
      }
      const data = await response.json();
      const rows = (data.profiles || []) as MerchantRow[];
      setMerchants(rows.filter((row) => row.role === 'merchant'));
    } catch (err) {
      setError('Failed to load merchants');
    }
  };

  const filteredMerchants = merchants
    .filter((merchant) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      const name = `${merchant.first_name ?? ''} ${merchant.last_name ?? ''}`.toLowerCase();
      return name.includes(query) || (merchant.username ?? '').toLowerCase().includes(query);
    })
    .sort((a, b) => {
      if (sortBy === 'joined') {
        return new Date(b.created_at ?? '').getTime() - new Date(a.created_at ?? '').getTime();
      }
      return `${a.first_name ?? ''} ${a.last_name ?? ''}`.localeCompare(`${b.first_name ?? ''} ${b.last_name ?? ''}`);
    });

  const stats = [
    {
      label: 'Total Merchants',
      value: merchants.length,
      gradient: 'from-[#7856ff] to-[#5c3bff]',
    },
    {
      label: 'Online Merchants',
      value: merchants.filter((m) => m.status === 'online').length,
      gradient: 'from-[#1ba86c] to-[#23d38c]',
    },
    {
      label: 'Offline Merchants',
      value: merchants.filter((m) => m.status !== 'online').length,
      gradient: 'from-[#4b5c7c] to-[#4b5c7c]',
    },
  ];

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
      <div className="max-w-7xl mx-auto px-4 py-10 space-y-8">
        <div className="rounded-[32px] border border-[#1f4e5a]/60 bg-gradient-to-br from-[#0c2735] via-[#132840] to-[#09121c] p-8 shadow-[0_25px_45px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-white/10 p-4 text-white">
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h14M4 18h8" />
              </svg>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-[#7eb3b0] mb-1">Merchants</p>
              <h1 className="text-3xl font-semibold text-white">Merchants</h1>
              <p className="text-[#9fc3c1]">View all merchants and their topup request statistics.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`rounded-[24px] bg-gradient-to-br ${stat.gradient} p-5 text-white shadow-[0_20px_40px_rgba(0,0,0,0.35)] flex items-center justify-between`}
            >
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/80">{stat.label}</p>
                <p className="text-4xl font-semibold mt-1">{stat.value}</p>
              </div>
              <div className="rounded-full bg-white/20 p-3 text-white">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h12M4 18h8" />
                </svg>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-[24px] border border-[#1a2b3f] bg-[#0a1624] px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between shadow-[0_15px_35px_rgba(0,0,0,0.4)]">
          <div className="flex w-full items-center gap-3 rounded-[18px] border border-[#213549] bg-[#091324] px-4 py-2 text-sm text-[#8fb4c4]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5a6 6 0 105.196 11.196l3.304 3.304" />
            </svg>
            <input
              className="flex-1 bg-transparent text-sm text-white placeholder:text-[#4c6375] focus:outline-none"
              placeholder="Search by name, username, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" className="rounded-full border border-[#2c4a63] p-2 text-[#7ec0ff] hover:bg-[#163049] transition">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-[0.25em] text-[#5e758d]">Sort by</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-[16px] border border-[#1f2f45] bg-[#0b1f32] px-4 py-2 text-sm text-white focus:border-[#4da8ff] focus:outline-none"
            >
              <option value="name">Name</option>
              <option value="joined">Joined</option>
            </select>
          </div>
        </div>

        <div className="rounded-[28px] border border-[#1a2e3f] bg-[#071420] shadow-[0_25px_65px_rgba(0,0,0,0.55)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#132233] flex items-center justify-between text-sm uppercase tracking-[0.3em] text-[#6b8899]">
            <span>All Merchants ({filteredMerchants.length} of {merchants.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#132233] text-sm text-[#9fc3c1]">
              <thead className="bg-[#0c1c2b] text-[11px] uppercase tracking-[0.35em] text-[#6b8899]">
                <tr>
                  <th className="px-6 py-3 text-left">Merchant</th>
                  <th className="px-6 py-3 text-left">Username</th>
                  <th className="px-6 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#132233]">
                {filteredMerchants.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-10 text-center text-[#5f7991]">
                      No merchants found.
                    </td>
                  </tr>
                )}
                {filteredMerchants.map((merchant) => (
                  <tr key={merchant.id} className="hover:bg-white/5 transition">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-white font-semibold">
                          {merchant.first_name} {merchant.last_name}
                        </span>
                        <span className="text-xs text-[#5f7991]">ID: {merchant.id}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-white">{merchant.username}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                          merchant.status === 'online'
                            ? 'bg-green-500/20 text-green-200'
                            : 'bg-slate-500/20 text-slate-200'
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${merchant.status === 'online' ? 'bg-green-300' : 'bg-slate-300'}`} />
                        {merchant.status === 'online' ? 'Online' : 'Offline'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">{error}</div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
