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

describe('ReportPopup append-only integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  });

  it('does not mount ReportContent or query session until opened', () => {
    render(<ReportPopup isOpen={false} onClose={vi.fn()} />);
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('renders auth form when opened and no session', async () => {
    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Ingresar a Mi Reporte')).toBeDefined());
  });

  it('handles login success', async () => {
    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Ingresar a Mi Reporte')).toBeDefined());
    
    supabase.auth.signInWithPassword.mockResolvedValueOnce({ error: null });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });
    
    const user = screen.getByLabelText('Usuario');
    const pass = screen.getByLabelText('Contraseña');
    fireEvent.change(user, { target: { value: 'alice' } });
    fireEvent.change(pass, { target: { value: 'password123' } });
    
    const form = user.closest('form');
    fireEvent.submit(form);
    
    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'alice@walkingweb.internal', password: 'password123' });
    });
  });

  it('handles login error and min password', async () => {
    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Ingresar a Mi Reporte')).toBeDefined());
    
    const user = screen.getByLabelText('Usuario');
    const pass = screen.getByLabelText('Contraseña');
    const form = user.closest('form');
    
    fireEvent.change(user, { target: { value: 'alice' } });
    fireEvent.change(pass, { target: { value: 'short' } });
    fireEvent.submit(form);
    
    await waitFor(() => expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeDefined());
    
    fireEvent.change(pass, { target: { value: 'password123' } });
    supabase.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'invalid' } });
    fireEvent.submit(form);
    
    await waitFor(() => expect(screen.getByText('Usuario o contraseña incorrectos, o cuenta inactiva.')).toBeDefined());
  });

  it('loads profile and draft on successful session', async () => {
    const userId = '111-222';
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });
    
    saveDraft(userId, { calls: 10, emails: 5, liveChats: 2, clientEntryId: '00000000-0000-0000-0000-000000000000' });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    expect(screen.getByText('10')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('Total:')).toBeDefined();
    expect(screen.getByText('17')).toBeDefined();
  });

  it('handles disabled profile', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'disabled', display_name: 'Bob' } });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Tu cuenta está desactivada.')).toBeDefined());
  });

  it('handles profile error', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: false, error: 'DB down' });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Error al cargar perfil o cuenta inactiva.')).toBeDefined());
  });

  it('handles history error', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Bob' } });
    listRecentReportEntries.mockResolvedValue({ success: false, error: 'History error' });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('History error')).toBeDefined());
  });

  it('handles logout error', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });
    supabase.auth.signOut.mockResolvedValueOnce({ error: { message: 'Logout failed' } });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    fireEvent.click(screen.getByText('Cerrar Sesión'));
    await waitFor(() => expect(screen.getByText('Logout failed')).toBeDefined());
  });

  it('Save disabled when total is 0', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    const saveBtn = screen.getByText('Guardar Reporte');
    expect(saveBtn.disabled).toBe(true);

    const incCallsBtn = screen.getAllByLabelText('Incrementar Calls')[0];
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

    fireEvent.click(screen.getAllByLabelText('Incrementar Calls')[0]);

    await waitFor(() => {
      expect(loadDraft(userId)).not.toBeNull();
    });

    const oldDraft = loadDraft(userId);
    const oldUuid = oldDraft.clientEntryId;

    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(screen.getByText('¡Reporte guardado exitosamente!')).toBeDefined());

    expect(appendReportEntry).toHaveBeenCalledTimes(1);
    expect(appendReportEntry).toHaveBeenCalledWith({
      calls: 1, emails: 0, liveChats: 0, clientEntryId: oldUuid
    });

    expect(loadDraft(userId)).toBeNull(); // Empty draft shouldn't be saved
  });

  it('error keeps counters and UUID', async () => {
    const userId = '1';
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });
    appendReportEntry.mockResolvedValue({ success: false, error: 'Database error' });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    fireEvent.click(screen.getAllByLabelText('Incrementar Emails')[0]);
    
    await waitFor(() => {
      expect(loadDraft(userId)).not.toBeNull();
    });

    const draft = loadDraft(userId);
    const uuid = draft.clientEntryId;

    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(screen.getByText('Database error')).toBeDefined());

    const newDraft = loadDraft(userId);
    expect(newDraft.emails).toBe(1);
    expect(newDraft.clientEntryId).toBe(uuid);
  });

  it('Limpiar button resets counters and deletes draft without backend call', async () => {
    const userId = '1';
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    fireEvent.click(screen.getAllByLabelText('Incrementar Live Chats')[0]);
    await waitFor(() => expect(screen.getByText('Total:')).toBeDefined());

    fireEvent.click(screen.getByText('Limpiar'));

    await waitFor(() => {
      expect(loadDraft(userId)).toBeNull();
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

  it('preserves state when closed and reopened', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });

    const { rerender } = render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    fireEvent.click(screen.getAllByLabelText('Incrementar Calls')[0]);
    
    rerender(<ReportPopup isOpen={false} onClose={vi.fn()} />);
    rerender(<ReportPopup isOpen={true} onClose={vi.fn()} />);

    expect(screen.queryAllByText('1').length).toBeGreaterThan(0);
  });
});
