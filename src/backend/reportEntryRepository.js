import { supabase } from '../data/supabaseClient.js';
import { normalizeReportEntryData } from '../domain/reportEntry.js';

export async function appendReportEntry({ calls, emails, liveChats, clientEntryId }) {
  try {
    const { data, error } = await supabase.rpc('append_report_entry', {
      p_calls: calls,
      p_emails: emails,
      p_live_chats: liveChats,
      p_client_entry_id: clientEntryId
    });
    
    if (error) {
      throw error;
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
    
    return { success: true, data: data.map(normalizeReportEntryData) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
