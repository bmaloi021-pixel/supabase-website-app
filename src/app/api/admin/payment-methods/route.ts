'use server';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type AdminClientResult = {
  adminClient: SupabaseClient | null;
  errorResponse: NextResponse | null;
};

type Action = 'activate' | 'deactivate' | 'delete';
type EditableField =
  | 'type'
  | 'label'
  | 'provider'
  | 'account_name'
  | 'account_number_last4'
  | 'phone'
  | 'is_public'
  | 'is_default';

async function getAdminClient(request: NextRequest): Promise<AdminClientResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      adminClient: null,
      errorResponse: NextResponse.json(
        { error: 'Server misconfigured: missing Supabase credentials' },
        { status: 500 }
      ),
    };
  }

  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!bearerToken) {
    return { adminClient: null, errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const anonClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: sessionData, error: sessionError } = await anonClient.auth.getUser(bearerToken);
  const sessionUser = sessionData?.user;

  if (!sessionUser) {
    return {
      adminClient: null,
      errorResponse: NextResponse.json({ error: sessionError?.message ?? 'Unauthorized' }, { status: 401 }),
    };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return {
      adminClient: null,
      errorResponse: NextResponse.json(
        { error: 'Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      ),
    };
  }

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', sessionUser.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    return { adminClient: null, errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { adminClient, errorResponse: null };
}

export async function GET(request: NextRequest) {
  const { adminClient, errorResponse } = await getAdminClient(request);
  if (!adminClient || errorResponse) {
    return errorResponse!;
  }

  try {
    const { data, error } = await adminClient
      .from('payment_methods')
      .select('id,type,label,provider,account_name,account_number_last4,phone,is_public,is_default,qr_code_path,created_at')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const methods = await Promise.all(
      (data ?? []).map(async (method) => {
        let qrUrl: string | null = null;
        if (method.qr_code_path) {
          const { data: signed, error: signedError } = await adminClient.storage
            .from('payment-method-qr-codes')
            .createSignedUrl(method.qr_code_path, 3600);
          if (!signedError && signed?.signedUrl) {
            qrUrl = signed.signedUrl;
          }
        }
        return { ...method, qr_url: qrUrl };
      })
    );

    return NextResponse.json({ methods });
  } catch (error) {
    console.error('Admin payment method fetch failed:', error);
    return NextResponse.json({ error: 'Failed to load payment methods' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { adminClient, errorResponse } = await getAdminClient(request);
  if (!adminClient || errorResponse) {
    return errorResponse!;
  }

  let body: { id?: string; action?: Action };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, action } = body ?? {};
  if (!id || !action) {
    return NextResponse.json({ error: 'id and action are required' }, { status: 400 });
  }

  try {
    if (action === 'delete') {
      const { error } = await adminClient.from('payment_methods').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Payment method deleted.', id });
    }

    const nextIsPublic = action === 'activate';
    const { error } = await adminClient.from('payment_methods').update({ is_public: nextIsPublic }).eq('id', id);
    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: nextIsPublic ? 'Payment method activated.' : 'Payment method deactivated.',
      id,
      is_public: nextIsPublic,
    });
  } catch (error) {
    console.error('Admin payment method update failed:', error);
    return NextResponse.json({ error: 'Failed to update payment method' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { adminClient, errorResponse } = await getAdminClient(request);
  if (!adminClient || errorResponse) {
    return errorResponse!;
  }

  let body: { id?: string; updates?: Partial<Record<EditableField, unknown>> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, updates } = body ?? {};
  if (!id || !updates || typeof updates !== 'object') {
    return NextResponse.json({ error: 'id and updates are required' }, { status: 400 });
  }

  const allowedFields: EditableField[] = [
    'type',
    'label',
    'provider',
    'account_name',
    'account_number_last4',
    'phone',
    'is_public',
    'is_default',
  ];

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key as EditableField)) {
      sanitized[key] = value;
    }
  }

  if (Object.keys(sanitized).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided for update' }, { status: 400 });
  }

  try {
    if (sanitized.is_default === true) {
      const { data: methodRecord, error: fetchError } = await adminClient
        .from('payment_methods')
        .select('user_id')
        .eq('id', id)
        .single();

      if (fetchError || !methodRecord?.user_id) {
        throw fetchError ?? new Error('Payment method not found');
      }

      await adminClient
        .from('payment_methods')
        .update({ is_default: false })
        .eq('user_id', methodRecord.user_id)
        .neq('id', id);
    }

    const { error } = await adminClient.from('payment_methods').update(sanitized).eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Payment method updated.', id });
  } catch (error) {
    console.error('Admin payment method edit failed:', error);
    return NextResponse.json({ error: 'Failed to edit payment method' }, { status: 500 });
  }
}
