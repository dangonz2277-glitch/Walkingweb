import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import App from '../App.jsx';
import { initStore } from '../data/store.js';

import categories from '../../data/categories.json';
import products from '../../data/products.json';
import sourceIssues from '../../data/issues_complete.json';
import guide from '../../data/guia.json';
import generalIssues from '../../data/general_issues.json';

const initialData = { categories, products, sourceIssues, guide, generalIssues };
initStore(initialData);

describe('Order 12C - Frontend fixes', () => {

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function() { this.open = true; });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function() { this.open = false; });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('búsquedas específicas exactas y conteos (SAFE, No power, E05)', async () => {
    render(<App initialData={initialData} />);
    
    await waitFor(() => expect(screen.queryByText(/42 productos/)).toBeTruthy());

    const input = screen.getByLabelText('Buscar catálogo');
    
    fireEvent.change(input, { target: { value: 'SAFE' } });
    await waitFor(() => expect(screen.queryByText((content) => content.includes("productos") && content.includes("| 2 problemas generales"))).toBeTruthy());
    expect(screen.getByText('SAFE · Display shows SAFE')).toBeTruthy();
    
    fireEvent.change(input, { target: { value: 'No power' } });
    await waitFor(() => expect(screen.queryByText((content) => content.includes("productos") && content.includes("| 1 problema general"))).toBeTruthy());
    expect(screen.getByText("No power · Machine won't turn on")).toBeTruthy();

    fireEvent.change(input, { target: { value: 'E05' } });
    await waitFor(() => expect(screen.queryByText((content) => content.includes("28 productos"))).toBeTruthy());
    expect(screen.queryByText((content, element) => {
       if (element.tagName !== 'STRONG') return false;
       return content.includes('X218');
    })).toBeTruthy();
    expect(screen.queryByText((content, element) => {
       if (element.tagName !== 'STRONG') return false;
       return content.includes('X25+');
    })).toBeTruthy();
  });

  it('Flujo completo de Modal: apertura, foco, Escape real, scroll-lock y retorno de foco', async () => {
    render(<App initialData={initialData} />);
    
    const guideBtn = screen.getByText('Guía');
    guideBtn.focus();
    act(() => { fireEvent.click(guideBtn); });
    
    expect(document.body.classList.contains('scroll-lock')).toBe(true);
    
    const title = screen.getByRole('heading', { name: 'Guía de capacitación' });
    const dialog = title.closest('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    
    act(() => {
      const cancelEvent = new Event('cancel', { bubbles: true, cancelable: true });
      dialog.dispatchEvent(cancelEvent);
    });

    expect(document.body.classList.contains('scroll-lock')).toBe(false);
    expect(document.activeElement).toBe(guideBtn);
  });

  it('Errores de persistencia y UI con alert, mantiene campos', async () => {
    render(<App initialData={initialData} />);
    
    act(() => { fireEvent.click(screen.getByText('+ Producto')); });
    
    const nameInput = screen.getByLabelText('Nombre');
    const modelInput = screen.getByLabelText('Modelo');
    const capInput = screen.getByLabelText('Capacidad');

    fireEvent.change(nameInput, { target: { value: 'Test' } });
    fireEvent.change(modelInput, { target: { value: 'M1' } });
    fireEvent.change(capInput, { target: { value: '100' } });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    act(() => { fireEvent.click(screen.getByText('Guardar producto')); });

    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('No se pudo guardar');

    expect(nameInput.value).toBe('Test');
    
    vi.restoreAllMocks();
  });

  it('Ajustes usa role alert/status e ignora Trackings en respaldo antiguo', async () => {
    render(<App initialData={initialData} />);
    
    act(() => { fireEvent.click(screen.getAllByText('Ajustes').find(e => e.tagName === 'BUTTON')); });
    
    const fileInput = screen.getByLabelText(/Importar respaldo/i);
    
    const oldBackup = {
      version: 1,
      keys: {
        walkingpad_local_products: JSON.stringify([{ name: 'Test', baseId: 'base:Vertical Fold|X21|—' }]),
        walkingpad_trackings: JSON.stringify({ "some": "data" })
      }
    };
    const file = new File([JSON.stringify(oldBackup)], "backup.json", { type: "application/json" });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(JSON.stringify(oldBackup)) });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Importación:');
    
    expect(localStorage.getItem('walkingpad_trackings')).toBeNull();
  });
});
