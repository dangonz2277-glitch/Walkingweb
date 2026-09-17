export function getDraftKey(userId) {
  return `draft_report_entry_${userId}`;
}

export function loadDraft(userId) {
  if (!userId) return null;
  const key = getDraftKey(userId);
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.calls !== 'number' ||
      typeof parsed.emails !== 'number' ||
      typeof parsed.liveChats !== 'number' ||
      !parsed.clientEntryId
    ) {
      throw new Error('Formato de borrador inválido');
    }
    return parsed;
  } catch {
    localStorage.setItem(`${key}_corrupted`, raw);
    localStorage.removeItem(key);
    return null;
  }
}

export function saveDraft(userId, draft) {
  if (!userId) return;
  const key = getDraftKey(userId);
  localStorage.setItem(key, JSON.stringify({
    calls: draft.calls,
    emails: draft.emails,
    liveChats: draft.liveChats,
    clientEntryId: draft.clientEntryId
  }));
}

export function clearDraft(userId) {
  if (!userId) return;
  localStorage.removeItem(getDraftKey(userId));
}
