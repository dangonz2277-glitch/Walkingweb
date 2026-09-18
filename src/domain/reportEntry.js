export function validateReportEntry({ calls, emails, liveChats }) {
  const isValidInt = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 9999;

  if (!isValidInt(calls) || !isValidInt(emails) || !isValidInt(liveChats)) {
    return { valid: false, error: 'Los valores deben ser números enteros entre 0 y 9999.' };
  }

  return {
    valid: true,
    data: {
      calls,
      emails,
      liveChats,
      total: calls + emails + liveChats
    }
  };
}

export function normalizeReportEntryData(dbRow) {
  if (!dbRow) return null;
  return {
    id: dbRow.id,
    calls: dbRow.calls,
    emails: dbRow.emails,
    liveChats: dbRow.live_chats,
    total: dbRow.total,
    workDate: dbRow.work_date,
    createdAt: dbRow.created_at
  };
}

export function formatDateTimeLaPaz(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(d);
}

export function formatDateLaPaz() {
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}
