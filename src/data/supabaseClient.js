import { createClient } from '@supabase/supabase-js';
import { getPublishableKey } from '../utils/envUtils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const publishableKey = getPublishableKey();

export const supabase = createClient(supabaseUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
