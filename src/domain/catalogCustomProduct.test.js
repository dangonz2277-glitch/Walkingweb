import { describe, it, expect } from 'vitest';
import { 
  validateCreateCustomProductPayload,
  validateUpdateCustomProductPayload,
  validateCustomProductData, 
  validateRequestId, 
  validateExpectedRevision,
  fromDatabase
} from './catalogCustomProduct.js';

describe('Domain: catalogCustomProduct', () => {
  describe('Wrappers principales (Create)', () => {
    it('acepta payload válido', () => {
      const payload = {
        requestId: '00000000-0000-0000-0000-000000000001',
        productData: { cat: 'A', name: 'B', model: 'C', capacity: 'D' }
      };
      const res = validateCreateCustomProductPayload(payload);
      expect(res.valid).toBe(true);
    });

    it('rechaza campo superior extra', () => {
      const payload = {
        requestId: '00000000-0000-0000-0000-000000000001',
        productData: { cat: 'A', name: 'B', model: 'C', capacity: 'D' },
        extra: 'hacker'
      };
      const res = validateCreateCustomProductPayload(payload);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('UNKNOWN_FIELD');
      expect(res.field).toBe('extra');
    });

    it('rechaza payload array', () => {
      const res = validateCreateCustomProductPayload([1, 2, 3]);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('INVALID_FORMAT');
    });

    it('rechaza productData array', () => {
      const payload = {
        requestId: '00000000-0000-0000-0000-000000000001',
        productData: [{ cat: 'A', name: 'B', model: 'C', capacity: 'D' }]
      };
      const res = validateCreateCustomProductPayload(payload);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('INVALID_FORMAT');
      expect(res.field).toBe('productData');
    });
  });

  describe('Wrappers principales (Update)', () => {
    it('acepta payload válido', () => {
      const payload = {
        expectedRevision: 5,
        productData: { cat: 'A', name: 'B', model: 'C', capacity: 'D' }
      };
      const res = validateUpdateCustomProductPayload(payload);
      expect(res.valid).toBe(true);
    });

    it('rechaza campo superior extra', () => {
      const payload = {
        expectedRevision: 5,
        productData: { cat: 'A', name: 'B', model: 'C', capacity: 'D' },
        session: 'token'
      };
      const res = validateUpdateCustomProductPayload(payload);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('UNKNOWN_FIELD');
      expect(res.field).toBe('session');
    });

    it('rechaza payload array', () => {
      const res = validateUpdateCustomProductPayload([{expectedRevision: 5}]);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('INVALID_FORMAT');
    });

    it('rechaza productData date o null', () => {
      const payload = {
        expectedRevision: 5,
        productData: new Date()
      };
      const res = validateUpdateCustomProductPayload(payload);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('INVALID_FORMAT');
    });
  });

  describe('validateCustomProductData', () => {
    it('producto completo válido', () => {
      const input = {
        cat: 'A', name: 'B', model: 'C', capacity: 'D',
        speed: '1', motor: '2', area: '3', weight: '4',
        folded: '5', control: '6', assembly: '7', notes: '8',
        links: [{ url: 'http://test.com', label: 'L', price: 'P' }],
        issues: [{ code: 'E1', name: 'Error', fix: 'Fix', parts: 'Parts' }]
      };
      const res = validateCustomProductData(input);
      expect(res.valid).toBe(true);
      expect(res.data.notes).toBe('8');
    });

    it('rechaza propiedad desconocida', () => {
      const res = validateCustomProductData({ cat: 'A', name: 'A', model: 'A', capacity: 'A', extra: 'B' });
      expect(res.valid).toBe(false);
      expect(res.field).toBe('extra');
    });
  });

  describe('Links y Expansión', () => {
    const validBase = { cat: 'A', name: 'A', model: 'A', capacity: 'A' };
    
    it('rechaza link que no sea un objeto plano', () => {
      const r = validateCustomProductData({ ...validBase, links: [[{ url: 'http://a.com' }]] });
      expect(r.valid).toBe(false);
      expect(r.code).toBe('VALIDATION_ERROR');
    });

    it('rechaza link tipo Date', () => {
      const r = validateCustomProductData({ ...validBase, links: [new Date()] });
      expect(r.valid).toBe(false);
    });
  });

  describe('Issues', () => {
    const validBase = { cat: 'A', name: 'A', model: 'A', capacity: 'A' };
    
    it('rechaza issue que no sea objeto plano', () => {
      const r = validateCustomProductData({ ...validBase, issues: [[{ code: 'E1', name: 'N1' }]] });
      expect(r.valid).toBe(false);
    });

    it('exceso de tamaño UTF-8', () => {
      const issues = Array(1000).fill({ code: 'E1', name: 'Ñ'.repeat(50) });
      const r = validateCustomProductData({ ...validBase, issues });
      expect(r.valid).toBe(false);
      expect(r.code).toBe("SIZE_EXCEEDED");
    });
  });

  describe('fromDatabase seguro', () => {
    it('rechaza row inexistente o sin id', () => {
      expect(() => fromDatabase(null)).toThrow('CATALOG_MAPPING_ERROR');
      expect(() => fromDatabase({ missingId: true })).toThrow('CATALOG_MAPPING_ERROR');
    });

    it('rechaza links e issues inválidos', () => {
      const row = { id: '1', request_id: 'r1' };
      expect(() => fromDatabase({ ...row, links: 'string' })).toThrow('CATALOG_MAPPING_ERROR');
      expect(() => fromDatabase({ ...row, links: [], issues: { object: true } })).toThrow('CATALOG_MAPPING_ERROR');
    });

    it('Mapea correctamente', () => {
      const row = {
        id: 'id1', request_id: 'req1', cat: 'C', name: 'N', model: 'M', capacity: 'Cap',
        speed: '', motor: '', area: '', weight: '', folded: '', control: '', assembly: '', notes: '',
        links: [], issues: [], revision: 0, created_at: '2020', updated_at: '2020',
        deleted_at: '2020'
      };
      const res = fromDatabase(row);
      expect(res.id).toBe('id1');
      expect(res.requestId).toBe('req1');
      expect(res.isCustom).toBe(true);
      expect(res.isRemoteCustom).toBe(true);
      expect(res.deletedAt).toBeUndefined(); // no se expone
    });
  });
});

describe('Domain: validadores individuales', () => {
  it('requestId', () => {
    expect(validateRequestId('not-a-uuid').valid).toBe(false);
    expect(validateRequestId('00000000-0000-0000-0000-000000000001').valid).toBe(true);
  });

  it('expectedRevision', () => {
    expect(validateExpectedRevision(-1).valid).toBe(false);
    expect(validateExpectedRevision(1.5).valid).toBe(false);
    expect(validateExpectedRevision("1").valid).toBe(false);
    expect(validateExpectedRevision(0).valid).toBe(true);
    expect(validateExpectedRevision(10).valid).toBe(true);
  });
});
