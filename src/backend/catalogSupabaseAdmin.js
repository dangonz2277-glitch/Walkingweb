import { createClient } from '@supabase/supabase-js';
import { getSecretKey } from '../utils/envUtils.js';

export function getCatalogAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = getSecretKey();
  
  if (!supabaseUrl || !secretKey) {
    throw new Error('CONFIG_ERROR: Missing Supabase credentials for Catalog');
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
