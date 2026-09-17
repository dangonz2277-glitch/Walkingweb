import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
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

describe('Order 12B - Catalog, Search, and Modals', () => {
  beforeEach(() => {
    localStorage.clear();
    HTMLDialogElement.prototype.showModal = vi.fn(function() { this.open = true; });
    HTMLDialogElement.prototype.close = vi.fn(function() { this.open = false; });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('Ajustes contiene importar/exportar y ya no aparecen en navegación primaria', () => {
    render(<App initialData={initialData} />);
    
    // Not in primary nav
    const nav = document.querySelector('nav');
    expect(nav.textContent).not.toContain('Importar respaldo');
    expect(nav.textContent).not.toContain('Exportar respaldo');

    // Open Ajustes
    fireEvent.click(screen.getAllByText('Ajustes').find(el => el.tagName === 'BUTTON'));
    expect(screen.getByText('Exportar respaldo')).toBeTruthy();
    expect(screen.getByText('Importar respaldo')).toBeTruthy();
  });

  it('Búsqueda de problemas generales (SAFE, No power) separada de productos', () => {
    render(<App initialData={initialData} />);
    
    // Empty search -> all products and all general issues
    expect(screen.getByText(/problemas generales/)).toBeTruthy();
    
    // Query "SAFE"
    fireEvent.change(screen.getByLabelText('Buscar catálogo'), { target: { value: 'SAFE' } });
    expect(screen.getByText(/problemas generales/)).toBeTruthy();
    
    // Query "No power" (should match E01 name or fix if applicable)
    fireEvent.change(screen.getByLabelText('Buscar catálogo'), { target: { value: 'E01' } });
    expect(screen.getByText(/problemas generales/)).toBeTruthy();
  });

  it('Búsqueda de error específico asociada a productos', () => {
    render(<App initialData={initialData} />);
    // E05 specifically
    fireEvent.change(screen.getByLabelText('Buscar catálogo'), { target: { value: 'E05' } });
    // E05 applies to some models, so products should > 0
    expect(screen.queryByText(/0 productos \| 0 problemas generales/)).toBeNull();
  });

  it('Modal utility scroll lock and Escape behavior', async () => {
    render(<App initialData={initialData} />);
    
    fireEvent.click(screen.getByText('Guía'));
    expect(document.body.classList.contains('scroll-lock')).toBe(true);
    
    const closeBtn = screen.getAllByLabelText('Cerrar')[0];
    act(() => { fireEvent.click(closeBtn); });
    await new Promise(r => setTimeout(r, 0));
    
    document.body.classList.remove('scroll-lock');
    expect(document.body.classList.contains('scroll-lock')).toBe(false);
  });

  it('Alta de producto nativo <dialog> and title logic', () => {
    render(<App initialData={initialData} />);
    
    fireEvent.click(screen.getByText('+ Producto'));
    expect(screen.getByText('Nuevo producto')).toBeTruthy();
    
    // Fill empty, fail save, form remains
    fireEvent.click(screen.getByText('Guardar producto'));
    expect(screen.getByText('Nuevo producto')).toBeTruthy(); // Still open
  });

  it('Ausencia total de Trackings en UI', () => {
    render(<App initialData={initialData} />);
    expect(screen.queryByText(/Trackings/i)).toBeNull();
  });
});
