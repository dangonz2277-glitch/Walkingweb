import { describe, it, expect, vi } from 'vitest';
import { 
  listActiveCustomProducts, 
  getCustomProductById, 
  createCustomProduct, 
  updateCustomProduct, 
  softDeleteCustomProduct,
  CatalogRepositoryError
} from './catalogCustomProductRepository.js';

function createMockSupabase(mockBehavior) {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain), // Falso positivo detector
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    order: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => mockBehavior.maybeSingleResult())
  };
  
  if (mockBehavior.overrides) {
    Object.assign(chain, mockBehavior.overrides(chain));
  }

  const thenable = {
    then(resolve) {
      resolve(mockBehavior.result ? mockBehavior.result() : { data: null, error: null });
    }
  };

  Object.setPrototypeOf(chain, thenable);

  return {
    from: vi.fn(() => chain)
  };
}

describe('Backend: catalogCustomProductRepository', () => {
  const validProduct = { cat: 'C', name: 'N', model: 'M', capacity: 'C', speed: '', motor: '', area: '', weight: '', folded: '', control: '', assembly: '', notes: '', links: [], issues: [] };

  describe('listActiveCustomProducts', () => {
    it('comprueba deleted_at IS NULL y orden determinista', async () => {
      let isCalled = false;
      let orderCalls = [];
      const sb = createMockSupabase({
        result: () => ({ data: [], error: null }),
        overrides: (chain) => ({
          is: vi.fn((col, val) => {
            if (col === 'deleted_at' && val === null) isCalled = true;
            return chain;
          }),
          order: vi.fn((col, opts) => {
            orderCalls.push({ col, opts });
            return chain;
          })
        })
      });
      
      await listActiveCustomProducts(sb);
      expect(isCalled).toBe(true);
      expect(orderCalls.length).toBe(2);
      expect(orderCalls[0].col).toBe('created_at');
      expect(orderCalls[0].opts.ascending).toBe(false);
      expect(orderCalls[1].col).toBe('id');
      expect(orderCalls[1].opts.ascending).toBe(true);
    });
  });

  describe('getCustomProductById', () => {
    it('registro activo', async () => {
      const sb = createMockSupabase({
        maybeSingleResult: () => ({ data: { id: 'uuid', cat: 'C', links: [], issues: [] }, error: null })
      });
      const res = await getCustomProductById(sb, 'uuid');
      expect(res.status).toBe('OK');
      expect(res.data.id).toBe('uuid');
    });

    it('inexistente', async () => {
      const sb = createMockSupabase({
        maybeSingleResult: () => ({ data: null, error: null })
      });
      const res = await getCustomProductById(sb, 'uuid');
      expect(res.status).toBe('NOT_FOUND');
    });

    it('eliminado', async () => {
      const sb = createMockSupabase({
        maybeSingleResult: () => ({ data: { id: 'uuid', deleted_at: '2020' }, error: null })
      });
      const res = await getCustomProductById(sb, 'uuid');
      expect(res.status).toBe('DELETED');
    });

    it('error de Supabase saneado', async () => {
      const sb = createMockSupabase({
        maybeSingleResult: () => ({ data: null, error: { message: 'SECRET_URL' } })
      });
      try {
        await getCustomProductById(sb, 'uuid');
        expect.fail('Debería haber lanzado error');
      } catch (error) {
        expect(error).toBeInstanceOf(CatalogRepositoryError);
        expect(error.code).toBe('CATALOG_DB_ERROR');
        expect(error.message).toBe('Ha ocurrido un error interno en el repositorio del catálogo.');
        expect(error.message).not.toContain('SECRET');
      }
    });
  });

  describe('createCustomProduct', () => {
    it('creación normal', async () => {
      const sb = createMockSupabase({
        maybeSingleResult: () => ({ data: { id: 'uuid', cat: 'C', links: [], issues: [] }, error: null })
      });
      const res = await createCustomProduct(sb, validProduct, 'req-uuid');
      expect(res.status).toBe('CREATED');
    });

    it('reintento idéntico no duplica, manejando orden de propiedades JSON', async () => {
      let callCount = 0;
      const sb = createMockSupabase({
        maybeSingleResult: () => {
          callCount++;
          if (callCount === 1) return { error: { code: '23505' }, data: null };
          // En la DB llega price, url, label en otro orden
          return { data: { id: 'uuid', request_id: 'req-uuid', cat: 'C', name: 'N', model: 'M', capacity: 'C', speed: '', motor: '', area: '', weight: '', folded: '', control: '', assembly: '', notes: '', links: [{ price: '', url: 'http://a', label: 'L' }], issues: [] }, error: null };
        }
      });
      const prod = { ...validProduct, links: [{ label: 'L', url: 'http://a', price: '' }] };
      const res = await createCustomProduct(sb, prod, 'req-uuid');
      expect(res.status).toBe('IDEMPOTENT_REPLAY');
    });

    it('reintento con issues en otro orden de claves', async () => {
      let callCount = 0;
      const sb = createMockSupabase({
        maybeSingleResult: () => {
          callCount++;
          if (callCount === 1) return { error: { code: '23505' }, data: null };
          return { data: { id: 'uuid', request_id: 'req-uuid', cat: 'C', name: 'N', model: 'M', capacity: 'C', speed: '', motor: '', area: '', weight: '', folded: '', control: '', assembly: '', notes: '', links: [], issues: [{ fix: 'F', parts: 'P', code: 'C', name: 'N' }] }, error: null };
        }
      });
      const prod = { ...validProduct, issues: [{ code: 'C', name: 'N', fix: 'F', parts: 'P' }] };
      const res = await createCustomProduct(sb, prod, 'req-uuid');
      expect(res.status).toBe('IDEMPOTENT_REPLAY');
    });

    it('cambio real en un link produce CONFLICT', async () => {
      let callCount = 0;
      const sb = createMockSupabase({
        maybeSingleResult: () => {
          callCount++;
          if (callCount === 1) return { error: { code: '23505' }, data: null };
          return { data: { id: 'uuid', request_id: 'req-uuid', cat: 'C', name: 'N', model: 'M', capacity: 'C', speed: '', motor: '', area: '', weight: '', folded: '', control: '', assembly: '', notes: '', links: [{ label: 'L2', url: 'http://b', price: '' }], issues: [] }, error: null };
        }
      });
      const prod = { ...validProduct, links: [{ label: 'L1', url: 'http://a', price: '' }] };
      const res = await createCustomProduct(sb, prod, 'req-uuid');
      expect(res.status).toBe('CONFLICT');
    });

    it('cambio real en un issue produce CONFLICT', async () => {
      let callCount = 0;
      const sb = createMockSupabase({
        maybeSingleResult: () => {
          callCount++;
          if (callCount === 1) return { error: { code: '23505' }, data: null };
          return { data: { id: 'uuid', request_id: 'req-uuid', cat: 'C', name: 'N', model: 'M', capacity: 'C', speed: '', motor: '', area: '', weight: '', folded: '', control: '', assembly: '', notes: '', links: [], issues: [{ code: 'C1', name: 'N1', fix: 'F1', parts: 'P1' }] }, error: null };
        }
      });
      const prod = { ...validProduct, issues: [{ code: 'C1', name: 'N1', fix: 'DIFERENTE', parts: 'P1' }] };
      const res = await createCustomProduct(sb, prod, 'req-uuid');
      expect(res.status).toBe('CONFLICT');
    });

    it('reintento sobre registro borrado lógicamente produce DELETED', async () => {
      let callCount = 0;
      const sb = createMockSupabase({
        maybeSingleResult: () => {
          callCount++;
          if (callCount === 1) return { error: { code: '23505' }, data: null };
          return { data: { id: 'uuid', request_id: 'req-uuid', deleted_at: '2020', cat: 'C', name: 'N', model: 'M', capacity: 'C' }, error: null };
        }
      });
      const res = await createCustomProduct(sb, validProduct, 'req-uuid');
      expect(res.status).toBe('DELETED');
    });

    it('requestId repetido con otro contenido produce conflicto', async () => {
      let callCount = 0;
      const sb = createMockSupabase({
        maybeSingleResult: () => {
          callCount++;
          if (callCount === 1) return { error: { code: '23505' }, data: null };
          return { data: { id: 'uuid', request_id: 'req-uuid', cat: 'DIFERENTE', name: 'N', model: 'M', capacity: 'C', speed: '', motor: '', area: '', weight: '', folded: '', control: '', assembly: '', notes: '', links: [], issues: [] }, error: null };
        }
      });
      const res = await createCustomProduct(sb, validProduct, 'req-uuid');
      expect(res.status).toBe('CONFLICT');
    });
  });

  describe('updateCustomProduct', () => {
    it('comprueba que update recibe revision incrementada y filtros id, revision, deleted_at', async () => {
      let eqFilters = {};
      let isFilters = {};
      let updatedData = {};
      const sb = createMockSupabase({
        maybeSingleResult: () => ({ data: { id: '1', revision: 2, links: [], issues: [] }, error: null }),
        overrides: (chain) => ({
          update: vi.fn((data) => {
            updatedData = data;
            return chain;
          }),
          eq: vi.fn((col, val) => {
            eqFilters[col] = val;
            return chain;
          }),
          is: vi.fn((col, val) => {
            isFilters[col] = val;
            return chain;
          })
        })
      });
      const res = await updateCustomProduct(sb, '1', 1, validProduct);
      expect(res.status).toBe('OK');
      expect(updatedData.revision).toBe(2); // expectedRevision + 1
      expect(eqFilters.id).toBe('1');
      expect(eqFilters.revision).toBe(1);
      expect(isFilters.deleted_at).toBe(null);
    });

    it('revisión obsoleta produce conflicto', async () => {
      let callCount = 0;
      const sb = createMockSupabase({
        maybeSingleResult: () => {
          callCount++;
          if (callCount === 1) return { data: null, error: null };
          return { data: { revision: 5, deleted_at: null }, error: null };
        }
      });
      const res = await updateCustomProduct(sb, '1', 1, validProduct);
      expect(res.status).toBe('CONFLICT');
      expect(res.currentRevision).toBe(5);
    });
  });

  describe('softDeleteCustomProduct', () => {
    it('nunca se invoca DELETE físico y se hace softDelete', async () => {
      let updateData = null;
      let deleteCalled = false;
      const sb = createMockSupabase({
        maybeSingleResult: () => ({ data: { id: '1' }, error: null }),
        overrides: (chain) => ({
          update: vi.fn((data) => {
            updateData = data;
            return chain;
          }),
          delete: vi.fn(() => {
            deleteCalled = true;
            return chain;
          })
        })
      });

      const res = await softDeleteCustomProduct(sb, '1', 1);
      expect(res.status).toBe('OK');
      expect(deleteCalled).toBe(false);
      expect(updateData.deleted_at).toBeDefined();
      expect(updateData.revision).toBe(2);
    });
  });

  describe('Errores estables y serialización segura', () => {
    it('errores de Supabase se convierten a un error interno estable sin exponer secrets', async () => {
      const sb = createMockSupabase({
        result: () => ({ data: null, error: { message: 'SECRET_CONNECTION_STRING', code: '999' } })
      });
      try {
        await listActiveCustomProducts(sb);
        expect.fail('Debió fallar');
      } catch(err) {
        expect(err).toBeInstanceOf(CatalogRepositoryError);
        expect(err.code).toBe('CATALOG_DB_ERROR');
        expect(err.message).toBe('Ha ocurrido un error interno en el repositorio del catálogo.');
        
        // Verifica que cause preserva el original
        expect(err.cause).toBeDefined();
        expect(err.cause.message).toBe('SECRET_CONNECTION_STRING');

        // Verifica que al serializar no se fuga el secret
        const stringified = JSON.stringify(err);
        expect(stringified).not.toContain('SECRET_CONNECTION_STRING');
        expect(stringified).not.toContain('999');
      }
    });
  });
});
