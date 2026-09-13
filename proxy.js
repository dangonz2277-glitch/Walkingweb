import { NextResponse } from 'next/server';

export function proxy(request) {
  const path = request.nextUrl.pathname;
  
  if (path === '/login' || path === '/api/login') {
    return NextResponse.next();
  }

  const session = request.cookies.get('site_session');
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  // Proteger TODO excepto login y la ruta API de login
  matcher: '/((?!login|api/login).*)',
};
