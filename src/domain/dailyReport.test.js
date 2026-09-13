import { describe, it, expect } from 'vitest';
import {
  validateResolvedCount,
  getWorkDate,
  getReportId,
  hasRevisionConflict
} from './dailyReport';

describe('dailyReport domain', () => {
  describe('validateResolvedCount', () => {
    it('debe aceptar valores válidos (0 a 9999)', () => {
      expect(validateResolvedCount(0)).toBe(0);
      expect(validateResolvedCount(50)).toBe(50);
      expect(validateResolvedCount(9999)).toBe(9999);
    });

    it('debe rechazar números negativos', () => {
      expect(() => validateResolvedCount(-1)).toThrow('resolvedCount debe estar entre 0 y 9999');
      expect(() => validateResolvedCount(-50)).toThrow('resolvedCount debe estar entre 0 y 9999');
    });

    it('debe rechazar valores mayores a 9999', () => {
      expect(() => validateResolvedCount(10000)).toThrow('resolvedCount debe estar entre 0 y 9999');
    });

    it('debe rechazar números fraccionarios', () => {
      expect(() => validateResolvedCount(1.5)).toThrow('resolvedCount debe ser un número entero');
    });

    it('debe rechazar valores no numéricos', () => {
      expect(() => validateResolvedCount('10')).toThrow('resolvedCount debe ser un número entero');
      expect(() => validateResolvedCount(null)).toThrow('resolvedCount debe ser un número entero');
      expect(() => validateResolvedCount(undefined)).toThrow('resolvedCount debe ser un número entero');
    });
  });

  describe('getWorkDate', () => {
    it('debe devolver la fecha en formato YYYY-MM-DD en America/La_Paz', () => {
      // Medianoche en UTC, que es el día anterior en La Paz (UTC-4)
      const date1 = new Date('2026-09-13T02:00:00Z'); // 22:00 La Paz (12 de sep)
      expect(getWorkDate(date1)).toBe('2026-09-12');

      const date2 = new Date('2026-09-13T06:00:00Z'); // 02:00 La Paz (13 de sep)
      expect(getWorkDate(date2)).toBe('2026-09-13');
    });
  });

  describe('getReportId', () => {
    it('debe generar una clave combinada de usuario y fecha', () => {
      expect(getReportId('userA', '2026-09-12')).toBe('userA_2026-09-12');
      expect(getReportId('userB', '2026-09-12')).toBe('userB_2026-09-12');
    });

    it('debe distinguir a dos usuarios distintos en el mismo día', () => {
      const idA = getReportId('userA', '2026-09-12');
      const idB = getReportId('userB', '2026-09-12');
      expect(idA).not.toBe(idB);
    });

    it('debe lanzar error si faltan argumentos', () => {
      expect(() => getReportId('', '2026-09-12')).toThrow('userId y workDate son requeridos');
      expect(() => getReportId('userA', '')).toThrow('userId y workDate son requeridos');
    });
  });

  describe('hasRevisionConflict', () => {
    it('no hay conflicto si las revisiones coinciden', () => {
      expect(hasRevisionConflict(1, 1)).toBe(false);
      expect(hasRevisionConflict(5, 5)).toBe(false);
    });

    it('hay conflicto si las revisiones son distintas', () => {
      expect(hasRevisionConflict(1, 2)).toBe(true);
      expect(hasRevisionConflict(2, 1)).toBe(true);
    });

    it('maneja correctamente valores iniciales (null/undefined/0)', () => {
      // Cliente no tiene revisión (nuevo), servidor tampoco (nuevo)
      expect(hasRevisionConflict(null, null)).toBe(false);
      expect(hasRevisionConflict(undefined, 0)).toBe(false);

      // Cliente no tiene revisión, servidor sí (alguien más lo creó)
      expect(hasRevisionConflict(null, 1)).toBe(true);

      // Cliente cree que es la revisión 1, servidor no tiene (fue borrado)
      expect(hasRevisionConflict(1, null)).toBe(true);
    });
  });
});
