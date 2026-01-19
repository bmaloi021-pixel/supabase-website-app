'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/client';

export default function AdminWithdrawPage() {
  const router = useRouter();
  const supabase = useMemo(() => createAdminClient(), []);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawalAmountInput, setWithdrawalAmountInput] = useState('');
  const [withdrawalNote, setWithdrawalNote] = useState('');
  const [withdrawalFormError, setWithdrawalFormError] = useState<string | null>(null);
  const [withdrawalFormSuccess, setWithdrawalFormSuccess] = useState<string | null>(null);
  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Calculate withdrawable balance (balance + commission earnings)
  const withdrawableBalance = useMemo(() => {
    const balance = profile?.balance || 0;
    // This would need to include commission earnings in a real implementation
    return balance;
  }, [profile]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!profileData || profileData.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      setProfile(profileData);
      setLoading(false);
    };

    checkAuth();
  }, [supabase, router]);

  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawalFormError(null);
    setWithdrawalFormSuccess(null);

    const normalizedAmount = parseFloat(withdrawalAmountInput.replace(/,/g, '').trim());
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      setWithdrawalFormError('Enter a valid amount to withdraw.');
      return;
    }
    if (normalizedAmount > withdrawableBalance) {
      setWithdrawalFormError(`You only have ${formatCurrency(withdrawableBalance)} available.`);
      return;
    }

    setIsSubmittingWithdrawal(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error('You must be signed in to withdraw.');
      }

      const response = await fetch('/api/withdrawal-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: normalizedAmount,
          payment_method_info: withdrawalNote ? { note: withdrawalNote } : null,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to submit withdrawal request.');
      }

      setWithdrawalFormSuccess('Withdrawal request submitted. Our team will process it shortly.');
      setWithdrawalAmountInput('');
      setWithdrawalNote('');
    } catch (err) {
      setWithdrawalFormError((err as any)?.message ?? 'Failed to submit withdrawal request.');
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#050f15] via-[#071922] to-[#041017] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#050f15] via-[#071922] to-[#041017] text-slate-100">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 text-[#8fbab9] hover:text-white transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </button>
        </div>

        <div className="max-w-3xl mx-auto">
          <div className="rounded-[32px] border border-[#1f4e5a]/60 bg-gradient-to-br from-[#0c2735] via-[#0f3445] to-[#071720] p-8 shadow-[0_25px_45px_rgba(0,0,0,0.45)]">
            <div className="mb-8">
              <h1 className="text-3xl font-semibold text-white">Withdraw Balance</h1>
              <p className="text-[#9fc3c1] mt-2">Balance accumulates from matured packages and paid commissions.</p>
            </div>

            <form onSubmit={handleWithdrawalSubmit} className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#1c3f4c] bg-[#0b1e27] p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-[#7eb3b0]">Available Balance</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(withdrawableBalance)}</p>
                </div>
                <div className="rounded-2xl border border-[#1c3f4c] bg-[#0b1e27] p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-[#7eb3b0]">Processing Time</p>
                  <p className="mt-2 text-lg font-semibold text-[#d4b673]">1-3 business days</p>
                </div>
              </div>

              {withdrawalFormError && (
                <div className="rounded-2xl border border-red-500/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">
                  {withdrawalFormError}
                </div>
              )}

              {withdrawalFormSuccess && (
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {withdrawalFormSuccess}
                </div>
              )}

              <div className="rounded-2xl border border-[#1c3f4c] bg-[#0b1e27] p-6">
                <label htmlFor="amount" className="block text-sm font-semibold text-white mb-3">
                  Withdrawal Amount (PHP)
                </label>
                <input
                  id="amount"
                  type="text"
                  value={withdrawalAmountInput}
                  onChange={(e) => setWithdrawalAmountInput(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full rounded-xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-white placeholder:text-white/40 focus:border-[#0f5d63] focus:outline-none focus:ring-2 focus:ring-[#0f5d63]"
                  required
                />
              </div>

              <div className="rounded-2xl border border-[#1c3f4c] bg-[#0b1e27] p-6">
                <label htmlFor="note" className="block text-sm font-semibold text-white mb-3">
                  Note (Optional)
                </label>
                <textarea
                  id="note"
                  value={withdrawalNote}
                  onChange={(e) => setWithdrawalNote(e.target.value)}
                  placeholder="Add any notes for your withdrawal request"
                  rows={3}
                  className="w-full rounded-xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-white placeholder:text-white/40 focus:border-[#0f5d63] focus:outline-none focus:ring-2 focus:ring-[#0f5d63]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={isSubmittingWithdrawal || withdrawableBalance <= 0}
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#d7b668] to-[#c59d4c] px-6 py-3 text-sm font-semibold text-[#1c2322] shadow-[0_15px_30px_rgba(0,0,0,0.35)] transition disabled:opacity-40"
                >
                  {isSubmittingWithdrawal ? 'Submitting…' : 'Submit Withdrawal'}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  className="rounded-2xl border border-[#1c3f4c] px-6 py-3 text-sm font-semibold text-[#8fbab9] hover:border-[#25626f]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/admin/account-withdrawals')}
                  className="ml-auto text-sm font-semibold text-[#d4b673] underline decoration-dotted decoration-[#d4b673]/70 underline-offset-4"
                >
                  View withdrawal timeline →
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
