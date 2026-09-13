import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBackup, importData } from '../data/importExport.js';
import { loadRepState, finishRepDay, loadRepHistory } from '../data/reports.js';
import { getBaseProducts, getIssues } from '../data/store.js';
const backup = keys => JSON.stringify({ version: 1, keys });
describe('datos y respaldo', () => {
  beforeEach(() => localStorage.clear());
  it('incluye los 42 productos base y errores asociados', () => {
    expect(getBaseProducts()).toHaveLength(42);
    expect(getIssues(getBaseProducts()[0].issueKey).length).toBeGreaterThan(0);
  });
  it('exporta el archivo histórico del módulo retirado sin mostrarlo', () => {
    localStorage.setItem('walkingpad_trackings_corrupted', '{roto');
    const result = JSON.parse(createBackup());
    expect(result.keys.walkingpad_trackings_corrupted).toBe('{roto');
  });
  it('importa dos veces sin duplicar productos ni historiales sin id', () => {
    const data = backup({
      walkingpad_custom_products: JSON.stringify([{ name: 'Nuevo', model: 'N1', cat: 'Hybrid' }]),
      repHistory_Daniel: JSON.stringify([{ date: 'ayer', calls: 2 }, { date: 'hoy', calls: 2 }]),
      repSession_Daniel: JSON.stringify({ calls: 1 }),
      walkingpad_trackings_corrupted: '{antiguo',
    });
    expect(importData(data).added).toBe(4);
    expect(importData(data).added).toBe(0);
    expect(JSON.parse(localStorage.getItem('repHistory_Daniel'))).toHaveLength(2);
    expect(localStorage.getItem('walkingpad_trackings_corrupted')).toBeNull();
  });
  it('no sobrescribe una sesión existente y señala el conflicto', () => {
    localStorage.setItem('repSession_Daniel', JSON.stringify({ calls: 9, shiftId: 'mine' }));
    const result = importData(backup({ repSession_Daniel: JSON.stringify({ calls: 1, shiftId: 'theirs' }) }));
    expect(result.conflicts).toBe(1);
    expect(loadRepState().calls).toBe(9);
  });
  it('rechaza estructura inválida antes de escribir', () => {
    expect(() => importData(backup({ repHistory_Daniel: '{}', walkingpad_custom_products: '[]' }))).toThrow();
    expect(localStorage.getItem('walkingpad_custom_products')).toBeNull();
  });
  it('preserva almacenamiento inválido y no lo sobrescribe al importar', () => {
    localStorage.setItem('repHistory_Daniel', '{roto');
    const result = importData(backup({ repHistory_Daniel: JSON.stringify([{ id: 's1', calls: 3 }]) }));
    expect(result.conflicts).toBe(1);
    expect(localStorage.getItem('repHistory_Daniel')).toBe('{roto');
    expect(localStorage.getItem('repHistory_Daniel_corrupted')).toBe('{roto');
  });
  it('ignora datos del módulo retirado en respaldos antiguos', () => {
    importData(backup({ walkingpad_trackings: JSON.stringify([{ id: 1, ticket: 'T1' }]) }));
    expect(localStorage.getItem('walkingpad_trackings')).toBeNull();
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
});
