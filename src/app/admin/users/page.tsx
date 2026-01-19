'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/client';
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
  const supabase = useMemo(() => createAdminClient(), []);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [passwordSavingId, setPasswordSavingId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  const [settingsTargetUser, setSettingsTargetUser] = useState<UserRow | null>(null);
  const [impersonateLoadingId, setImpersonateLoadingId] = useState<string | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState<UserRow | null>(null);
  const [customPassword, setCustomPassword] = useState('');

  const showFinancialColumns = roleFilter !== 'all';

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const openUserSettings = (user: UserRow) => {
    setSettingsTargetUser(user);
    setError(null);
    setSuccess(null);
    setIsUserSettingsOpen(true);
  };

  const closeUserSettings = () => {
    setIsUserSettingsOpen(false);
    setSettingsTargetUser(null);
  };

  const backupAdminSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) return;

    try {
      localStorage.setItem('admin_session_backup', JSON.stringify(session));
      localStorage.setItem('admin_user_id_backup', session.user.id);
    } catch {
      // ignore
    }
  };

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setSuccess(`${label} copied.`);
    } catch {
      setError(`Failed to copy ${label.toLowerCase()}.`);
    }
  };

  const impersonateUser = async (targetUserId: string) => {
    setError(null);
    setSuccess(null);
    setImpersonateLoadingId(targetUserId);

    try {
      const ok = window.confirm('Impersonate this user? You will temporarily switch into their account.');
      if (!ok) return;

      await backupAdminSession();

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error('Missing admin session token');
      }

      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: targetUserId }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error((json as any)?.error ?? 'Failed to impersonate user');
      }

      const actionLink = (json as any)?.action_link as string | undefined;
      if (!actionLink) {
        throw new Error('No impersonation link returned');
      }

      window.location.href = actionLink;
    } catch (e) {
      setError((e as any)?.message ?? 'Failed to impersonate user');
    } finally {
      setImpersonateLoadingId(null);
    }
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
    setSuccess(null);

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

  const resetUserPassword = async (userId: string) => {
    setPasswordSavingId(userId);
    setError(null);
    setSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId, action: 'reset_password' }),
      });

      const json = await response.json().catch(() => ({} as any));
      if (!response.ok) {
        throw new Error((json as any)?.error ?? 'Failed to reset password');
      }

      setSuccess('Password reset successfully.');
    } catch (err) {
      setError((err as any)?.message ?? 'Failed to reset password');
    } finally {
      setPasswordSavingId(null);
    }
  };

  const openSetPasswordModal = (user: UserRow) => {
    setPasswordTargetUser(user);
    setCustomPassword('');
    setError(null);
    setSuccess(null);
    setIsPasswordModalOpen(true);
  };

  const closeSetPasswordModal = () => {
    setIsPasswordModalOpen(false);
    setPasswordTargetUser(null);
    setCustomPassword('');
  };

  const submitSetPassword = async () => {
    const target = passwordTargetUser;
    if (!target?.id) return;
    if (!customPassword || customPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setPasswordSavingId(target.id);
    setError(null);
    setSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId: target.id, action: 'set_password', password: customPassword }),
      });

      const json = await response.json().catch(() => ({} as any));
      if (!response.ok) {
        throw new Error((json as any)?.error ?? 'Failed to set password');
      }

      setSuccess('Password updated successfully.');
      closeSetPasswordModal();
    } catch (err) {
      setError((err as any)?.message ?? 'Failed to set password');
    } finally {
      setPasswordSavingId(null);
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
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-[32px] border border-[#1f4e5a]/60 bg-gradient-to-br from-[#0c2735] via-[#0f3445] to-[#071720] p-5 sm:p-8 shadow-[0_25px_45px_rgba(0,0,0,0.45)] mb-6 sm:mb-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#7eb3b0] mb-2">User Management</p>
                <h1 className="text-3xl font-semibold text-white">Registered Users</h1>
                <p className="text-[#9fc3c1] mt-2">View and manage all registered users and their roles.</p>
              </div>
              <div className="-mx-2 flex items-center gap-2 overflow-x-auto px-2 pb-1">
                {(['all', 'user', 'merchant', 'accounting', 'admin'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setRoleFilter(filter)}
                    className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-xl text-sm font-medium transition ${
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

          {success && (
            <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {success}
            </div>
          )}

          <div className="rounded-2xl border border-[#1c3f4c] bg-[#0b1e27] overflow-hidden">
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[#1c3f4c]">
              {filteredUsers.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-[#9fc3c1]">No users found.</div>
              ) : (
                filteredUsers.map((user) => (
                  <div key={user.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {user.first_name} {user.last_name}
                        </p>
                        <p className="mt-1 text-xs text-[#9fc3c1] truncate">@{user.username}</p>
                      </div>
                      <p className="shrink-0 text-[11px] text-[#7eb3b0]">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                      </p>
                    </div>

                    {showFinancialColumns ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-[#1c3f4c] bg-[#08131b] px-3 py-2">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-[#7eb3b0]">Balance</p>
                          <p className="mt-1 text-sm font-semibold text-white">
                            {formatCurrency(user.balance || 0)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-[#1c3f4c] bg-[#08131b] px-3 py-2">
                          <p className="text-[10px] uppercase tracking-[0.25em] text-[#7eb3b0]">Earnings</p>
                          <p className="mt-1 text-sm font-semibold text-white">
                            {formatCurrency(user.total_earnings || 0)}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.25em] text-[#7eb3b0]">Role</p>
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
                    </div>

                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => openUserSettings(user)}
                        aria-label="Open user settings"
                        title="Settings"
                        className="inline-flex items-center justify-center rounded-xl border border-[#1c3f4c] bg-[#08131b] p-2 text-[#9fc3c1] transition hover:bg-[#0f1f2e]"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.03.03a2.05 2.05 0 0 1 0 2.9 2.05 2.05 0 0 1-2.9 0l-.03-.03A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .3 1.7 1.7 0 0 0-.7 1.43V21a2.05 2.05 0 0 1-4.1 0v-.07A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.87-.34l-.03.03a2.05 2.05 0 0 1-2.9 0 2.05 2.05 0 0 1 0-2.9l.03-.03A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.3-1 1.7 1.7 0 0 0-1.43-.7H2.8a2.05 2.05 0 0 1 0-4.1h.07A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.87l-.03-.03a2.05 2.05 0 0 1 0-2.9 2.05 2.05 0 0 1 2.9 0l.03.03A1.7 1.7 0 0 0 8.5 4.6a1.7 1.7 0 0 0 1-.3 1.7 1.7 0 0 0 .7-1.43V2.8a2.05 2.05 0 0 1 4.1 0v.07A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.87.34l.03-.03a2.05 2.05 0 0 1 2.9 0 2.05 2.05 0 0 1 0 2.9l-.03.03A1.7 1.7 0 0 0 19.4 8.5c.2.31.3.66.3 1s-.1.69-.3 1a1.7 1.7 0 0 0 1.43.7h.07a2.05 2.05 0 0 1 0 4.1h-.07a1.7 1.7 0 0 0-1.43.7c.2.31.3.66.3 1Z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
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
                    <th className="px-6 py-3 text-right text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">
                      <span className="sr-only">Settings</span>
                    </th>
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
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => openUserSettings(user)}
                          aria-label="Open user settings"
                          title="Settings"
                          className="inline-flex items-center justify-center rounded-xl border border-[#1c3f4c] bg-[#08131b] p-2 text-[#9fc3c1] transition hover:bg-[#0f1f2e]"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.03.03a2.05 2.05 0 0 1 0 2.9 2.05 2.05 0 0 1-2.9 0l-.03-.03A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .3 1.7 1.7 0 0 0-.7 1.43V21a2.05 2.05 0 0 1-4.1 0v-.07A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.87-.34l-.03.03a2.05 2.05 0 0 1-2.9 0 2.05 2.05 0 0 1 0-2.9l.03-.03A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.3-1 1.7 1.7 0 0 0-1.43-.7H2.8a2.05 2.05 0 0 1 0-4.1h.07A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.87l-.03-.03a2.05 2.05 0 0 1 0-2.9 2.05 2.05 0 0 1 2.9 0l.03.03A1.7 1.7 0 0 0 8.5 4.6a1.7 1.7 0 0 0 1-.3 1.7 1.7 0 0 0 .7-1.43V2.8a2.05 2.05 0 0 1 4.1 0v.07A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.87.34l.03-.03a2.05 2.05 0 0 1 2.9 0 2.05 2.05 0 0 1 0 2.9l-.03.03A1.7 1.7 0 0 0 19.4 8.5c.2.31.3.66.3 1s-.1.69-.3 1a1.7 1.7 0 0 0 1.43.7h.07a2.05 2.05 0 0 1 0 4.1h-.07a1.7 1.7 0 0 0-1.43.7c.2.31.3.66.3 1Z" />
                          </svg>
                        </button>
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

          {isUserSettingsOpen && settingsTargetUser ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
              <div className="absolute inset-0 bg-black/60" onClick={closeUserSettings} aria-hidden="true" />
              <div className="relative z-10 w-[92vw] max-w-md rounded-3xl border border-[#1c3f4c] bg-[#0b1e27] shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#1c3f4c] px-6 py-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#7eb3b0]">Settings</p>
                    <h2 className="text-xl font-semibold text-white">Account actions</h2>
                    <p className="mt-1 text-sm text-[#9fc3c1] truncate">
                      {settingsTargetUser.first_name} {settingsTargetUser.last_name} (@{settingsTargetUser.username})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeUserSettings}
                    className="rounded-full border border-transparent p-2 text-white/70 hover:text-white hover:bg-white/10"
                    aria-label="Close user settings"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className="px-6 py-5">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => resetUserPassword(settingsTargetUser.id)}
                      disabled={passwordSavingId === settingsTargetUser.id}
                      className="rounded-xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-sm font-semibold text-[#f3cc84] transition hover:bg-[#0f1f2e] disabled:opacity-50"
                    >
                      {passwordSavingId === settingsTargetUser.id ? 'Working…' : 'Reset PW'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeUserSettings();
                        openSetPasswordModal(settingsTargetUser);
                      }}
                      disabled={passwordSavingId === settingsTargetUser.id}
                      className="rounded-xl bg-gradient-to-r from-[#16a7a1] to-[#1ed3c2] px-4 py-3 text-sm font-semibold text-[#062226] transition hover:opacity-90 disabled:opacity-50"
                    >
                      Set PW
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => impersonateUser(settingsTargetUser.id)}
                      disabled={impersonateLoadingId === settingsTargetUser.id}
                      className="rounded-xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-sm font-semibold text-white/90 transition hover:bg-[#0f1f2e] disabled:opacity-50"
                    >
                      {impersonateLoadingId === settingsTargetUser.id ? 'Switching…' : 'Impersonate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(settingsTargetUser.id, 'User ID')}
                      className="rounded-xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-sm font-semibold text-[#9fc3c1] transition hover:bg-[#0f1f2e]"
                    >
                      Copy ID
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(settingsTargetUser.username, 'Username')}
                      className="rounded-xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-sm font-semibold text-[#9fc3c1] transition hover:bg-[#0f1f2e]"
                    >
                      Copy Username
                    </button>
                    <button
                      type="button"
                      onClick={closeUserSettings}
                      className="rounded-xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-sm font-semibold text-[#9fc3c1] transition hover:bg-[#0f1f2e]"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {isPasswordModalOpen && passwordTargetUser ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
              <div className="absolute inset-0 bg-black/60" onClick={closeSetPasswordModal} aria-hidden="true" />
              <div className="relative z-10 w-[92vw] max-w-lg rounded-3xl border border-[#1c3f4c] bg-[#0b1e27] shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#1c3f4c] px-6 py-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#7eb3b0]">Password</p>
                    <h2 className="text-xl font-semibold text-white">Set password</h2>
                    <p className="mt-1 text-sm text-[#9fc3c1] truncate">
                      {passwordTargetUser.first_name} {passwordTargetUser.last_name} (@{passwordTargetUser.username})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeSetPasswordModal}
                    className="rounded-full border border-transparent p-2 text-white/70 hover:text-white hover:bg-white/10"
                    aria-label="Close set password"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#9fc3c1]">New password</label>
                    <input
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      type="text"
                      placeholder="Minimum 6 characters"
                      className="mt-2 w-full rounded-xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-sm text-white outline-none focus:border-[#16a7a1]"
                    />
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                    <button
                      type="button"
                      onClick={closeSetPasswordModal}
                      className="rounded-full border border-[#1c3f4c] px-5 py-2 text-sm font-semibold text-[#7eb3b0] hover:bg-[#0f2835] transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitSetPassword}
                      disabled={passwordSavingId === passwordTargetUser.id}
                      className="rounded-full bg-gradient-to-r from-[#16a7a1] to-[#1ed3c2] px-6 py-2 text-sm font-semibold text-[#062226] shadow-md hover:opacity-90 transition disabled:opacity-50"
                    >
                      {passwordSavingId === passwordTargetUser.id ? 'Working…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AdminLayout>
  );
}
