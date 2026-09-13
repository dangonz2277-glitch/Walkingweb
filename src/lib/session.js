export async function signSession(payload, secretStr) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secretStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  const payloadStr = JSON.stringify({ ...payload, exp: Date.now() + 20 * 24 * 60 * 60 * 1000 }); // 20 days max
  const data = encoder.encode(payloadStr);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  
  // base64 encode using btoa for edge compatibility
  const payloadB64 = btoa(String.fromCharCode(...new Uint8Array(data))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signatureHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `${payloadB64}.${signatureHex}`;
}

export async function verifySession(cookieValue, secretStr) {
  if (!cookieValue || !cookieValue.includes('.')) return null;
  const [payloadB64, signatureHex] = cookieValue.split('.');
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secretStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );

  // Convert hex to Uint8Array
  const signature = new Uint8Array(signatureHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  
  // Reconstruct payload string from base64url
  let base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const payloadStr = atob(base64);
  const data = encoder.encode(payloadStr);

  const isValid = await crypto.subtle.verify('HMAC', key, signature, data);
  if (!isValid) return null;

  const payload = JSON.parse(payloadStr);
  if (payload.exp < Date.now()) return null; // Expired

  return payload;
}
