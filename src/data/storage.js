export function preserveCorrupt(key, raw) {
  try {
    const backupKey = `${key}_corrupted`;
    if (raw != null && localStorage.getItem(backupKey) == null) localStorage.setItem(backupKey, raw);
  } catch { /* storage may be unavailable */ }
}
export function loadArray(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(v => v && typeof v === 'object' && !Array.isArray(v))) return parsed;
    preserveCorrupt(key, raw);
  } catch {
    try { preserveCorrupt(key, localStorage.getItem(key)); } catch { /* unavailable */ }
  }
  return fallback;
}
export function saveArray(key, value) {
  if (!Array.isArray(value)) return false;
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
