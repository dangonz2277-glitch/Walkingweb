import { NextResponse } from 'next/server';

export async function POST(request) {
  const formData = await request.formData();
  const password = formData.get('password');

  // En producción, esto debe venir de process.env.SITE_PASSWORD
  const sitePassword = process.env.SITE_PASSWORD || 'local-test-password';

  if (password === sitePassword) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    const response = NextResponse.redirect(url, 303);
    // Secure HTTPOnly cookie
    response.cookies.set('site_session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 // 24 hours
    });
    return response;
  }

  // Fallo de contraseña
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('error', '1');
  return NextResponse.redirect(url, 303);
}
