import { NextResponse } from 'next/server';

export async function GET(request) {
  return NextResponse.json({
    "request.ip": request.ip || null,
    "x-real-ip": request.headers.get('x-real-ip') || null,
    "x-forwarded-for": request.headers.get('x-forwarded-for') || null,
    "host": request.headers.get('host') || null,
    "message": "Usa este endpoint en HTTPS Preview enviando cabeceras personalizadas para verificar si el proxy las sobrescribe."
  });
}
