export async function signSession(payload, secretStr) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secretStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  const payloadStr = JSON.stringify({ ...payload, exp: Date.now() + 20 * 24 * 60 * 60 * 1000 }); // 20 días max
  const data = encoder.encode(payloadStr);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  
  const payloadB64 = btoa(String.fromCharCode(...new Uint8Array(data))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signatureHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `${payloadB64}.${signatureHex}`;
}

export async function verifySession(cookieValue, secretStr) {
  if (!cookieValue || typeof cookieValue !== 'string' || cookieValue.length > 2000) return null;
  if (!cookieValue.includes('.')) return null;
  
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signatureHex] = parts;
  
  // Basic validation of signature format
  if (!/^[0-9a-fA-F]{64}$/.test(signatureHex)) return null;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secretStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );

    const signature = new Uint8Array(signatureHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    let base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    
    const payloadStr = atob(base64);
    const data = encoder.encode(payloadStr);

    const isValid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!isValid) return null;

    const payload = JSON.parse(payloadStr);
    
    // Check expiration
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;

    return payload;
  } catch {
    // Si falla el atob (InvalidCharacterError), o el JSON.parse, o cualquier manipulación de bytes
    return null;
  }
}
