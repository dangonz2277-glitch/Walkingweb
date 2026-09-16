import { getSecretKey } from '../../../src/utils/envUtils';
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { signSession } from '../../../src/lib/session';
import { createClient } from '@supabase/supabase-js';

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
  let ip = request.ip;

  if (!ip) {
    if (process.env.IS_LOCAL_TEST === '1') {
      // Usado exclusivamente por gateway_test.js para probar la lógica de limitación.
      ip = request.headers.get('x-real-ip');
    } else {
      // Vercel u otros proxies seguros suelen sobrescribir x-forwarded-for con la IP real del cliente de forma inalterable.
      // Sin embargo, si esto no está garantizado, NO podemos confiar en x-forwarded-for o x-real-ip provenientes del cliente.
      const forwarded = request.headers.get('x-forwarded-for');
      if (forwarded && process.env.TRUST_FORWARDED_IP === '1') {
          ip = forwarded.split(',')[0].trim();
      }
    }
  }

  if (!ip || ip.trim() === '') {
    // Si no se puede garantizar una identidad de red inalterable, fallamos en estado cerrado.
    return new NextResponse('Internal Server Error: Unreliable Client Identity. Configure TRUST_FORWARDED_IP o use un runtime compatible con request.ip', { status: 500 });
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

  const sitePassword = process.env.SITE_PASSWORD;
  const sessionSecret = process.env.SITE_SESSION_SECRET;

  if (!sitePassword || !sessionSecret) {
    return new NextResponse('Internal Server Error: Missing Secrets', { status: 500 });
  }

  const inputHash = crypto.createHash('sha256').update(password).digest();
  const expectedHash = crypto.createHash('sha256').update(sitePassword).digest();

  if (crypto.timingSafeEqual(inputHash, expectedHash)) {
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
