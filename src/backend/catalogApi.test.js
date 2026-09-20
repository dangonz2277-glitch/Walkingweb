import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '../../app/api/catalog/custom-products/route.js';
import { PATCH, DELETE } from '../../app/api/catalog/custom-products/[id]/route.js';
import * as routeSecurity from './routeSecurity.js';
import * as catalogSupabaseAdmin from './catalogSupabaseAdmin.js';
import * as catalogRepo from './catalogCustomProductRepository.js';

vi.mock('./routeSecurity.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    requireAuthSession: vi.fn(),
    validateMutationRequest: vi.fn(),
    compareSitePassword: vi.fn()
  };
});

vi.mock('./catalogSupabaseAdmin.js', () => ({
  getCatalogAdminClient: vi.fn()
}));

vi.mock('./catalogCustomProductRepository.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listActiveCustomProducts: vi.fn(),
    createCustomProduct: vi.fn(),
    updateCustomProduct: vi.fn(),
    softDeleteCustomProduct: vi.fn()
  };
});

describe('Catalog API Routes', () => {
  let req;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { url: 'http://localhost/api', headers: new Headers() };
  });

  describe('GET', () => {
    it('requiere sesion', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: false });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('error interno genérico', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      catalogSupabaseAdmin.getCatalogAdminClient.mockImplementation(() => { throw new Error('Secret DB Error'); });
      const res = await GET(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Internal Server Error');
      expect(JSON.stringify(json)).not.toContain('Secret DB Error');
    });

    it('devuelve productos', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({});
      catalogRepo.listActiveCustomProducts.mockResolvedValue([{ id: '1' }]);
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.products[0].id).toBe('1');
    });
  });

  describe('POST', () => {
    it('devuelve 400 en JSON invalido u origen', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ error: 'INVALID_ORIGIN', status: 403 });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it('payload invalido devuelve 400', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { bad: 'data' } });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('VALIDATION_ERROR');
    });

    it('error de repositorio 500 generico', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { requestId: '00000000-0000-0000-0000-000000000001', productData: { cat: 'A', name: 'N', model: 'M', capacity: 'C' } } });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({});
      catalogRepo.createCustomProduct.mockRejectedValue(new Error('Secret DB Error'));
      
      const res = await POST(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Internal Server Error');
      expect(JSON.stringify(json)).not.toContain('Secret DB Error');
    });

    it('creacion normal: 201', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { requestId: '00000000-0000-0000-0000-000000000001', productData: { cat: 'A', name: 'N', model: 'M', capacity: 'C' } } });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({});
      catalogRepo.createCustomProduct.mockResolvedValue({ status: 'CREATED', data: { id: '1' } });
      
      const res = await POST(req);
      expect(res.status).toBe(201);
    });

    it('IDEMPOTENT_REPLAY devuelve 200', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { requestId: '00000000-0000-0000-0000-000000000001', productData: { cat: 'A', name: 'N', model: 'M', capacity: 'C' } } });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({});
      catalogRepo.createCustomProduct.mockResolvedValue({ status: 'IDEMPOTENT_REPLAY', data: { id: '1' } });
      
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it('CONFLICT devuelve 409', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { requestId: '00000000-0000-0000-0000-000000000001', productData: { cat: 'A', name: 'N', model: 'M', capacity: 'C' } } });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({});
      catalogRepo.createCustomProduct.mockResolvedValue({ status: 'CONFLICT' });
      
      const res = await POST(req);
      expect(res.status).toBe(409);
    });

    it('DELETED devuelve 410', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { requestId: '00000000-0000-0000-0000-000000000001', productData: { cat: 'A', name: 'N', model: 'M', capacity: 'C' } } });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({});
      catalogRepo.createCustomProduct.mockResolvedValue({ status: 'DELETED' });
      
      const res = await POST(req);
      expect(res.status).toBe(410);
    });
  });

  describe('PATCH', () => {
    const validParams = { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }) };

    it('sesion ausente', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: false });
      const res = await PATCH(req, validParams);
      expect(res.status).toBe(401);
    });

    it('UUID inválido devuelve 400', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      const res = await PATCH(req, { params: Promise.resolve({ id: 'bad' }) });
      expect(res.status).toBe(400);
    });

    it('Origin/Content-Type propagados', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ error: 'INVALID_CONTENT_TYPE', status: 400 });
      const res = await PATCH(req, validParams);
      expect(res.status).toBe(400);
    });

    it('payload inválido devuelve 400', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { bad: 'data' } });
      const res = await PATCH(req, validParams);
      expect(res.status).toBe(400);
    });

    it('actualización OK devuelve 200 y producto', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, productData: { cat: 'A', name: 'N', model: 'M', capacity: 'C' } } });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({});
      catalogRepo.updateCustomProduct.mockResolvedValue({ status: 'OK', data: { id: '1' } });
      
      const res = await PATCH(req, validParams);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.product.id).toBe('1');
    });

    it('NOT_FOUND devuelve 404', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, productData: { cat: 'A', name: 'N', model: 'M', capacity: 'C' } } });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({});
      catalogRepo.updateCustomProduct.mockResolvedValue({ status: 'NOT_FOUND' });
      const res = await PATCH(req, validParams);
      expect(res.status).toBe(404);
    });

    it('CONFLICT devuelve 409 con currentRevision', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, productData: { cat: 'A', name: 'N', model: 'M', capacity: 'C' } } });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({});
      catalogRepo.updateCustomProduct.mockResolvedValue({ status: 'CONFLICT', currentRevision: 2 });
      
      const res = await PATCH(req, validParams);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.currentRevision).toBe(2);
    });

    it('DELETED devuelve 410', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, productData: { cat: 'A', name: 'N', model: 'M', capacity: 'C' } } });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({});
      catalogRepo.updateCustomProduct.mockResolvedValue({ status: 'DELETED' });
      
      const res = await PATCH(req, validParams);
      expect(res.status).toBe(410);
    });

    it('error del repositorio 500 generico', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, productData: { cat: 'A', name: 'N', model: 'M', capacity: 'C' } } });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({});
      catalogRepo.updateCustomProduct.mockRejectedValue(new Error('Secret DB Error'));
      
      const res = await PATCH(req, validParams);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Internal Server Error');
      expect(JSON.stringify(json)).not.toContain('Secret DB Error');
    });
  });

  describe('DELETE', () => {
    const validParams = { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000001' }) };

    it('sesion ausente', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: false });
      const res = await DELETE(req, validParams);
      expect(res.status).toBe(401);
    });

    it('UUID inválido devuelve 400', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'bad' }) });
      expect(res.status).toBe(400);
    });

    it('campo extra devuelve 400', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, password: 'pw', extra: 1 } });
      const res = await DELETE(req, validParams);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('UNKNOWN_FIELD');
    });

    it('expectedRevision negativo, fraccional y string', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      const inputs = [-1, 1.5, "1"];
      for (const input of inputs) {
        routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: input, password: 'pw' } });
        const res = await DELETE(req, validParams);
        expect(res.status).toBe(400);
      }
    });

    it('password ausente y no string', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true });
      const inputs = [undefined, 123];
      for (const input of inputs) {
        routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, password: input } });
        const res = await DELETE(req, validParams);
        expect(res.status).toBe(400);
      }
    });

    it('RPC lanza excepción y devuelve 500', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true, identHash: 'hash' });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, password: 'pw' } });
      const rpc = vi.fn().mockRejectedValue(new Error('RPC Exception'));
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({ rpc });
      
      const res = await DELETE(req, validParams);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(JSON.stringify(json)).not.toContain('RPC Exception');
    });

    it('RPC devuelve error genérico 500 sin secreto', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true, identHash: 'hash' });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, password: 'pw' } });
      const rpc = vi.fn().mockResolvedValue({ error: { message: 'Secret DB Error' } });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({ rpc });
      
      const res = await DELETE(req, validParams);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(JSON.stringify(json)).not.toContain('Secret DB Error');
    });

    it('limite agotado devuelve 429 sin comprobar contraseña', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true, identHash: 'hash' });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, password: 'pw' } });
      const rpc = vi.fn().mockResolvedValue({ data: false });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({ rpc });
      
      const res = await DELETE(req, validParams);
      expect(res.status).toBe(429);
      expect(routeSecurity.compareSitePassword).not.toHaveBeenCalled();
    });

    it('contraseña correcta cuando limite esta agotado continua en 429', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true, identHash: 'hash' });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, password: 'correct_pw' } });
      routeSecurity.compareSitePassword.mockReturnValue(true);
      const rpc = vi.fn().mockResolvedValue({ data: false });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({ rpc });
      
      const res = await DELETE(req, validParams);
      expect(res.status).toBe(429);
    });

    it('reset lanza excepcion', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true, identHash: 'hash' });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, password: 'pw' } });
      const rpc = vi.fn((name) => {
        if (name === 'check_catalog_delete_rate_limit') return Promise.resolve({ data: true });
        if (name === 'reset_catalog_delete_rate_limit') return Promise.reject(new Error('Secret DB Error'));
        return Promise.resolve({});
      });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({ rpc });
      routeSecurity.compareSitePassword.mockReturnValue(true);
      
      const res = await DELETE(req, validParams);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(JSON.stringify(json)).not.toContain('Secret DB Error');
    });

    it('reset devuelve { error } y devuelve 500', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true, identHash: 'hash' });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, password: 'pw' } });
      const rpc = vi.fn((name) => {
        if (name === 'check_catalog_delete_rate_limit') return Promise.resolve({ data: true });
        if (name === 'reset_catalog_delete_rate_limit') return Promise.resolve({ error: { message: 'Secret DB Error' } });
        return Promise.resolve({});
      });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({ rpc });
      routeSecurity.compareSitePassword.mockReturnValue(true);
      
      const res = await DELETE(req, validParams);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(JSON.stringify(json)).not.toContain('Secret DB Error');
    });

    it('NOT_FOUND devuelve 404', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true, identHash: 'hash' });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, password: 'pw' } });
      const rpc = vi.fn().mockResolvedValue({ data: true });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({ rpc });
      routeSecurity.compareSitePassword.mockReturnValue(true);
      catalogRepo.softDeleteCustomProduct.mockResolvedValue({ status: 'NOT_FOUND' });
      
      const res = await DELETE(req, validParams);
      expect(res.status).toBe(404);
    });
    
    it('CONFLICT devuelve 409 con currentRevision', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true, identHash: 'hash' });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, password: 'pw' } });
      const rpc = vi.fn().mockResolvedValue({ data: true });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({ rpc });
      routeSecurity.compareSitePassword.mockReturnValue(true);
      catalogRepo.softDeleteCustomProduct.mockResolvedValue({ status: 'CONFLICT', currentRevision: 2 });
      
      const res = await DELETE(req, validParams);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.currentRevision).toBe(2);
    });

    it('DELETED devuelve 410', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true, identHash: 'hash' });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, password: 'pw' } });
      const rpc = vi.fn().mockResolvedValue({ data: true });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({ rpc });
      routeSecurity.compareSitePassword.mockReturnValue(true);
      catalogRepo.softDeleteCustomProduct.mockResolvedValue({ status: 'DELETED' });
      
      const res = await DELETE(req, validParams);
      expect(res.status).toBe(410);
    });

    it('repositorio lanza error y responde 500 generico sin secreto', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true, identHash: 'hash' });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, password: 'my-password-123' } });
      const rpc = vi.fn().mockResolvedValue({ data: true });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({ rpc });
      routeSecurity.compareSitePassword.mockReturnValue(true);
      catalogRepo.softDeleteCustomProduct.mockRejectedValue(new Error('Secret DB Error'));
      
      const res = await DELETE(req, validParams);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(JSON.stringify(json)).not.toContain('Secret DB Error');
      expect(JSON.stringify(json)).not.toContain('my-password-123');
      expect(JSON.stringify(json)).not.toContain('hash');
    });

    it('OK devuelve 204 y se asegura de llamadas correspondientes', async () => {
      routeSecurity.requireAuthSession.mockResolvedValue({ authorized: true, identHash: 'hash' });
      routeSecurity.validateMutationRequest.mockResolvedValue({ json: { expectedRevision: 1, password: 'pw' } });
      
      const rpc = vi.fn((name) => {
        if (name === 'check_catalog_delete_rate_limit') return Promise.resolve({ data: true });
        return Promise.resolve({});
      });
      catalogSupabaseAdmin.getCatalogAdminClient.mockReturnValue({ rpc });
      routeSecurity.compareSitePassword.mockReturnValue(true);
      catalogRepo.softDeleteCustomProduct.mockResolvedValue({ status: 'OK' });

      const res = await DELETE(req, validParams);
      expect(res.status).toBe(204);
      expect(rpc).toHaveBeenCalledWith('reset_catalog_delete_rate_limit', { client_ident: 'hash' });
      expect(catalogRepo.softDeleteCustomProduct).toHaveBeenCalled();
      // No existe borrado fisico importado o llamado
    });
  });
});
