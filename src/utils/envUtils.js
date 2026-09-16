export function getPublishableKey() {
  const isProd = process.env.NODE_ENV === 'production';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (key) return key;
  if (!isProd && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
  // No strict throw on client, let Supabase fail or just return empty if it's Next.js static build?
  // Actually, returning empty string was the old behavior. We'll throw so it fails fast.
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

export function getSecretKey() {
  const isProd = process.env.NODE_ENV === 'production';
  const key = process.env.SUPABASE_SECRET_KEY;
  if (key) return key;
  if (!isProd && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  throw new Error("Missing SUPABASE_SECRET_KEY");
}
