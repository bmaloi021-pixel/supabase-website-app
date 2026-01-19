'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/client';
import AdminLayout from '@/components/admin/AdminLayout';

type Role = 'admin' | 'user' | 'merchant' | 'accounting';

type CommissionRow = {
  id: string;
  user_id: string;
  referral_id: string;
  top_up_request_id: string | null;
  amount: number;
  commission_type: string;
  level: number;
  status: string;
  created_at: string;
};

export default function AdminCommissionsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createAdminClient(), []);
  const [loading, setLoading] = useState(true);
  const [commissionsLoading, setCommissionsLoading] = useState(false);
  const [commissionsError, setCommissionsError] = useState<string | null>(null);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(amount);
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
        .select('role')
        .eq('id', session.user.id)
        .single()) as { data: { role: Role } | null };

      if (!profileData || profileData.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      setLoading(false);
    };

    checkAuth();
  }, [supabase, router]);

  useEffect(() => {
    const fetchCommissions = async () => {
      setCommissionsError(null);
      setCommissionsLoading(true);
      try {
        const { data, error } = await supabase
          .from('commissions')
          .select('id,user_id,referral_id,top_up_request_id,amount,commission_type,level,status,created_at')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setCommissions((data as CommissionRow[]) ?? []);
      } catch (e) {
        setCommissionsError((e as any)?.message ?? 'Failed to load commissions');
        setCommissions([]);
      } finally {
        setCommissionsLoading(false);
      }
    };

    if (!loading) {
      fetchCommissions();
    }
  }, [loading, supabase]);

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
          <div className="rounded-[32px] border border-[#1f4e5a]/60 bg-gradient-to-br from-[#0c2735] via-[#0f3445] to-[#071720] p-8 shadow-[0_25px_45px_rgba(0,0,0,0.45)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[#7eb3b0] mb-2">Commissions</p>
            <h1 className="text-3xl font-semibold text-white">Commission Tracking</h1>
            <p className="text-[#9fc3c1] mt-2">View and manage commission payments and records.</p>
          </div>

          <div className="mt-6 rounded-[24px] border border-[#1f4e5a]/40 bg-[#071720]/60 p-6">
            {commissionsError ? (
              <div className="mb-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {commissionsError}
              </div>
            ) : null}

            {commissionsLoading ? (
              <div className="text-white">Loading commissions...</div>
            ) : commissions.length === 0 ? (
              <div className="text-[#9fc3c1]">No commissions found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-[#9fc3c1]">
                    <tr className="border-b border-[#1f4e5a]/40">
                      <th className="py-3 pr-4 font-medium">Created</th>
                      <th className="py-3 pr-4 font-medium">Amount</th>
                      <th className="py-3 pr-4 font-medium">Type</th>
                      <th className="py-3 pr-4 font-medium">Status</th>
                      <th className="py-3 pr-4 font-medium">Level</th>
                      <th className="py-3 pr-4 font-medium">User</th>
                      <th className="py-3 pr-4 font-medium">Referral</th>
                      <th className="py-3 pr-4 font-medium">Top-up</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {commissions.map((c) => (
                      <tr key={c.id} className="border-b border-[#1f4e5a]/20">
                        <td className="py-3 pr-4 whitespace-nowrap">{new Date(c.created_at).toLocaleString()}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">{formatCurrency(c.amount)}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">{c.commission_type}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">{c.status}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">{c.level}</td>
                        <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">{c.user_id}</td>
                        <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">{c.referral_id}</td>
                        <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">{c.top_up_request_id ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
