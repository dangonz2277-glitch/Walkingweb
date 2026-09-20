import "./setup.js";
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Catalog from '../components/Catalog.jsx';
import * as client from '../data/catalogCustomProductClient.js';
import { getBaseProducts, initStore } from '../data/store.js';

import categories from '../../data/categories.json';
import products from '../../data/products.json';
import sourceIssues from '../../data/issues_complete.json';
import guide from '../../data/guia.json';
import generalIssues from '../../data/general_issues.json';

initStore({ categories, products, sourceIssues, guide, generalIssues });

vi.mock('../data/catalogCustomProductClient.js', () => ({
  listCustomProducts: vi.fn(),
  createCustomProduct: vi.fn(),
  CatalogApiError: class CatalogApiError extends Error {
    constructor(msg, details) {
      super(msg);
      this.name = 'CatalogApiError';
      Object.assign(this, details);
    }
  }
}));

describe('Order 18F - Remote Catalog Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.listCustomProducts.mockResolvedValue([]);
  });

  it('render inicial muestra 42 productos base sin acciones de edición/reversión/eliminación', async () => {
    client.listCustomProducts.mockResolvedValue([]);
    render(<Catalog />);
    
    const baseCount = getBaseProducts().length;
    expect(screen.getByText(new RegExp(`^${baseCount} productos?`))).toBeDefined();
    
    const firstProductBtn = screen.getAllByRole('button', { name: /R1 Pro/i })[0];
    fireEvent.click(firstProductBtn);
    
    await waitFor(() => {
      const modal = screen.getByRole('dialog');
      expect(modal).toBeDefined();
      expect(screen.queryByText('Editar')).toBeNull();
      expect(screen.queryByText('Revertir a base')).toBeNull();
      expect(screen.queryByText('Eliminar')).toBeNull();
    });
  });

  it('incorpora productos remotos al resolver lectura', async () => {
    client.listCustomProducts.mockResolvedValue([
      { id: '11111111-1111-1111-1111-111111111111', revision: 1, name: 'Remote Walker', model: 'RW-1', cat: 'Caminadoras', capacity: '120 kg', links: [], issues: [] }
    ]);
    
    render(<Catalog />);
    await waitFor(() => {
      expect(screen.getByText('Remote Walker')).toBeDefined();
      expect(screen.getByText('Compartido')).toBeDefined();
    });
  });

  it('fallo de lectura conserva productos base y permite reintentar', async () => {
    client.listCustomProducts.mockRejectedValueOnce(new Error('Network Fail'));
    client.listCustomProducts.mockResolvedValueOnce([
      { id: '22222222-2222-2222-2222-222222222222', revision: 1, name: 'Retry Walker', model: 'RW-2', cat: 'Caminadoras', capacity: '120 kg', links: [], issues: [] }
    ]);

    render(<Catalog />);
    
    await waitFor(() => {
      expect(screen.getByText('Network Fail')).toBeDefined();
      expect(screen.getByText(/R1 Pro/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText('Reintentar cargar compartidos'));
    
    await waitFor(() => {
      expect(screen.queryByText('Network Fail')).toBeNull();
      expect(screen.getByText('Retry Walker')).toBeDefined();
    });
    
    expect(client.listCustomProducts).toHaveBeenCalledTimes(2);
  });

  it('aborto al desmontar no muestra error y aborta el signal', async () => {
    let capturedSignal = null;
    client.listCustomProducts.mockImplementation(({ signal }) => {
      capturedSignal = signal;
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('AbortError');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const { unmount } = render(<Catalog />);
    
    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal.aborted).toBe(false);

    unmount();
    
    expect(capturedSignal.aborted).toBe(true);
    
    client.listCustomProducts.mockImplementation(() => {
      const err = new Error('AbortError');
      err.name = 'AbortError';
      return Promise.reject(err);
    });
    render(<Catalog />);
    await waitFor(() => {
      expect(screen.queryByText('AbortError')).toBeNull();
      expect(screen.queryByText('Error de conexión')).toBeNull();
    });
  });

  it('creación correcta y aparición inmediata', async () => {
    client.createCustomProduct.mockResolvedValue({
      id: '33333333-3333-3333-3333-333333333333', revision: 1, name: 'Nuevo Test', model: 'NT-1', cat: 'Caminadoras', capacity: '100kg', links: [], issues: []
    });

    render(<Catalog notify={vi.fn()} />);
    
    fireEvent.click(screen.getByText('+ Producto'));
    
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Nuevo producto/i })).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuevo Test' } });
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'NT-1' } });
    fireEvent.change(screen.getByLabelText(/Capacidad/i), { target: { value: '100kg' } });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar producto' }));

    await waitFor(() => {
      expect(client.createCustomProduct).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Nuevo Test', model: 'NT-1' }),
        expect.any(String)
      );
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getAllByText('Nuevo Test')[0]).toBeDefined();
    });
  });

  it('doble clic durante guardado produce una sola petición', async () => {
    let resolveCreate;
    client.createCustomProduct.mockReturnValue(new Promise(res => { resolveCreate = res; }));

    render(<Catalog />);
    fireEvent.click(screen.getByText('+ Producto'));
    
    await waitFor(() => screen.getByLabelText('Nombre'));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Test Doble' } });
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'TD-1' } });
    fireEvent.change(screen.getByLabelText(/Capacidad/i), { target: { value: '100kg' } });

    const saveBtn = screen.getByRole('button', { name: 'Guardar producto' });
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn);

    expect(client.createCustomProduct).toHaveBeenCalledTimes(1);
    
    await act(async () => {
      resolveCreate({ id: '44444444-4444-4444-4444-444444444444', revision: 1, name: 'Test Doble', model: 'TD-1', cat: 'Caminadoras', capacity: '100kg', links: [], issues: [] });
    });
  });

  it('error de guardado conserva datos, reintento reusa requestId, nueva alta usa otro requestId', async () => {
    client.createCustomProduct.mockRejectedValueOnce(new client.CatalogApiError('Validation Failed', { field: 'name' }));
    
    render(<Catalog />);
    fireEvent.click(screen.getByText('+ Producto'));
    
    await waitFor(() => screen.getByLabelText('Nombre'));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Fail Test' } });
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'FT-1' } });
    fireEvent.change(screen.getByLabelText(/Capacidad/i), { target: { value: '100kg' } });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar producto' }));

    await waitFor(() => {
      expect(screen.getByText('Validation Failed (name)')).toBeDefined();
      expect(screen.getByLabelText('Nombre').value).toBe('Fail Test');
    });

    const firstRequestId = client.createCustomProduct.mock.calls[0][1];
    
    client.createCustomProduct.mockResolvedValueOnce({
      id: '55555555-5555-5555-5555-555555555555', revision: 1, name: 'Fail Test', model: 'FT-1', cat: 'Caminadoras', capacity: '100kg', links: [], issues: []
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar producto' }));

    await waitFor(() => {
      expect(client.createCustomProduct).toHaveBeenCalledTimes(2);
      expect(client.createCustomProduct.mock.calls[1][1]).toBe(firstRequestId);
    });

    fireEvent.click(screen.getByText('+ Producto'));
    await waitFor(() => screen.getByRole('dialog'));
    
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Otra Test' } });
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'OT-1' } });
    fireEvent.change(screen.getByLabelText(/Capacidad/i), { target: { value: '100kg' } });

    client.createCustomProduct.mockResolvedValueOnce({
      id: '66666666-6666-6666-6666-666666666666', revision: 1, name: 'Otra Test', model: 'OT-1', cat: 'Caminadoras', capacity: '100kg', links: [], issues: []
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar producto' }));

    await waitFor(() => {
      const thirdRequestId = client.createCustomProduct.mock.calls[2][1];
      expect(thirdRequestId).not.toBe(firstRequestId);
    });
  });

  it('errores opcionales usan fix en payload y detalle, participan en búsqueda', async () => {
    client.listCustomProducts.mockResolvedValue([
      { 
        id: '77777777-7777-7777-7777-777777777777', revision: 1, name: 'Error Walker', model: 'EW-1', cat: 'Caminadoras', capacity: '100kg', links: [],
        issues: [{ code: 'EX99', name: 'Explosión', fix: 'Apagar', parts: 'Fusible' }] 
      }
    ]);
    
    render(<Catalog />);
    await waitFor(() => expect(screen.getByText('Error Walker')).toBeDefined());

    const searchInput = screen.getByPlaceholderText(/Buscar/i);
    fireEvent.change(searchInput, { target: { value: 'Explosión' } });
    
    expect(screen.getByText('Error Walker')).toBeDefined();
    expect(screen.queryByText('R1 Pro')).toBeNull();

    fireEvent.click(screen.getByText('Error Walker'));
    await waitFor(() => {
      expect(screen.getByText('EX99')).toBeDefined();
      expect(screen.getByText(/Explosión/i)).toBeDefined();
      expect(screen.getByText(/Fusible/i)).toBeDefined();
      expect(screen.getByText(/Apagar/i)).toBeDefined();
    });

    client.createCustomProduct.mockResolvedValueOnce({
      id: '88888888-8888-8888-8888-888888888888', revision: 1, name: 'Form Err', model: 'FE-1', cat: 'Caminadoras', capacity: '100kg', links: [], issues: []
    });

    fireEvent.click(screen.getByText('+ Producto'));
    await waitFor(() => screen.getByRole('dialog'));
    
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Form Err' } });
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'FE-1' } });
    fireEvent.change(screen.getByLabelText(/Capacidad/i), { target: { value: '100kg' } });

    fireEvent.click(screen.getByText('+ Error'));
    fireEvent.change(screen.getByLabelText('Código Error 1'), { target: { value: 'FX1' } });
    fireEvent.change(screen.getByLabelText('Nombre Error 1'), { target: { value: 'Falla' } });
    fireEvent.change(screen.getByLabelText('Solución Error 1'), { target: { value: 'Arreglar' } });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar producto' }));

    await waitFor(() => {
      expect(client.createCustomProduct).toHaveBeenCalledWith(
        expect.objectContaining({ 
          issues: [{ code: 'FX1', name: 'Falla', fix: 'Arreglar', parts: '' }] 
        }),
        expect.any(String)
      );
      const payload = client.createCustomProduct.mock.calls[0][0];
      expect(payload.issues[0]).not.toHaveProperty('solution');
    });
  });

  it('resuelve carrera de carga remota vs alta concurrente preservando el producto pendiente', async () => {
    let resolveGet;
    const getPromise = new Promise(res => { resolveGet = res; });
    client.listCustomProducts.mockReturnValue(getPromise);

    render(<Catalog />);
    
    await act(async () => {
      fireEvent.click(screen.getByText('+ Producto'));
    });
    
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Race Prod' } });
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'RACE-1' } });
    fireEvent.change(screen.getByLabelText(/Capacidad/i), { target: { value: '100kg' } });

    const newProd = { id: '99999999-9999-9999-9999-999999999999', revision: 1, name: 'Race Prod', model: 'RACE-1', cat: 'Caminadoras', capacity: '100kg', links: [], issues: [] };
    client.createCustomProduct.mockResolvedValueOnce(newProd);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar producto' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Race Prod')).toBeDefined();
    });

    // Ahora resolvemos el GET sin incluir el producto recién creado
    await act(async () => {
      resolveGet([
        { id: '00000000-0000-0000-0000-000000000000', revision: 1, name: 'Otro Prod', model: 'OTR-1', cat: 'Caminadoras', capacity: '100kg', links: [], issues: [] }
      ]);
    });

    await waitFor(() => {
      expect(screen.getByText('Otro Prod')).toBeDefined();
      const raceCards = screen.getAllByText('Race Prod');
      expect(raceCards.length).toBe(1); // El producto creado sigue visible una sola vez
    });
  });

  it('una carga posterior devuelve lista autoritativa y el producto remoto anterior desaparece', async () => {
    let rejectGet1, resolveGet2;
    const getPromise1 = new Promise((_, rej) => { rejectGet1 = rej; });
    const getPromise2 = new Promise(res => { resolveGet2 = res; });
    
    client.listCustomProducts.mockReturnValueOnce(getPromise1).mockReturnValueOnce(getPromise2);

    render(<Catalog />);
    
    await act(async () => {
      fireEvent.click(screen.getByText('+ Producto'));
    });
    
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Temp Prod' } });
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'TEMP-1' } });
    fireEvent.change(screen.getByLabelText(/Capacidad/i), { target: { value: '100kg' } });

    const newProd = { id: '12312312-1234-1234-1234-123456789012', revision: 1, name: 'Temp Prod', model: 'TEMP-1', cat: 'Caminadoras', capacity: '100kg', links: [], issues: [] };
    client.createCustomProduct.mockResolvedValueOnce(newProd);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar producto' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Temp Prod')).toBeDefined();
    });

    // Rechazamos la primera carga
    await act(async () => {
      rejectGet1(new Error('Network Error'));
    });

    await waitFor(() => {
      expect(screen.getByText('Reintentar cargar compartidos')).toBeDefined();
    });

    // Temp Prod sigue ahí porque ya estaba en estado
    expect(screen.getByText('Temp Prod')).toBeDefined();

    // Hacemos una carga posterior (reintento)
    await act(async () => {
      fireEvent.click(screen.getByText('Reintentar cargar compartidos'));
    });

    // Resolvemos la carga posterior sin Temp Prod
    await act(async () => {
      resolveGet2([
        { id: '11111111-2222-3333-4444-555555555555', revision: 1, name: 'Authoritative Prod', model: 'AUTH-1', cat: 'Caminadoras', capacity: '100kg', links: [], issues: [] }
      ]);
    });

    await waitFor(() => {
      expect(screen.getByText('Authoritative Prod')).toBeDefined();
      // Temp Prod debe desaparecer porque la carga posterior es autoritativa
      expect(screen.queryByText('Temp Prod')).toBeNull();
    });
  });
});
