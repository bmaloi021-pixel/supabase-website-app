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

export default function AdminUsersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');

  const showFinancialColumns = roleFilter !== 'all';

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

      if (!profileData || profileData.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      setProfile(profileData);
      await fetchUsers();
      setLoading(false);
    };

    checkAuth();
  }, [supabase, router]);

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

      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    } catch (err) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: prevRole } : u));
      setError('Failed to update user role');
    } finally {
      setSavingId(null);
    }
  };

  const filteredUsers = roleFilter === 'all' ? users : users.filter(u => u.role === roleFilter);

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
                <p className="text-xs uppercase tracking-[0.3em] text-[#7eb3b0] mb-2">User Management</p>
                <h1 className="text-3xl font-semibold text-white">Registered Users</h1>
                <p className="text-[#9fc3c1] mt-2">View and manage all registered users and their roles.</p>
              </div>
              <div className="flex items-center gap-2">
                {(['all', 'user', 'merchant', 'accounting', 'admin'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setRoleFilter(filter)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                      roleFilter === filter
                        ? 'bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] text-[#0a1217]'
                        : 'bg-[#173042] text-[#9fc3c1] hover:bg-[#1f4050]'
                    }`}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-[#1c3f4c] bg-[#0b1e27] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#1c3f4c]">
                <thead className="bg-[#0f2835]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Username</th>
                    {showFinancialColumns ? (
                      <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Balance</th>
                    ) : null}
                    {showFinancialColumns ? (
                      <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Total Earnings</th>
                    ) : null}
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c3f4c]">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-white/5 transition">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                        {user.first_name} {user.last_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#9fc3c1]">
                        @{user.username}
                      </td>
                      {showFinancialColumns ? (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {formatCurrency(user.balance || 0)}
                        </td>
                      ) : null}
                      {showFinancialColumns ? (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {formatCurrency(user.total_earnings || 0)}
                        </td>
                      ) : null}
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
        </div>
      </div>
    </AdminLayout>
  );
}
