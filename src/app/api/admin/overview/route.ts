'use server';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Role = 'admin' | 'user' | 'merchant' | 'accounting';

type GetAdminClientResult = {
  // Using loose typing keeps this route flexible without having to re-export internal schema types
  adminClient?: ReturnType<typeof createClient<any, any, any>>;
  errorResponse?: NextResponse;
};

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

  const anonClient = createClient(url, anonKey);
  const {
    data: { user: userData },
    error: userError,
  } = await anonClient.auth.getUser(bearerToken);

  if (!userData) {
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
    .eq('id', userData.id)
    .single();

  if (profileError || myProfile?.role !== 'admin') {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { adminClient };
}

const toNumber = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

type DateRange = { start: string; end: string };

const getDateRange = (dateString?: string | null): DateRange | null => {
  if (!dateString) return null;
  const parsed = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const end = new Date(parsed);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: parsed.toISOString(), end: end.toISOString() };
};

const applyDateFilter = (query: any, column: string, range: DateRange | null) => {
  if (!range) return query;
  return query.gte(column, range.start).lt(column, range.end);
};

export async function GET(request: NextRequest) {
  const { adminClient, errorResponse } = await getAdminClientAndAssertAdmin(request);
  if (errorResponse || !adminClient) {
    return errorResponse!;
  }

  try {
    const dateRange = getDateRange(request.nextUrl.searchParams.get('date'));

    const profilesQuery = applyDateFilter(
      adminClient.from('profiles').select('id', { count: 'exact', head: true }),
      'created_at',
      dateRange
    );

    const referralsQuery = applyDateFilter(
      adminClient.from('referrals').select('id', { count: 'exact', head: true }),
      'created_at',
      dateRange
    );

    const topUpsQuery = applyDateFilter(
      adminClient.from('top_up_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      'created_at',
      dateRange
    );

    const withdrawalsQuery = applyDateFilter(
      adminClient.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      'processed_at',
      dateRange
    );

    const commissionsQuery = applyDateFilter(
      adminClient.from('commissions').select('amount, level, status, created_at').eq('status', 'paid'),
      'created_at',
      dateRange
    );

    let userPackagesCreatedQuery = applyDateFilter(
      adminClient.from('user_packages').select(
        `
        status,
        created_at,
        packages (
          price,
          commission_rate
        )
      `
      ),
      'created_at',
      dateRange
    );

    let userPackagesWithdrawnQuery = adminClient
      .from('user_packages')
      .select(
        `
        withdrawn_at,
        packages (
          price,
          commission_rate
        )
      `
      )
      .not('withdrawn_at', 'is', null);

    if (dateRange) {
      userPackagesWithdrawnQuery = userPackagesWithdrawnQuery.gte('withdrawn_at', dateRange.start).lt('withdrawn_at', dateRange.end);
    }

    const [
      profilesCountRes,
      referralsCountRes,
      approvedTopUpsRes,
      approvedWithdrawalsRes,
      commissionsRes,
      userPackagesCreatedRes,
      userPackagesWithdrawnRes,
    ] = await Promise.all([
      profilesQuery,
      referralsQuery,
      topUpsQuery,
      withdrawalsQuery,
      commissionsQuery,
      userPackagesCreatedQuery,
      userPackagesWithdrawnQuery,
    ]);

    const expectOk = (res: { error: any }) => {
      if (res.error) {
        throw res.error;
      }
    };

    expectOk(profilesCountRes);
    expectOk(referralsCountRes);
    expectOk(approvedTopUpsRes);
    expectOk(approvedWithdrawalsRes);
    expectOk(commissionsRes);
    expectOk(userPackagesCreatedRes);
    expectOk(userPackagesWithdrawnRes);

    const totalRegisteredUsers = profilesCountRes.count ?? 0;
    const totalReferrals = referralsCountRes.count ?? 0;
    const approvedReceiptsCount = approvedTopUpsRes.count ?? 0;
    const approvedWithdrawalsCount = approvedWithdrawalsRes.count ?? 0;

    const commissionRows = commissionsRes.data ?? [];
    let directReferral = 0;
    let indirectReferral = 0;
    let paidCommissionSum = 0;

    for (const row of commissionRows) {
      const amount = toNumber((row as any)?.amount);
      paidCommissionSum += amount;
      const level = toNumber((row as any)?.level);
      if (level === 1) {
        directReferral += amount;
      } else if (level > 1) {
        indirectReferral += amount;
      }
    }

    const userPackagesCreated = userPackagesCreatedRes.data ?? [];
    const userPackagesWithdrawn = userPackagesWithdrawnRes.data ?? [];
    let totalPackageValue = 0;
    let totalWithdrawn = 0;
    let activePackageCount = 0;

    for (const row of userPackagesCreated as any[]) {
      const price = toNumber(row?.packages?.price);
      const rate = toNumber(row?.packages?.commission_rate);
      const withProfit = price + (price * rate) / 100;
      totalPackageValue += withProfit;

      if ((row?.status as string)?.toLowerCase() === 'active') {
        activePackageCount += 1;
      }

    }

    for (const row of userPackagesWithdrawn as any[]) {
      if (!row?.withdrawn_at) continue;
      const price = toNumber(row?.packages?.price);
      const rate = toNumber(row?.packages?.commission_rate);
      const withProfit = price + (price * rate) / 100;
      totalWithdrawn += withProfit;
    }

    const totalActivatedPackages = userPackagesCreated.length;
    const totalEarnings = totalWithdrawn + paidCommissionSum;
    const salesDifference = totalEarnings - totalWithdrawn;

    return NextResponse.json({
      stats: {
        totalPackageValue,
        totalEarnings,
        totalWithdrawn,
        directReferral,
        indirectReferral,
        activePackageCount,
        approvedWithdrawalsCount,
        approvedReceiptsCount,
        salesDifference,
        totalRegisteredUsers,
        totalActivatedPackages,
        totalReferrals,
      },
    });
  } catch (error) {
    console.error('Admin overview fetch failed:', error);
    return NextResponse.json({ error: 'Failed to load admin overview stats' }, { status: 500 });
  }
}
