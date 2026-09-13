const MAIN = ['walkingpad_local_products', 'repSession_Daniel', 'repHistory_Daniel'];
// Backups may contain data from the retired module. Export it for archival only;
// importing must never recreate that module's local data.
const LEGACY_ARCHIVE = ['walkingpad_trackings', 'walkingpad_trackings_corrupted'];
const KEYS = [...MAIN, ...MAIN.map(k => `${k}_corrupted`), ...LEGACY_ARCHIVE, 'walkingpad_custom_products'];
export function createBackup() {
  return JSON.stringify({ version: 1, timestamp: new Date().toISOString(), keys: Object.fromEntries(KEYS.map(k => [k, localStorage.getItem(k)])) }, null, 2);
}
export function exportData() {
  const blob = new Blob([createBackup()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `walkingpad_respaldo_${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const object = v => v && typeof v === 'object' && !Array.isArray(v);
function parse(raw, key) {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw Error(`${key}: formato inválido`);
  let value;
  try { value = JSON.parse(raw); } catch { throw Error(`${key}: JSON inválido`); }
  if (key === 'repSession_Daniel' ? !object(value) : !Array.isArray(value) || !value.every(object)) throw Error(`${key}: estructura inválida`);
  return value;
}
const identity = (key, item) => key === 'walkingpad_local_products'
  ? (item.id != null ? `id:${item.id}` : `product:${String(item.model || '').toLowerCase()}|${String(item.name || '').toLowerCase()}|${String(item.cat || '').toLowerCase()}`)
  : `shift:${item.shiftId || item.id || JSON.stringify(item)}`;
function legacyShift(item, index) {
  const raw = JSON.stringify(item);
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  return `legacy_${index}_${(hash >>> 0).toString(36)}`;
}
function normalizeHistory(item, index) {
  const shiftId = item.shiftId || item.id || legacyShift(item, index);
  return { ...item, id: item.id || shiftId, shiftId };
}
export function importData(raw) {
  let backup;
  try { backup = JSON.parse(raw); } catch { throw Error('El archivo no es JSON válido.'); }
  if (!object(backup) || !object(backup.keys) || (backup.version != null && backup.version !== 1)) throw Error('Formato de respaldo inválido.');
  
  // Normalizar custom_products legacy a local_products
  if (backup.keys['walkingpad_custom_products'] != null && backup.keys['walkingpad_local_products'] == null) {
    backup.keys['walkingpad_local_products'] = backup.keys['walkingpad_custom_products'];
  }

  const keys = backup.keys;
  const operations = [];
  let added = 0, conflicts = 0;
  for (const key of MAIN) {
    const incoming = parse(keys[key], key);
    if (incoming == null) continue;
    const currentRaw = localStorage.getItem(key);
    let currentValue = null;
    if (currentRaw != null) {
      try { currentValue = parse(currentRaw, key); }
      catch {
        const corruptKey = `${key}_corrupted`;
        if (localStorage.getItem(corruptKey) == null) operations.push([corruptKey, currentRaw]);
        conflicts++;
        continue;
      }
    }
    if (key === 'repSession_Daniel') {
      const normalized = { ...incoming, shiftId: incoming.shiftId || legacyShift(incoming, 0) };
      if (currentRaw == null) { operations.push([key, JSON.stringify(normalized)]); added++; }
      else if (JSON.stringify(currentValue) !== JSON.stringify(normalized)) conflicts++;
      continue;
    }
    const current = currentValue || [];
    const seen = new Set(current.map((item, index) => identity(key, key === 'repHistory_Daniel' ? normalizeHistory(item, index) : item)));
    const merged = [...current];
    for (const [index, item] of incoming.entries()) {
      const normalized = key === 'repHistory_Daniel' ? normalizeHistory(item, index) : item;
      const id = identity(key, normalized);
      if (seen.has(id)) { if (!current.some((x, index) => { const existing = key === 'repHistory_Daniel' ? normalizeHistory(x, index) : x; return identity(key, existing) === id && JSON.stringify(existing) === JSON.stringify(normalized); })) conflicts++; continue; }
      seen.add(id); merged.push(normalized); added++;
    }
    if (merged.length !== current.length) operations.push([key, JSON.stringify(merged)]);
  }
  for (const key of MAIN.map(k => `${k}_corrupted`)) {
    if (keys[key] == null) continue;
    if (typeof keys[key] !== 'string') throw Error(`${key}: formato inválido`);
    const existing = localStorage.getItem(key);
    if (existing == null && !operations.some(([name]) => name === key)) operations.push([key, keys[key]]);
    else if (existing !== keys[key]) conflicts++;
  }
  // Validate every operation before writing. Roll back on quota/security errors.
  const before = operations.map(([key]) => [key, localStorage.getItem(key)]);
  try { for (const [key, value] of operations) localStorage.setItem(key, value); }
  catch { for (const [key, value] of before) { try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* unavailable */ } } throw Error('No se pudo guardar el respaldo. No se completó la importación.'); }
  return { added, conflicts };
}
