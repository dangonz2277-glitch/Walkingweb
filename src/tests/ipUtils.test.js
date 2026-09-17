import { describe, it, expect } from 'vitest';
import { resolveClientIp } from '../backend/ipUtils.js';

describe('resolveClientIp', () => {
  const createReq = (ip, headersRecord = {}) => {
    return {
      ip,
      headers: {
        get: (name) => headersRecord[name] || null
      }
    };
  };

  it('Vercel mode: prioriza x-vercel-forwarded-for', () => {
    const req = createReq(null, {
      'x-vercel-forwarded-for': '203.0.113.1',
      'x-forwarded-for': '198.51.100.1'
    });
    expect(resolveClientIp(req, { VERCEL: '1' })).toBe('203.0.113.1');
  });

  it('Vercel mode: permite x-forwarded-for si x-vercel-forwarded-for falta', () => {
    const req = createReq(null, {
      'x-forwarded-for': '198.51.100.1'
    });
    expect(resolveClientIp(req, { VERCEL: '1' })).toBe('198.51.100.1');
  });

  it('Vercel mode: falla si faltan ambas cabeceras', () => {
    const req = createReq(null, {});
    expect(resolveClientIp(req, { VERCEL: '1' })).toBeNull();
  });

  it('Fuera de Vercel: conserva request.ip si existe', () => {
    const req = createReq('192.168.1.10', {
      'x-forwarded-for': 'malicious-ip'
    });
    expect(resolveClientIp(req, {})).toBe('192.168.1.10');
  });

  it('Fuera de Vercel (local mode): permite x-real-ip', () => {
    const req = createReq(null, {
      'x-real-ip': '127.0.0.1',
      'x-forwarded-for': 'malicious'
    });
    expect(resolveClientIp(req, { IS_LOCAL_TEST: '1' })).toBe('127.0.0.1');
  });

  it('Fuera de Vercel (trust forwarded): permite x-forwarded-for', () => {
    const req = createReq(null, {
      'x-forwarded-for': '10.0.0.5'
    });
    expect(resolveClientIp(req, { TRUST_FORWARDED_IP: '1' })).toBe('10.0.0.5');
  });

  it('Fuera de Vercel: cabeceras manipulables se ignoran si no hay confianza', () => {
    const req = createReq(null, {
      'x-forwarded-for': '10.0.0.5',
      'x-real-ip': '10.0.0.6'
    });
    // Missing IS_LOCAL_TEST=1 or TRUST_FORWARDED_IP=1
    expect(resolveClientIp(req, {})).toBeNull();
  });

  it('Normaliza listas separadas por comas y valida', () => {
    const req = createReq(null, {
      'x-vercel-forwarded-for': ' 1.1.1.1 , 2.2.2.2'
    });
    expect(resolveClientIp(req, { VERCEL: '1' })).toBe('1.1.1.1');
  });
  
  it('Ignora valores vacíos en listas separadas por comas', () => {
    const req = createReq(null, {
      'x-forwarded-for': ' , , 3.3.3.3, 4.4.4.4'
    });
    expect(resolveClientIp(req, { TRUST_FORWARDED_IP: '1' })).toBe('3.3.3.3');
  });

  it('Rechaza entrada sobredimensionada (> 45 caracteres)', () => {
    const hugeIp = '2001:0db8:85a3:0000:0000:8a2e:0370:7334:1234567890';
    const req = createReq(hugeIp, {});
    expect(resolveClientIp(req, {})).toBeNull();
  });

  it('Rechaza texto arbitrario (no es IP)', () => {
    const req = createReq('not-an-ip-address', {});
    expect(resolveClientIp(req, {})).toBeNull();
  });

  it('Permite IPv4 válida', () => {
    const req = createReq('192.168.1.1', {});
    expect(resolveClientIp(req, {})).toBe('192.168.1.1');
  });

  it('Permite IPv6 válida', () => {
    const req = createReq('2001:0db8:85a3:0000:0000:8a2e:0370:7334', {});
    expect(resolveClientIp(req, {})).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
  });

});
