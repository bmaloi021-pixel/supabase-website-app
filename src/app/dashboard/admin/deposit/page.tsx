'use client';

import { useCallback, useEffect, useMemo, useState, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type PaymentType = 'gcash' | 'maya' | 'gotyme' | 'bank';

type FormState = {
  type: PaymentType;
  label: string;
  provider: string;
  accountName: string;
  accountLast4: string;
  phone: string;
  makeDefault: boolean;
  makePublic: boolean;
};

type AdminPaymentMethod = {
  id: string;
  type: string;
  label: string | null;
  provider: string | null;
  account_name: string | null;
  account_number_last4: string | null;
  phone: string | null;
  is_public: boolean;
  is_default: boolean;
  qr_code_path: string | null;
  qr_url?: string | null;
  created_at: string;
};

type Action = 'activate' | 'deactivate' | 'delete';

const DEFAULT_FORM_STATE: FormState = {
  type: 'gcash',
  label: '',
  provider: '',
  accountName: '',
  accountLast4: '',
  phone: '',
  makeDefault: true,
  makePublic: true,
};

const getDefaultProvider = (value: PaymentType) => {
  switch (value) {
    case 'gcash':
      return 'GCash';
    case 'maya':
      return 'Maya';
    case 'gotyme':
      return 'GoTyme Bank';
    default:
      return '';
  }
};

const PAYMENT_TYPES: PaymentType[] = ['gcash', 'maya', 'gotyme', 'bank'];

const isPaymentType = (value: string): value is PaymentType => PAYMENT_TYPES.includes(value as PaymentType);
const isWalletType = (type: PaymentType) => type === 'gcash' || type === 'maya';
const isGoTymeType = (type: PaymentType) => type === 'gotyme';
const isBankType = (type: PaymentType) => type === 'bank' || type === 'gotyme';

const validatePaymentForm = (state: FormState) => {
  const walletSelected = isWalletType(state.type);
  const goTymeSelected = isGoTymeType(state.type);
  const bankSelected = isBankType(state.type);

  if (walletSelected) {
    if (!state.accountName.trim()) {
      return 'Please provide an account name.';
    }
    if (!state.phone.trim()) {
      return `Please provide a ${state.type === 'gcash' ? 'GCash' : 'Maya'} number.`;
    }
  }

  if (bankSelected) {
    if (!state.accountName.trim()) {
      return 'Please provide an account name.';
    }
    if (!goTymeSelected && !state.provider.trim()) {
      return 'Please provide a bank name.';
    }
    const last4 = state.accountLast4.trim();
    if (!last4 || last4.length !== 4) {
      return 'Account last 4 digits must be exactly 4 numbers.';
    }
  }

  return null;
};

const buildNormalizedFields = (state: FormState) => {
  const walletSelected = isWalletType(state.type);
  const goTymeSelected = isGoTymeType(state.type);
  const bankSelected = isBankType(state.type);

  return {
    type: state.type,
    label: state.label.trim() || null,
    provider: walletSelected
      ? getDefaultProvider(state.type)
      : goTymeSelected
        ? getDefaultProvider('gotyme')
        : state.provider.trim() || null,
    account_name: walletSelected || bankSelected ? state.accountName.trim() || null : null,
    account_number_last4: bankSelected ? state.accountLast4.trim() || null : null,
    phone: walletSelected ? state.phone.trim() || null : null,
    is_public: !!state.makePublic,
    is_default: !!state.makeDefault,
  };
};

const methodToFormState = (method: AdminPaymentMethod): FormState => ({
  type: isPaymentType(method.type) ? method.type : 'gcash',
  label: method.label ?? '',
  provider: method.provider ?? '',
  accountName: method.account_name ?? '',
  accountLast4: method.account_number_last4 ?? '',
  phone: method.phone ?? '',
  makeDefault: method.is_default,
  makePublic: method.is_public,
});

type PaymentMethodFormProps = {
  state: FormState;
  error: string | null;
  success?: string | null;
  isSubmitting: boolean;
  submitLabel: string;
  onFieldChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onFileChange?: (file: File | null) => void;
  onSubmit: () => Promise<void>;
  secondaryLabel?: string;
  onSecondary?: () => void;
  showUpload?: boolean;
  requireAccountPhone?: boolean;
  requireUpload?: boolean;
};

const PaymentMethodForm = ({
  state,
  error,
  success,
  isSubmitting,
  submitLabel,
  onFieldChange,
  onFileChange,
  onSubmit,
  secondaryLabel,
  onSecondary,
  showUpload = false,
  requireAccountPhone = false,
  requireUpload = false,
}: PaymentMethodFormProps) => {
  const isWallet = state.type === 'gcash' || state.type === 'maya';
  const isGoTyme = state.type === 'gotyme';
  const isBank = state.type === 'bank' || isGoTyme;
  const mustRequireUpload = showUpload && requireUpload;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!onFileChange) return;
    const file = event.target.files?.[0] ?? null;
    onFileChange(file);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="rounded-[28px] border border-[#1f4e5a]/60 bg-[#07171f] p-6 shadow-[0_20px_35px_rgba(0,0,0,0.35)] space-y-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7eb3b0]">Type</label>
          <select
            value={state.type}
            onChange={(event) => onFieldChange('type', event.target.value as PaymentType)}
            className="mt-2 w-full rounded-2xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-sm text-white focus:border-[#0f5d63] focus:outline-none"
          >
            <option value="gcash">GCash</option>
            <option value="maya">Maya</option>
            <option value="gotyme">GoTyme Bank</option>
            <option value="bank">Other Bank</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7eb3b0]">Label</label>
          <input
            value={state.label}
            onChange={(event) => onFieldChange('label', event.target.value)}
            placeholder="e.g. Merchant 1"
            className="mt-2 w-full rounded-2xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#0f5d63] focus:outline-none"
          />
        </div>
      </div>

      {isWallet ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7eb3b0]">Account Name</label>
            <input
              value={state.accountName}
              onChange={(event) => onFieldChange('accountName', event.target.value)}
              placeholder="Juan Dela Cruz"
              required={requireAccountPhone}
              className="mt-2 w-full rounded-2xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#0f5d63] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7eb3b0]">Mobile Number</label>
            <input
              value={state.phone}
              onChange={(event) => onFieldChange('phone', event.target.value)}
              placeholder="09XXXXXXXXX"
              required={requireAccountPhone}
              className="mt-2 w-full rounded-2xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#0f5d63] focus:outline-none"
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7eb3b0]">Bank</label>
            <input
              value={isGoTyme ? 'GoTyme Bank' : state.provider}
              onChange={(event) => onFieldChange('provider', event.target.value)}
              placeholder="Bank Name"
              disabled={isGoTyme}
              className="mt-2 w-full rounded-2xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#0f5d63] focus:outline-none disabled:opacity-60"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7eb3b0]">Account Name</label>
            <input
              value={state.accountName}
              onChange={(event) => onFieldChange('accountName', event.target.value)}
              placeholder="Juan Dela Cruz"
              required={requireAccountPhone}
              className="mt-2 w-full rounded-2xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#0f5d63] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7eb3b0]">Acct # (last 4)</label>
            <input
              value={state.accountLast4}
              onChange={(event) => onFieldChange('accountLast4', event.target.value)}
              placeholder="1234"
              maxLength={4}
              className="mt-2 w-full rounded-2xl border border-[#1c3f4c] bg-[#08131b] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#0f5d63] focus:outline-none"
            />
          </div>
        </div>
      )}

      {showUpload && onFileChange ? (
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7eb3b0]">Upload QR</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            required={mustRequireUpload}
            className="mt-2 block w-full text-sm text-white file:mr-4 file:rounded-full file:border-0 file:bg-[#1c3f4c] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#285a68]"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-sm text-white">
          <input
            type="checkbox"
            checked={state.makeDefault}
            onChange={(event) => onFieldChange('makeDefault', event.target.checked)}
            className="rounded border-[#1c3f4c] bg-[#08131b]"
          />
          Make default
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-white">
          <input
            type="checkbox"
            checked={state.makePublic}
            onChange={(event) => onFieldChange('makePublic', event.target.checked)}
            className="rounded border-[#1c3f4c] bg-[#08131b]"
          />
          Make public
        </label>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{success}</div>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-2xl bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] px-6 py-3 text-sm font-semibold text-[#0a1217] shadow-[0_15px_30px_rgba(0,0,0,0.35)] disabled:opacity-40"
        >
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        {showUpload && onFileChange ? (
          <button
            type="button"
            onClick={() => onFileChange(null)}
            className="rounded-2xl border border-[#1c3f4c] px-6 py-3 text-sm font-semibold text-[#8fbab9]"
          >
            Clear Upload
          </button>
        ) : null}
        {secondaryLabel && onSecondary ? (
          <button
            type="button"
            onClick={onSecondary}
            className="rounded-2xl border border-[#1c3f4c] px-6 py-3 text-sm font-semibold text-[#8fbab9]"
          >
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </form>
  );
};

export default function AdminPaymentMethodsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isAuthorizing, setIsAuthorizing] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [methods, setMethods] = useState<AdminPaymentMethod[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(DEFAULT_FORM_STATE);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<FormState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<'name' | 'type' | 'status'>('name');
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const totalMethods = methods.length;
  const activeCount = useMemo(() => methods.filter((method) => method.is_public).length, [methods]);
  const inactiveCount = totalMethods - activeCount;

  const filteredMethods = useMemo(() => {
    const normalizedTerm = searchTerm.trim().toLowerCase();
    const list = methods.filter((method) => {
      if (showActiveOnly && !method.is_public) {
        return false;
      }
      if (!normalizedTerm) return true;
      const combined =
        `${method.provider ?? ''} ${method.label ?? ''} ${method.type} ${method.account_name ?? ''} ${method.phone ?? ''}`.toLowerCase();
      return combined.includes(normalizedTerm);
    });

    return [...list].sort((a, b) => {
      if (sortOption === 'type') {
        return a.type.localeCompare(b.type);
      }
      if (sortOption === 'status') {
        return Number(b.is_public) - Number(a.is_public);
      }
      const aLabel = a.label ?? a.provider ?? a.type;
      const bLabel = b.label ?? b.provider ?? b.type;
      return aLabel.localeCompare(bLabel);
    });
  }, [methods, searchTerm, sortOption, showActiveOnly]);

  const renderListContent = () => {
    if (isLoadingList && methods.length === 0) {
      return (
        <div className="rounded-2xl border border-[#1c3f4c] bg-[#0b1e27] px-6 py-12 text-center text-[#9fc3c1] mt-4">
          Loading payment methods…
        </div>
      );
    }

    if (filteredMethods.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-[#1c3f4c] bg-[#08131b] px-6 py-12 text-center mt-4">
          <p className="text-lg font-semibold text-white mb-2">No payment methods match your filters</p>
          <p className="text-sm text-[#9fc3c1]">Adjust your search or filter criteria to see existing methods.</p>
        </div>
      );
    }

    return (
      <div className="mt-4 space-y-4">
        {filteredMethods.map((method) => {
          const label = method.label ? `${method.provider ?? method.type} — ${method.label}` : method.provider ?? method.type;
          return (
            <div key={method.id} className="rounded-[26px] border border-[#1c3f4c]/60 bg-[#0b1e27] p-4 shadow-[0_20px_35px_rgba(0,0,0,0.35)]">
              <div className="grid gap-4 md:grid-cols-[2fr,1fr,1fr] md:items-center">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-[#132531] p-2 text-[#f3cc84]">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h12M4 17h8" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#7fb9b3]">{method.type}</p>
                    <h3 className="text-lg font-semibold text-white">{label}</h3>
                    <p className="text-xs text-[#9fc3c1] mt-1">
                      Added {new Date(method.created_at).toLocaleDateString()} • {method.is_default ? 'Default method' : 'Optional'}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-[#1c3f4c] bg-[#07161f] p-3 text-sm text-[#9fc3c1]">
                  {method.type === 'gcash' || method.type === 'maya' ? (
                    <>
                      <p className="font-semibold text-white">{method.account_name ?? '—'}</p>
                      <p className="text-xs">Number: {method.phone ?? '—'}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-white">{method.provider ?? method.type}</p>
                      <p className="text-xs">Acct: {method.account_number_last4 ? `****${method.account_number_last4}` : '—'}</p>
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${
                      method.is_public ? 'bg-[#173d2c] text-[#8ee4b8]' : 'bg-[#453310] text-[#f4cc7c]'
                    }`}
                  >
                    {method.is_public ? 'Active' : 'Inactive'}
                  </span>
                  {method.qr_url ? (
                    <img src={method.qr_url} alt={`${label} payment QR`} className="h-16 w-16 self-end rounded-xl border border-[#1c3f4c] object-cover" />
                  ) : (
                    <span className="text-[10px] uppercase tracking-[0.35em] text-[#4d6970] text-center">No QR</span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 border-t border-[#132633] pt-4">
                <button
                  onClick={() => handleEditClick(method)}
                  className={`inline-flex items-center rounded-2xl border border-[#1c3f4c] px-5 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#9fc3c1] hover:bg-[#132028] transition ${
                    editingId && editingId !== method.id ? 'opacity-60' : ''
                  }`}
                >
                  {editingId === method.id ? 'Close Edit' : 'Edit'}
                </button>
                <button
                  onClick={() => toggleMethodVisibility(method)}
                  disabled={workingId === method.id}
                  className={`inline-flex items-center rounded-2xl px-5 py-2 text-sm font-semibold uppercase tracking-[0.25em] transition ${
                    method.is_public
                      ? 'border border-[#f3cc84]/40 text-[#f3cc84] hover:bg-[#2a1f0d]'
                      : 'bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] text-[#0a1217]'
                  } disabled:opacity-40`}
                >
                  {workingId === method.id ? 'Working…' : method.is_public ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => deletePaymentMethod(method)}
                  disabled={workingId === method.id}
                  className="inline-flex items-center rounded-2xl border border-red-500/40 px-5 py-2 text-sm font-semibold uppercase tracking-[0.25ea] text-red-200 hover:bg-red-900/30 disabled:opacity-40"
                >
                  {workingId === method.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>

              {editingId === method.id && editState ? (
                <div className="mt-6 rounded-[26px] border border-dashed border-[#1c3f4c] bg-[#08131b]/80 p-5">
                  <PaymentMethodForm
                    state={editState}
                    error={editError}
                    isSubmitting={editSubmitting}
                    submitLabel="Update Method"
                    onFieldChange={handleEditFieldChange}
                    onSubmit={handleSaveEdit}
                    secondaryLabel="Cancel"
                    onSecondary={cancelEdit}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const resetForm = useCallback(() => {
    setFormState(DEFAULT_FORM_STATE);
    setQrFile(null);
    setFormError(null);
  }, []);

  const handleFieldChange = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleEditFieldChange = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setEditState((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditState(null);
    setEditError(null);
    setEditSubmitting(false);
  }, []);

  const handleEditClick = useCallback(
    (method: AdminPaymentMethod) => {
      if (editingId === method.id) {
        cancelEdit();
        return;
      }
      setEditingId(method.id);
      setEditState(methodToFormState(method));
      setEditError(null);
    },
    [editingId, cancelEdit]
  );

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push('/login');
          return;
        }

        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (!profileData || profileData.role !== 'admin') {
          router.push('/dashboard');
          return;
        }

        setUserId(session.user.id);
        setIsAuthorized(true);
      } finally {
        setIsAuthorizing(false);
      }
    };

    checkAuth();
  }, [router, supabase]);

  const fetchPaymentMethods = useCallback(async () => {
    setIsLoadingList(true);
    setActionError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch('/api/admin/payment-methods', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to load payment methods');
      }

      setMethods((payload?.methods ?? []) as AdminPaymentMethod[]);
    } catch (err) {
      setActionError((err as any)?.message ?? 'Failed to load payment methods');
    } finally {
      setIsLoadingList(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (isAuthorized) {
      fetchPaymentMethods();
    }
  }, [isAuthorized, fetchPaymentMethods]);

  const performAdminAction = useCallback(
    async (id: string, action: Action) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch('/api/admin/payment-methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, action }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to update payment method.');
      }

      return payload as { message?: string };
    },
    [supabase]
  );

  const handleCreatePaymentMethod = useCallback(async () => {
    if (!userId) {
      setFormError('Unable to determine your account. Please refresh the page.');
      return;
    }

    if (!qrFile) {
      setFormError('Please upload a QR code image.');
      return;
    }

    const validationError = validatePaymentForm(formState);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    setFormSuccess(null);
    setFormSubmitting(true);

    const normalized = buildNormalizedFields(formState);
    const payload: any = {
      user_id: userId,
      type: normalized.type,
      label: normalized.label,
      provider: normalized.provider,
      account_name: normalized.account_name,
      account_number_last4: normalized.account_number_last4,
      phone: normalized.phone,
      is_default: false,
      is_public: normalized.is_public,
    };

    try {
      const { data: inserted, error } = await supabase
        .from('payment_methods')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      if (formState.makeDefault && inserted?.id) {
        await supabase.from('payment_methods').update({ is_default: false }).eq('user_id', userId);
        await supabase.from('payment_methods').update({ is_default: true }).eq('id', inserted.id);
      }

      if (qrFile && inserted?.id) {
        const extension = (qrFile.name.split('.').pop() || 'png').toLowerCase();
        const objectPath = `${userId}/${inserted.id}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('payment-method-qr-codes')
          .upload(objectPath, qrFile, { upsert: true, contentType: qrFile.type || 'image/*' });

        if (uploadError) {
          throw uploadError;
        }

        const { error: updateError } = await supabase
          .from('payment_methods')
          .update({ qr_code_path: objectPath })
          .eq('id', inserted.id);

        if (updateError) {
          throw updateError;
        }
      }

      setFormSuccess('Payment method saved.');
      resetForm();
      await fetchPaymentMethods();
    } catch (err) {
      setFormError((err as any)?.message ?? 'Failed to create payment method.');
    } finally {
      setFormSubmitting(false);
    }
  }, [fetchPaymentMethods, formState, resetForm, supabase, userId, qrFile]);

  const handleSaveEdit = useCallback(async () => {
    if (!editState || !editingId) {
      return;
    }

    const validationError = validatePaymentForm(editState);
    if (validationError) {
      setEditError(validationError);
      return;
    }

    setEditSubmitting(true);
    setEditError(null);
    setActionError(null);
    setActionMessage(null);

    try {
      const normalized = buildNormalizedFields(editState);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch('/api/admin/payment-methods', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: editingId, updates: normalized }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to update payment method');
      }

      setActionMessage(payload?.message ?? 'Payment method updated.');
      cancelEdit();
      await fetchPaymentMethods();
    } catch (err) {
      setEditError((err as any)?.message ?? 'Failed to update payment method.');
    } finally {
      setEditSubmitting(false);
    }
  }, [editState, editingId, supabase, cancelEdit, fetchPaymentMethods]);

  const toggleMethodVisibility = async (method: AdminPaymentMethod) => {
    setWorkingId(method.id);
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await performAdminAction(method.id, method.is_public ? 'deactivate' : 'activate');
      setActionMessage(result?.message ?? (method.is_public ? 'Payment method deactivated.' : 'Payment method activated.'));
      await fetchPaymentMethods();
    } catch (err) {
      setActionError((err as any)?.message ?? 'Failed to update payment method status');
    } finally {
      setWorkingId(null);
    }
  };

  const deletePaymentMethod = async (method: AdminPaymentMethod) => {
    const confirmDelete = window.confirm(`Delete ${method.provider ?? method.type}? This action cannot be undone.`);
    if (!confirmDelete) return;

    setWorkingId(method.id);
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await performAdminAction(method.id, 'delete');
      setActionMessage(result?.message ?? 'Payment method deleted.');
      await fetchPaymentMethods();
    } catch (err) {
      setActionError((err as any)?.message ?? 'Failed to delete payment method');
    } finally {
      setWorkingId(null);
    }
  };

  if (isAuthorizing) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#050f15] via-[#071922] to-[#041017] flex items-center justify-center">
        <div className="text-white text-sm tracking-[0.3em] uppercase">Checking access…</div>
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

        <div className="max-w-6xl mx-auto space-y-6">
          <div className="rounded-[32px] border border-[#1f4e5a]/60 bg-gradient-to-br from-[#0c2735] via-[#0f3445] to-[#071720] p-8 shadow-[0_25px_45px_rgba(0,0,0,0.45)] space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-[#173042] p-3 text-[#f3cc84]">
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h10" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-[#7eb3b0]">Admin Overview</p>
                  <h1 className="text-3xl font-semibold text-white">Payment Methods</h1>
                  <p className="text-[#9fc3c1] mt-2">View all deposit methods and manage their status right from this panel.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsCreateOpen((prev) => !prev);
                  setFormError(null);
                  setFormSuccess(null);
                  if (!isCreateOpen) {
                    resetForm();
                  }
                }}
                className={`inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold shadow-[0_15px_30px_rgba(0,0,0,0.35)] ${isCreateOpen ? 'bg-[#1c2b30] text-[#9fc3c1]' : 'bg-gradient-to-r from-[#0f5d63] via-[#16a7a1] to-[#d4b673] text-[#0a1217]'}`}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                </svg>
                {isCreateOpen ? 'Close Form' : 'Add Payment Method'}
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-gradient-to-r from-[#1b73a1] to-[#2ab0c7] p-4 shadow-[0_20px_35px_rgba(0,0,0,0.35)]">
                <p className="text-xs uppercase tracking-[0.35em] text-white/70">Total Methods</p>
                <div className="mt-3 flex items-end justify-between">
                  <span className="text-4xl font-semibold text-white">{totalMethods}</span>
                  <svg className="h-8 w-8 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-r from-[#177341] to-[#38c680] p-4 shadow-[0_20px_35px_rgba(0,0,0,0.35)]">
                <p className="text-xs uppercase tracking-[0.35em] text-white/70">Active Methods</p>
                <div className="mt-3 flex items-end justify-between">
                  <span className="text-4xl font-semibold text-white">{activeCount}</span>
                  <svg className="h-8 w-8 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                  </svg>
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-r from-[#3d3b54] to-[#232236] p-4 shadow-[0_20px_35px_rgba(0,0,0,0.35)]">
                <p className="text-xs uppercase tracking-[0.35em] text-white/70">Inactive Methods</p>
                <div className="mt-3 flex items-end justify-between">
                  <span className="text-4xl font-semibold text-white">{inactiveCount}</span>
                  <svg className="h-8 w-8 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by provider, label, account name, or number…"
                  className="w-full rounded-2xl border border-[#1c3f4c] bg-[#08131b] pl-12 pr-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#0f5d63] focus:outline-none"
                />
                <svg
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7eb3b0]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16 16 5 5" strokeLinecap="round" />
                </svg>
              </div>
              <button
                onClick={() => setShowActiveOnly((prev) => !prev)}
                className={`inline-flex items-center justify-center rounded-2xl border px-5 py-3 text-sm font-semibold uppercase tracking-[0.3em] ${
                  showActiveOnly ? 'border-[#38c680] text-[#38c680]' : 'border-[#1c3f4c] text-[#9fc3c1]'
                }`}
              >
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M8 12h8M10 18h4" />
                </svg>
                {showActiveOnly ? 'Active Only' : 'All Status'}
              </button>
              <div className="flex items-center gap-2 rounded-2xl border border-[#1c3f4c] bg-[#08131b] px-4 py-2">
                <span className="text-xs uppercase tracking-[0.35em] text-[#7eb3b0]">Sort</span>
                <select
                  value={sortOption}
                  onChange={(event) => setSortOption(event.target.value as typeof sortOption)}
                  className="bg-transparent text-sm text-white focus:outline-none"
                >
                  <option value="name">By Name</option>
                  <option value="type">By Type</option>
                  <option value="status">By Status</option>
                </select>
              </div>
            </div>
          </div>

          {actionError ? (
            <div className="rounded-2xl border border-red-500/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">{actionError}</div>
          ) : null}
          {actionMessage ? (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{actionMessage}</div>
          ) : null}

          {isCreateOpen ? (
            <PaymentMethodForm
              state={formState}
              error={formError}
              success={formSuccess}
              isSubmitting={formSubmitting}
              submitLabel="Save Payment Method"
              onFieldChange={handleFieldChange}
              onFileChange={setQrFile}
              onSubmit={handleCreatePaymentMethod}
              showUpload
              requireAccountPhone
              requireUpload
            />
          ) : null}

          <div className="rounded-[32px] border border-[#1f4e5a]/60 bg-[#061019] p-6 shadow-[0_25px_45px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-2 border-b border-[#1c3f4c] pb-4 mb-4">
              <div className="flex items-center gap-3 text-[#f3cc84]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
                <p className="text-sm font-semibold uppercase tracking-[0.35em]">
                  All Payment Methods ({filteredMethods.length} of {totalMethods})
                </p>
              </div>
              <p className="text-xs text-[#9fc3c1]">List updates instantly when you add, edit, or deactivate a method.</p>
            </div>

            <div className="hidden md:grid grid-cols-[2fr,1fr,1fr] gap-4 rounded-2xl border border-[#1c3f4c] bg-[#091723] px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#7eb3b0]">
              <span>Payment Method</span>
              <span>Details</span>
              <span>Status</span>
            </div>

            {renderListContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
