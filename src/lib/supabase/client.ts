import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from './types';

export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  }

  if (!supabaseKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  }

  // For @supabase/supabase-js@1.0.0, we can't use generic typing
  return createSupabaseClient(supabaseUrl, supabaseKey);
}
