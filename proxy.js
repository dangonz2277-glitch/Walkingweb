import { NextResponse } from 'next/server';
import { verifySession } from './src/lib/session';

export async function proxy(request) {
  const path = request.nextUrl.pathname;
  
  // Rutas exentas de autenticación
  if (
    path === '/login' || 
    path === '/api/login' || 
    path.startsWith('/_next/') || 
    path === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('site_session')?.value;
  const sessionSecret = process.env.SITE_SESSION_SECRET;

  if (!sessionSecret) {
    return new NextResponse('Internal Server Error: Missing SITE_SESSION_SECRET', { status: 500 });
  }

  // Verificar la firma de la cookie y su expiración
  const payload = await verifySession(sessionCookie, sessionSecret);

  if (!payload || !payload.auth) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  // Interceptar todas las rutas y decidir en código
  matcher: '/:path*',
};
