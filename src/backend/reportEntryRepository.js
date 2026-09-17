import { supabase } from '../data/supabaseClient.js';
import { normalizeReportEntryData, validateReportEntry } from '../domain/reportEntry.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function appendReportEntry({ calls, emails, liveChats, clientEntryId }) {
  const val = validateReportEntry({ calls, emails, liveChats });
  if (!val.valid) {
    return { success: false, error: val.error };
  }
  if (!clientEntryId || typeof clientEntryId !== 'string' || !UUID_REGEX.test(clientEntryId)) {
    return { success: false, error: 'Identificador de cliente (UUID) inválido.' };
  }

  try {
    const { data, error } = await supabase.rpc('append_report_entry', {
      p_calls: val.data.calls,
      p_emails: val.data.emails,
      p_live_chats: val.data.liveChats,
      p_client_entry_id: clientEntryId
    });
    
    if (error) {
      throw error;
    }
    
    if (!data) {
      throw new Error('El servidor no devolvió datos al guardar.');
    }
    
    return { success: true, data: normalizeReportEntryData(data) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function listRecentReportEntries() {
  try {
    const { data, error } = await supabase
      .from('report_entries')
      .select('id, calls, emails, live_chats, total, work_date, created_at')
      .order('created_at', { ascending: false })
      .limit(30);
      
    if (error) {
      throw error;
    }
    
    return { success: true, data: (data || []).map(normalizeReportEntryData) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
