import crypto from 'crypto';
import { verifySession } from '../lib/session.js';

export function compareSitePassword(input) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) throw new Error("CONFIG_ERROR");
  if (typeof input !== 'string') return false;

  const h1 = crypto.createHash('sha256').update(input).digest();
  const h2 = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(h1, h2);
}

export async function requireAuthSession(req) {
  let token;
  if (req.cookies && typeof req.cookies.get === 'function') {
    token = req.cookies.get('site_session')?.value;
  } else {
    const cookieHeader = req.headers?.get('cookie') || '';
    const match = cookieHeader.match(/(?:^|;\s*)site_session=([^;]*)/);
    if (match) token = match[1];
  }

  if (!token) return { authorized: false };

  const secret = process.env.SITE_SESSION_SECRET;
  if (!secret) return { authorized: false };

  try {
    const payload = await verifySession(token, secret);
    if (payload && payload.auth === true) {
      const identHash = crypto.createHash('sha256').update(token).digest('hex');
      return { authorized: true, identHash };
    }
  } catch {
    // Ignorar errores
  }
  return { authorized: false };
}

export async function validateMutationRequest(req) {
  const ctypeHeader = req.headers?.get('content-type') || '';
  const ctype = ctypeHeader.split(';')[0].trim().toLowerCase();
  if (ctype !== 'application/json') {
    return { error: 'INVALID_CONTENT_TYPE', status: 400 };
  }

  const origin = req.headers?.get('origin');
  if (!origin) return { error: 'MISSING_ORIGIN', status: 403 };

  let reqOrigin;
  try {
    reqOrigin = new URL(req.url).origin;
  } catch {
    return { error: 'INVALID_URL', status: 400 };
  }
  
  if (origin !== reqOrigin) return { error: 'INVALID_ORIGIN', status: 403 };

  const clenHeader = req.headers?.get('content-length');
  if (clenHeader) {
    if (!/^\d+$/.test(clenHeader)) {
      return { error: 'INVALID_CONTENT_LENGTH', status: 400 };
    }
    const len = parseInt(clenHeader, 10);
    if (len > 200000) return { error: 'PAYLOAD_TOO_LARGE', status: 413 };
  }

  let text;
  try {
    text = await req.text();
  } catch {
    return { error: 'INVALID_BODY', status: 400 };
  }

  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength > 200000) return { error: 'PAYLOAD_TOO_LARGE', status: 413 };

  try {
    const json = JSON.parse(text);
    return { json };
  } catch {
    return { error: 'INVALID_JSON', status: 400 };
  }
}
