'use server';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type GetAdminClientResult = {
  adminClient?: ReturnType<typeof createClient<any, any, any>>;
  errorResponse?: NextResponse;
};

type SupabaseAuthUser = {
  id: string;
  [key: string]: any;
};

async function getUserFromBearerToken(args: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  bearerToken: string;
}): Promise<{ user: SupabaseAuthUser | null; errorMessage?: string }> {
  const res = await fetch(`${args.supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: args.supabaseAnonKey,
      Authorization: `Bearer ${args.bearerToken}`,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({} as any));
    return {
      user: null,
      errorMessage:
        (json as any)?.msg ??
        (json as any)?.error_description ??
        (json as any)?.message ??
        'Unauthorized',
    };
  }

  const user = (await res.json().catch(() => null)) as SupabaseAuthUser | null;
  if (!user?.id) {
    return { user: null, errorMessage: 'Unauthorized' };
  }

  return { user };
}

async function getAdminClientAndAssertAdmin(request: NextRequest): Promise<GetAdminClientResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Server misconfigured: missing Supabase credentials' },
        { status: 500 }
      ),
    };
  }

  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (!bearerToken) {
    return { errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { user, errorMessage: userErrorMessage } = await getUserFromBearerToken({
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    bearerToken,
  });

  if (!user) {
    return {
      errorResponse: NextResponse.json({ error: userErrorMessage ?? 'Unauthorized' }, { status: 401 }),
    };
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

type DateRange = { start: string; end: string; date: string };

const getDateRange = (dateString?: string | null): DateRange | null => {
  if (!dateString) return null;
  const parsed = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const end = new Date(parsed);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: parsed.toISOString(), end: end.toISOString(), date: dateString };
};

const toNumber = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const toMonthKeyUTC = (d: Date) => {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

export async function GET(request: NextRequest) {
  const { adminClient, errorResponse } = await getAdminClientAndAssertAdmin(request);
  if (errorResponse || !adminClient) {
    return errorResponse!;
  }

  const mode = request.nextUrl.searchParams.get('mode');
  const bucket = request.nextUrl.searchParams.get('bucket');
  if (mode === 'series') {
    try {
      const [topUpsRes, payoutsRes] = await Promise.all([
        adminClient
          .from('top_up_requests')
          .select('amount, created_at')
          .eq('status', 'approved'),
        adminClient
          .from('withdrawal_requests')
          .select('amount, processed_at')
          .eq('status', 'approved'),
      ]);

      if (topUpsRes.error) {
        throw topUpsRes.error;
      }
      if (payoutsRes.error) {
        throw payoutsRes.error;
      }

      if (bucket !== 'month') {
        return NextResponse.json({ error: 'Invalid bucket parameter' }, { status: 400 });
      }

      const salesByMonth = new Map<string, number>();
      for (const row of topUpsRes.data ?? []) {
        const createdAt = (row as any)?.created_at as string | undefined;
        if (!createdAt) continue;
        const key = toMonthKeyUTC(new Date(createdAt));
        salesByMonth.set(key, (salesByMonth.get(key) ?? 0) + toNumber((row as any)?.amount));
      }

      const payoutByMonth = new Map<string, number>();
      for (const row of payoutsRes.data ?? []) {
        const processedAt = (row as any)?.processed_at as string | undefined;
        if (!processedAt) continue;
        const key = toMonthKeyUTC(new Date(processedAt));
        payoutByMonth.set(key, (payoutByMonth.get(key) ?? 0) + toNumber((row as any)?.amount));
      }

      const months = Array.from(new Set([...salesByMonth.keys(), ...payoutByMonth.keys()])).sort();
      const series = months.map((m) => {
        const totalSales = salesByMonth.get(m) ?? 0;
        const totalPayout = payoutByMonth.get(m) ?? 0;
        const totalRevenue = totalSales - totalPayout;
        return { date: m, totalSales, totalPayout, totalRevenue };
      });

      return NextResponse.json({ series });
    } catch (error) {
      console.error('AdminPayoutCalendarSeriesRouteError', error);
      return NextResponse.json(
        { error: (error as any)?.message ?? 'Failed to load payout calendar series' },
        { status: 500 }
      );
    }
  }

  const dateParam = request.nextUrl.searchParams.get('date');
  const range = getDateRange(dateParam);

  if (!range) {
    return NextResponse.json({ error: 'Invalid date parameter' }, { status: 400 });
  }

  try {
    const [topUpsRes, payoutsRes] = await Promise.all([
      adminClient
        .from('top_up_requests')
        .select('amount, created_at')
        .eq('status', 'approved')
        .gte('created_at', range.start)
        .lt('created_at', range.end),
      adminClient
        .from('withdrawal_requests')
        .select('amount, processed_at, created_at')
        .eq('status', 'approved')
        .gte('processed_at', range.start)
        .lt('processed_at', range.end),
    ]);

    if (topUpsRes.error) {
      throw topUpsRes.error;
    }
    if (payoutsRes.error) {
      throw payoutsRes.error;
    }

    const totalSales = (topUpsRes.data ?? []).reduce((sum: number, row: any) => sum + toNumber(row?.amount), 0);
    const totalPayout = (payoutsRes.data ?? []).reduce((sum: number, row: any) => sum + toNumber(row?.amount), 0);
    const totalRevenue = totalSales - totalPayout;

    return NextResponse.json({
      stats: {
        date: range.date,
        totalSales,
        totalPayout,
        totalRevenue,
      },
    });
  } catch (error) {
    console.error('AdminPayoutCalendarRouteError', error);
    return NextResponse.json(
      { error: (error as any)?.message ?? 'Failed to load payout calendar stats' },
      { status: 500 }
    );
  }
}
