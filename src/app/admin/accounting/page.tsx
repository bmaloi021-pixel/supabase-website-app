'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';

type Role = 'admin' | 'user' | 'merchant' | 'accounting';

type UserRow = {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  role: Role;
  balance?: number;
  total_earnings?: number;
  created_at?: string;
};

export default function AdminAccountingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'balance' | 'joined' | 'total_earnings'>('name');

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(value ?? 0);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (!profile || profile.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      await fetchUsers();
      setLoading(false);
    };

    checkAuth();
  }, [router, supabase]);

  const fetchUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/admin/users', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data.profiles || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users');
    }
  };

  const updateUserRole = async (userId: string, role: Role, prevRole: Role) => {
    setSavingId(userId);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId, role }),
      });

      if (!response.ok) {
        throw new Error('Failed to update role');
      }

      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    } catch (err) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: prevRole } : u)));
      setError('Failed to update user role');
    } finally {
      setSavingId(null);
    }
  };

  const accountingUsers = users.filter((user) => user.role === 'accounting');
  const statBlocks = [
    { label: 'Total Accounting', value: accountingUsers.length, gradient: 'from-[#7856ff] to-[#5c3bff]' },
    { label: 'Online Accounting', value: 0, gradient: 'from-[#1ba86c] to-[#23d38c]' },
    { label: 'Offline Accounting', value: 0, gradient: 'from-[#4b5c7c] to-[#4b5c7c]' },
  ];

  const visibleUsers = accountingUsers
    .filter((user) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return (
        `${user.first_name} ${user.last_name}`.toLowerCase().includes(query) || (user.username ?? '').toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'balance') {
        return (b.balance ?? 0) - (a.balance ?? 0);
      }
      if (sortBy === 'joined') {
        return new Date(b.created_at ?? '').getTime() - new Date(a.created_at ?? '').getTime();
      }
      if (sortBy === 'total_earnings') {
        return (b.total_earnings ?? 0) - (a.total_earnings ?? 0);
      }
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });

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
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="rounded-[32px] border border-[#1f4e5a]/60 bg-gradient-to-br from-[#0d2a39] via-[#0a1d2b] to-[#08121a] p-8 shadow-[0_25px_55px_rgba(0,0,0,0.55)]">
          <p className="text-xs uppercase tracking-[0.35em] text-[#6aa8a8] mb-1">Accounting Staff</p>
          <h1 className="text-3xl font-semibold text-white">Accounting</h1>
          <p className="text-[#9ac4c3] mt-2">View and manage accounting staff.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {statBlocks.map((block) => (
            <div
              key={block.label}
              className={`rounded-[24px] bg-gradient-to-br ${block.gradient} p-5 text-white shadow-[0_20px_45px_rgba(0,0,0,0.35)] flex items-center justify-between`}
            >
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.3em] text-white/80">{block.label}</p>
                <p className="text-4xl font-semibold">{block.value}</p>
              </div>
              <div className="rounded-2xl bg-white/15 p-3">
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
            <button
              type="button"
              className="rounded-full border border-[#2c4a63] p-2 text-[#7ec0ff] hover:bg-[#163049] transition"
            >
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
              <option value="balance">Balance</option>
              <option value="joined">Joined</option>
              <option value="total_earnings">Total Earnings</option>
            </select>
          </div>
        </div>

        <div className="rounded-[28px] border border-[#1a2e3f] bg-[#071420] shadow-[0_25px_65px_rgba(0,0,0,0.55)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#152536]">
              <thead className="bg-[#0c1c2b] text-[11px] uppercase tracking-[0.35em] text-[#6b8899]">
                <tr>
                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Username</th>
                  <th className="px-6 py-3 text-left">Balance</th>
                  <th className="px-6 py-3 text-left">Total Earnings</th>
                  <th className="px-6 py-3 text-left">Star Cards</th>
                  <th className="px-6 py-3 text-left">Role</th>
                  <th className="px-6 py-3 text-left">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#132233]">
                {visibleUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-[#5f7991]">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="h-10 w-10 text-[#4d6675]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 8v4" />
                          <circle cx="12" cy="16" r=".5" />
                        </svg>
                        <div>
                          <p className="text-white font-semibold">No accounting users found.</p>
                          <p className="text-sm text-[#5f7991]">Accounting users will appear once they are created.</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {visibleUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-white/5 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                      {user.first_name} {user.last_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#9fc3c1]">@{user.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{formatCurrency(user.balance || 0)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{formatCurrency(user.total_earnings || 0)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">0</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={user.role}
                        onChange={(e) => updateUserRole(user.id, e.target.value as Role, user.role)}
                        disabled={savingId === user.id}
                        className="rounded-xl border border-[#1c3f4c] bg-[#08131b] px-3 py-2 text-sm text-white focus:border-[#0f5d63] focus:outline-none disabled:opacity-50"
                      >
                        <option value="user">User</option>
                        <option value="merchant">Merchant</option>
                        <option value="accounting">Accounting</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#9fc3c1]">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
