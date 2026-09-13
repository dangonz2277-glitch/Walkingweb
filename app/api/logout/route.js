import { NextResponse } from 'next/server';

export async function POST(request) {
  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  response.cookies.delete('site_session');
  return response;
}
