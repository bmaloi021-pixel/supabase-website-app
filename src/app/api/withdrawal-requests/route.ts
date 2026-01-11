import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Create a new withdrawal request
export async function POST(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceKey) {
      return NextResponse.json(
        { error: 'Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      )
    }

    const authHeader = request.headers.get('authorization')
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null

    if (!bearerToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(url, anonKey)
    const serviceClient = createClient(url, serviceKey)
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser(bearerToken)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { amount, payment_method_info } = body

    // Validate input
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 })
    }

    // Get user profile to check withdrawable balance
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('withdrawable_balance')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Check if user has sufficient withdrawable balance
    const withdrawableBalance = Number((profile as any)?.withdrawable_balance) || 0
    if (withdrawableBalance < amount) {
      return NextResponse.json({ 
        error: 'Insufficient balance',
        available_balance: withdrawableBalance
      }, { status: 400 })
    }

    // Create withdrawal request
    const { data: withdrawalRequest, error: insertError } = await serviceClient
      .from('withdrawal_requests')
      .insert({
        user_id: user.id,
        amount: Number(amount),
        payment_method_info,
        status: 'pending'
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating withdrawal request:', insertError)
      return NextResponse.json({ error: 'Failed to create withdrawal request' }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Withdrawal request created successfully',
      withdrawal_request: withdrawalRequest
    })

  } catch (error) {
    console.error('Error in withdrawal request POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Get withdrawal requests for authenticated user
export async function GET(request: NextRequest) {
  console.log('=== GET /api/withdrawal-requests START ===')
  
  try {
    console.log('1. Getting environment variables...')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    console.log('Environment vars:', { url: !!url, anonKey: !!anonKey })

    console.log('2. Extracting auth header...')
    const authHeader = request.headers.get('authorization')
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
    console.log('Auth status:', { hasAuthHeader: !!authHeader, hasBearerToken: !!bearerToken })

    if (!bearerToken) {
      console.log('ERROR: No bearer token')
      return NextResponse.json({ error: 'Unauthorized - No token' }, { status: 401 })
    }

    console.log('3. Creating supabase client...')
    const supabase = createClient(url, anonKey)
    
    console.log('4. Getting authenticated user...')
    const { data: { user }, error: authError } = await supabase.auth.getUser(bearerToken)
    console.log('Auth result:', { user: !!user, userId: user?.id, authError })
    
    if (authError || !user) {
      console.log('ERROR: Auth failed', { authError, user: !!user })
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 })
    }

    console.log('5. Querying withdrawal_requests table...')
    const { data: withdrawalRequests, error } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    console.log('Query result:', { 
      data: withdrawalRequests, 
      error,
      dataLength: withdrawalRequests?.length 
    })

    if (error) {
      console.error('ERROR: Database query failed:', error)
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 })
    }

    console.log('6. Success - returning data')
    return NextResponse.json({ withdrawal_requests: withdrawalRequests || [] })

  } catch (error) {
    console.error('ERROR: Unexpected exception in GET:', error)
    return NextResponse.json({ error: `Server error: ${error}` }, { status: 500 })
  }
}
