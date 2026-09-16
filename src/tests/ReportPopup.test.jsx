import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReportPopup from '../components/ReportPopup';
import { supabase } from '../data/supabaseClient';
import { getProfile, getTodayReport, setResolvedCount, listMyReports } from '../data/reportRepository';

vi.mock('../data/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
    }
  }
}));

vi.mock('../data/reportRepository', () => ({
  getProfile: vi.fn(),
  getTodayReport: vi.fn(),
  setResolvedCount: vi.fn(),
  listMyReports: vi.fn()
}));

describe('ReportPopup UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  });

  it('shows login form, prevents double submit, and handles successful login', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });

    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    getTodayReport.mockResolvedValue({ success: true, data: { resolvedCount: 0, revision: 0 } });
    listMyReports.mockResolvedValue({ success: true, data: [] });

    let authCallback;
    supabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Ingresar a Mi Reporte')).toBeDefined());

    let resolveLogin;
    supabase.auth.signInWithPassword.mockReturnValue(new Promise(res => resolveLogin = res));

    const userInput = screen.getByLabelText(/Usuario/i);
    const passInput = screen.getByLabelText(/Contraseña/i);
    const btn = screen.getByText('Iniciar Sesión');

    fireEvent.change(userInput, { target: { value: 'test' } });
    fireEvent.change(passInput, { target: { value: 'password123' } });

    // Double submit
    fireEvent.click(btn);
    fireEvent.click(btn);

    await waitFor(() => expect(screen.getByText('Ingresando...')).toBeDefined());
    expect(btn.disabled).toBe(true);
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@walkingweb.internal',
      password: 'password123'
    });

    resolveLogin({ data: { user: { id: '1' } }, error: null });

    // Actually call the onAuthStateChange listener
    if (authCallback) {
      setTimeout(() => authCallback('SIGNED_IN', { user: { id: '1' } }), 10);
    }

    await waitFor(() => expect(screen.queryByText('Ingresar a Mi Reporte')).toBeNull());
    // Assert successful view
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());
    expect(screen.getByLabelText(/Tickets Resueltos/i)).toBeDefined();
  });

  it('handles error in history/profile and logout', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });

    // Test 1: Profile error
    getProfile.mockResolvedValueOnce({ success: false, error: 'Profile error' });
    const { unmount: u1 } = render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Error al cargar perfil o cuenta inactiva.')).toBeDefined());
    u1();

    // Test 2: Read error
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    getTodayReport.mockResolvedValueOnce({ success: false, error: 'Read error' });
    listMyReports.mockResolvedValue({ success: true, data: [] });

    const { unmount: u2 } = render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Read error')).toBeDefined());
    u2();

    // Test 3: History error
    getTodayReport.mockResolvedValue({ success: true, data: { resolvedCount: 5, revision: 1 } });
    listMyReports.mockResolvedValueOnce({ success: false, error: 'History error' });

    const { unmount: u3 } = render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('History error')).toBeDefined());
    u3();

    // Test 4: Logout error (Session retained)
    supabase.auth.signOut.mockResolvedValueOnce({ error: { message: 'Logout failed' } });
    listMyReports.mockResolvedValue({ success: true, data: [] });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    const logoutBtn = screen.getByText('Cerrar Sesión');
    fireEvent.click(logoutBtn);

    await waitFor(() => expect(screen.getByText('Logout failed')).toBeDefined());
    // Expect session to still exist
    expect(screen.getByText('Alice')).toBeDefined();
  });

  it('validates bounds: 0, 9999, empty, and alphanumeric', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    getTodayReport.mockResolvedValue({ success: true, data: { resolvedCount: 0, revision: 0 } });
    listMyReports.mockResolvedValue({ success: true, data: [] });
    setResolvedCount.mockResolvedValue({ success: true, data: { revision: 1 } });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    const input = screen.getByLabelText(/Tickets Resueltos/i);
    const btn = screen.getByText('Guardar Reporte');

    // alphanumeric (invalid state sets to '0')
    fireEvent.change(input, { target: { value: '12abc' } });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText('El número de tickets resueltos debe ser un entero válido sin decimales ni letras.')).toBeDefined());
    expect(setResolvedCount).not.toHaveBeenCalled();

    // empty (sets to '0')
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText('El número de tickets resueltos debe ser un entero válido sin decimales ni letras.')).toBeDefined());
    expect(setResolvedCount).not.toHaveBeenCalled();

    // Clear the error by entering a valid number
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(btn);
    await waitFor(() => expect(setResolvedCount).toHaveBeenCalledWith(expect.any(String), 0, 0));

    setResolvedCount.mockResolvedValue({ success: true, data: { revision: 2 } });

    // 9999 (valid)
    fireEvent.change(input, { target: { value: '9999' } });
    fireEvent.click(btn);
    await waitFor(() => expect(setResolvedCount).toHaveBeenCalledWith(expect.any(String), 9999, 1));

    // 10000 (invalid)
    fireEvent.change(input, { target: { value: '10000' } });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText('El número de tickets resueltos debe ser un entero entre 0 y 9999.')).toBeDefined());

    // negatives
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText('El número de tickets resueltos debe ser un entero válido sin decimales ni letras.')).toBeDefined());

    // fractions
    fireEvent.change(input, { target: { value: '3.14' } });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText('El número de tickets resueltos debe ser un entero válido sin decimales ni letras.')).toBeDefined());

    expect(setResolvedCount).toHaveBeenCalledTimes(2); // Only for 0 (valid), 9999 (valid)
    expect(setResolvedCount).not.toHaveBeenCalledWith(expect.any(String), 10000, expect.any(Number));
    expect(setResolvedCount).not.toHaveBeenCalledWith(expect.any(String), -5, expect.any(Number));
    expect(setResolvedCount).not.toHaveBeenCalledWith(expect.any(String), 3.14, expect.any(Number));
  });

  it('renders remote conflict correctly including 0', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    getTodayReport.mockResolvedValue({ success: true, data: { resolvedCount: 5, revision: 1 } });
    listMyReports.mockResolvedValue({ success: true, data: [] });

    // Simular conflicto inicial
    setResolvedCount.mockResolvedValueOnce({ success: false, conflict: true });
    // Y la subsecuente lectura remota traerá un 0
    getTodayReport.mockResolvedValue({ success: true, data: { resolvedCount: 0, revision: 2 } });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());

    const input = screen.getByLabelText(/Tickets Resueltos/i);
    const btn = screen.getByText('Guardar Reporte');

    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.click(btn);

    // Debe mostrar la ventana de conflicto con 0
    await waitFor(() => expect(screen.getByText(/El servidor tiene un valor diferente/i)).toBeDefined());

    // Probar "Adoptar valor remoto" primero
    const btnAdopt = screen.getByText(/Adoptar valor remoto/i);
    fireEvent.click(btnAdopt);

    // The input should update to 0.
    await waitFor(() => expect(screen.getByDisplayValue('0')).toBeDefined());

    // Volver a simular conflicto con el valor local (10) para probar sobrescritura
    fireEvent.change(input, { target: { value: '10' } });
    setResolvedCount.mockResolvedValueOnce({ success: false, conflict: true });
    getTodayReport.mockResolvedValue({ success: true, data: { resolvedCount: 0, revision: 2 } });
    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(screen.getByText(/El servidor tiene un valor diferente/i)).toBeDefined());

    // Presionar Sobrescribir
    setResolvedCount.mockResolvedValueOnce({ success: true, data: { revision: 3 } });
    const btnOverwrite = screen.getByText(/Sobrescribir/i);
    fireEvent.click(btnOverwrite);

    await waitFor(() => expect(screen.getByText('¡Guardado!')).toBeDefined());
    expect(setResolvedCount).toHaveBeenCalledWith(expect.any(String), 10, 2); // local value 10, remote revision 2
  });

  it('handles disabled profile', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'disabled', display_name: 'Bob' } });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Tu cuenta está desactivada.')).toBeDefined());
  });

  it('does not mount ReportContent or query session until opened', () => {
    render(<ReportPopup isOpen={false} onClose={vi.fn()} />);
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('preserves draft state when closed and reopened', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    getTodayReport.mockResolvedValue({ success: true, data: { resolvedCount: 5, revision: 1 } });
    listMyReports.mockResolvedValue({ success: true, data: [] });

    const { rerender } = render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue('5')).toBeDefined());

    const input = screen.getByLabelText(/Tickets Resueltos/i);
    fireEvent.change(input, { target: { value: '42' } });

    rerender(<ReportPopup isOpen={false} onClose={vi.fn()} />);
    rerender(<ReportPopup isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByDisplayValue('42')).toBeDefined();
  });
});
