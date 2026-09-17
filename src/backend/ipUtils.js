import { isIP } from 'node:net';

export function resolveClientIp(request, env) {
  // En Next.js Request (basado en Fetch API), headers.get() devuelve null si no existe.
  const getHeader = (name) => request.headers.get(name) || '';
  
  let rawIp = null;
  
  if (env.VERCEL === '1') {
    // En Vercel, x-vercel-forwarded-for es la fuente primaria garantizada.
    // Como respaldo en algunos entornos directos de Vercel, x-forwarded-for es sobrescrita y segura.
    rawIp = getHeader('x-vercel-forwarded-for') || getHeader('x-forwarded-for');
  } else {
    // Fuera de Vercel
    if (request.ip) {
      rawIp = request.ip;
    } else if (env.IS_LOCAL_TEST === '1') {
      rawIp = getHeader('x-real-ip');
    } else if (env.TRUST_FORWARDED_IP === '1') {
      rawIp = getHeader('x-forwarded-for');
    }
  }
  
  if (!rawIp) return null;
  
  // Normalizar listas separadas por comas tomando el primero no vacío
  const ips = rawIp.split(',').map(ip => ip.trim()).filter(Boolean);
  if (ips.length === 0) return null;
  
  const ip = ips[0];
  
  // Rechazar valores mayores a 45 caracteres (longitud máxima razonable para IPv6 mapeada)
  if (ip.length > 45) {
    return null;
  }
  
  // Rechazar cualquier valor que no sea estrictamente IPv4 o IPv6
  if (isIP(ip) === 0) {
    return null;
  }
  
  return ip;
}
