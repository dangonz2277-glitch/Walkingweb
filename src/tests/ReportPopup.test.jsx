import "./setup.js";

import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import ReportPopup from '../components/ReportPopup.jsx';
import { supabase } from '../data/supabaseClient.js';
import { getProfile, getTodayReport, setResolvedCount, listMyReports } from '../data/reportRepository.js';
import { getWorkDate } from '../utils/date.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../data/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

vi.mock('../data/reportRepository.js', () => ({
  getProfile: vi.fn(),
  getTodayReport: vi.fn(),
  setResolvedCount: vi.fn(),
  listMyReports: vi.fn(),
}));

vi.mock('../utils/date.js', () => ({
  getWorkDate: vi.fn(() => '2026-09-15'),
}));

describe('ReportPopup UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows login form when unauthenticated and handles login', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    
    await waitFor(() => expect(screen.getByText('Ingresar a Mi Reporte')).toBeDefined());
    
    supabase.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid' } });
    
    const userInput = screen.getByLabelText(/Usuario/i);
    const passInput = screen.getByLabelText(/Contraseña/i);
    const btn = screen.getByText('Iniciar Sesión');
    
    fireEvent.change(userInput, { target: { value: 'test' } });
    fireEvent.change(passInput, { target: { value: 'password123' } });
    fireEvent.click(btn);
    
    await waitFor(() => expect(screen.getByText('Usuario o contraseña incorrectos, o cuenta inactiva.')).toBeDefined());
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'test@walkingweb.internal', password: 'password123' });
  });

  it('shows active report when authenticated', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    getTodayReport.mockResolvedValue({ success: true, data: { resolvedCount: 5, revision: 1 } });
    listMyReports.mockResolvedValue({ success: true, data: [] });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());
    expect(screen.getByDisplayValue('5')).toBeDefined();
  });

  it('handles disabled profile', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'disabled', display_name: 'Bob' } });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    
    await waitFor(() => expect(screen.getByText('Tu cuenta está desactivada.')).toBeDefined());
  });

  it('validates strictly integers', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    getTodayReport.mockResolvedValue({ success: true, data: null });
    listMyReports.mockResolvedValue({ success: true, data: [] });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Guardar Reporte')).toBeDefined());
    
    const input = screen.getByLabelText(/Tickets Resueltos/i);
    fireEvent.change(input, { target: { value: '5.5' } });
    fireEvent.click(screen.getByText('Guardar Reporte'));
    
    await waitFor(() => expect(screen.getByText(/El número de tickets resueltos debe ser un entero válido sin decimales ni letras/)).toBeDefined());
    expect(setResolvedCount).not.toHaveBeenCalled();
    
    // Test negative
    fireEvent.change(input, { target: { value: '-2' } });
    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(screen.getByText(/El número de tickets resueltos debe ser un entero válido/)).toBeDefined());
    
    // Valid
    fireEvent.change(input, { target: { value: '15' } });
    setResolvedCount.mockResolvedValue({ success: true, data: { revision: 1 } });
    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(setResolvedCount).toHaveBeenCalledWith('2026-09-15', 15, 0));
  });

  it('handles remote conflict', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    getProfile.mockResolvedValue({ success: true, data: { status: 'active', display_name: 'Alice' } });
    getTodayReport.mockResolvedValue({ success: true, data: { resolvedCount: 10, revision: 1 } });
    listMyReports.mockResolvedValue({ success: true, data: [] });

    render(<ReportPopup isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue('10')).toBeDefined());
    
    const input = screen.getByLabelText(/Tickets Resueltos/i);
    fireEvent.change(input, { target: { value: '15' } });
    
    // Simulate conflict
    setResolvedCount.mockResolvedValue({ success: false, conflict: true });
    // Re-fetch returns the new remote value
    getTodayReport.mockResolvedValue({ success: true, data: { resolvedCount: 20, revision: 2 } });
    
    fireEvent.click(screen.getByText('Guardar Reporte'));
    
    await waitFor(() => expect(screen.getByText(/El servidor tiene un valor diferente \(20 tickets resueltos\)/)).toBeDefined());
    
    // Sync
    fireEvent.click(screen.getByText('Adoptar valor remoto'));
    await waitFor(() => expect(screen.getByDisplayValue('20')).toBeDefined());
  });
});
