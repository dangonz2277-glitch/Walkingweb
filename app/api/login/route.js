import { resolveClientIp } from '../../../src/backend/ipUtils.js';
import { getSecretKey } from '../../../src/utils/envUtils';
import { NextResponse } from 'next/server';
import { signSession } from '../../../src/lib/session';
import { createClient } from '@supabase/supabase-js';
import { compareSitePassword } from '../../../src/backend/routeSecurity.js';

async function rateLimit(ip) {
  const supabaseUrl = process.env.SUPABASE_URL;

  const serviceRoleKey = getSecretKey();

  if (!supabaseUrl || !serviceRoleKey) {
    // Fail closed si no hay credenciales (no se permiten logins sin rate limit)
    throw new Error('Missing Supabase credentials for rate limiting');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const windowInterval = process.env.RATE_LIMIT_WINDOW || '1 minute';
  const { data, error } = await supabase.rpc('check_rate_limit', {
    client_ip: ip,
    max_attempts: 5,
    window_interval: windowInterval
  });

  if (error) {
    console.error('Rate limit error:', error);
    return false; // Fall closed en caso de error
  }
  return data;
}

async function resetRateLimit(ip) {
  const supabaseUrl = process.env.SUPABASE_URL;

  const serviceRoleKey = getSecretKey();
  if (!supabaseUrl || !serviceRoleKey) return;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  await supabase.rpc('reset_rate_limit', { client_ip: ip });
}

export async function POST(request) {
  const ip = resolveClientIp(request, process.env);

  if (!ip || ip.trim() === '') {
    // Si no se puede garantizar una identidad de red inalterable, fallamos en estado cerrado.
    return new NextResponse('Internal Server Error: Unreliable Client Identity. Configure TRUST_FORWARDED_IP, VERCEL=1, o use un runtime compatible con request.ip', { status: 500 });
  }

  let allowed;
  try {
    allowed = await rateLimit(ip);
  } catch {
    return new NextResponse('Internal Server Error: Missing Secrets', { status: 500 });
  }

  if (!allowed) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  const formData = await request.formData();
  const password = formData.get('password') || '';

  const sessionSecret = process.env.SITE_SESSION_SECRET;

  if (!sessionSecret) {
    return new NextResponse('Internal Server Error: Missing Secrets', { status: 500 });
  }

  let isMatch = false;
  try {
    isMatch = compareSitePassword(password);
  } catch (error) {
    if (error.message === "CONFIG_ERROR") {
      return new NextResponse('Internal Server Error: Missing Secrets', { status: 500 });
    }
  }

  if (isMatch) {
    const sessionValue = await signSession({ auth: true }, sessionSecret);

    const response = new NextResponse(null, {
      status: 303,
      headers: { Location: '/' }
    });

    response.cookies.set('site_session', sessionValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 20
    });

    // Limpiar intentos para que otros en la misma IP no sean bloqueados injustamente
    await resetRateLimit(ip);

    return response;
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: '/login?error=1' }
  });
}
