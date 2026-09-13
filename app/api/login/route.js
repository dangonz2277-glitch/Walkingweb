import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { signSession } from '../../../src/lib/session';

export async function POST(request) {
  const formData = await request.formData();
  const password = formData.get('password') || '';

  const sitePassword = process.env.SITE_PASSWORD;
  const sessionSecret = process.env.SITE_SESSION_SECRET;

  if (!sitePassword || !sessionSecret) {
    // Fail closed si faltan secretos
    return new NextResponse('Internal Server Error: Missing Secrets', { status: 500 });
  }

  // Constant time comparison
  const inputHash = crypto.createHash('sha256').update(password).digest();
  const expectedHash = crypto.createHash('sha256').update(sitePassword).digest();

  if (crypto.timingSafeEqual(inputHash, expectedHash)) {
    const sessionValue = await signSession({ auth: true }, sessionSecret);

    const url = request.nextUrl.clone();
    url.pathname = '/';
    const response = NextResponse.redirect(url, 303);
    
    // Configurar cookie segura (20 días de expiración)
    response.cookies.set('site_session', sessionValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 20
    });
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('error', '1');
  return NextResponse.redirect(url, 303);
}
