import { validateReportEntry } from '../domain/reportEntry.js';

export function getDraftKey(userId) {
  return `draft_report_entry_${userId}`;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function loadDraft(userId) {
  if (!userId) return null;
  const key = getDraftKey(userId);
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const val = validateReportEntry({
      calls: parsed.calls,
      emails: parsed.emails,
      liveChats: parsed.liveChats
    });
    if (!val.valid) throw new Error('Contadores inválidos');
    if (typeof parsed.clientEntryId !== 'string' || !UUID_REGEX.test(parsed.clientEntryId)) {
      throw new Error('UUID inválido');
    }
    return parsed;
  } catch {
    try {
      let suffix = 1;
      let corruptKey = `${key}_corrupted_${suffix}`;
      while (localStorage.getItem(corruptKey) !== null) {
        suffix++;
        corruptKey = `${key}_corrupted_${suffix}`;
      }
      localStorage.setItem(corruptKey, raw);
      const verify = localStorage.getItem(corruptKey);
      if (verify === raw) {
        localStorage.removeItem(key);
      }
    } catch {
      // Si falla respaldo, conservar original sin borrarlo.
    }
    return null;
  }
}

export function saveDraft(userId, draft) {
  if (!userId) return { success: false, error: 'No user ID' };

  const val = validateReportEntry({
    calls: draft.calls,
    emails: draft.emails,
    liveChats: draft.liveChats
  });

  if (!val.valid) {
    return { success: false, error: val.error };
  }

  if (typeof draft.clientEntryId !== 'string' || !UUID_REGEX.test(draft.clientEntryId)) {
    return { success: false, error: 'UUID inválido' };
  }

  if (val.data.total === 0) {
    return clearDraft(userId);
  }

  try {
    localStorage.setItem(getDraftKey(userId), JSON.stringify({
      calls: val.data.calls,
      emails: val.data.emails,
      liveChats: val.data.liveChats,
      clientEntryId: draft.clientEntryId
    }));
    return { success: true };
  } catch {
    return { success: false, error: 'No se pudo guardar el borrador localmente.' };
  }
}

export function clearDraft(userId) {
  if (!userId) return { success: false, error: 'No user ID' };
  try {
    localStorage.removeItem(getDraftKey(userId));
    return { success: true };
  } catch {
    return { success: false, error: 'No se pudo limpiar el borrador localmente.' };
  }
}
