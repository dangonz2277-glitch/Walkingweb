import { render, screen, fireEvent,cleanup, waitFor } from '@testing-library/react';
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

describe('Order 12F - Catalog Race Condition', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('Mantiene tarjeta expandida (X218) y Editar visible tras la hidratación diferida', async () => {
    // Renderear con timers reales
    render(<App initialData={initialData} />);
    
    // Inmediatamente buscar y expandir X218 (antes de que act() procese el setTimeout de useEffect)
    const x218Btn = screen.getByRole('button', { name: /X218/i });
    
    // Abrimos el detalle síncronamente
    fireEvent.click(x218Btn);
    
    // Verificamos que Editar esté visible en este momento exacto
    expect(screen.getByText('Editar')).toBeTruthy();

    // Ahora esperamos a que el setTimeout de Catalog.jsx reemplace el array de products
    // (waitFor internamente da tiempo al event loop)
    await waitFor(() => {
      // Si la carrera se activa, Editar desaparecerá. Como lo arreglamos, debe estar aquí.
      expect(screen.getByText('Editar')).toBeTruthy();
    });
    
    // Y el botón debe seguir diciendo aria-expanded=true
    expect(x218Btn.getAttribute('aria-expanded')).toBe('true');
  });
});
