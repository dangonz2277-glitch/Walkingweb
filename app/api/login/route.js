import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { signSession } from '../../../src/lib/session';
import { createClient } from '@supabase/supabase-js';

async function rateLimit(ip) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  await supabase.rpc('reset_rate_limit', { client_ip: ip });
}

export async function POST(request) {
  // Identidad confiable: IP asegurada por Vercel (request.ip) o por el proxy configurado en la plataforma (x-real-ip)
  const ip = request.ip || request.headers.get('x-real-ip');
  
  if (!ip || ip.trim() === '') {
    return new NextResponse('Internal Server Error: Unreliable Client Identity', { status: 500 });
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
