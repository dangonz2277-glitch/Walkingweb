import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not mount ReportContent or query session until opened', () => {
    render(<ReportPopup isOpen={false} onClose={vi.fn()} />);
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('warns only for pending reports, including while the modal is closed', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });
    appendReportEntry.mockResolvedValue({ success: true });
    const { rerender, unmount } = render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await screen.findByText('Alice');
    const warned = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(warned()).toBe(false);
    fireEvent.click(screen.getByLabelText('Incrementar Calls'));
    expect(warned()).toBe(true);
    rerender(<ReportPopup isOpen={false} onClose={vi.fn()} />);
    expect(warned()).toBe(true);
    rerender(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Cancelar / Limpiar'));
    expect(warned()).toBe(false);
    fireEvent.click(screen.getByLabelText('Incrementar Emails'));
    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(warned()).toBe(false));
    fireEvent.click(screen.getByLabelText('Incrementar Live Chats'));
    expect(warned()).toBe(true);
    unmount();
    expect(warned()).toBe(false);
  });

  it('renders auth form when opened and no session', async () => {
    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Ingresar a Mi Reporte')).toBeDefined());
  });

  it('handles double submit login correctly', async () => {
    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Ingresar a Mi Reporte')).toBeDefined());

    // Defer resolution to test pending state
    let resolveLogin;
    const loginPromise = new Promise(r => { resolveLogin = r; });
    supabase.auth.signInWithPassword.mockReturnValue(loginPromise);

    const user = screen.getByLabelText('Usuario');
    const pass = screen.getByLabelText('Contraseña');
    const form = user.closest('form');

    fireEvent.change(user, { target: { value: 'alice' } });
    fireEvent.change(pass, { target: { value: 'password123' } });

    fireEvent.submit(form);
    fireEvent.submit(form); // Second submit

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledTimes(1);

    resolveLogin({ error: null });
  });

  it('full login success via onAuthStateChange', async () => {
    let authCallback;
    supabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Ingresar a Mi Reporte')).toBeDefined());

    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });

    // Simulate auth event
    authCallback('SIGNED_IN', { user: { id: '1' } });

    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());
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
    expect(screen.getByText('Total de esta entrada')).toBeDefined();
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

  it('double click on save calls backend once', async () => {
    const userId = '1';
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });

    let resolveAppend;
    const appendPromise = new Promise(r => { resolveAppend = r; });
    appendReportEntry.mockReturnValue(appendPromise);

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    fireEvent.click(screen.getAllByLabelText('Incrementar Calls')[0]);

    const saveBtn = screen.getByText('Guardar Reporte');
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn); // Double click

    expect(appendReportEntry).toHaveBeenCalledTimes(1);

    resolveAppend({ success: true });
    await waitFor(() => expect(screen.getByText('¡Reporte guardado exitosamente!')).toBeDefined());
  });

  it('successful save clears draft exactly, leaves exact draft key absent', async () => {
    const userId = '1';
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });
    appendReportEntry.mockResolvedValue({ success: true });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    fireEvent.click(screen.getAllByLabelText('Incrementar Calls')[0]);
    expect(loadDraft(userId)).not.toBeNull();

    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(screen.getByText('¡Reporte guardado exitosamente!')).toBeDefined());

    expect(window.localStorage.getItem(`draft_report_entry_${userId}`)).toBeNull();
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
    const uuid = loadDraft(userId).clientEntryId;

    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(screen.getByText('Database error')).toBeDefined());

    const newDraft = loadDraft(userId);
    expect(newDraft.emails).toBe(1);
    expect(newDraft.clientEntryId).toBe(uuid);
  });

  it('Limpiar button resets counters and deletes draft key exactly', async () => {
    const userId = '1';
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    fireEvent.click(screen.getAllByLabelText('Incrementar Live Chats')[0]);
    expect(screen.getByText('Total de esta entrada')).toBeDefined();

    fireEvent.click(screen.getByText('Cancelar / Limpiar'));

    await waitFor(() => {
      expect(window.localStorage.getItem(`draft_report_entry_${userId}`)).toBeNull();
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

    expect(screen.getByText('Calls: 10 · Emails: 5 · Live Chats: 2')).toBeDefined();
  });

  it('updates date automatically after change to next day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-17T10:00:00Z'));

    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });

    const { rerender } = render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/17\/09\/2026/)).toBeDefined());

    // Jump to next day
    act(() => {
      vi.setSystemTime(new Date('2026-09-18T10:00:00Z'));
    });

    // Reopen
    act(() => {
      rerender(<ReportPopup isOpen={false} onClose={vi.fn()} />);
    });

    act(() => {
      rerender(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    });

    expect(screen.getByText(/18\/09\/2026/)).toBeDefined();
  });

  it('shows warning and maintains visual counters on localStorage error', async () => {
    const userId = '1';
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    listRecentReportEntries.mockResolvedValue({ success: true, data: [] });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    // Mock storage failure
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });

    fireEvent.click(screen.getAllByLabelText('Incrementar Calls')[0]);

    await waitFor(() => expect(screen.getByText('No se pudo guardar el borrador localmente.')).toBeDefined());

    // Counter updated visually despite error
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);

    vi.restoreAllMocks();
  });
});
