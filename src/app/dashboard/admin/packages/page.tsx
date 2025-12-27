'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Package = {
  id: string;
  name: string;
  description: string;
  price: number;
  commission_rate: number;
  level: number;
  max_referrals: number | null;
  maturity_days: number;
  is_active: boolean;
};

type UserPackage = {
  id: string;
  user_id: string;
  package_id: string;
  purchased_at: string;
  withdrawn_at: string | null;
  packages?: Package;
};

export default function AdminPackagesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<Package[]>([]);
  const [activeUserPackages, setActiveUserPackages] = useState<UserPackage[]>([]);
  const [packageActionLoadingId, setPackageActionLoadingId] = useState<string | null>(null);
  const [packagePurchaseError, setPackagePurchaseError] = useState<string | null>(null);
  const [packageAdminError, setPackageAdminError] = useState<string | null>(null);
  const [packageAdminLoading, setPackageAdminLoading] = useState(false);
  const [isAddPackageOpen, setIsAddPackageOpen] = useState(false);
  const [newPackage, setNewPackage] = useState({
    name: '',
    description: '',
    price: '',
    commission_rate: '',
    level: '',
    max_referrals: '',
    maturity_days: '0',
  });

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(amount);
  }, []);

  const getMaturityLabel = (userPackage: UserPackage | null): string | null => {
    if (!userPackage?.packages?.maturity_days || userPackage.packages.maturity_days === 0) return null;
    
    const purchaseDate = new Date(userPackage.purchased_at);
    const maturityDate = new Date(purchaseDate.getTime() + userPackage.packages.maturity_days * 24 * 60 * 60 * 1000);
    
    return maturityDate.toLocaleDateString();
  };

  const renderMaturityProgressBar = (userPackage: UserPackage | null) => {
    if (!userPackage?.packages?.maturity_days || userPackage.packages.maturity_days === 0) return null;

    const purchaseDate = new Date(userPackage.purchased_at);
    const maturityDate = new Date(purchaseDate.getTime() + userPackage.packages.maturity_days * 24 * 60 * 60 * 1000);
    const now = new Date();
    
    const totalDuration = maturityDate.getTime() - purchaseDate.getTime();
    const elapsed = now.getTime() - purchaseDate.getTime();
    const pct = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

    return (
      <div className="mt-2 h-3 w-full rounded-full bg-[#07131a] ring-1 ring-[#1c3f4c] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] shadow-[0_0_10px_rgba(20,160,150,0.45)] transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  };

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

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) return;

      try {
        // Fetch packages
        const { data: packagesData, error: packagesError } = await supabase
          .from('packages')
          .select('*')
          .order('created_at', { ascending: true });

        if (packagesError) throw packagesError;
        setPackages(packagesData || []);

        // Fetch user packages
        const { data: userPackagesData, error: userPackagesError } = await supabase
          .from('user_packages')
          .select(`
            *,
            packages (*)
          `)
          .eq('user_id', user.id)
          .is('withdrawn_at', null);

        if (userPackagesError) throw userPackagesError;
        setActiveUserPackages(userPackagesData || []);
      } catch (error) {
        console.error('Error fetching data:', error);
        setPackagePurchaseError('Failed to load packages');
      }
    };

    if (!loading && user) {
      fetchData();
    }
  }, [loading, user, supabase]);

  const handleActivatePackage = async (pkg: Package) => {
    setPackageActionLoadingId(pkg.id);
    setPackagePurchaseError(null);

    try {
      if (profile?.role === 'admin') {
        // Admin activating package
        const { error } = await supabase
          .from('packages')
          .update({ is_active: true })
          .eq('id', pkg.id);

        if (error) throw error;
        
        setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, is_active: true } : p));
      } else {
        // User purchasing package
        const { error } = await supabase
          .from('user_packages')
          .insert({
            user_id: user.id,
            package_id: pkg.id,
            purchased_at: new Date().toISOString(),
          });

        if (error) throw error;
        
        // Refresh data
        window.location.reload();
      }
    } catch (error) {
      setPackagePurchaseError((error as any)?.message || 'Failed to activate package');
    } finally {
      setPackageActionLoadingId(null);
    }
  };

  const handleDeactivatePackage = async (pkg: Package) => {
    setPackageActionLoadingId(pkg.id);
    setPackagePurchaseError(null);

    try {
      if (profile?.role === 'admin') {
        // Admin deactivating package
        const { error } = await supabase
          .from('packages')
          .update({ is_active: false })
          .eq('id', pkg.id);

        if (error) throw error;
        
        setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, is_active: false } : p));
      }
    } catch (error) {
      setPackagePurchaseError((error as any)?.message || 'Failed to deactivate package');
    } finally {
      setPackageActionLoadingId(null);
    }
  };

  const handleDeletePackage = async (pkg: Package) => {
    if (!window.confirm(`Are you sure you want to delete the ${pkg.name} package? This action cannot be undone.`)) {
      return;
    }

    setPackageAdminLoading(true);
    setPackageAdminError(null);

    try {
      const { error } = await supabase
        .from('packages')
        .delete()
        .eq('id', pkg.id);

      if (error) throw error;
      
      setPackages(prev => prev.filter(p => p.id !== pkg.id));
    } catch (error) {
      setPackageAdminError((error as any)?.message || 'Failed to delete package');
    } finally {
      setPackageAdminLoading(false);
    }
  };

  const handleCreatePackage = async () => {
    setPackageAdminLoading(true);
    setPackageAdminError(null);

    try {
      const packageData = {
        name: newPackage.name.trim(),
        description: newPackage.description.trim(),
        price: parseFloat(newPackage.price),
        commission_rate: parseFloat(newPackage.commission_rate),
        level: parseInt(newPackage.level),
        max_referrals: newPackage.max_referrals ? parseInt(newPackage.max_referrals) : null,
        maturity_days: parseInt(newPackage.maturity_days),
        is_active: true,
      };

      const { error } = await supabase
        .from('packages')
        .insert(packageData);

      if (error) throw error;

      setNewPackage({
        name: '',
        description: '',
        price: '',
        commission_rate: '',
        level: '',
        max_referrals: '',
        maturity_days: '0',
      });
      setIsAddPackageOpen(false);
      
      // Refresh packages
      window.location.reload();
    } catch (error) {
      setPackageAdminError((error as any)?.message || 'Failed to create package');
    } finally {
      setPackageAdminLoading(false);
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

        <div className="max-w-7xl mx-auto">
          <div className="rounded-[32px] border border-[#4c3a1a]/60 bg-gradient-to-br from-[#1a1205] via-[#221707] to-[#080402] p-8 shadow-[0_25px_45px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between mb-8">
              <div>
                <h1 className="text-3xl font-semibold text-white">Investment Packages</h1>
                <p className="text-white/70 mt-2">Create, activate, and monitor membership packages.</p>
              </div>
              {profile?.role === 'admin' && (
                <button
                  onClick={() => {
                    setPackageAdminError(null);
                    setIsAddPackageOpen(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#f3cc84]/70 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-[#f3cc84] transition hover:bg-[#2a1f0d]"
                >
                  Add Package
                </button>
              )}
            </div>

            <div className="space-y-6">
              {packageAdminError ? (
                <div className="rounded-2xl border border-red-500/50 bg-red-900/30 px-4 py-3 text-sm text-red-100">
                  {packageAdminError}
                </div>
              ) : null}
              {packagePurchaseError ? (
                <div className="rounded-2xl border border-red-500/50 bg-red-900/30 px-4 py-3 text-sm text-red-100">
                  {packagePurchaseError}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                {packages.map((pkg) => {
                  const activeRowsForPkg = activeUserPackages.filter((up) => up?.packages?.id === pkg.id || up?.package_id === pkg.id);
                  const isActive = activeRowsForPkg.length > 0;
                  const activeRowForDisplay = activeRowsForPkg[0] ?? null;
                  const isBusy = packageActionLoadingId === pkg.id;

                  return (
                    <div
                      key={pkg.id}
                      className={`rounded-[28px] border border-[#4c3a1a]/50 bg-gradient-to-br from-[#1a1205] via-[#241808] to-[#110903] p-6 text-white shadow-[0_25px_45px_rgba(0,0,0,0.45)] ${
                        isActive ? 'ring-2 ring-[#f3cc84]/70' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.35em] text-[#f3cc84]/80">Package</p>
                          <h3 className="text-xl font-semibold text-white">{pkg.name}</h3>
                          <p className="text-sm text-white/70 mt-1">{pkg.description}</p>
                        </div>
                        {isActive ? (
                          <span className="rounded-full bg-[#1f3d3b] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#7dd6d0]">
                            Active
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-4 text-3xl font-semibold text-white">{formatCurrency(pkg.price)}</p>
                      <p className="text-sm text-[#f3cc84] mt-1">{pkg.commission_rate}% commission</p>
                      {isActive && activeRowsForPkg.length > 1 ? (
                        <p className="text-xs text-[#f3cc84]/80 mt-2">Active: {activeRowsForPkg.length}</p>
                      ) : null}
                      {isActive && getMaturityLabel(activeRowForDisplay) ? (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs uppercase tracking-[0.2em] text-white/60">Matures: {getMaturityLabel(activeRowForDisplay)}</p>
                          {renderMaturityProgressBar(activeRowForDisplay)}
                        </div>
                      ) : null}
                      {isActive && activeRowForDisplay?.withdrawn_at ? (
                        <p className="text-xs text-[#9fe8c2] mt-2">
                          Withdrawn: {new Date(activeRowForDisplay.withdrawn_at).toLocaleString()}
                        </p>
                      ) : null}
                      <p className="text-sm text-white/60 mt-2">Max referrals: {pkg.max_referrals || 'Unlimited'}</p>

                      <div className={`mt-5 ${profile?.role === 'admin' ? 'grid grid-cols-2 gap-3' : ''}`}>
                        <button
                          onClick={() => (isActive ? handleDeactivatePackage(pkg) : handleActivatePackage(pkg))}
                          disabled={isBusy}
                          className={`w-full rounded-2xl px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] transition ${
                            isActive
                              ? 'border border-[#f3cc84]/40 bg-transparent text-[#f3cc84] hover:bg-[#35230c]'
                              : 'bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] text-[#0a1217] shadow-[0_15px_30px_rgba(0,0,0,0.4)]'
                          } disabled:opacity-50`}
                        >
                          {isBusy ? 'Working…' : isActive ? 'Deactivate' : profile?.role === 'admin' ? 'Activate' : 'Buy Package'}
                        </button>

                        {profile?.role === 'admin' ? (
                          <button
                            onClick={() => handleDeletePackage(pkg)}
                            disabled={packageAdminLoading}
                            className="w-full rounded-2xl border border-red-400/60 bg-transparent px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-red-200 transition hover:bg-red-900/40 disabled:opacity-50"
                          >
                            {packageAdminLoading ? 'Working…' : 'Delete'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Add Package Modal */}
        {isAddPackageOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/60 backdrop-blur" onClick={() => setIsAddPackageOpen(false)} />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-xl rounded-[28px] border border-[#4c3a1a]/60 bg-gradient-to-br from-[#120b03] via-[#1f1407] to-[#090402] text-white shadow-[0_35px_65px_rgba(0,0,0,0.65)]">
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-[#f3cc84]/80">Admin</p>
                    <h3 className="text-lg font-semibold text-white">Add Package</h3>
                  </div>
                  <button
                    onClick={() => setIsAddPackageOpen(false)}
                    className="rounded-full border border-white/20 p-2 text-white/70 hover:text-white hover:border-white/40"
                  >
                    ×
                  </button>
                </div>
                <div className="px-6 py-5 space-y-3">
                  {packageAdminError && (
                    <div className="rounded-2xl border border-red-500/50 bg-red-900/30 px-4 py-3 text-sm text-red-100">
                      {packageAdminError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3">
                    <input
                      className="rounded-2xl border border-white/10 bg-[#140d06] px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#f3cc84] focus:outline-none"
                      placeholder="Name"
                      value={newPackage.name}
                      onChange={(e) => setNewPackage((p) => ({ ...p, name: e.target.value }))}
                    />
                    <input
                      className="rounded-2xl border border-white/10 bg-[#140d06] px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#f3cc84] focus:outline-none"
                      placeholder="Description"
                      value={newPackage.description}
                      onChange={(e) => setNewPackage((p) => ({ ...p, description: e.target.value }))}
                    />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <input
                        className="rounded-2xl border border-white/10 bg-[#140d06] px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#f3cc84] focus:outline-none"
                        placeholder="Price"
                        value={newPackage.price}
                        onChange={(e) => setNewPackage((p) => ({ ...p, price: e.target.value }))}
                      />
                      <input
                        className="rounded-2xl border border-white/10 bg-[#140d06] px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#f3cc84] focus:outline-none"
                        placeholder="Commission rate (%)"
                        value={newPackage.commission_rate}
                        onChange={(e) => setNewPackage((p) => ({ ...p, commission_rate: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <input
                        className="rounded-2xl border border-white/10 bg-[#140d06] px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#f3cc84] focus:outline-none"
                        placeholder="Level"
                        value={newPackage.level}
                        onChange={(e) => setNewPackage((p) => ({ ...p, level: e.target.value }))}
                      />
                      <input
                        className="rounded-2xl border border-white/10 bg-[#140d06] px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#f3cc84] focus:outline-none"
                        placeholder="Max referrals (optional)"
                        value={newPackage.max_referrals}
                        onChange={(e) => setNewPackage((p) => ({ ...p, max_referrals: e.target.value }))}
                      />
                      <input
                        className="rounded-2xl border border-white/10 bg-[#140d06] px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#f3cc84] focus:outline-none sm:col-span-2"
                        placeholder="Maturity days (0 = instant)"
                        value={newPackage.maturity_days}
                        onChange={(e) => setNewPackage((p) => ({ ...p, maturity_days: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
                  <button
                    onClick={() => setIsAddPackageOpen(false)}
                    className="inline-flex items-center rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 hover:text-white"
                    disabled={packageAdminLoading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreatePackage}
                    className="inline-flex items-center rounded-full bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#0a1217] shadow-[0_15px_30px_rgba(0,0,0,0.45)] disabled:opacity-50"
                    disabled={packageAdminLoading}
                  >
                    {packageAdminLoading ? 'Saving…' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
