import { supabase } from './supabaseClient.js';

export async function getTodayReport(workDate) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('daily_reports')
      .select('resolved_count, revision')
      .eq('work_date', workDate)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { success: true, data: null };

    return {
      success: true,
      data: {
        userId: user.id,
        workDate: workDate,
        resolvedCount: data.resolved_count,
        revision: data.revision
      }
    };
  } catch (err) {
    return { success: false, error: err.message || 'Network error' };
  }
}

export async function setResolvedCount(workDate, resolvedCount, currentRevision) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase.rpc('set_daily_report', {
      p_work_date: workDate,
      p_resolved_count: resolvedCount,
      p_expected_revision: currentRevision || 0
    });

    if (error) throw error;

    if (!data.success) {
      if (data.conflict) {
        return { success: false, conflict: true, currentRevision: data.current_revision };
      }
      return { success: false, error: 'Unknown error saving report' };
    }

    return {
      success: true,
      data: {
        userId: user.id,
        workDate: workDate,
        resolvedCount: resolvedCount,
        revision: data.revision
      }
    };
  } catch (err) {
    return { success: false, error: err.message || 'Network error' };
  }
}

export async function listMyReports() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('daily_reports')
      .select('work_date, resolved_count, revision')
      .order('work_date', { ascending: false })
      .limit(30);

    if (error) throw error;

    return {
      success: true,
      data: data.map(r => ({
        userId: user.id,
        workDate: r.work_date,
        resolvedCount: r.resolved_count,
        revision: r.revision
      }))
    };
  } catch (err) {
    return { success: false, error: err.message || 'Network error' };
  }
}

export async function getProfile() {
  try {
    const { data, error } = await supabase.from('profiles').select('display_name, status').single();
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
