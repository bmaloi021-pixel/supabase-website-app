'use server';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type GetAdminClientResult = {
  adminClient?: ReturnType<typeof createClient<any, any, any>>;
  errorResponse?: NextResponse;
};

async function getAdminClientAndAssertAdmin(request: NextRequest): Promise<GetAdminClientResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      errorResponse: NextResponse.json({ error: 'Server misconfigured: missing Supabase credentials' }, { status: 500 }),
    };
  }

  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (!bearerToken) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const anonClient = createClient(url, anonKey);
  const {
    data: { user },
    error: userError,
  } = await anonClient.auth.getUser(bearerToken);

  if (!user) {
    if (userError) {
      return { errorResponse: NextResponse.json({ error: userError.message }, { status: 401 }) };
    }
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      ),
    };
  }

  const adminClient = createClient(url, serviceKey);
  const { data: myProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || myProfile?.role !== 'admin') {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { adminClient };
}

type RawCashflowEntry = {
  id: string;
  user_id: string | null;
  amount: number;
  status: string;
  status_notes?: string | null;
  created_at: string;
  processed_at?: string | null;
};

type EnrichedEntry = RawCashflowEntry & {
  username: string | null;
  payment_method_type: string | null;
};

const PAYMENT_METHOD_REGEX = /payment_method_id:([0-9a-f-]{36})/i;

const extractPaymentMethodId = (statusNotes?: string | null) => {
  if (!statusNotes) return null;
  const match = statusNotes.match(PAYMENT_METHOD_REGEX);
  return match?.[1] ?? null;
};

const hydrateCashflowEntries = async (
  adminClient: ReturnType<typeof createClient<any, any, any>>,
  entries: RawCashflowEntry[]
): Promise<EnrichedEntry[]> => {
  if (!entries.length) return [];

  const uniqueUserIds = Array.from(new Set(entries.map((entry) => entry.user_id).filter(Boolean))) as string[];
  const paymentMethodIds = Array.from(
    new Set(
      entries
        .map((entry) => extractPaymentMethodId(entry.status_notes))
        .filter(Boolean)
    )
  ) as string[];

  const [profilesResult, paymentMethodsResult] = await Promise.all([
    uniqueUserIds.length
      ? adminClient.from('profiles').select('id, username').in('id', uniqueUserIds)
      : Promise.resolve({ data: [], error: null }),
    paymentMethodIds.length
      ? adminClient.from('payment_methods').select('id, type').in('id', paymentMethodIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error) {
    throw profilesResult.error;
  }
  if (paymentMethodsResult.error) {
    throw paymentMethodsResult.error;
  }

  const usernameById = Object.fromEntries(
    (profilesResult.data ?? []).map((profile: any) => [profile.id, profile.username ?? null])
  );
  const paymentMethodTypeById = Object.fromEntries(
    (paymentMethodsResult.data ?? []).map((method: any) => [method.id, method.type ?? null])
  );

  return entries.map((entry) => {
    const paymentMethodId = extractPaymentMethodId(entry.status_notes);
    const paymentMethodType = paymentMethodId ? paymentMethodTypeById[paymentMethodId] ?? null : null;
    return {
      ...entry,
      username: entry.user_id ? usernameById[entry.user_id] ?? null : null,
      payment_method_type: paymentMethodType,
    };
  });
};

export async function GET(request: NextRequest) {
  const { adminClient, errorResponse } = await getAdminClientAndAssertAdmin(request);
  if (errorResponse || !adminClient) {
    return errorResponse!;
  }

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type');
  const limitParam = Number.parseInt(searchParams.get('limit') ?? '200', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 200;
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');
  const hasDateRange = Boolean(startParam && endParam);
  const effectiveLimit = hasDateRange ? Math.max(limit, 1000) : limit;

  if (type !== 'topups' && type !== 'withdrawals') {
    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
  }

  try {
    if (type === 'topups') {
      let query = adminClient
        .from('top_up_requests')
        .select('id, user_id, amount, status, status_notes, created_at')
        .order('created_at', { ascending: false })
        .limit(effectiveLimit);

      if (startParam) {
        query = query.gte('created_at', startParam);
      }
      if (endParam) {
        query = query.lt('created_at', endParam);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const enriched = await hydrateCashflowEntries(adminClient, (data as RawCashflowEntry[]) ?? []);
      return NextResponse.json({ entries: enriched });
    }

    let query = adminClient
      .from('withdrawal_requests')
      .select('id, user_id, amount, status, status_notes, created_at, processed_at')
      .order('created_at', { ascending: false })
      .limit(effectiveLimit);

    if (startParam) {
      query = query.gte('created_at', startParam);
    }
    if (endParam) {
      query = query.lt('created_at', endParam);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const enriched = await hydrateCashflowEntries(adminClient, (data as RawCashflowEntry[]) ?? []);
    return NextResponse.json({ entries: enriched });
  } catch (error) {
    console.error('AdminCashflowRouteError', error);
    return NextResponse.json(
      { error: (error as any)?.message ?? 'Failed to load cashflow entries' },
      { status: 500 }
    );
  }
}
