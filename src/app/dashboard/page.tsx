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
  referred_by_username?: string | null;
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

type TopUpHistoryEntry = {
  id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  status_notes?: string | null;
  created_at: string;
};

type WithdrawalHistoryEntry = {
  id: string;
  amount: number;
  withdrawnAt: string;
  packageName: string;
};

type AccountWithdrawalEntry = {
  id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'processing';
  created_at: string;
  processed_at?: string | null;
  status_notes?: string | null;
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
  const [topUpRequests, setTopUpRequests] = useState<
    Array<{
      id: string;
      amount: number;
      status: 'pending' | 'approved' | 'rejected';
      status_notes?: string | null;
      created_at: string;
    }>
  >([]);
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
  const [hasCopiedReferralLink, setHasCopiedReferralLink] = useState(false);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<'packages' | 'commissions' | null>(null);
  const [isTopUpHistoryOpen, setIsTopUpHistoryOpen] = useState(false);
  const [isWithdrawalHistoryOpen, setIsWithdrawalHistoryOpen] = useState(false);
  const [isAccountWithdrawalHistoryOpen, setIsAccountWithdrawalHistoryOpen] = useState(false);
  const [accountWithdrawals, setAccountWithdrawals] = useState<AccountWithdrawalEntry[]>([]);
  const [accountWithdrawalLoading, setAccountWithdrawalLoading] = useState(false);
  const [accountWithdrawalError, setAccountWithdrawalError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const buyPackageInFlightRef = useRef(false);
  const lastRealtimeUserRefreshAtRef = useRef(0);
  const lastRealtimeUsersListRefreshAtRef = useRef(0);
  const realtimeUserRefreshInFlightRef = useRef(false);
  const packagesSectionRef = useRef<HTMLDivElement | null>(null);
  const commissionsSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        setLoading(true);
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          logError('DashboardSessionError', sessionError);
          setLoading(false);
          return;
        }

        if (!session?.user) {
          setLoading(false);
          router.replace('/login');
          return;
        }

        if (!isMounted) return;

        setUser(session.user);
        await fetchUserData(session.user.id);
      } catch (err) {
        logError('DashboardBootstrapError', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, [supabase, router]);

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
  const withdrawalHistoryEntries = useMemo(
    () =>
      availedUserPackages
        .filter((up) => !!up?.withdrawn_at)
        .map((up) => ({
          id: up.id,
          amount: Number((up as any)?.packages?.price ?? 0),
          withdrawnAt: up.withdrawn_at as string,
          packageName: up.packages?.name ?? up.package_id,
        }))
        .sort((a, b) => new Date(b.withdrawnAt).getTime() - new Date(a.withdrawnAt).getTime()),
    [availedUserPackages]
  );
  useEffect(() => {
    if (!pendingScrollTarget) return;
    const ref = pendingScrollTarget === 'packages' ? packagesSectionRef : commissionsSectionRef;
    const timeout = window.setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingScrollTarget(null);
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [pendingScrollTarget, activeTab]);

  const formatCurrency = (value: any, digits = 2) => {
    const n = Number(value);
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
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

  const fetchTopUpRequests = async (userId?: string, limit = 20) => {
    if (!userId) {
      logError('FetchTopUpRequestsError', 'No user ID provided');
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('top_up_requests')
        .select('id, amount, status, status_notes, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

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

  const calculateTotalWithdrawn = () =>
    availedUserPackages
      .filter((up) => !!up?.withdrawn_at)
      .reduce((total, up) => {
        const amt = Number((up as any)?.packages?.price ?? 0);
        return total + (Number.isFinite(amt) ? amt : 0);
      }, 0);

  const calculateDirectCommissions = () =>
    commissions
      .filter((commission) => commission.level === 1 && commission.status === 'paid')
      .reduce((total, commission) => total + commission.amount, 0);

  const calculateIndirectCommissions = () =>
    commissions
      .filter((commission) => commission.level && commission.level > 1 && commission.status === 'paid')
      .reduce((total, commission) => total + commission.amount, 0);

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
  const focusPackagesSection = () => {
    selectTab('packages');
    setPendingScrollTarget('packages');
  };
  const focusCommissionsSection = () => {
    selectTab('commissions');
    setPendingScrollTarget('commissions');
  };
  const openTopUpHistory = () => {
    selectTab('overview');
    setIsTopUpHistoryOpen(true);
  };
  const openWithdrawalHistory = () => {
    selectTab('overview');
    setIsWithdrawalHistoryOpen(true);
  };
  const openAccountWithdrawalHistory = () => {
    selectTab('overview');
    setIsAccountWithdrawalHistoryOpen(true);
    fetchAccountWithdrawals();
  };
  const closeTopUpHistory = () => setIsTopUpHistoryOpen(false);
  const closeWithdrawalHistory = () => setIsWithdrawalHistoryOpen(false);
  const closeAccountWithdrawalHistory = () => setIsAccountWithdrawalHistoryOpen(false);

  const fetchAccountWithdrawals = async () => {
    if (!user?.id) return;
    setAccountWithdrawalLoading(true);
    setAccountWithdrawalError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const response = await fetch('/api/withdrawal-requests', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();
      
      console.log('API Response:', { 
        status: response.status, 
        statusText: response.statusText, 
        data 
      });
      
      if (!response.ok) {
        console.error('API Error Details:', data);
        throw new Error(data.error || `Failed to fetch withdrawal requests (${response.status})`);
      }

      setAccountWithdrawals(data.withdrawal_requests || []);
    } catch (error) {
      const errorMsg = (error as any)?.message || 'Failed to load withdrawal history';
      setAccountWithdrawalError(errorMsg);
      logError('FetchAccountWithdrawalsError', error);
    } finally {
      setAccountWithdrawalLoading(false);
    }
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

  const renderTopUpHistoryModal = () => {
    const statusStyle: Record<TopUpHistoryEntry['status'], string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };

    return (
      <div className="rounded-3xl bg-[#0f1f2e] border border-[#1a2f3f] shadow-2xl max-h-[80vh] w-full max-w-3xl overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#1a2f3f] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7eb3b0]">History</p>
            <h2 className="text-xl font-semibold text-white">Recent Top Ups</h2>
          </div>
          <button
            type="button"
            onClick={closeTopUpHistory}
            className="rounded-full border border-[#1a2f3f] p-2 text-[#7eb3b0] transition hover:bg-[#132f40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a7a1]"
            aria-label="Close top-up history modal"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" fill="none" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-3 text-xs text-[#6a8f99]">
          Most recent {Math.min(topUpRequests.length, 20)} submissions • Balances update once reviewed
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-6 pb-6">
          {topUpRequests.length > 0 ? (
            <div className="space-y-3">
              {topUpRequests.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-2 rounded-2xl border border-[#1a2f3f] bg-[#0b1721] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-base font-semibold text-white">{formatCurrency(entry.amount)}</p>
                    <p className="text-xs text-[#7eb3b0]">{new Date(entry.created_at).toLocaleString()}</p>
                    {entry.status_notes ? (
                      <p className="text-xs text-[#6a8f99]">
                        Ref: <span className="font-mono text-[#9fc3c1]">{entry.status_notes}</span>
                      </p>
                    ) : null}
                  </div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyle[entry.status]}`}>
                    {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#1a2f3f] bg-[#0b1721] px-4 py-12 text-center text-sm text-[#6a8f99]">
              You haven't submitted any top-up requests yet.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderWithdrawalHistoryModal = () => (
    <div className="rounded-3xl bg-[#0f1f2e] border border-[#1a2f3f] shadow-2xl max-h-[80vh] w-full max-w-3xl overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#1a2f3f] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7eb3b0]">History</p>
          <h2 className="text-xl font-semibold text-white">Package Withdrawals</h2>
        </div>
        <button
          type="button"
          onClick={closeWithdrawalHistory}
          className="rounded-full border border-[#1a2f3f] p-2 text-[#7eb3b0] transition hover:bg-[#132f40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a7a1]"
          aria-label="Close withdrawal history modal"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" fill="none" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="px-6 py-3 text-xs text-[#6a8f99]">Completed package withdrawals and released balances</div>
      <div className="max-h-[60vh] overflow-y-auto px-6 pb-6">
        {withdrawalHistoryEntries.length > 0 ? (
          <div className="space-y-3">
            {withdrawalHistoryEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-2 rounded-2xl border border-[#1a2f3f] bg-[#0b1721] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-base font-semibold text-white">{formatCurrency(entry.amount)}</p>
                  <p className="text-xs text-[#7eb3b0]">{new Date(entry.withdrawnAt).toLocaleString()}</p>
                  <p className="text-xs text-[#6a8f99]">
                    Package: <span className="font-medium text-[#9fc3c1]">{entry.packageName ?? '—'}</span>
                  </p>
                </div>
                <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold bg-[#16a7a1]/20 text-[#16a7a1]">
                  Released
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#1a2f3f] bg-[#0b1721] px-4 py-12 text-center text-sm font-semibold text-[#6a8f99]">
            None
          </div>
        )}
      </div>
    </div>
  );

  const renderAccountWithdrawalHistoryModal = () => {
    const statusStyle: Record<AccountWithdrawalEntry['status'], string> = {
      pending: 'bg-[#d4b673]/20 text-[#d4b673]',
      approved: 'bg-[#16a7a1]/20 text-[#16a7a1]',
      rejected: 'bg-red-500/20 text-red-400',
      processing: 'bg-[#3d7cff]/20 text-[#3d7cff]',
    };

    return (
      <div className="rounded-3xl bg-[#0f1f2e] border border-[#1a2f3f] shadow-2xl max-h-[80vh] w-full max-w-3xl overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#1a2f3f] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7eb3b0]">History</p>
            <h2 className="text-xl font-semibold text-white">Account Withdrawals</h2>
          </div>
          <button
            type="button"
            onClick={closeAccountWithdrawalHistory}
            className="rounded-full border border-[#1a2f3f] p-2 text-[#7eb3b0] transition hover:bg-[#132f40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a7a1]"
            aria-label="Close account withdrawal history modal"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" fill="none" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-3 text-xs text-[#6a8f99]">
          Balance withdrawal requests and their processing status
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-6 pb-6">
          {accountWithdrawalLoading ? (
            <div className="rounded-2xl border border-[#1a2f3f] bg-[#0b1721] px-4 py-12 text-center text-sm text-[#6a8f99]">
              Loading withdrawal history...
            </div>
          ) : accountWithdrawalError ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-12 text-center text-sm text-red-400">
              {accountWithdrawalError}
            </div>
          ) : accountWithdrawals.length > 0 ? (
            <div className="space-y-3">
              {accountWithdrawals.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-2 rounded-2xl border border-[#1a2f3f] bg-[#0b1721] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-base font-semibold text-white">{formatCurrency(entry.amount)}</p>
                    <p className="text-xs text-[#7eb3b0]">
                      Requested: {new Date(entry.created_at).toLocaleString()}
                    </p>
                    {entry.processed_at ? (
                      <p className="text-xs text-[#7eb3b0]">
                        Processed: {new Date(entry.processed_at).toLocaleString()}
                      </p>
                    ) : null}
                    {entry.status_notes ? (
                      <p className="text-xs text-[#6a8f99]">
                        Note: <span className="font-mono text-[#9fc3c1]">{entry.status_notes}</span>
                      </p>
                    ) : null}
                  </div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyle[entry.status]}`}>
                    {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#1a2f3f] bg-[#0b1721] px-4 py-12 text-center text-sm font-semibold text-[#6a8f99]">
              No account withdrawal requests yet
            </div>
          )}
        </div>
      </div>
    );
  };

  const StatCard = ({
    label,
    value,
    description,
    icon,
  }: {
    label: string;
    value: string;
    description: string;
    icon: React.ReactNode;
  }) => (
    <div className="rounded-xl border border-[#1a2f3f] bg-[#0f1f2e] p-5 text-white shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[#7eb3b0]">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          <p className="mt-1 text-xs text-[#6a8f99]">{description}</p>
        </div>
        <div className="h-11 w-11 rounded-xl bg-[#132f40] text-[#16a7a1] flex items-center justify-center shadow-inner">
          {icon}
        </div>
      </div>
    </div>
  );

  const SectionCard = ({
    title,
    subtitle,
    action,
    children,
    accent = 'yellow',
  }: {
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    accent?: 'yellow' | 'green' | 'blue' | 'purple';
  }) => {
    const accentStyles: Record<typeof accent, { border: string; glow: string }> = {
      yellow: { border: 'border-[#3b2f17]', glow: 'shadow-[#d4b673]/10' },
      green: { border: 'border-[#14322e]', glow: 'shadow-[#16a7a1]/10' },
      blue: { border: 'border-[#173049]', glow: 'shadow-[#3d7cff]/10' },
      purple: { border: 'border-[#2a1f47]', glow: 'shadow-[#9c6dff]/10' },
    };
    const palette = accentStyles[accent];

    return (
      <div className={`rounded-2xl border ${palette.border} bg-[#0f1f2e] p-6 text-white shadow-lg ${palette.glow}`}>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1a2f3f] pb-4">
          <div>
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm text-[#7eb3b0]">{subtitle}</p> : null}
          </div>
          {action}
        </div>
        <div className="pt-4 text-[#cfe3e8]">{children}</div>
      </div>
    );
  };

  const renderHeroHeader = () => (
    <div className="relative overflow-hidden rounded-3xl border border-[#1c3f4c] bg-gradient-to-br from-[#102335] via-[#133247] to-[#0c1f2b] p-6 sm:p-8 text-white shadow-lg shadow-black/40">
      <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-[#16a7a1]/15 blur-2xl" />
      <div className="absolute -bottom-24 -left-20 h-60 w-60 rounded-full bg-[#d4b673]/15 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-4">
        <div className="h-14 w-14 rounded-2xl border border-[#1c3f4c] bg-[#091522] text-[#16a7a1] flex items-center justify-center text-2xl font-semibold shadow-inner shadow-black/40">
          {profile?.first_name?.[0]?.toUpperCase() ?? 'X'}
        </div>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.4em] text-[#7eb3b0]/70">Welcome back</p>
          <h1 className="text-2xl sm:text-3xl font-semibold">
            Hello, <span className="text-[#f3cc84]">@{profile?.username ?? 'user'}</span>!
          </h1>
          <p className="text-sm text-[#9fc3c1]">Manage your investments, track earnings, and grow your portfolio.</p>
        </div>
        <div className="rounded-full border border-[#1c3f4c] bg-[#112333] px-4 py-2 text-sm font-semibold text-[#7eb3b0]">
          {profile?.role ?? 'User'}
        </div>
      </div>
    </div>
  );

  const renderReferralLink = () => (
    <SectionCard
      title="Referral Link"
      subtitle="Share your link to earn commissions."
      action={
        <button
          type="button"
          onClick={async () => {
            if (!profile?.referral_code) return;
            const link = `${window.location.origin}/signup?ref=${profile.referral_code}`;
            try {
              await navigator.clipboard.writeText(link);
              setHasCopiedReferralLink(true);
              setTimeout(() => setHasCopiedReferralLink(false), 2000);
            } catch (e) {
              logError('CopyReferralLinkError', e);
            }
          }}
          disabled={!profile?.referral_code}
          className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-4 py-2 text-sm font-semibold text-black transition disabled:opacity-50"
        >
          {hasCopiedReferralLink ? 'Copied!' : 'Copy Link'}
        </button>
      }
    >
      <div className="rounded-2xl border border-[#1a2f3f] bg-[#0b1721] p-4 text-sm text-[#9fc3c1] font-mono break-all">
        {profile?.referral_code
          ? `${window.location.origin}/signup?ref=${profile.referral_code}`
          : 'Referral link unavailable (missing referral_code)'}
      </div>
    </SectionCard>
  );

  const renderReferredBy = () => {
    if (!profile?.referred_by_username) return null;
    return (
      <SectionCard title="Referred By" accent="purple">
        <div className="flex items-center gap-3 text-white/80">
          <div className="h-10 w-10 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-semibold">
            {profile?.referred_by_username?.[0]?.toUpperCase() ?? 'R'}
          </div>
          <div>
            <p className="text-sm text-white/60">Username</p>
            <p className="font-medium">@{profile.referred_by_username}</p>
          </div>
        </div>
      </SectionCard>
    );
  };

  const renderOverviewStats = () => (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total Withdrawn"
        value={formatCurrency(calculateTotalWithdrawn())}
        description="Total amount withdrawn"
        icon="₱"
      />
      <StatCard
        label="Direct Commissions"
        value={formatCurrency(calculateDirectCommissions())}
        description="10% from direct referrals"
        icon="1%"
      />
      <StatCard
        label="Indirect Commissions"
        value={formatCurrency(calculateIndirectCommissions())}
        description="1% from level 2-10"
        icon="2%"
      />
      <StatCard
        label="Total Package Income"
        value={formatCurrency(calculateTotalEarnings())}
        description="Total investments claimed"
        icon={
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
          </svg>
        }
      />
    </div>
  );

  const renderInvestments = () => (
    <SectionCard
      title="My Investments"
      subtitle="Track progress, returns, and claim when ready."
      accent="blue"
    >
      {availedUserPackages.filter((up) => !up?.withdrawn_at).length === 0 ? (
        <div className="rounded-2xl border border-[#1a2f3f] bg-[#0d2131] p-6 text-center text-[#6a8f99]">
          No active investments yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {availedUserPackages
            .filter((up) => !up?.withdrawn_at)
            .map((up) => (
              <div key={up.id} className="rounded-2xl border border-[#1a2f3f] bg-[#0f1f2e] p-5 text-white shadow-inner shadow-black/20">
                <div className="mb-4 flex items-center justify-between text-sm text-[#9fc3c1]">
                  <div className="rounded-full bg-[#133247] px-3 py-1 text-xs font-semibold text-[#16a7a1]">
                    {up.packages?.name ?? up.package_id}
                  </div>
                  <span>{up.created_at ? new Date(up.created_at).toLocaleDateString() : '-'}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm text-[#9fc3c1]">
                  <div>
                    <p>Invested</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {formatCurrency((up as any)?.packages?.price)}
                    </p>
                  </div>
                  <div>
                    <p>Expected</p>
                    <p className="mt-1 text-lg font-semibold text-[#f3cc84]">
                      {formatCurrency((up as any)?.packages?.price * 1.2)}
                    </p>
                  </div>
                  <div>
                    <p>Rate</p>
                    <p className="mt-1 font-semibold text-[#16a7a1]">
                      {(up as any)?.packages?.commission_rate ?? 20}%
                    </p>
                  </div>
                  <div>
                    <p>Progress</p>
                    <p className="mt-1 font-semibold text-white">{getMaturityLabel(up) ?? 'Instant'}</p>
                  </div>
                </div>
                {isWithdrawable(up) ? (
                  <button
                    type="button"
                    onClick={() => handleWithdrawPackage(up.id)}
                    disabled={packageWithdrawLoading}
                    className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#16a7a1] via-[#1ed3c2] to-[#9fdccd] py-2 text-sm font-semibold text-[#062226] transition hover:opacity-95 disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                ) : (
                  <div className="mt-4 rounded-xl border border-[#1a2f3f] bg-[#0b1721] px-4 py-2 text-center text-xs text-[#637d86]">
                    Awaiting maturity
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </SectionCard>
  );

  const renderActionsRow = () => (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <SectionCard title="Deposit" accent="green">
        <div className="grid gap-3">
          <button
            onClick={() => setShowTopUpForm(true)}
            className="rounded-xl bg-gradient-to-r from-[#d4b673] to-[#f2c572] py-3 text-center text-sm font-semibold text-[#1a1a1a] shadow-md hover:opacity-90 transition"
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={focusPackagesSection}
            className="rounded-xl bg-gradient-to-r from-[#16a7a1] to-[#1ed3c2] py-3 text-center text-sm font-semibold text-[#062226] shadow-md hover:opacity-90 transition"
          >
            Buy Packages
          </button>
          <button
            type="button"
            onClick={openTopUpHistory}
            className="rounded-xl border border-[#1a2f3f] bg-[#0b1721] py-3 text-center text-sm font-medium text-[#7eb3b0] hover:bg-[#132f40] transition"
          >
            View History
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Withdrawal" accent="blue">
        <div className="grid gap-3">
          <button className="rounded-xl bg-gradient-to-r from-[#16a7a1] to-[#1ed3c2] py-3 text-center text-sm font-semibold text-[#062226] shadow-md hover:opacity-90 transition">
            Withdraw (₱0.00)
          </button>
          <button
            type="button"
            onClick={openAccountWithdrawalHistory}
            className="rounded-xl border border-[#1a2f3f] bg-[#0b1721] py-3 text-center text-sm font-medium text-[#7eb3b0] hover:bg-[#132f40] transition"
          >
            View History
          </button>
        </div>
      </SectionCard>
    </div>
  );

  const renderTopUpCard = () => (
    <SectionCard title="Top Up" accent="yellow">
      {!showTopUpForm ? (
        <button
          onClick={() => setShowTopUpForm(true)}
          className="rounded-full bg-gradient-to-r from-[#d4b673] to-[#f2c572] px-5 py-2 text-sm font-semibold text-[#1a1a1a] shadow-md hover:opacity-90 transition"
        >
          Top Up Balance
        </button>
      ) : (
        <form onSubmit={handleTopUp} className="space-y-4">
          {publicPaymentMethods.length > 0 ? (
            <div className="rounded-2xl border border-[#1a2f3f] bg-[#0b1721] p-4">
              <p className="text-sm font-semibold text-[#9fc3c1]">Payment method</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {publicPaymentMethods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedPublicPaymentMethodId(m.id)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      selectedPublicPaymentMethodId === m.id
                        ? 'border-[#16a7a1] bg-[#132f40]'
                        : 'border-[#1a2f3f] bg-[#0f1f2e] hover:border-[#16a7a1]/50'
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                      <div className="flex-1 space-y-2">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {(m.provider || (m.type === 'gcash' ? 'GCash' : m.type)) + (m.label ? ` - ${m.label}` : '')}
                          </p>
                        </div>
                        <div className="rounded-xl border border-[#1a2f3f] bg-[#091522] p-3 text-xs text-[#7eb3b0]">
                          <p className="font-semibold text-[#9fc3c1]">Account Details</p>
                          {m.type === 'gcash' ? (
                            <>
                              <p>Account Name: {m.account_name ?? '—'}</p>
                              <p>Number: {m.phone ?? '—'}</p>
                            </>
                          ) : (
                            <>
                              <p>Bank: {m.provider ?? m.type}</p>
                              <p>Account Name: {m.account_name ?? '—'}</p>
                              <p>Account #: {m.account_number_last4 ? `****${m.account_number_last4}` : '—'}</p>
                            </>
                          )}
                        </div>
                      </div>
                      {publicPaymentQrUrls[m.id] ? (
                        <div className="w-full sm:w-52">
                          <div className="aspect-square w-full rounded-2xl border border-[#1a2f3f] bg-[#0f1f2e] flex items-center justify-center p-3">
                            <img
                              src={publicPaymentQrUrls[m.id]}
                              alt="Payment preview"
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#1a2f3f] bg-[#0b1721] p-4 text-[#6a8f99]">
              No payment methods available yet.
            </div>
          )}

          <div className="rounded-2xl border border-[#1a2f3f] bg-[#0b1721] p-4">
            <label htmlFor="amount" className="text-sm text-[#7eb3b0]">
              Amount
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#6a8f99]">₱</span>
                <input
                  type="number"
                  id="amount"
                  name="amount"
                  className="w-full rounded-xl border border-[#1a2f3f] bg-[#091522] py-2 pl-8 pr-3 text-white outline-none focus:border-[#16a7a1]"
                  placeholder="0.00"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  min="1"
                  step="0.01"
                  required
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isProcessingPayment}
                  className="rounded-full bg-gradient-to-r from-[#16a7a1] to-[#1ed3c2] px-4 py-2 text-sm font-semibold text-[#062226] disabled:opacity-50 shadow-md hover:opacity-90 transition"
                >
                  {isProcessingPayment ? 'Processing…' : 'Submit'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTopUpForm(false);
                    setPaymentError(null);
                  }}
                  className="rounded-full border border-[#1a2f3f] px-4 py-2 text-sm text-[#7eb3b0] hover:bg-[#132f40] transition"
                >
                  Cancel
                </button>
              </div>
            </div>
            {paymentError ? <p className="mt-2 text-sm text-red-600">{paymentError}</p> : null}
          </div>
        </form>
      )}
    </SectionCard>
  );

  const renderAccountBalanceCard = () => (
    <SectionCard title="Account Balance" accent="green">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-white/60">Available balance</p>
          <p className="text-3xl font-bold text-white">{formatCurrency(profile?.balance || 0)}</p>
        </div>
        <div className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70">
          Last updated {profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString() : '—'}
        </div>
      </div>
    </SectionCard>
  );

  const renderOverview = () => (
    <div className="space-y-6">
      {renderOverviewStats()}
      {renderInvestments()}
      {renderActionsRow()}
    </div>
  );

  const renderUsers = () => (
    <div className="bg-[#0f1f2e] rounded-lg shadow-lg border border-[#1a2f3f] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#1a2f3f] flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Registered Users</h3>
          <p className="text-sm text-[#7eb3b0]">Admin only: view users and change their roles.</p>
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
                      ? 'inline-flex items-center px-3 py-1.5 border border-[#16a7a1] text-sm font-medium rounded-md text-[#0a1621] bg-[#16a7a1]'
                      : 'inline-flex items-center px-3 py-1.5 border border-[#1a2f3f] text-sm font-medium rounded-md text-[#7eb3b0] bg-[#0f1f2e] hover:bg-[#132f40]'
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
            className="inline-flex items-center px-3 py-2 border border-[#16a7a1] text-sm font-medium rounded-md text-[#16a7a1] bg-[#0f1f2e] hover:bg-[#132f40]"
          >
            Refresh
          </button>
        </div>
      </div>

      {(usersListError || impersonateError) && (
        <div className="px-6 py-4 text-sm text-red-400">{usersListError || impersonateError}</div>
      )}

      {usersListLoading ? (
        <div className="px-6 py-8 text-center text-sm text-[#6a8f99]">Loading users…</div>
      ) : (
        (() => {
          const filteredUsers = usersRoleFilter === 'all' ? usersList : usersList.filter((u) => u.role === usersRoleFilter);
          return (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#1a2f3f]">
            <thead className="bg-[#0b1721]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Username</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Balance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Total Earnings</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-[#0f1f2e] divide-y divide-[#1a2f3f]">
              {filteredUsers.map((u) => {
                const isSelf = u.id === user?.id;
                const isBusy = userRoleSavingId === u.id;
                const isViewing = impersonateLoadingId === u.id;
                return (
                  <tr key={u.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                      {u.first_name} {u.last_name}{isSelf ? ' (you)' : ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#7eb3b0]">{u.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{formatCurrency((u as any)?.balance ?? 0)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{formatCurrency((u as any)?.total_earnings ?? 0)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        className="border border-[#1a2f3f] rounded-md px-3 py-2 text-sm text-white bg-[#091522] focus:outline-none focus:ring-2 focus:ring-[#16a7a1] focus:border-[#16a7a1] disabled:opacity-60"
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
                            className="inline-flex items-center px-3 py-2 border border-[#1a2f3f] text-sm font-medium rounded-md text-[#7eb3b0] bg-[#0f1f2e] hover:bg-[#132f40] disabled:opacity-50"
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
            <div className="px-6 py-8 text-center text-sm text-[#6a8f99]">No users found.</div>
          )}
        </div>
          );
        })()
      )}
    </div>
  );

  const renderReferrals = () => (
    <div className="bg-[#0f1f2e] rounded-lg shadow-lg border border-[#1a2f3f] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#1a2f3f]">
        <h3 className="text-lg font-semibold text-white">Your Referrals</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[#1a2f3f]">
          <thead className="bg-[#0b1721]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">
                Username
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">
                Commission
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="bg-[#0f1f2e] divide-y divide-[#1a2f3f]">
            {referrals.map((referral) => (
              <tr key={referral.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                  {referral.referred.first_name} {referral.referred.last_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-[#7eb3b0]">
                  {referral.referred.username}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    referral.status === 'active' 
                      ? 'bg-[#16a7a1]/20 text-[#16a7a1]' 
                      : 'bg-[#d4b673]/20 text-[#d4b673]'
                  }`}>
                    {referral.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-[#9fc3c1]">
                  {formatCurrency(referral.commission_earned)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-[#7eb3b0]">
                  {new Date(referral.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {referrals.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[#6a8f99]">No referrals yet</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderCommissions = () => (
    <div className="bg-[#0f1f2e] rounded-lg shadow-lg border border-[#1a2f3f] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#1a2f3f]">
        <h3 className="text-lg font-semibold text-white">Commission History</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[#1a2f3f]">
          <thead className="bg-[#0b1721]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Level</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#7eb3b0] uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="bg-[#0f1f2e] divide-y divide-[#1a2f3f]">
            {commissions.map((commission) => (
              <tr key={commission.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                  {formatCurrency(commission.amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-[#7eb3b0]">
                  {commission.commission_type}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-[#7eb3b0]">
                  Level {commission.level}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    commission.status === 'paid' 
                      ? 'bg-[#16a7a1]/20 text-[#16a7a1]' 
                      : 'bg-[#d4b673]/20 text-[#d4b673]'
                  }`}>
                    {commission.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-[#7eb3b0]">
                  {new Date(commission.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {commissions.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[#6a8f99]">No commissions yet</p>
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
            {packageAdminError && <div className="text-sm text-red-400">{packageAdminError}</div>}
          </div>
          {profile?.role === 'admin' && (
            <button
              onClick={() => {
                setPackageAdminError(null);
                setIsAddPackageOpen(true);
              }}
              className="inline-flex items-center px-3 py-2 border border-[#16a7a1] text-sm font-medium rounded-md text-[#16a7a1] bg-[#0f1f2e] hover:bg-[#132f40]"
            >
              Add Package
            </button>
          )}
        </div>
      )}

      {packagePurchaseError ? (
        <div className="text-sm text-red-400">{packagePurchaseError}</div>
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
              className={`bg-[#0f1f2e] rounded-lg shadow-lg border border-[#1a2f3f] p-6 ${isActive ? 'ring-2 ring-[#16a7a1]' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">{pkg.name}</h3>
                  <p className="text-sm text-[#7eb3b0] mt-1">{pkg.description}</p>
                </div>
              </div>

              <p className="text-2xl font-bold text-white mt-4">{formatCurrency(pkg.price)}</p>
              <p className="text-sm text-[#7eb3b0] mt-1">{pkg.commission_rate}% commission</p>
              {isActive && activeRowsForPkg.length > 1 ? (
                <p className="text-xs text-[#16a7a1] mt-2">Active: {activeRowsForPkg.length}</p>
              ) : null}
              {isActive && getMaturityLabel(activeRowForDisplay) ? (
                <div className="mt-2">
                  <p className="text-xs text-[#7eb3b0]">Matures: {getMaturityLabel(activeRowForDisplay)}</p>
                  {renderMaturityProgressBar(activeRowForDisplay)}
                </div>
              ) : null}
              {isActive && activeRowForDisplay?.withdrawn_at ? (
                <p className="text-xs text-[#16a7a1] mt-1">
                  Withdrawn: {new Date(activeRowForDisplay.withdrawn_at).toLocaleString()}
                </p>
              ) : null}
              <p className="text-sm text-[#6a8f99] mt-1">Max referrals: {pkg.max_referrals || 'Unlimited'}</p>

              {profile?.role === 'admin' ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {isActive ? (
                    <button
                      onClick={() => handleDeactivatePackage(pkg)}
                      disabled={isBusy}
                      className="w-full bg-[#0f1f2e] text-[#16a7a1] py-2 px-4 rounded-md border border-[#16a7a1] hover:bg-[#132f40] focus:outline-none focus:ring-2 focus:ring-[#16a7a1] disabled:opacity-50"
                    >
                      {isBusy ? 'Working…' : 'Deactivate'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivatePackage(pkg)}
                      disabled={isBusy}
                      className="w-full bg-gradient-to-r from-[#16a7a1] to-[#1ed3c2] text-[#062226] py-2 px-4 rounded-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#16a7a1] disabled:opacity-50"
                    >
                      {isBusy ? 'Working…' : 'Activate'}
                    </button>
                  )}

                  <button
                    onClick={() => handleDeletePackage(pkg)}
                    disabled={packageAdminLoading}
                    className="w-full bg-[#0f1f2e] text-red-400 py-2 px-4 rounded-md border border-red-500/50 hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
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
                      className="w-full bg-[#0f1f2e] text-[#16a7a1] py-2 px-4 rounded-md border border-[#16a7a1] hover:bg-[#132f40] focus:outline-none focus:ring-2 focus:ring-[#16a7a1] disabled:opacity-50"
                    >
                      {isBusy ? 'Working…' : 'Deactivate'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivatePackage(pkg)}
                      disabled={isBusy}
                      className="w-full bg-gradient-to-r from-[#16a7a1] to-[#1ed3c2] text-[#062226] py-2 px-4 rounded-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#16a7a1] disabled:opacity-50"
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
          <div className="absolute inset-0 bg-black/60" onClick={() => setIsAddPackageOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-lg bg-[#0f1f2e] border border-[#1a2f3f] shadow-2xl">
              <div className="px-6 py-4 border-b border-[#1a2f3f] flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Add Package</h3>
                <button
                  onClick={() => setIsAddPackageOpen(false)}
                  className="text-sm font-medium text-[#7eb3b0] hover:text-white"
                >
                  Close
                </button>
              </div>
              <div className="px-6 py-4 space-y-3">
                {packageAdminError && <div className="text-sm text-red-400">{packageAdminError}</div>}
                <div className="grid grid-cols-1 gap-3">
                  <input
                    className="border border-[#1a2f3f] bg-[#091522] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#6a8f99] focus:border-[#16a7a1] outline-none"
                    placeholder="Name"
                    value={newPackage.name}
                    onChange={(e) => setNewPackage((p) => ({ ...p, name: e.target.value }))}
                  />
                  <input
                    className="border border-[#1a2f3f] bg-[#091522] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#6a8f99] focus:border-[#16a7a1] outline-none"
                    placeholder="Description"
                    value={newPackage.description}
                    onChange={(e) => setNewPackage((p) => ({ ...p, description: e.target.value }))}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      className="border border-[#1a2f3f] bg-[#091522] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#6a8f99] focus:border-[#16a7a1] outline-none"
                      placeholder="Price"
                      value={newPackage.price}
                      onChange={(e) => setNewPackage((p) => ({ ...p, price: e.target.value }))}
                    />
                    <input
                      className="border border-[#1a2f3f] bg-[#091522] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#6a8f99] focus:border-[#16a7a1] outline-none"
                      placeholder="Commission rate (%)"
                      value={newPackage.commission_rate}
                      onChange={(e) => setNewPackage((p) => ({ ...p, commission_rate: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      className="border border-[#1a2f3f] bg-[#091522] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#6a8f99] focus:border-[#16a7a1] outline-none"
                      placeholder="Level"
                      value={newPackage.level}
                      onChange={(e) => setNewPackage((p) => ({ ...p, level: e.target.value }))}
                    />
                    <input
                      id="max_referrals"
                      name="max_referrals"
                      className="border border-[#1a2f3f] bg-[#091522] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#6a8f99] focus:border-[#16a7a1] outline-none"
                      placeholder="Max referrals (optional)"
                      value={newPackage.max_referrals}
                      onChange={(e) => setNewPackage((p) => ({ ...p, max_referrals: e.target.value }))}
                    />
                    <input
                      id="maturity_days"
                      name="maturity_days"
                      className="border border-[#1a2f3f] bg-[#091522] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#6a8f99] focus:border-[#16a7a1] outline-none"
                      placeholder="Maturity days (0 = instant)"
                      value={newPackage.maturity_days}
                      onChange={(e) => setNewPackage((p) => ({ ...p, maturity_days: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-[#1a2f3f] flex justify-end gap-3">
                <button
                  onClick={() => setIsAddPackageOpen(false)}
                  className="inline-flex items-center px-3 py-2 border border-[#1a2f3f] text-sm font-medium rounded-md text-[#7eb3b0] bg-[#0f1f2e] hover:bg-[#132f40]"
                  disabled={packageAdminLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreatePackage}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-[#062226] bg-gradient-to-r from-[#16a7a1] to-[#1ed3c2] hover:opacity-90 disabled:opacity-50"
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
      <div className="min-h-screen bg-[#0a1621] flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#16a7a1] mb-4"></div>
        <p className="text-[#9fc3c1] mb-2">Loading your dashboard...</p>
        {loadingError && (
          <div className="mt-4 p-3 bg-[#1a2f3f] text-[#f3cc84] rounded-md text-sm max-w-md text-center">
            {loadingError}
            <button 
              onClick={() => window.location.reload()} 
              className="mt-2 text-[#16a7a1] hover:text-[#1ed3c2] font-medium"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1621]">
      <nav className="bg-[#0f1a24] border-b border-[#1a2f3f]">
        <div className="w-full px-4">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(true)}
                  className="mr-3 inline-flex items-center justify-center rounded-md p-2 text-[#7eb3b0] hover:bg-[#1a2f3f] focus:outline-none focus:ring-2 focus:ring-[#16a7a1]"
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
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white font-bold text-sm mr-3">X</div>
                <h1 className="text-xl font-bold text-white">Xhimer</h1>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-[#9fc3c1] mr-4">
                {profile?.first_name} {profile?.last_name}
              </span>
              {hasAdminBackup && isImpersonating && !isAdmin && (
                <button
                  onClick={handleReturnToAdmin}
                  className="mr-3 inline-flex items-center px-3 py-2 border border-[#1a2f3f] text-sm font-medium rounded-md text-[#9fc3c1] bg-[#0f1a24] hover:bg-[#1a2f3f]"
                >
                  Return to Admin
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => router.push('/admin')}
                  className="mr-3 inline-flex items-center px-3 py-2 border border-[#6366f1] text-sm font-medium rounded-md text-[#a5b4fc] bg-[#0f1a24] hover:bg-[#1e1b4b]"
                >
                  Admin
                </button>
              )}
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6366f1]"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className={`fixed inset-0 z-40 ${isMenuOpen ? '' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
            isMenuOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setIsMenuOpen(false)}
        />

        <div
          className={`absolute inset-y-0 left-0 w-64 max-w-[85vw] bg-[#0f1a24] border-r border-[#1a2f3f] shadow-2xl transform transition-transform duration-300 flex flex-col ${
            isMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-4 h-16 border-b border-[#1a2f3f]">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white font-bold text-sm">X</div>
              <span className="font-semibold text-white">Xhimer</span>
            </div>
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="inline-flex items-center justify-center rounded-md p-2 text-[#7eb3b0] hover:bg-[#1a2f3f] focus:outline-none focus:ring-2 focus:ring-[#16a7a1]"
              aria-label="Close navigation"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {navItems.map((item) => {
              const icons: Record<string, React.ReactNode> = {
                overview: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
                referrals: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
                commissions: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                packages: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
                users: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
              };
              return (
                <button
                  key={item.key}
                  onClick={() => selectTab(item.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === item.key
                      ? 'bg-[#1a2f3f] text-[#16a7a1]'
                      : 'text-[#7eb3b0] hover:bg-[#1a2f3f]/60 hover:text-white'
                  }`}
                >
                  {icons[item.key] ?? null}
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="p-4 border-t border-[#1a2f3f]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[#16a7a1] flex items-center justify-center text-white font-semibold">
                {profile?.first_name?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{profile?.first_name ?? 'User'}</p>
                <p className="text-xs text-[#7eb3b0] truncate">{profile?.role ?? 'user'}</p>
              </div>
              <button
                type="button"
                className="p-1.5 rounded-md text-[#7eb3b0] hover:bg-[#1a2f3f] hover:text-white"
                aria-label="More options"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="mt-6">
            {activeTab === 'overview' && (
              <>
                {renderReferralLink()}
                {renderAccountBalanceCard()}
                {renderTopUpCard()}
                {renderOverview()}
              </>
            )}
            {activeTab === 'referrals' && renderReferrals()}
            {activeTab === 'commissions' && <div ref={commissionsSectionRef}>{renderCommissions()}</div>}
            {activeTab === 'packages' && (
              <div ref={packagesSectionRef}>
                {userPackageRow && renderAccountBalanceCard()}
                {userPackageRow && renderTopUpCard()}
                {renderPackages()}
              </div>
            )}
            {activeTab === 'users' && isAdmin && renderUsers()}
            {activeTab === 'admin' && isAdmin && renderAdminPanel()}
          </div>
        </div>
      </main>
      {isTopUpHistoryOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <div className="absolute inset-0 bg-black/50" onClick={closeTopUpHistory} aria-hidden="true" />
          <div className="relative z-10">{renderTopUpHistoryModal()}</div>
        </div>
      ) : null}
      {isWithdrawalHistoryOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <div className="absolute inset-0 bg-black/50" onClick={closeWithdrawalHistory} aria-hidden="true" />
          <div className="relative z-10">{renderWithdrawalHistoryModal()}</div>
        </div>
      ) : null}
      {isAccountWithdrawalHistoryOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <div className="absolute inset-0 bg-black/50" onClick={closeAccountWithdrawalHistory} aria-hidden="true" />
          <div className="relative z-10">{renderAccountWithdrawalHistoryModal()}</div>
        </div>
      ) : null}
    </div>
  );
}
