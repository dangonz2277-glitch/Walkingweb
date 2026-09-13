import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { signSession } from '../../../src/lib/session';

import { createClient } from '@supabase/supabase-js';

async function rateLimit(ip) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  // Use default local service key if none provided for test environments
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Limit: 5 attempts per 3 seconds (very short window to allow tests to recover quickly)
  const { data, error } = await supabase.rpc('check_rate_limit', {
    client_ip: ip,
    max_attempts: 5,
    window_interval: '3 seconds'
  });

  if (error) {
    console.error('Rate limit error:', error);
    // Fall closed on database error to protect against brute force if DB is down
    return false;
  }
  return data;
}

export async function POST(request) {
  // Confiamos en el IP real que reporta Next.js o un header estándar para el gateway
  const ip = request.ip || request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  
  if (!(await rateLimit(ip))) {
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
    
    return response;
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: '/login?error=1' }
  });
}
