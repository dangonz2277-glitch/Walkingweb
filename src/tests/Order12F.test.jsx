import { render, screen, fireEvent,cleanup, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import App from '../App.jsx';
import { initStore } from '../data/store.js';
import * as client from '../data/catalogCustomProductClient.js';

import categories from '../../data/categories.json';
import products from '../../data/products.json';
import sourceIssues from '../../data/issues_complete.json';
import guide from '../../data/guia.json';
import generalIssues from '../../data/general_issues.json';

const initialData = { categories, products, sourceIssues, guide, generalIssues };
initStore(initialData);

vi.mock('../data/catalogCustomProductClient.js', () => ({
  listCustomProducts: vi.fn(),
  createCustomProduct: vi.fn()
}));

describe('Order 12F - Catalog Race Condition', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('Mantiene tarjeta expandida (X218) tras la hidratación de compartidos', async () => {
    let resolveRemote;
    const remotePromise = new Promise(res => { resolveRemote = res; });
    client.listCustomProducts.mockReturnValue(remotePromise);

    render(<App initialData={initialData} />);

    // Inmediatamente buscar y expandir X218 (antes de que la promesa se resuelva)
    const x218Btn = screen.getByRole('button', { name: /X218/i });

    // Abrimos el detalle síncronamente
    fireEvent.click(x218Btn);

    // Verificamos que esté visible el detalle
    expect(screen.getByText('1–11.5 mph / 18 km/h')).toBeTruthy();

    // Simulamos que la respuesta remota llega y actualiza el estado
    await act(async () => {
      resolveRemote([{ id: 'uuid-1', revision: 1, name: 'Remote Walker', model: 'RW-1', cat: 'Caminadoras', capacity: '100', issues: [], links: [] }]);
    });

    await waitFor(() => {
      // El detalle debe seguir abierto
      expect(screen.getByText('1–11.5 mph / 18 km/h')).toBeTruthy();
      // Y el producto remoto debe haber sido inyectado
      expect(screen.getByText('Remote Walker')).toBeTruthy();
    });

    // Y el botón debe seguir diciendo aria-expanded=true
    expect(x218Btn.getAttribute('aria-expanded')).toBe('true');
  });
});
