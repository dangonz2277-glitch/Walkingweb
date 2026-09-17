import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportPopup from '../components/ReportPopup.jsx';
import { supabase } from '../data/supabaseClient.js';
import { getProfile } from '../data/reportRepository.js';
import { appendReportEntry, listRecentReportEntries } from '../backend/reportEntryRepository.js';
import { loadDraft, saveDraft } from '../backend/reportEntryStorage.js';

vi.mock('../data/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
    }
  }
}));

vi.mock('../data/reportRepository.js', () => ({
  getProfile: vi.fn()
}));

vi.mock('../backend/reportEntryRepository.js', () => ({
  appendReportEntry: vi.fn(),
  listRecentReportEntries: vi.fn()
}));

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('ReportPopup append-only integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  });

  it('renders auth form when no session', async () => {
    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Ingresar a Mi Reporte')).toBeDefined());
  });

  it('loads profile and draft on successful session', async () => {
    const userId = '111-222';
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });
    
    saveDraft(userId, { calls: 10, emails: 5, liveChats: 2, clientEntryId: 'uuid-123' });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    expect(screen.getByText('10')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('Total:')).toBeDefined();
    expect(screen.getByText('17')).toBeDefined();
  });

  it('Save disabled when total is 0', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    const saveBtn = screen.getByText('Guardar Reporte');
    expect(saveBtn.disabled).toBe(true);

    const incCallsBtn = screen.getAllByText('+1')[0];
    fireEvent.click(incCallsBtn);

    expect(saveBtn.disabled).toBe(false);
  });

  it('successful save calls backend once, clears draft, and generates new UUID', async () => {
    const userId = '1';
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });
    appendReportEntry.mockResolvedValue({ success: true });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    fireEvent.click(screen.getAllByText('+1')[0]);

    const oldDraft = loadDraft(userId);
    expect(oldDraft).not.toBeNull();
    const oldUuid = oldDraft.clientEntryId;

    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(screen.getByText('¡Reporte guardado exitosamente!')).toBeDefined());

    expect(appendReportEntry).toHaveBeenCalledTimes(1);
    expect(appendReportEntry).toHaveBeenCalledWith({
      calls: 1, emails: 0, liveChats: 0, clientEntryId: oldUuid
    });

    expect(screen.queryAllByText('0').length).toBeGreaterThan(0);

    const newDraft = loadDraft(userId);
    expect(newDraft).not.toBeNull();
    expect(newDraft.calls).toBe(0);
    expect(newDraft.clientEntryId).not.toBe(oldUuid);
  });

  it('error keeps counters and UUID', async () => {
    const userId = '1';
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });
    appendReportEntry.mockResolvedValue({ success: false, error: 'Database error' });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    fireEvent.click(screen.getAllByText('+1')[1]);
    
    const draft = loadDraft(userId);
    const uuid = draft.clientEntryId;

    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(screen.getByText('Database error')).toBeDefined());

    const newDraft = loadDraft(userId);
    expect(newDraft.emails).toBe(1);
    expect(newDraft.clientEntryId).toBe(uuid);
  });

  it('Limpiar button resets counters without backend call', async () => {
    const userId = '1';
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    fireEvent.click(screen.getAllByText('+1')[2]);
    expect(screen.getByText('Total:')).toBeDefined();

    fireEvent.click(screen.getByText('Limpiar'));

    await waitFor(() => {
      const draft = loadDraft(userId);
      expect(draft.liveChats).toBe(0);
    });
    
    expect(appendReportEntry).not.toHaveBeenCalled();
  });

  it('shows history formatted as C | E | Ch', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [
      { id: '111', calls: 10, emails: 5, liveChats: 2, createdAt: '2026-09-17T20:00:00.000Z' }
    ] });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    expect(screen.getByText('C: 10 | E: 5 | Ch: 2')).toBeDefined();
  });

  it('corrupted draft is discarded', async () => {
    const userId = '1';
    localStorage.setItem(`draft_report_entry_${userId}`, '{ bad json }');
    
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    expect(localStorage.getItem(`draft_report_entry_${userId}_corrupted`)).toBe('{ bad json }');
  });
});
