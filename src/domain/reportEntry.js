export function validateReportEntry({ calls, emails, liveChats }) {
  const clamp = (val) => {
    const num = Math.floor(Number(val) || 0);
    return Math.max(0, Math.min(9999, num));
  };
  
  const c = clamp(calls);
  const e = clamp(emails);
  const l = clamp(liveChats);
  const total = c + e + l;
  
  return { calls: c, emails: e, liveChats: l, total };
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
