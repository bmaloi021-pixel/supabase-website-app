'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Profile {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  role?: 'admin' | 'user' | 'merchant' | 'accounting';
  referral_code?: string;
  balance?: number;
  updated_at?: string;
}

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

interface Package {
  id: string;
  name: string;
  description: string;
  price: number;
  commission_rate: number;
  level: number;
  max_referrals: number | null;
  maturity_days: number;
  maturity_minutes?: number;
}

type UserPackageRow = {
  id: string;
  user_id: string;
  package_id: string;
  status: string;
  activated_at: string | null;
  matures_at: string | null;
  withdrawn_at: string | null;
  created_at?: string;
  updated_at?: string;
  packages: Package;
};

interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  package_id: string;
  status: string;
  commission_earned: number;
  created_at: string;
  referred: Profile;
}

interface Commission {
  id: string;
  amount: number;
  commission_type: string;
  level: number;
  status: string;
  created_at: string;
}

type PublicPaymentMethod = {
  id: string;
  type: string;
  label: string | null;
  provider: string | null;
  account_name: string | null;
  account_number_last4: string | null;
  phone: string | null;
  qr_code_path: string | null;
};

const logError = (errorName: string, error: any) => {
  console.error(`[${errorName}]`, error);
};

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [topUpRequests, setTopUpRequests] = useState<Array<{
    id: string;
    amount: number;
    status: string;
    created_at: string;
  }>>([]);
  const [userPackageRow, setUserPackageRow] = useState<UserPackageRow | null>(null);
  const [activeUserPackages, setActiveUserPackages] = useState<UserPackageRow[]>([]);
  const [availedUserPackages, setAvailedUserPackages] = useState<UserPackageRow[]>([]);
  const [withdrawCandidateRow, setWithdrawCandidateRow] = useState<UserPackageRow | null>(null);
  const [packageActionLoadingId, setPackageActionLoadingId] = useState<string | null>(null);
  const [packageWithdrawLoading, setPackageWithdrawLoading] = useState(false);
  const [packageWithdrawError, setPackageWithdrawError] = useState<string | null>(null);
  const [withdrawingUserPackageId, setWithdrawingUserPackageId] = useState<string | null>(null);
  const [withdrawErrorByUserPackageId, setWithdrawErrorByUserPackageId] = useState<Record<string, string>>({});
  const [packagePurchaseError, setPackagePurchaseError] = useState<string | null>(null);
  const [isAddPackageOpen, setIsAddPackageOpen] = useState(false);
  const [packageAdminLoading, setPackageAdminLoading] = useState(false);
  const [packageAdminError, setPackageAdminError] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [showTopUpForm, setShowTopUpForm] = useState(false);
  const [publicPaymentMethods, setPublicPaymentMethods] = useState<PublicPaymentMethod[]>([]);
  const [publicPaymentQrUrls, setPublicPaymentQrUrls] = useState<Record<string, string>>({});
  const [selectedPublicPaymentMethodId, setSelectedPublicPaymentMethodId] = useState<string | null>(null);
  const [newPackage, setNewPackage] = useState({
    name: '',
    description: '',
    price: '',
    commission_rate: '',
    level: '',
    max_referrals: '',
    maturity_days: '',
  });
  const [usersList, setUsersList] = useState<UserRow[]>([]);
  const [usersListError, setUsersListError] = useState<string | null>(null);
  const [usersListLoading, setUsersListLoading] = useState(false);
  const [userRoleSavingId, setUserRoleSavingId] = useState<string | null>(null);
  const [usersRoleFilter, setUsersRoleFilter] = useState<'all' | Role>('all');
  const [impersonateLoadingId, setImpersonateLoadingId] = useState<string | null>(null);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);
  const [hasAdminBackup, setHasAdminBackup] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const buyPackageInFlightRef = useRef(false);
  const lastRealtimeUserRefreshAtRef = useRef(0);
  const lastRealtimeUsersListRefreshAtRef = useRef(0);
  const realtimeUserRefreshInFlightRef = useRef(false);

  useEffect(() => {
    try {
      setHasAdminBackup(!!localStorage.getItem('admin_session_backup'));
      setIsImpersonating(localStorage.getItem('is_impersonating') === '1');
    } catch {
      setHasAdminBackup(false);
      setIsImpersonating(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const formatCurrency = (value: any) => {
    const n = Number(value);
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
  };

  const getMaturityDate = (up?: Partial<UserPackageRow> | null) => {
    if (!up) return null;
    const mm = Number((up as any)?.packages?.maturity_minutes ?? 0);
    const md = Number((up as any)?.packages?.maturity_days ?? 0);
    const baseRaw = (up as any)?.activated_at ?? (up as any)?.created_at ?? (up as any)?.updated_at;

    const base = baseRaw ? new Date(baseRaw as any) : null;
    const baseOk = base != null && !Number.isNaN(base.getTime());

    if ((up as any)?.matures_at) {
      const d = new Date((up as any).matures_at as any);
      if (Number.isNaN(d.getTime())) return null;

      if (baseOk) {
        const diffMs = Math.abs(d.getTime() - base!.getTime());
        const mins = Number.isFinite(mm) ? mm : 0;
        const days = Number.isFinite(md) ? md : 0;

        if (diffMs < 60 * 1000 && (mins > 0 || days > 0)) {
          const next = new Date(base!.getTime());
          if (mins > 0) {
            next.setTime(next.getTime() + mins * 60 * 1000);
          } else {
            next.setUTCDate(next.getUTCDate() + days);
          }
          return next;
        }
      }

      return d;
    }

    if (!baseOk) return null;

    const next = new Date(base!.getTime());
    const mins = Number.isFinite(mm) ? mm : 0;
    if (mins > 0) {
      next.setTime(next.getTime() + mins * 60 * 1000);
      return next;
    }

    const days = Number.isFinite(md) ? md : 0;
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  };

  const getMaturityLabel = (up?: Partial<UserPackageRow> | null) => {
    if (!up) return null;
    const mm = Number((up as any)?.packages?.maturity_minutes ?? 0);
    const md = Number((up as any)?.packages?.maturity_days ?? 0);

    const d = getMaturityDate(up);
    if (!d) return null;

    const mins = Number.isFinite(mm) ? mm : 0;
    const days = Number.isFinite(md) ? md : 0;
    if (mins <= 0 && days <= 0) return 'Instant';

    const diffMs = d.getTime() - nowMs;
    if (!Number.isFinite(diffMs)) return null;
    if (diffMs <= 0) return 'Matured';

    const totalSeconds = Math.max(0, Math.ceil(diffMs / 1000));
    const dd = Math.floor(totalSeconds / 86400);
    const hh = Math.floor((totalSeconds % 86400) / 3600);
    const min = Math.floor((totalSeconds % 3600) / 60);
    const ss = totalSeconds % 60;
    const pad2 = (n: number) => String(n).padStart(2, '0');

    const time = `${pad2(hh)}:${pad2(min)}:${pad2(ss)}`;
    return dd > 0 ? `${dd}d ${time}` : time;
  };

  const isWithdrawable = (up?: Partial<UserPackageRow> | null) => {
    if (!up) return false;
    if ((up as any)?.status !== 'active') return false;
    if ((up as any)?.withdrawn_at) return false;
    const d = getMaturityDate(up);
    if (!d) return false;
    return d.getTime() <= nowMs;
  };

  const getMaturityProgress = (up?: Partial<UserPackageRow> | null) => {
    if (!up) return null;

    const mm = Number((up as any)?.packages?.maturity_minutes ?? 0);
    const md = Number((up as any)?.packages?.maturity_days ?? 0);
    const mins = Number.isFinite(mm) ? mm : 0;
    const days = Number.isFinite(md) ? md : 0;
    if (mins <= 0 && days <= 0) return null;

    const end = getMaturityDate(up);
    if (!end) return null;

    const baseRaw = (up as any)?.activated_at ?? (up as any)?.created_at ?? (up as any)?.updated_at;
    const base = baseRaw ? new Date(baseRaw as any) : null;
    let startMs = base && !Number.isNaN(base.getTime()) ? base.getTime() : NaN;

    if (!Number.isFinite(startMs)) {
      const endMs = end.getTime();
      if (Number.isFinite(endMs)) {
        startMs = endMs - (mins > 0 ? mins * 60 * 1000 : days * 24 * 60 * 60 * 1000);
      }
    }

    const endMs = end.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    const total = Math.max(1, endMs - startMs);
    const elapsed = Math.min(total, Math.max(0, nowMs - startMs));
    return elapsed / total;
  };

  const renderMaturityProgressBar = (up?: Partial<UserPackageRow> | null) => {
    const p = getMaturityProgress(up);
    if (p == null) return null;
    const pct = Math.max(0, Math.min(100, Math.round(p * 100)));
    return (
      <div className="mt-2">
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <span>Maturity</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1 h-3 w-full rounded-full bg-gray-200 ring-1 ring-gray-300/80 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-600 shadow-sm transition-[width] duration-700 ease-out animate-pulse"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  const refreshPackages = async () => {
    const { data: packageData, error: packageError } = await supabase
      .from('packages')
      .select('*')
      .order('level', { ascending: true });

    if (packageError) {
      logError('PackageError', packageError);
    } else if (packageData) {
      const byId = new Map<string, Package>();
      for (const p of packageData as Package[]) {
        if (!p?.id) continue;
        if (!byId.has(p.id)) byId.set(p.id, p);
      }

      const byLevelName = new Map<string, Package>();
      for (const p of Array.from(byId.values())) {
        const key = `${p.level}::${p.name}`;
        if (!byLevelName.has(key)) byLevelName.set(key, p);
      }

      setPackages(Array.from(byLevelName.values()));
    }
  };

  const fetchPublicPaymentMethods = async () => {
    try {
      const { data, error, status, statusText } = await supabase
        .from('payment_methods')
        .select('id,type,label,provider,account_name,account_number_last4,phone,qr_code_path')
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) {
        logError('PublicPaymentMethodsError', error);
        setPublicPaymentMethods([]);
        setPublicPaymentQrUrls({});
        return;
      }

      const rows = (data ?? []) as any[];
      setPublicPaymentMethods(rows as any);

      const nextUrls: Record<string, string> = {};
      await Promise.all(
        rows
          .filter((m) => !!m?.qr_code_path)
          .map(async (m) => {
            const { data: signed, error: signedError } = await supabase.storage
              .from('payment-method-qr-codes')
              .createSignedUrl(m.qr_code_path, 60 * 60);

            if (!signedError && signed?.signedUrl) {
              nextUrls[m.id] = signed.signedUrl;
            }
          })
      );

      setPublicPaymentQrUrls(nextUrls);

      if (rows.length > 0 && !selectedPublicPaymentMethodId) {
        setSelectedPublicPaymentMethodId(rows[0].id);
      }
    } catch (e) {
      logError('PublicPaymentMethodsUnexpectedError', e);
      setPublicPaymentMethods([]);
      setPublicPaymentQrUrls({});
    }
  };

  useEffect(() => {
    if (showTopUpForm && user?.id) {
      fetchPublicPaymentMethods();
    }
    if (!showTopUpForm) {
      setSelectedPublicPaymentMethodId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTopUpForm, user?.id]);

  const backupAdminSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) return;

    try {
      localStorage.setItem('admin_session_backup', JSON.stringify(session));
      localStorage.setItem('admin_user_id_backup', session.user.id);
      setHasAdminBackup(true);
    } catch {
      // ignore
    }
  };

  const handleImpersonate = async (targetUserId: string) => {
    if (!isAdmin) return;
    setImpersonateError(null);
    setImpersonateLoadingId(targetUserId);
    try {
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

      const accessToken = (json as any)?.access_token;
      const refreshToken = (json as any)?.refresh_token;
      if (!accessToken || !refreshToken) {
        throw new Error('No impersonation session returned');
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        throw error;
      }

      try {
        localStorage.setItem('is_impersonating', '1');
      } catch {
        // ignore localStorage issues
      }
      setIsImpersonating(true);

      window.location.href = '/dashboard';
    } catch (err) {
      setImpersonateError((err as any)?.message ?? 'Failed to impersonate user');
      try {
        localStorage.removeItem('is_impersonating');
      } catch {
        // ignore
      }
    } finally {
      setImpersonateLoadingId(null);
    }
  };

  const handleReturnToAdmin = async () => {
    setImpersonateError(null);
    try {
      const raw = localStorage.getItem('admin_session_backup');
      if (!raw) return;
      const session = JSON.parse(raw);
      if (!session?.access_token || !session?.refresh_token) {
        localStorage.removeItem('admin_session_backup');
        localStorage.removeItem('admin_user_id_backup');
        localStorage.removeItem('is_impersonating');
        setHasAdminBackup(false);
        setIsImpersonating(false);
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (error) {
        setImpersonateError(error.message);
        return;
      }

      localStorage.removeItem('admin_session_backup');
      localStorage.removeItem('admin_user_id_backup');
      localStorage.removeItem('is_impersonating');
      setHasAdminBackup(false);
      setIsImpersonating(false);

      // Hard navigation ensures all auth state and cookies are reloaded cleanly
      window.location.href = '/dashboard';
    } catch (e) {
      setImpersonateError((e as any)?.message ?? 'Failed to restore admin session');
    }
  };

  const handleDeletePackage = async (pkg: Package) => {
    if (!profile?.role || profile.role !== 'admin') return;
    const ok = window.confirm(`Delete package "${pkg.name}"? This cannot be undone.`);
    if (!ok) return;

    setPackageAdminLoading(true);
    setPackageAdminError(null);
    try {
      const { error } = await supabase.from('packages').delete().eq('id', pkg.id);
      if (error) {
        setPackageAdminError(error.message);
        return;
      }
      await refreshPackages();
    } finally {
      setPackageAdminLoading(false);
    }
  };

  const handleCreatePackage = async () => {
    if (!profile?.role || profile.role !== 'admin') return;

    const parsedPayload = {
      name: newPackage.name.trim(),
      description: newPackage.description.trim() || null,
      price: Number(newPackage.price) || 0,
      commission_rate: Number(newPackage.commission_rate) || 0,
      level: Number(newPackage.level) || 0,
      max_referrals: newPackage.max_referrals ? Number(newPackage.max_referrals) : null,
      maturity_days: Number(newPackage.maturity_days) || 0,
    };

    if (!parsedPayload.name || parsedPayload.price <= 0) {
      setPackageAdminError('Please provide a package name and valid price.');
      return;
    }

    setPackageAdminLoading(true);
    setPackageAdminError(null);
    try {
      const { error } = await supabase.from('packages').insert(parsedPayload);
      if (error) {
        setPackageAdminError(error.message);
        return;
      }
      setNewPackage({
        name: '',
        description: '',
        price: '',
        commission_rate: '',
        level: '',
        max_referrals: '',
        maturity_days: '',
      });
      setIsAddPackageOpen(false);
      await refreshPackages();
    } catch (err) {
      setPackageAdminError((err as any)?.message ?? 'Failed to create package');
    } finally {
      setPackageAdminLoading(false);
    }
  };

  const fetchTopUpRequests = async (userId?: string) => {
    if (!userId) {
      logError('FetchTopUpRequestsError', 'No user ID provided');
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('top_up_requests')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        logError('FetchTopUpRequestsError', error);
        return [];
      }
      
      return data || [];
    } catch (err) {
      logError('FetchTopUpRequestsUnexpectedError', err);
      return [];
    }
  };

  const fetchUserData = async (userId: string, isMounted?: boolean) => {
    try {
      // 1. Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      // If profile doesn't exist, create it
      if ((profileError && profileError.code === 'PGRST116') || (!profileData && profileError)) {
        try {
          const newProfileData = {
            id: userId,
            username: `user_${Date.now()}`,
            first_name: 'User',
            last_name: 'Name',
            updated_at: new Date().toISOString(),
          };
          
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .upsert(newProfileData, { onConflict: 'id' })
            .select()
            .single();
            
          if (createError) throw createError;
            
          setProfile(newProfile);
        } catch (createError) {
          logError('CreateProfileError', createError);
          throw new Error('Failed to create user profile');
        }
      } else if (profileData) {
        setProfile(profileData);
      }

      // First, check if we have a valid user ID
      if (!userId) {
        logError('FetchUserDataError', 'No user ID available to fetch data');
        return;
      }

      // Fetch data in parallel for better performance
      const [
        { data: referralData, error: referralError },
        { data: commissionData, error: commissionError },
        { data: userPackagesData, error: userPackagesError },
        { data: availedPackagesData, error: availedPackagesError },
        { data: withdrawCandidateData, error: withdrawCandidateError },
        packagesData
      ] = await Promise.all([
        supabase
          .from('referrals')
          .select('*, referred:profiles!referrals_referred_id_fkey(*)')
          .eq('referrer_id', userId),
        supabase
          .from('commissions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_packages')
          .select(`
            *,
            packages (
              id,
              name,
              description,
              price,
              commission_rate,
              level,
              max_referrals,
              maturity_days,
              maturity_minutes
            )
          `)
          .eq('user_id', userId)
          .eq('status', 'active')
          .is('withdrawn_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_packages')
          .select(`
            *,
            packages (
              id,
              name,
              description,
              price,
              commission_rate,
              level,
              max_referrals,
              maturity_days,
              maturity_minutes
            )
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_packages')
          .select(`
            *,
            packages (
              id,
              name,
              description,
              price,
              commission_rate,
              level,
              max_referrals,
              maturity_days,
              maturity_minutes
            )
          `)
          .eq('user_id', userId)
          .eq('status', 'active')
          .is('withdrawn_at', null)
          .not('matures_at', 'is', null)
          .lte('matures_at', new Date().toISOString())
          .order('matures_at', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        refreshPackages()
      ]);

      // Only fetch top-up requests for merchant accounts
      if (profileData?.role === 'merchant') {
        try {
          const topUpRequestsData = await fetchTopUpRequests(userId);
          if (isMounted !== false) {
            setTopUpRequests(topUpRequestsData);
          }
        } catch (error) {
          logError('FetchTopUpRequestsError', error);
          if (isMounted !== false) {
            setTopUpRequests([]);
          }
        }
      } else {
        // Clear top-up requests for non-merchant users
        if (isMounted !== false) {
          setTopUpRequests([]);
        }
      }

      if (referralData) {
        setReferrals(referralData);
      }

      if (commissionData) {
        setCommissions(commissionData);
      }

      const activeRows = ((userPackagesData ?? []) as any[]).filter((r) => !!r?.packages);
      setActiveUserPackages(activeRows as any);
      if (activeRows.length > 0) {
        setUserPackageRow(activeRows[0] as any);
      } else {
        setUserPackageRow(null);
      }

      const availedRows = ((availedPackagesData ?? []) as any[]).filter((r) => !!r?.packages);
      setAvailedUserPackages(availedRows as any);

      if (withdrawCandidateData && (withdrawCandidateData as any).packages) {
        setWithdrawCandidateRow(withdrawCandidateData as any);
      } else {
        setWithdrawCandidateRow(null);
      }
    } catch (error) {
      logError('FetchUserDataError', error);
      throw error; // Re-throw to be caught by the caller
    }
  };

  useEffect(() => {
    // Realtime not available in @supabase/supabase-js@1.0.0
  }, [user?.id]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleActivatePackage = async (pkg: Package) => {
    if (!user?.id) return;
    if (buyPackageInFlightRef.current) return;
    setPackageActionLoadingId(pkg.id);
    setPackagePurchaseError(null);
    buyPackageInFlightRef.current = true;
    try {
      const { data, error } = await supabase.rpc('buy_package_with_balance', {
        p_package_id: pkg.id,
      });

      if (error) {
        const raw = error as any;
        logError('BuyPackageError', raw);
        setPackagePurchaseError(
          raw?.message ??
            raw?.details ??
            raw?.hint ??
            'Failed to buy package'
        );
        return;
      }

      const returnedBalanceRaw = (data as any)?.balance;
      const returnedBalanceBeforeRaw = (data as any)?.balance_before;
      
      if (returnedBalanceRaw !== undefined && returnedBalanceRaw !== null) {
        const returnedBalance = Number(returnedBalanceRaw);
        if (Number.isFinite(returnedBalance)) {
          setProfile((prev) => (prev ? ({ ...prev, balance: returnedBalance } as any) : prev));
        }
      }

      const { data: userPackagesData, error: userPackagesError } = await supabase
        .from('user_packages')
        .select(`
          *,
          packages (
            id,
            name,
            description,
            price,
            commission_rate,
            level,
            max_referrals,
            maturity_days,
            maturity_minutes
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .is('withdrawn_at', null)
        .order('created_at', { ascending: false });

      if (!userPackagesError) {
        const activeRows = ((userPackagesData ?? []) as any[]).filter((r) => !!r?.packages);
        setActiveUserPackages(activeRows as any);
        setUserPackageRow(activeRows.length > 0 ? (activeRows[0] as any) : null);
      }

      const { data: availedPackagesData } = await supabase
        .from('user_packages')
        .select(`
          *,
          packages (
            id,
            name,
            description,
            price,
            commission_rate,
            level,
            max_referrals,
            maturity_days,
            maturity_minutes
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      const availedRows = ((availedPackagesData ?? []) as any[]).filter((r) => !!r?.packages);
      setAvailedUserPackages(availedRows as any);

      const { data: withdrawCandidateData } = await supabase
        .from('user_packages')
        .select(`
          *,
          packages (
            id,
            name,
            description,
            price,
            commission_rate,
            level,
            max_referrals,
            maturity_days,
            maturity_minutes
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .is('withdrawn_at', null)
        .not('matures_at', 'is', null)
        .lte('matures_at', new Date().toISOString())
        .order('matures_at', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      setWithdrawCandidateRow((withdrawCandidateData as any)?.packages ? (withdrawCandidateData as any) : null);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (!profileError && profileData) {
        setProfile(profileData);
      }
    } finally {
      buyPackageInFlightRef.current = false;
      setPackageActionLoadingId(null);
    }
  };

  const handleDeactivatePackage = async (pkg: Package) => {
    if (!user?.id) return;
    setPackageActionLoadingId(pkg.id);
    try {
      const now = new Date().toISOString();
      const targetId = activeUserPackages.find((up) => up?.packages?.id === pkg.id || up?.package_id === pkg.id)?.id;
      if (!targetId) {
        return;
      }
      const { error } = await supabase
        .from('user_packages')
        .update({ status: 'cancelled', updated_at: now })
        .eq('id', targetId)
        .eq('user_id', user.id);

      if (error) {
        logError('DeactivatePackageError', error);
        return;
      }

      const { data: nextActives, error: nextActiveError } = await supabase
        .from('user_packages')
        .select(`
          *,
          packages (
            id,
            name,
            description,
            price,
            commission_rate,
            level,
            max_referrals,
            maturity_days,
            maturity_minutes
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .is('withdrawn_at', null)
        .order('created_at', { ascending: false });

      if (!nextActiveError) {
        const activeRows = ((nextActives ?? []) as any[]).filter((r) => !!r?.packages);
        setActiveUserPackages(activeRows as any);
        setUserPackageRow(activeRows.length > 0 ? (activeRows[0] as any) : null);
      }

      const { data: availedPackagesData } = await supabase
        .from('user_packages')
        .select(`
          *,
          packages (
            id,
            name,
            description,
            price,
            commission_rate,
            level,
            max_referrals,
            maturity_days,
            maturity_minutes
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      const availedRows = ((availedPackagesData ?? []) as any[]).filter((r) => !!r?.packages);
      setAvailedUserPackages(availedRows as any);
    } finally {
      setPackageActionLoadingId(null);
    }
  };

  const handleWithdrawPackage = async (userPackageId?: string) => {
    if (!user?.id) return;
    setPackageWithdrawError(null);
    if (userPackageId) {
      setWithdrawErrorByUserPackageId((prev) => {
        const next = { ...prev };
        delete next[userPackageId];
        return next;
      });
      setWithdrawingUserPackageId(userPackageId);
    } else {
      setWithdrawingUserPackageId(null);
    }
    setPackageWithdrawLoading(true);
    try {
      const { data, error } = userPackageId
        ? await supabase.rpc('withdraw_user_package', { p_user_package_id: userPackageId })
        : await supabase.rpc('withdraw_matured_package');
      if (error) throw error;

      // Refresh profile + active package row
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (!profileError && profileData) {
        setProfile(profileData);
      }

      const { data: activePackagesData, error: activePackagesError } = await supabase
        .from('user_packages')
        .select(`
          *,
          packages (
            id,
            name,
            description,
            price,
            commission_rate,
            level,
            max_referrals,
            maturity_days,
            maturity_minutes
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .is('withdrawn_at', null)
        .order('created_at', { ascending: false });

      if (!activePackagesError) {
        const activeRows = ((activePackagesData ?? []) as any[]).filter((r) => !!r?.packages);
        setActiveUserPackages(activeRows as any);
        setUserPackageRow(activeRows.length > 0 ? (activeRows[0] as any) : null);
      }

      const { data: userPackageData, error: userPackageError } = await supabase
        .from('user_packages')
        .select(`
          *,
          packages (
            id,
            name,
            description,
            price,
            commission_rate,
            level,
            max_referrals,
            maturity_days,
            maturity_minutes
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .is('withdrawn_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!userPackageError && userPackageData) {
        setUserPackageRow(userPackageData as any);
      }

      const { data: withdrawCandidateData } = await supabase
        .from('user_packages')
        .select(`
          *,
          packages (
            id,
            name,
            description,
            price,
            commission_rate,
            level,
            max_referrals,
            maturity_days,
            maturity_minutes
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .is('withdrawn_at', null)
        .not('matures_at', 'is', null)
        .lte('matures_at', new Date().toISOString())
        .order('matures_at', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      setWithdrawCandidateRow((withdrawCandidateData as any)?.packages ? (withdrawCandidateData as any) : null);

      const { data: availedPackagesData } = await supabase
        .from('user_packages')
        .select(`
          *,
          packages (
            id,
            name,
            description,
            price,
            commission_rate,
            level,
            max_referrals,
            maturity_days,
            maturity_minutes
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      const availedRows = ((availedPackagesData ?? []) as any[]).filter((r) => !!r?.packages);
      setAvailedUserPackages(availedRows as any);
    } catch (error) {
      const raw = error as any;
      logError('WithdrawPackageError', raw);
      const msg = raw?.message ?? 'Failed to withdraw';
      const code = raw?.code ? ` (${raw.code})` : '';
      const full = `${msg}${code}`;
      setPackageWithdrawError(full);
      if (userPackageId) {
        setWithdrawErrorByUserPackageId((prev) => ({ ...prev, [userPackageId]: full }));
      }
    } finally {
      setPackageWithdrawLoading(false);
      setWithdrawingUserPackageId(null);
    }
  };

  const isAdmin = profile?.role === 'admin';

  const reloadUsersList = useCallback(async () => {
    if (!isAdmin) return;
    if (activeTab !== 'users') return;

    setUsersListLoading(true);
    setUsersListError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/admin/users', {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error((json as any)?.error ?? 'Failed to load users');
      }
      setUsersList((((json as any)?.profiles ?? []) as UserRow[]) ?? []);
    } catch (e) {
      logError('ReloadUsersListError', e);
      setUsersListError((e as any)?.message ?? 'Failed to load users');
      setUsersList([]);
    } finally {
      setUsersListLoading(false);
    }
  }, [activeTab, isAdmin, supabase]);

  useEffect(() => {
    reloadUsersList();
  }, [reloadUsersList]);

  useEffect(() => {
    // Realtime not available in @supabase/supabase-js@1.0.0
  }, [activeTab, isAdmin, reloadUsersList, supabase]);

  const calculateTotalEarnings = () => {
    const paidCommissions = commissions
      .filter((c) => c.status === 'paid')
      .reduce((total, commission) => total + commission.amount, 0);

    const withdrawnPackages = availedUserPackages
      .filter((up) => !!up?.withdrawn_at)
      .reduce((total, up) => {
        const amt = Number((up as any)?.packages?.price ?? 0);
        return total + (Number.isFinite(amt) ? amt : 0);
      }, 0);

    return paidCommissions + withdrawnPackages;
  };

  const calculateTotalReferrals = () => {
    return referrals.length;
  };

  const navItems = [
    { key: 'overview', label: 'Overview' },
    { key: 'referrals', label: 'Referrals' },
    { key: 'commissions', label: 'Commissions' },
    { key: 'packages', label: 'Packages' },
    ...(isAdmin ? ([{ key: 'users', label: 'Users' }] as const) : []),
  ] as const;

  const selectTab = (tab: string) => {
    if (tab === 'users' && !isAdmin) return;
    setActiveTab(tab);
    setIsMenuOpen(false);
  };

  const updateUserRole = async (userId: string, role: Role, prevRole?: Role) => {
    if (!isAdmin) return;
    setUserRoleSavingId(userId);
    setUsersListError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : null),
        },
        body: JSON.stringify({ userId, role }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error((json as any)?.error ?? 'Failed to update role');
      }

      setUsersList((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      if (user?.id === userId) {
        setProfile((p) => (p ? ({ ...p, role } as any) : p));
      }
    } catch (e) {
      if (prevRole) {
        setUsersList((prev) => prev.map((u) => (u.id === userId ? { ...u, role: prevRole } : u)));
        if (user?.id === userId) {
          setProfile((p) => (p ? ({ ...p, role: prevRole } as any) : p));
        }
      }
      logError('UpdateUserRoleError', e);
      setUsersListError((e as any)?.message ?? 'Failed to update role');
    } finally {
      setUserRoleSavingId(null);
    }
  };

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topUpAmount || isNaN(Number(topUpAmount)) || Number(topUpAmount) <= 0) {
      setPaymentError('Please enter a valid amount');
      return;
    }

    setIsProcessingPayment(true);
    setPaymentError(null);

    try {
      if (!user?.id) {
        throw new Error('You must be signed in to top up');
      }

      const amount = Number(topUpAmount);

      // Create a pending top-up request (server-side/admin/merchant can approve and update balances)
      const { error, status, statusText } = await supabase
        .from('top_up_requests')
        .insert({
          user_id: user.id,
          amount,
          status: 'pending',
          status_notes: selectedPublicPaymentMethodId
            ? `payment_method_id:${selectedPublicPaymentMethodId}`
            : null,
        });

      if (error) {
        const raw = error as any;
        logError('TopUpError', raw);
        throw error;
      }

      setTopUpAmount('');
      setShowTopUpForm(false);
    
    } catch (error) {
      const raw = error as any;
      logError('TopUpError', raw);
      const msg = raw?.message ?? 'Failed to process payment. Please try again.';
      const code = raw?.code ? ` (${raw.code})` : '';
      setPaymentError(`${msg}${code}`);
    } finally {
      setIsProcessingPayment(false);
    }
  }; 

  const renderAdminPanel = () => (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Admin Panel</h2>
      
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">System Statistics</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-gray-500">Total Users</p>
              <p className="text-2xl font-semibold text-gray-900">
                {usersList.length}
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-gray-500">Active Packages</p>
              <p className="text-2xl font-semibold text-gray-900">
                {packages.length}
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-gray-500">Total Commissions</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatCurrency(commissions.reduce((sum, c) => sum + c.amount, 0))}
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-gray-900">User Management</h3>
            <button
              onClick={() => setActiveTab('users')}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              View All Users →
            </button>
          </div>
          
          {usersList.length > 0 ? (
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {usersList.slice(0, 5).map((user) => (
                  <li key={user.id}>
                    <div className="px-4 py-4 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center">
                        <div className="min-w-0 flex-1 flex items-center">
                          <div className="min-w-0 flex-1 px-4">
                            <div>
                              <p className="text-sm font-medium text-indigo-600 truncate">
                                {user.first_name} {user.last_name}
                              </p>
                              <p className="mt-1 text-sm text-gray-500 truncate">
                                @{user.username}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.role === 'admin' 
                            ? 'bg-purple-100 text-purple-800' 
                            : user.role === 'merchant' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {user.role}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No users found.</p>
          )}
        </div>
      </div>
    </div>
  );

  const renderTopUpRequests = () => {
    if (profile?.role !== 'merchant' && !isAdmin) {
      return null;
    }

    return (
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Top Up Requests</h2>
          <span className="px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full">
            {topUpRequests.length} Pending
          </span>
        </div>
        
        {topUpRequests.length > 0 ? (
          <div className="mt-4 space-y-3">
            {topUpRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div>
                  <p className="font-medium text-gray-900">{formatCurrency(request.amount)}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(request.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                  Pending
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">No pending top-up requests.</p>
        )}
      </div>
    );
  };

  const renderAccountBalanceCard = () => (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Account Balance</h2>
        <span className="text-2xl font-bold text-indigo-600">
          {formatCurrency(profile?.balance || 0)}
        </span>
      </div>
    </div>
  );

  const renderTopUpCard = () => (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Top Up</h2>
      </div>

      {!showTopUpForm ? (
        <button
          onClick={() => setShowTopUpForm(true)}
          className="mt-4 w-full sm:w-auto bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Top Up Balance
        </button>
      ) : (
        <form onSubmit={handleTopUp} className="mt-4">
          {publicPaymentMethods.length > 0 ? (
            <div className="mb-4 rounded-md border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900">Payment method</div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {publicPaymentMethods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedPublicPaymentMethodId(m.id)}
                    className={`text-left p-3 rounded-md border ${
                      selectedPublicPaymentMethodId === m.id
                        ? 'border-indigo-600 bg-indigo-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {(m.provider || (m.type === 'gcash' ? 'GCash' : m.type)) + (m.label ? ` - ${m.label}` : '')}
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          {m.type === 'gcash' ? (
                            <span>{m.phone}</span>
                          ) : (
                            <span>
                              {m.account_name}
                              {m.account_number_last4 ? ` • ****${m.account_number_last4}` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {publicPaymentQrUrls[m.id] ? (
                        <img
                          src={publicPaymentQrUrls[m.id]}
                          alt="QR"
                          className="h-16 w-16 rounded-md border border-gray-200 object-cover"
                        />
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-4 text-sm text-gray-600">
              No payment methods available yet.
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label htmlFor="amount" className="sr-only">Amount</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">₱</span>
                </div>
                <input
                  type="number"
                  name="amount"
                  id="amount"
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md"
                  placeholder="0.00"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  min="1"
                  step="0.01"
                  required
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isProcessingPayment}
                className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isProcessingPayment ? 'Processing...' : 'Submit Top Up'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTopUpForm(false);
                  setPaymentError(null);
                }}
                className="bg-white text-gray-700 py-2 px-4 rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
            </div>
          </div>
          {paymentError && (
            <p className="mt-2 text-sm text-red-600">{paymentError}</p>
          )}
        </form>
      )}
    </div>
  );

  const renderReferralLink = () => (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900">Your Referral Link</h3>
      <p className="text-sm text-gray-500 mt-1">Share this link to refer new users and earn commissions.</p>
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <input
          readOnly
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
          value={
            profile?.referral_code
              ? `${window.location.origin}/signup?ref=${profile.referral_code}`
              : 'Referral link unavailable (missing referral_code)'
          }
        />
        <button
          type="button"
          onClick={async () => {
            if (!profile?.referral_code) return;
            const link = `${window.location.origin}/signup?ref=${profile.referral_code}`;
            try {
              await navigator.clipboard.writeText(link);
            } catch (e) {
              logError('CopyReferralLinkError', e);
            }
          }}
          disabled={!profile?.referral_code}
          className="inline-flex justify-center items-center px-3 py-2 border border-indigo-600 text-sm font-medium rounded-md text-indigo-700 bg-white hover:bg-indigo-50 disabled:opacity-50"
        >
          Copy
        </button>
      </div>
    </div>
  );

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900">Total Earnings</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">
            {formatCurrency(calculateTotalEarnings())}
          </p>
          <p className="text-sm text-gray-500 mt-1">Lifetime earnings</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900">Total Referrals</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {calculateTotalReferrals()}
          </p>
          <p className="text-sm text-gray-500 mt-1">Active referrals</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Availed Packages</h3>
          <p className="text-sm text-gray-500 mt-1">All packages you have purchased (including stacked buys).</p>
        </div>
        <div className="p-6">
          {availedUserPackages.filter((up) => !up?.withdrawn_at).length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">No packages purchased yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {availedUserPackages.filter((up) => !up?.withdrawn_at).map((up) => {
                const statusClass =
                  up.status === 'active'
                    ? 'bg-green-50 text-green-700 ring-green-600/20'
                    : up.status === 'cancelled'
                    ? 'bg-gray-50 text-gray-700 ring-gray-600/20'
                    : 'bg-yellow-50 text-yellow-800 ring-yellow-600/20';

                const canWithdraw = isWithdrawable(up);
                const isThisWithdrawing = packageWithdrawLoading && withdrawingUserPackageId === up.id;
                const cardWithdrawError = withdrawErrorByUserPackageId[up.id];

                return (
                  <div
                    key={up.id}
                    className="relative overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-white via-white to-indigo-50 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-indigo-100" />
                    <div className="absolute top-4 right-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="h-4 w-4"
                        >
                          <path d="M12 2l2.9 6.6 7.1.6-5.4 4.6 1.7 7-6.3-3.8-6.3 3.8 1.7-7L2 9.2l7.1-.6L12 2z" />
                        </svg>
                        Availed
                      </span>
                    </div>

                    <div className="relative p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-500">Package</div>
                          <div className="mt-1 truncate text-lg font-semibold text-gray-900">
                            {up.packages?.name ?? up.package_id}
                          </div>
                          <div className="mt-2 text-2xl font-bold text-indigo-700">
                            {formatCurrency((up as any)?.packages?.price)}
                          </div>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${statusClass}`}> 
                          {up.status}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-gray-500">Bought</span>
                          <span className="text-gray-900">
                            {up.created_at ? new Date(up.created_at).toLocaleString() : '-'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-gray-500">Matures</span>
                          <span className="text-gray-900">
                            {getMaturityLabel(up) ?? '-'}
                          </span>
                        </div>
                        {getMaturityProgress(up) != null ? (
                          <div>
                            {renderMaturityProgressBar(up)}
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-gray-500">Withdrawn</span>
                          <span className="text-gray-900">
                            {up.withdrawn_at ? new Date(up.withdrawn_at).toLocaleString() : '-'}
                          </span>
                        </div>
                      </div>

                      {canWithdraw ? (
                        <div className="mt-4">
                          {cardWithdrawError ? (
                            <div className="mb-2 text-sm text-red-600">{cardWithdrawError}</div>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => handleWithdrawPackage(up.id)}
                            disabled={packageWithdrawLoading}
                            className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                          >
                            {isThisWithdrawing ? 'Withdrawing...' : 'Withdraw'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderUsers = () => (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Registered Users</h3>
          <p className="text-sm text-gray-500">Admin only: view users and change their roles.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {([
              { value: 'all' as const, label: 'All' },
              { value: 'user' as const, label: 'User' },
              { value: 'merchant' as const, label: 'Merchant' },
              { value: 'accounting' as const, label: 'Accounting' },
              { value: 'admin' as const, label: 'Admin' },
            ] as const).map((opt) => {
              const isActive = usersRoleFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setUsersRoleFilter(opt.value as any)}
                  className={
                    isActive
                      ? 'inline-flex items-center px-3 py-1.5 border border-indigo-600 text-sm font-medium rounded-md text-white bg-indigo-600'
                      : 'inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50'
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => {
              setActiveTab('users');
            }}
            className="inline-flex items-center px-3 py-2 border border-indigo-600 text-sm font-medium rounded-md text-indigo-700 bg-white hover:bg-indigo-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {(usersListError || impersonateError) && (
        <div className="px-6 py-4 text-sm text-red-600">{usersListError || impersonateError}</div>
      )}

      {usersListLoading ? (
        <div className="px-6 py-8 text-center text-sm text-gray-500">Loading users…</div>
      ) : (
        (() => {
          const filteredUsers = usersRoleFilter === 'all' ? usersList : usersList.filter((u) => u.role === usersRoleFilter);
          return (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Earnings</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((u) => {
                const isSelf = u.id === user?.id;
                const isBusy = userRoleSavingId === u.id;
                const isViewing = impersonateLoadingId === u.id;
                return (
                  <tr key={u.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {u.first_name} {u.last_name}{isSelf ? ' (you)' : ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency((u as any)?.balance ?? 0)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency((u as any)?.total_earnings ?? 0)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-60"
                        value={u.role}
                        onChange={(e) => {
                          const nextRole = e.target.value as Role;
                          const prevRole = u.role;
                          setUsersList((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x)));
                          if (isSelf) {
                            setProfile((p) => (p ? ({ ...p, role: nextRole } as any) : p));
                          }
                          updateUserRole(u.id, nextRole, prevRole);
                        }}
                        disabled={isBusy}
                      >
                        <option value="user">User</option>
                        <option value="merchant">Merchant</option>
                        <option value="accounting">Accounting</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {!isSelf && (
                          <button
                            onClick={() => handleImpersonate(u.id)}
                            disabled={isViewing}
                            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                          >
                            {isViewing ? 'Opening…' : 'View'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-gray-500">No users found.</div>
          )}
        </div>
          );
        })()
      )}
    </div>
  );

  const renderReferrals = () => (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Your Referrals</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Username
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Commission
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {referrals.map((referral) => (
              <tr key={referral.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {referral.referred.first_name} {referral.referred.last_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {referral.referred.username}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    referral.status === 'active' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {referral.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatCurrency(referral.commission_earned)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(referral.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {referrals.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No referrals yet</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderCommissions = () => (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Commission History</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Level</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {commissions.map((commission) => (
              <tr key={commission.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {formatCurrency(commission.amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {commission.commission_type}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  Level {commission.level}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    commission.status === 'paid' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {commission.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(commission.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {commissions.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No commissions yet</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderPackages = () => (
    <div className="space-y-4">
      {(profile?.role === 'admin' || packageAdminError) && (
        <div className="flex items-center justify-between gap-3">
          <div>
            {packageAdminError && <div className="text-sm text-red-600">{packageAdminError}</div>}
          </div>
          {profile?.role === 'admin' && (
            <button
              onClick={() => {
                setPackageAdminError(null);
                setIsAddPackageOpen(true);
              }}
              className="inline-flex items-center px-3 py-2 border border-indigo-600 text-sm font-medium rounded-md text-indigo-700 bg-white hover:bg-indigo-50"
            >
              Add Package
            </button>
          )}
        </div>
      )}

      {packagePurchaseError ? (
        <div className="text-sm text-red-600">{packagePurchaseError}</div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {packages.map((pkg) => {
          const activeRowsForPkg = activeUserPackages.filter((up) => up?.packages?.id === pkg.id || up?.package_id === pkg.id);
          const isActive = activeRowsForPkg.length > 0;
          const activeRowForDisplay = activeRowsForPkg[0] ?? null;
          const isBusy = packageActionLoadingId === pkg.id;

          return (
            <div
              key={pkg.id}
              className={`bg-white rounded-lg shadow p-6 ${isActive ? 'ring-2 ring-indigo-500' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{pkg.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{pkg.description}</p>
                </div>
              </div>

              <p className="text-2xl font-bold text-gray-900 mt-4">{formatCurrency(pkg.price)}</p>
              <p className="text-sm text-gray-500 mt-1">{pkg.commission_rate}% commission</p>
              {isActive && activeRowsForPkg.length > 1 ? (
                <p className="text-xs text-indigo-700 mt-2">Active: {activeRowsForPkg.length}</p>
              ) : null}
              {isActive && getMaturityLabel(activeRowForDisplay) ? (
                <div className="mt-2">
                  <p className="text-xs text-gray-600">Matures: {getMaturityLabel(activeRowForDisplay)}</p>
                  {renderMaturityProgressBar(activeRowForDisplay)}
                </div>
              ) : null}
              {isActive && activeRowForDisplay?.withdrawn_at ? (
                <p className="text-xs text-green-700 mt-1">
                  Withdrawn: {new Date(activeRowForDisplay.withdrawn_at).toLocaleString()}
                </p>
              ) : null}
              <p className="text-sm text-gray-500 mt-1">Max referrals: {pkg.max_referrals || 'Unlimited'}</p>

              {profile?.role === 'admin' ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {isActive ? (
                    <button
                      onClick={() => handleDeactivatePackage(pkg)}
                      disabled={isBusy}
                      className="w-full bg-white text-indigo-700 py-2 px-4 rounded-md border border-indigo-600 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {isBusy ? 'Working…' : 'Deactivate'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivatePackage(pkg)}
                      disabled={isBusy}
                      className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {isBusy ? 'Working…' : 'Activate'}
                    </button>
                  )}

                  <button
                    onClick={() => handleDeletePackage(pkg)}
                    disabled={packageAdminLoading}
                    className="w-full bg-white text-red-700 py-2 px-4 rounded-md border border-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                  >
                    {packageAdminLoading ? 'Working…' : 'Delete'}
                  </button>
                </div>
              ) : (
                <div className="mt-4">
                  {isActive ? (
                    <button
                      onClick={() => handleDeactivatePackage(pkg)}
                      disabled={isBusy}
                      className="w-full bg-white text-indigo-700 py-2 px-4 rounded-md border border-indigo-600 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {isBusy ? 'Working…' : 'Deactivate'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivatePackage(pkg)}
                      disabled={isBusy}
                      className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {isBusy ? 'Working…' : 'Buy Package'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isAddPackageOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsAddPackageOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Add Package</h3>
                <button
                  onClick={() => setIsAddPackageOpen(false)}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Close
                </button>
              </div>
              <div className="px-6 py-4 space-y-3">
                {packageAdminError && <div className="text-sm text-red-600">{packageAdminError}</div>}
                <div className="grid grid-cols-1 gap-3">
                  <input
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Name"
                    value={newPackage.name}
                    onChange={(e) => setNewPackage((p) => ({ ...p, name: e.target.value }))}
                  />
                  <input
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Description"
                    value={newPackage.description}
                    onChange={(e) => setNewPackage((p) => ({ ...p, description: e.target.value }))}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder="Price"
                      value={newPackage.price}
                      onChange={(e) => setNewPackage((p) => ({ ...p, price: e.target.value }))}
                    />
                    <input
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder="Commission rate (%)"
                      value={newPackage.commission_rate}
                      onChange={(e) => setNewPackage((p) => ({ ...p, commission_rate: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder="Level"
                      value={newPackage.level}
                      onChange={(e) => setNewPackage((p) => ({ ...p, level: e.target.value }))}
                    />
                    <input
                      id="max_referrals"
                      name="max_referrals"
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder="Max referrals (optional)"
                      value={newPackage.max_referrals}
                      onChange={(e) => setNewPackage((p) => ({ ...p, max_referrals: e.target.value }))}
                    />
                    <input
                      id="maturity_days"
                      name="maturity_days"
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                      placeholder="Maturity days (0 = instant)"
                      value={newPackage.maturity_days}
                      onChange={(e) => setNewPackage((p) => ({ ...p, maturity_days: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setIsAddPackageOpen(false)}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  disabled={packageAdminLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreatePackage}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
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
  );

  // Loading state management
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        setLoadingError('Taking longer than expected to load. Please check your connection.');
      }
    }, 5000); // Show error message after 5 seconds

    return () => clearTimeout(timer);
  }, [loading]);

  // Show loading state only if we don't have profile data and packages data yet
  if (loading && (!profile || !packages.length)) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-gray-600 mb-2">Loading your dashboard...</p>
        {loadingError && (
          <div className="mt-4 p-3 bg-yellow-50 text-yellow-700 rounded-md text-sm max-w-md text-center">
            {loadingError}
            <button 
              onClick={() => window.location.reload()} 
              className="mt-2 text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="w-full px-4">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(true)}
                  className="mr-3 inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Open navigation"
                  aria-expanded={isMenuOpen}
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </button>
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">First Steps Dashboard</h1>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-gray-700 mr-4">
                {profile?.first_name} {profile?.last_name}
              </span>
              {hasAdminBackup && isImpersonating && !isAdmin && (
                <button
                  onClick={handleReturnToAdmin}
                  className="mr-3 inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Return to Admin
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => router.push('/admin')}
                  className="mr-3 inline-flex items-center px-3 py-2 border border-indigo-600 text-sm font-medium rounded-md text-indigo-700 bg-white hover:bg-indigo-50"
                >
                  Admin
                </button>
              )}
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className={`fixed inset-0 z-40 ${isMenuOpen ? '' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
            isMenuOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setIsMenuOpen(false)}
        />

        <div
          className={`absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-white shadow-xl transform transition-transform duration-300 ${
            isMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-4 h-16 border-b">
            <div className="font-semibold text-gray-900">Menu</div>
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Close navigation"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="p-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => selectTab(item.key)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium ${
                  activeTab === item.key
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mt-6">
            {activeTab === 'overview' && (
              <>
                {renderReferralLink()}
                {renderAccountBalanceCard()}
                {renderTopUpCard()}
                {(profile?.role === 'merchant' || isAdmin) && renderTopUpRequests()}
                {renderOverview()}
              </>
            )}
            {activeTab === 'referrals' && renderReferrals()}
            {activeTab === 'commissions' && renderCommissions()}
            {activeTab === 'packages' && (
              <>
                {userPackageRow && renderAccountBalanceCard()}
                {userPackageRow && renderTopUpCard()}
                {renderPackages()}
              </>
            )}
            {activeTab === 'users' && isAdmin && renderUsers()}
            {activeTab === 'admin' && isAdmin && renderAdminPanel()}
          </div>
        </div>
      </main>
    </div>
  );
}
