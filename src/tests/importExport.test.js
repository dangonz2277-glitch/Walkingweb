import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBackup, importData } from '../data/importExport.js';
import { loadRepState, finishRepDay, loadRepHistory } from '../data/reports.js';
import { getBaseProducts, getIssues, initStore } from '../data/store.js';

import categories from '../../data/categories.json';
import products from '../../data/products.json';
import sourceIssues from '../../data/issues_complete.json';
import guide from '../../data/guia.json';
import generalIssues from '../../data/general_issues.json';

const initialData = { categories, products, sourceIssues, guide, generalIssues };
initStore(initialData);

const backup = keys => JSON.stringify({ version: 1, keys });
describe('datos y respaldo', () => {
  beforeEach(() => localStorage.clear());
  it('incluye los 42 productos base y errores asociados', () => {
    expect(getBaseProducts()).toHaveLength(42);
    expect(getIssues(getBaseProducts()[0].issueKey).length).toBeGreaterThan(0);
  });

  it('importa dos veces sin duplicar productos ni historiales sin id', () => {
    const data = backup({
      walkingpad_local_products: JSON.stringify([{ name: 'Nuevo', model: 'N1', cat: 'Hybrid' }]),
      repHistory_Daniel: JSON.stringify([{ date: 'ayer', calls: 2 }, { date: 'hoy', calls: 2 }]),
      repSession_Daniel: JSON.stringify({ calls: 1 })
    });
    expect(importData(data).added).toBe(4);
    expect(importData(data).added).toBe(0);
    expect(JSON.parse(localStorage.getItem('repHistory_Daniel'))).toHaveLength(2);
  });
  it('importa custom_products antiguo y lo migra a local_products', () => {
    const data = backup({
      walkingpad_custom_products: JSON.stringify([{ name: 'Viejo', model: 'V1', cat: 'Classic' }])
    });
    expect(importData(data).added).toBe(1);
    const locals = JSON.parse(localStorage.getItem('walkingpad_local_products'));
    expect(locals[0].model).toBe('V1');
  });
  
  it('exporta/importa un override renombrado dos veces sin duplicarlo', () => {
    const p1 = { baseId: 'base:Vertical Fold|X218|WP510B4', name: 'Nombre cambiado 1', isOverride: true };
    const data = backup({
      walkingpad_local_products: JSON.stringify([p1])
    });
    expect(importData(data).added).toBe(1);
    
    // Segunda vez
    const p2 = { baseId: 'base:Vertical Fold|X218|WP510B4', name: 'Nombre cambiado 2', isOverride: true };
    const data2 = backup({
      walkingpad_local_products: JSON.stringify([p2])
    });
    const result2 = importData(data2);
    expect(result2.added).toBe(0); 
    expect(result2.conflicts).toBe(1); // Conflicto de contenido, no lo duplica, lo conserva
    
    const locals = JSON.parse(localStorage.getItem('walkingpad_local_products'));
    expect(locals.length).toBe(1);
    expect(locals[0].name).toBe('Nombre cambiado 1'); // Conserva el que ya existía
  });

  it('no sobrescribe una sesión existente y señala el conflicto', () => {
    localStorage.setItem('repSession_Daniel', JSON.stringify({ calls: 9, shiftId: 'mine' }));
    const result = importData(backup({ repSession_Daniel: JSON.stringify({ calls: 1, shiftId: 'theirs' }) }));
    expect(result.conflicts).toBe(1);
    expect(loadRepState().calls).toBe(9);
  });
  it('rechaza estructura inválida antes de escribir', () => {
    expect(() => importData(backup({ repHistory_Daniel: '{}', walkingpad_local_products: '[]' }))).toThrow();
    expect(localStorage.getItem('walkingpad_local_products')).toBeNull();
  });
  it('preserva almacenamiento inválido y no lo sobrescribe al importar', () => {
    localStorage.setItem('repHistory_Daniel', '{roto');
    const result = importData(backup({ repHistory_Daniel: JSON.stringify([{ id: 's1', calls: 3 }]) }));
    expect(result.conflicts).toBe(1);
    expect(localStorage.getItem('repHistory_Daniel')).toBe('{roto');
    expect(localStorage.getItem('repHistory_Daniel_corrupted')).toBe('{roto');
  });

  it('exporta e importa conflictos de migración de forma idempotente y conserva corruptos', () => {
    localStorage.setItem('walkingpad_migration_conflicts_corrupted', '{corrupto');
    const conflict = { existing: { id: 1 }, incoming: { id: 2 } };
    localStorage.setItem('walkingpad_migration_conflicts', JSON.stringify([conflict]));
    
    // Crear backup y limpiarlo
    const data = createBackup();
    localStorage.clear();
    
    // Importar
    const result = importData(data);
    expect(result.added).toBe(1); // Añade el conflicto
    
    // Reimportar para comprobar idempotencia
    const result2 = importData(data);
    expect(result2.added).toBe(0); // Ya existía
    
    expect(JSON.parse(localStorage.getItem('walkingpad_migration_conflicts'))).toHaveLength(1);
    expect(localStorage.getItem('walkingpad_migration_conflicts_corrupted')).toBe('{corrupto');
  });

  it('recupera un borrador antiguo y conserva el mismo shiftId', () => {
    localStorage.setItem('repSession_Daniel', JSON.stringify({ calls: 3 }));
    const first = loadRepState();
    expect(loadRepState().shiftId).toBe(first.shiftId);
    expect(first.calls).toBe(3);
  });
  it('archiva turnos con totales iguales y no duplica un reintento', () => {
    const one = { calls: 2, emails: 0, chats: 0, note: '', shiftId: 'one' };
    const two = { ...one, shiftId: 'two' };
    finishRepDay(one); finishRepDay(one); finishRepDay(two);
    expect(loadRepHistory()).toHaveLength(2);
  });
  it('conserva el borrador si falla el guardado del historial', () => {
    const draft = { calls: 7, emails: 0, chats: 0, note: '', shiftId: 'blocked' };
    localStorage.setItem('repSession_Daniel', JSON.stringify(draft));
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) { if (key === 'repHistory_Daniel') throw Error('quota'); return original.call(this, key, value); });
    expect(() => finishRepDay(draft)).toThrow();
    expect(loadRepState().shiftId).toBe('blocked');
    vi.restoreAllMocks();
  });
  it('ausencia total de Trackings en respaldos nuevos', () => {
    localStorage.setItem('walkingpad_trackings', 'secreto');
    const bkp = JSON.parse(createBackup());
    expect(bkp.keys.walkingpad_trackings).toBeUndefined();
  });

});
