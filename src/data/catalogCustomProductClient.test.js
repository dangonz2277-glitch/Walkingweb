import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CatalogApiError,
  listCustomProducts,
  createCustomProduct,
  updateCustomProduct,
  deleteCustomProduct
} from './catalogCustomProductClient.js';

describe('catalogCustomProductClient', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validProduct = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    revision: 1,
    name: 'Name',
    model: 'Model',
    cat: 'Cat',
    capacity: 'Cap',
    links: [],
    issues: []
  };

  const invalidProduct = {
    id: 'not-a-uuid',
    revision: '1',
    name: 'Name',
    // missing model, cat, capacity, links, issues
  };

  it('GET correcto con producto válido', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ products: [validProduct] })
    });

    const result = await listCustomProducts();
    expect(result).toEqual([validProduct]);
    expect(global.fetch).toHaveBeenCalledWith('/api/catalog/custom-products', expect.objectContaining({
      method: 'GET',
      credentials: 'same-origin'
    }));
  });

  it('GET correcto falla si un producto en listado es inválido', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ products: [validProduct, invalidProduct] })
    });

    await expect(listCustomProducts()).rejects.toMatchObject({
      name: 'CatalogApiError',
      message: 'INVALID_RESPONSE_STRUCTURE',
      status: 200
    });
  });

  it('POST correcto y requestId con producto válido', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ product: validProduct })
    });

    const result = await createCustomProduct({ name: 'Name' }, 'req-123');
    expect(result).toEqual(validProduct);
    expect(global.fetch).toHaveBeenCalledWith('/api/catalog/custom-products', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ requestId: 'req-123', productData: { name: 'Name' } })
    }));
  });

  it('POST falla si devuelve un producto inválido', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ product: invalidProduct })
    });

    await expect(createCustomProduct({ name: 'Name' }, 'req-123')).rejects.toMatchObject({
      name: 'CatalogApiError',
      message: 'INVALID_RESPONSE_STRUCTURE',
      status: 201
    });
  });

  it('PATCH correcto y revisión esperada con producto válido', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ product: validProduct })
    });

    const result = await updateCustomProduct('1', { name: 'Name' }, 1);
    expect(result).toEqual(validProduct);
    expect(global.fetch).toHaveBeenCalledWith('/api/catalog/custom-products/1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ expectedRevision: 1, productData: { name: 'Name' } })
    }));
  });

  it('PATCH falla si devuelve un producto inválido', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ product: invalidProduct })
    });

    await expect(updateCustomProduct('1', { name: 'Name' }, 1)).rejects.toMatchObject({
      name: 'CatalogApiError',
      message: 'INVALID_RESPONSE_STRUCTURE',
      status: 200
    });
  });

  it('DELETE correcto con respuesta 204', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers()
    });

    await expect(deleteCustomProduct('1', 1, 'pw')).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith('/api/catalog/custom-products/1', expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({ expectedRevision: 1, password: 'pw' })
    }));
  });

  it('errores HTTP básicos lanzan CatalogApiError correctamente', async () => {
    const statuses = [400, 401, 403, 404, 410, 429, 500];
    for (const status of statuses) {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: `ERR_${status}`, code: 'CODE' })
      });

      await expect(listCustomProducts()).rejects.toMatchObject({
        name: 'CatalogApiError',
        status,
        message: `ERR_${status}`,
        code: 'CODE'
      });
    }
  });

  it('extracción de details.code y details.field en un error 400', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ 
        error: 'VALIDATION_FAILED', 
        details: { code: 'REQUIRED_FIELD', field: 'name' } 
      })
    });

    await expect(createCustomProduct({}, 'req-123')).rejects.toMatchObject({
      name: 'CatalogApiError',
      status: 400,
      message: 'VALIDATION_FAILED',
      code: 'REQUIRED_FIELD',
      field: 'name'
    });
  });

  it('conservación de currentRevision en conflictos', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'CONFLICT', currentRevision: 5 })
    });

    await expect(updateCustomProduct('1', { name: 'A' }, 4)).rejects.toMatchObject({
      name: 'CatalogApiError',
      status: 409,
      message: 'CONFLICT',
      currentRevision: 5
    });
  });

  it('JSON inválido (response parser error)', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => { throw new Error('parse error'); }
    });

    await expect(listCustomProducts()).rejects.toMatchObject({
      name: 'CatalogApiError',
      message: 'INVALID_JSON_RESPONSE',
      status: 200
    });
  });

  it('fallo de red', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(listCustomProducts()).rejects.toMatchObject({
      name: 'CatalogApiError',
      message: 'NETWORK_ERROR'
    });
  });

  it('solicitud abortada no se transforma en CatalogApiError', async () => {
    const abortErr = new Error('AbortError');
    abortErr.name = 'AbortError';
    global.fetch.mockRejectedValue(abortErr);

    const prom = listCustomProducts({ signal: new AbortController().signal });
    let errorCaught;
    try {
      await prom;
    } catch (e) {
      errorCaught = e;
    }

    expect(errorCaught).toBeDefined();
    expect(errorCaught.name).toBe('AbortError');
    expect(errorCaught).not.toBeInstanceOf(CatalogApiError);
  });
  
  it('UNEXPECTED_RESPONSE_TYPE si falla ok y no es json', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => 'Bad Gateway'
    });

    await expect(listCustomProducts()).rejects.toMatchObject({
      name: 'CatalogApiError',
      message: 'UNEXPECTED_RESPONSE_TYPE',
      status: 502
    });
  });

  it('INVALID_JSON_RESPONSE si es 200 y no es json', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'ok'
    });

    await expect(listCustomProducts()).rejects.toMatchObject({
      name: 'CatalogApiError',
      message: 'INVALID_JSON_RESPONSE',
      status: 200
    });
  });
});
