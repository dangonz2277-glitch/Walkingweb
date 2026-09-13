import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { signSession } from '../../../src/lib/session';

const attemptsMap = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minuto
  const maxAttempts = 5;

  const record = attemptsMap.get(ip) || { count: 0, firstAttempt: now };
  if (now - record.firstAttempt > windowMs) {
    record.count = 1;
    record.firstAttempt = now;
  } else {
    record.count++;
  }
  attemptsMap.set(ip, record);

  // Limpiar entradas antiguas (garbage collection simple)
  if (attemptsMap.size > 1000) {
    for (const [key, value] of attemptsMap.entries()) {
      if (now - value.firstAttempt > windowMs) attemptsMap.delete(key);
    }
  }

  return record.count <= maxAttempts;
}

export async function POST(request) {
  const ip = request.headers.get('x-forwarded-for') || request.ip || 'unknown';
  
  if (!rateLimit(ip)) {
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
    
    // Limpiar intentos tras un login exitoso
    attemptsMap.delete(ip);
    return response;
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: '/login?error=1' }
  });
}
