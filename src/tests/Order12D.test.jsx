import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import App from '../App.jsx';
import Modal from '../components/Modal.jsx';
import { initStore } from '../data/store.js';

import categories from '../../data/categories.json';
import products from '../../data/products.json';
import sourceIssues from '../../data/issues_complete.json';
import guide from '../../data/guia.json';
import generalIssues from '../../data/general_issues.json';

const initialData = { categories, products, sourceIssues, guide, generalIssues };
initStore(initialData);

describe('Order 12D - Parameterized Modals & Close', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function() { this.open = true; });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function() { this.open = false; });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const modalTests = [
    { name: 'Guía', triggerText: 'Guía', title: 'Guía de capacitación' },
    { name: 'Ajustes', triggerText: 'Ajustes', title: 'Ajustes', isNav: true },
    { name: 'Mi Reporte', triggerText: 'Mi Reporte', title: 'Mi Reporte', isAriaLabel: true, expectedHeading: 'Ingresar a Mi Reporte' },
    { name: 'Nuevo producto', triggerText: '+ Producto', title: 'Nuevo producto' },
    { name: 'Editar producto', triggerText: 'Editar', title: 'Editar producto', isEdit: true },
  ];

  modalTests.forEach(({ name, triggerText, title, isNav, isEdit, isAriaLabel, expectedHeading }) => {
    it(`Prueba parametrizada para ${name}: apertura, cancel, scroll-lock y retorno de foco`, async () => {
      render(<App initialData={initialData} />);

      // Wait for app load
      await waitFor(() => expect(screen.queryByText(/42 productos/)).toBeTruthy());

      let triggerBtn;
      if (isNav) {
         triggerBtn = screen.getAllByText(triggerText).find(e => e.tagName === 'BUTTON');
      } else if (isEdit) {
         // Expand first product to see edit button
         const prodCard = screen.getAllByRole('button').find(b => b.classList.contains('card-title'));
         act(() => { fireEvent.click(prodCard); });
         triggerBtn = screen.getAllByText(triggerText).find(e => e.tagName === 'BUTTON');
      } else {
         triggerBtn = screen.getByText(triggerText);
      }

      triggerBtn.focus();
      act(() => { fireEvent.click(triggerBtn); });

      expect(document.body.classList.contains('scroll-lock')).toBe(true);

      let dialog;
      if (isAriaLabel) {
        dialog = await screen.findByRole('dialog', { name: title });
        expect(dialog.getAttribute('aria-label')).toBe(title);
        // Verify the content heading exists
        await screen.findByRole('heading', { name: expectedHeading });
      } else {
        const heading = await screen.findByRole('heading', { name: title });
        dialog = heading.closest('dialog');
        expect(dialog).toBeTruthy();
        expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
        expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
      }

      act(() => {
        const cancelEvent = new Event('cancel', { bubbles: true, cancelable: true });
        dialog.dispatchEvent(cancelEvent);
      });

      // Editing now returns to the product dialog, which keeps the background locked.
      expect(document.body.classList.contains('scroll-lock')).toBe(Boolean(isEdit));
      expect(document.activeElement).toBe(triggerBtn);
    });
  });

  it('Modal onClose is called exactly once when cancel event occurs', () => {
    const handleClose = vi.fn();
    const triggerRef = { current: document.createElement('button') };

    render(<Modal isOpen={true} onClose={handleClose} title="Test Modal" triggerRef={triggerRef} ariaLabelledBy="test-title">
      <p>Content</p>
    </Modal>);

    const dialog = screen.getByRole('heading', { name: 'Test Modal' }).closest('dialog');

    act(() => {
      const cancelEvent = new Event('cancel', { bubbles: true, cancelable: true });
      dialog.dispatchEvent(cancelEvent);
    });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

import { supabase } from '../data/supabaseClient.js';
import * as authData from '../data/reportRepository.js';

describe('Order 12E - ReportPopup Accessible Names', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function() { this.open = true; });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function() { this.open = false; });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('Mi Reporte tiene nombre accesible en estado Cargando datos...', async () => {
    // Mock onAuthStateChange to immediately provide a session
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: { user: { id: 'test-user' } } } });
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((callback) => {
      callback('SIGNED_IN', { user: { id: 'test-user' } });
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    // Mock getProfile to never resolve or resolve slowly, so we stay in "Cargando datos..."
    let resolveProfile;
    const profilePromise = new Promise(r => { resolveProfile = r; });
    vi.spyOn(authData, 'getProfile').mockImplementation(() => profilePromise);

    render(<App initialData={initialData} />);

    await waitFor(() => expect(screen.queryByText(/42 productos/)).toBeTruthy());

    const reportBtn = screen.getAllByText('Mi Reporte').find(e => e.tagName === 'BUTTON');
    act(() => { fireEvent.click(reportBtn); });

    // The dialog should be in "Cargando datos..." state
    await screen.findByRole('heading', { name: 'Cargando datos...' });

    // Verify dialog has accessible name
    const dialog = screen.getByRole('dialog', { name: 'Mi Reporte' });
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-label')).toBe('Mi Reporte');

    // Resolve profile to prevent hanging promises if test ends
    resolveProfile({ success: false });
  });
});
