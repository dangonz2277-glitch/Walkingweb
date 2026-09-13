import { loadArray, preserveCorrupt } from './storage.js';
export const createNewShiftId = () => `shift_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
export const emptyDraft = () => ({ calls: 0, emails: 0, chats: 0, note: '', shiftId: createNewShiftId() });
export function loadRepState() {
  try {
    const raw = localStorage.getItem('repSession_Daniel');
    if (!raw) return emptyDraft();
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid session');
    const migrated = { calls: Number(value.calls) || 0, emails: Number(value.emails) || 0, chats: Number(value.chats) || 0, note: String(value.note || ''), shiftId: value.shiftId || createNewShiftId() };
    if (!value.shiftId) saveRepState(migrated);
    return migrated;
  } catch {
    try { preserveCorrupt('repSession_Daniel', localStorage.getItem('repSession_Daniel')); } catch { /* unavailable */ }
    return emptyDraft();
  }
}
export const loadRepHistory = () => loadArray('repHistory_Daniel');
export function saveRepState(value) {
  try { localStorage.setItem('repSession_Daniel', JSON.stringify({ ...value, shiftId: value.shiftId || createNewShiftId() })); return true; } catch { return false; }
}
export function finishRepDay(draft) {
  const shiftId = draft.shiftId || createNewShiftId();
  const history = loadRepHistory();
  if (!history.some(item => item.id === shiftId || item.shiftId === shiftId)) {
    const record = { id: shiftId, shiftId, date: new Date().toLocaleString('es-ES'), calls: Number(draft.calls) || 0, emails: Number(draft.emails) || 0, chats: Number(draft.chats) || 0, note: String(draft.note || '').trim() };
    try { localStorage.setItem('repHistory_Daniel', JSON.stringify([...history, record])); } catch { throw Error('No se pudo guardar el reporte. El borrador se conserva.'); }
  }
  const newDraft = emptyDraft();
  if (!saveRepState(newDraft)) throw Error('Reporte archivado, pero no se pudo reiniciar el borrador. Reintenta; no se duplicará.');
  return { success: true, newDraft };
}
