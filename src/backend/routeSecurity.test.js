import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requireAuthSession, validateMutationRequest, compareSitePassword } from './routeSecurity.js';
import { signSession } from '../lib/session.js';

describe('routeSecurity', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('compareSitePassword', () => {
    it('falla sin SITE_PASSWORD', () => {
      delete process.env.SITE_PASSWORD;
      expect(() => compareSitePassword('pw')).toThrow('CONFIG_ERROR');
    });

    it('retorna false si el input no es string', () => {
      process.env.SITE_PASSWORD = '123';
      expect(compareSitePassword(null)).toBe(false);
    });

    it('compara correctamente', () => {
      process.env.SITE_PASSWORD = '123';
      expect(compareSitePassword('123')).toBe(true);
      expect(compareSitePassword('abc')).toBe(false);
    });
  });

  describe('requireAuthSession (Pruebas reales)', () => {
    const SECRET = 'my-secret-key-that-is-long-enough-32-chars';

    it('cookie firmada válida con auth: true', async () => {
      process.env.SITE_SESSION_SECRET = SECRET;
      const token = await signSession({ auth: true }, SECRET);
      const req = { cookies: { get: () => ({ value: token }) } };
      const res = await requireAuthSession(req);
      expect(res.authorized).toBe(true);
      expect(res.identHash).toBeDefined();
      expect(res.identHash).not.toContain(token);
    });

    it('cookie firmada con auth: false', async () => {
      process.env.SITE_SESSION_SECRET = SECRET;
      const token = await signSession({ auth: false }, SECRET);
      const req = { cookies: { get: () => ({ value: token }) } };
      const res = await requireAuthSession(req);
      expect(res.authorized).toBe(false);
    });

    it('cookie falsa/malformada', async () => {
      process.env.SITE_SESSION_SECRET = SECRET;
      const req = { cookies: { get: () => ({ value: 'not-a-valid-token' }) } };
      const res = await requireAuthSession(req);
      expect(res.authorized).toBe(false);
    });

    it('cookie firmada pero expirada', async () => {
      process.env.SITE_SESSION_SECRET = SECRET;
      vi.useFakeTimers();
      // signSession setea expiración en +20 días.
      const token = await signSession({ auth: true }, SECRET);
      
      // Avanzamos 21 días
      vi.advanceTimersByTime(21 * 24 * 60 * 60 * 1000);
      
      const req = { cookies: { get: () => ({ value: token }) } };
      const res = await requireAuthSession(req);
      expect(res.authorized).toBe(false);
    });

    it('cookie ausente', async () => {
      process.env.SITE_SESSION_SECRET = SECRET;
      const req = { cookies: { get: () => undefined }, headers: new Headers() };
      const res = await requireAuthSession(req);
      expect(res.authorized).toBe(false);
    });

    it('SITE_SESSION_SECRET ausente', async () => {
      delete process.env.SITE_SESSION_SECRET;
      const token = await signSession({ auth: true }, SECRET);
      const req = { cookies: { get: () => ({ value: token }) } };
      const res = await requireAuthSession(req);
      expect(res.authorized).toBe(false);
    });

    it('lectura fallback desde header Cookie', async () => {
      process.env.SITE_SESSION_SECRET = SECRET;
      const token = await signSession({ auth: true }, SECRET);
      const req = { headers: new Headers({ cookie: `other=123; site_session=${token}; flag=true` }) };
      const res = await requireAuthSession(req);
      expect(res.authorized).toBe(true);
    });

    it('identHash es estable para el mismo token', async () => {
      process.env.SITE_SESSION_SECRET = SECRET;
      const token = await signSession({ auth: true }, SECRET);
      const req = { cookies: { get: () => ({ value: token }) } };
      
      const res1 = await requireAuthSession(req);
      const res2 = await requireAuthSession(req);
      expect(res1.identHash).toEqual(res2.identHash);
    });
  });

  describe('validateMutationRequest', () => {
    it('application/json', async () => {
      const req = { url: 'http://a.com', headers: new Headers({ 'content-type': 'application/json', 'origin': 'http://a.com' }), text: async () => '{}' };
      const res = await validateMutationRequest(req);
      expect(res.error).toBeUndefined();
    });

    it('application/json; charset=utf-8', async () => {
      const req = { url: 'http://a.com', headers: new Headers({ 'content-type': 'application/json; charset=utf-8', 'origin': 'http://a.com' }), text: async () => '{}' };
      const res = await validateMutationRequest(req);
      expect(res.error).toBeUndefined();
    });

    it('Application/JSON', async () => {
      const req = { url: 'http://a.com', headers: new Headers({ 'content-type': 'Application/JSON ', 'origin': 'http://a.com' }), text: async () => '{}' };
      const res = await validateMutationRequest(req);
      expect(res.error).toBeUndefined();
    });

    it('text/application/json-fake', async () => {
      const req = { url: 'http://a.com', headers: new Headers({ 'content-type': 'text/application/json-fake', 'origin': 'http://a.com' }) };
      const res = await validateMutationRequest(req);
      expect(res.status).toBe(400);
      expect(res.error).toBe('INVALID_CONTENT_TYPE');
    });

    it('Content-Length malformado', async () => {
      const req = { url: 'http://a.com', headers: new Headers({ 'content-type': 'application/json', 'content-length': '123abc', 'origin': 'http://a.com' }) };
      const res = await validateMutationRequest(req);
      expect(res.status).toBe(400);
      expect(res.error).toBe('INVALID_CONTENT_LENGTH');
    });

    it('Content-Length negativo', async () => {
      const req = { url: 'http://a.com', headers: new Headers({ 'content-type': 'application/json', 'content-length': '-100', 'origin': 'http://a.com' }) };
      const res = await validateMutationRequest(req);
      expect(res.status).toBe(400);
      expect(res.error).toBe('INVALID_CONTENT_LENGTH');
    });

    it('Content-Length real excede y byteLength excede', async () => {
      const charStr = 'a'.repeat(200001);
      const req = { url: 'http://a.com', headers: new Headers({ 'content-type': 'application/json', 'origin': 'http://a.com', 'content-length': '200001' }), text: async () => charStr };
      const res = await validateMutationRequest(req);
      expect(res.status).toBe(413);
    });

    it('multibyte supera en bytes pero no en chars', async () => {
      const charStr = 'ñ'.repeat(150000); // 150000 chars, but 300000 bytes
      const req = { url: 'http://a.com', headers: new Headers({ 'content-type': 'application/json', 'origin': 'http://a.com' }), text: async () => charStr };
      const res = await validateMutationRequest(req);
      expect(res.status).toBe(413);
    });

    it('origin ausente', async () => {
      const req = { headers: new Headers({ 'content-type': 'application/json' }) };
      const res = await validateMutationRequest(req);
      expect(res.status).toBe(403);
    });

    it('origin diferente', async () => {
      const req = { 
        url: 'https://real.com/api',
        headers: new Headers({ 'content-type': 'application/json', 'origin': 'https://fake.com' }) 
      };
      const res = await validateMutationRequest(req);
      expect(res.status).toBe(403);
    });

    it('json invalido', async () => {
      const req = { 
        url: 'https://real.com/api',
        headers: new Headers({ 'content-type': 'application/json', 'origin': 'https://real.com' }),
        text: async () => 'not json'
      };
      const res = await validateMutationRequest(req);
      expect(res.status).toBe(400);
      expect(res.error).toBe('INVALID_JSON');
    });

    it('valido', async () => {
      const req = { 
        url: 'https://real.com/api',
        headers: new Headers({ 'content-type': 'application/json', 'origin': 'https://real.com' }),
        text: async () => '{"a":1}'
      };
      const res = await validateMutationRequest(req);
      expect(res.json).toEqual({a:1});
    });
  });
});
