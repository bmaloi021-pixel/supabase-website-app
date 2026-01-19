import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type Role = 'admin' | 'user' | 'merchant' | 'accounting';

async function getAdminClientAndAssertAdmin(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
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
    data: { user },
    error,
  } = await anonClient.auth.getUser(bearerToken);

  if (!user) {
    return { errorResponse: NextResponse.json({ error: error?.message ?? 'Unauthorized' }, { status: 401 }) };
  }

  const serviceClient = createClient(url, serviceKey);
  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    return { errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { adminClient: serviceClient };
}

export async function GET(request: NextRequest) {
  const { adminClient, errorResponse } = await getAdminClientAndAssertAdmin(request);
  if (errorResponse) return errorResponse;

  const { data, error } = await adminClient
    .from('packages')
    .select('*')
    .order('level', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ packages: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { adminClient, errorResponse } = await getAdminClientAndAssertAdmin(request);
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { name, description, price, commission_rate, interest_rate, level, max_referrals, maturity_days } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Package name is required' }, { status: 400 });
  }

  const { error } = await adminClient.from('packages').insert({
    name: name.trim(),
    description: typeof description === 'string' ? description.trim() : null,
    price: Number(price) || 0,
    commission_rate: Number(commission_rate) || 0,
    interest_rate: Number(interest_rate) || 0,
    level: Number(level) || 0,
    max_referrals: max_referrals === null || max_referrals === '' ? null : Number(max_referrals) || 0,
    maturity_days: Number(maturity_days) || 0,
    is_active: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const { adminClient, errorResponse } = await getAdminClientAndAssertAdmin(request);
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const is_active = body?.is_active;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing package id' }, { status: 400 });
  }

  const { error } = await adminClient
    .from('packages')
    .update({ is_active: Boolean(is_active) })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { adminClient, errorResponse } = await getAdminClientAndAssertAdmin(request);
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => null);
  const id = body?.id;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing package id' }, { status: 400 });
  }

  const { error } = await adminClient.from('packages').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
