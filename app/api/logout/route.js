import { NextResponse } from 'next/server';

export async function POST(request) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  const response = NextResponse.redirect(url, 303);
  response.cookies.delete('site_session');
  return response;
}
