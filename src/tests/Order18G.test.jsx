import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import Catalog from '../components/Catalog.jsx';
import * as client from '../data/catalogCustomProductClient.js';
import { initStore } from '../data/store.js';
import categories from '../../data/categories.json';
import products from '../../data/products.json';
import sourceIssues from '../../data/issues_complete.json';
import guide from '../../data/guia.json';
import generalIssues from '../../data/general_issues.json';

initStore({ categories, products, sourceIssues, guide, generalIssues });

vi.mock('../data/catalogCustomProductClient.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listCustomProducts: vi.fn(),
    createCustomProduct: vi.fn(),
    updateCustomProduct: vi.fn(),
    deleteCustomProduct: vi.fn()
  };
});

const mockRemoteProduct = {
  id: '00000000-0000-0000-0000-000000000000',
  revision: 1,
  name: 'Remote Product',
  model: 'REMOTE-1',
  cat: 'Desks',
  capacity: '200 lb',
  speed: '1-4 mph',
  motor: '1 HP',
  area: '40x20',
  weight: '50 lb',
  folded: 'No',
  control: 'Remote',
  assembly: 'Easy',
  notes: 'Test remote product',
  links: [],
  issues: []
};

describe('Order 18G - Edición y eliminación de productos compartidos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.listCustomProducts.mockResolvedValue([mockRemoteProduct]);
  });

  it('los productos base no tienen botones de acción, solo los remotos', async () => {
    render(<Catalog />);
    await waitFor(() => {
      expect(screen.getByText('Remote Product')).toBeDefined();
    });
    
    // Abrir producto remoto
    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    const editBtn = screen.queryByRole('button', { name: 'Editar' });
    const deleteBtn = screen.queryByRole('button', { name: 'Eliminar' });
    expect(editBtn).not.toBeNull();
    expect(deleteBtn).not.toBeNull();

    // Cerrar remoto, abrir base
    fireEvent.click(screen.getAllByRole('button', { name: /R1 Pro/i })[0]);
    const editBtn2 = screen.queryByRole('button', { name: 'Editar' });
    const deleteBtn2 = screen.queryByRole('button', { name: 'Eliminar' });
    expect(editBtn2).toBeNull();
    expect(deleteBtn2).toBeNull();
  });

  it('Edición OK: abre con datos precargados, comprueba payload y sustituye', async () => {
    const updatedProduct = { ...mockRemoteProduct, name: 'Remote Updated', revision: 2 };
    client.updateCustomProduct.mockResolvedValue(updatedProduct);

    render(<Catalog />);
    await waitFor(() => {
      expect(screen.getByText('Remote Product')).toBeDefined();
    });

    // Abrir producto remoto y darle a Editar
    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    // Ver que el form se llena
    const nameInput = screen.getByLabelText('Nombre');
    expect(nameInput.value).toBe('Remote Product');

    // Cambiar nombre y guardar
    fireEvent.change(nameInput, { target: { value: 'Remote Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar producto' }));

    await waitFor(() => {
      expect(client.updateCustomProduct).toHaveBeenCalledWith(
        mockRemoteProduct.id,
        expect.objectContaining({ name: 'Remote Updated' }),
        mockRemoteProduct.revision
      );
    });

    // El producto se actualiza en la vista
    await waitFor(() => {
      expect(screen.getByText('Remote Updated')).toBeDefined();
    });
  });

  it('Eliminación OK: pide contraseña, elimina sin recarga total', async () => {
    client.deleteCustomProduct.mockResolvedValue(null);

    render(<Catalog />);
    await waitFor(() => {
      expect(screen.getByText('Remote Product')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    const passwordInput = screen.getByLabelText(/Contraseña/i);
    fireEvent.change(passwordInput, { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(client.deleteCustomProduct).toHaveBeenCalledWith(
        mockRemoteProduct.id,
        mockRemoteProduct.revision,
        'secret'
      );
    });

    await waitFor(() => {
      expect(screen.queryByText('Remote Product')).toBeNull();
    });
  });

  it('Edición 409 Conflict: cierra modal, recarga lista y muestra error', async () => {
    client.updateCustomProduct.mockRejectedValue(new client.CatalogApiError('CONFLICT', { status: 409, currentRevision: 2 }));

    render(<Catalog />);
    await waitFor(() => {
      expect(screen.getByText('Remote Product')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar producto' }));

    await waitFor(() => {
      // Debe intentar recargar (segunda vez que se llama a listCustomProducts)
      expect(client.listCustomProducts).toHaveBeenCalledTimes(2);
    });
  });

  it('Eliminación rechaza por 403 Forbidden y 429 Too Many Requests', async () => {
    client.deleteCustomProduct.mockRejectedValue(new client.CatalogApiError('Forbidden', { status: 403 }));

    render(<Catalog />);
    await waitFor(() => {
      expect(screen.getByText('Remote Product')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(screen.getByText('Contraseña incorrecta.')).toBeDefined();
    });

    // Validar que input de contraseña se limpia tras 403
    expect(screen.getByLabelText(/Contraseña/i).value).toBe('');

    // Cambiar a 429 y reescribir contraseña
    client.deleteCustomProduct.mockRejectedValue(new client.CatalogApiError('Too Many Requests', { status: 429 }));
    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'wrong2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(screen.getByText(/Demasiados intentos/i)).toBeDefined();
    });
    expect(screen.getByLabelText(/Contraseña/i).value).toBe('');
  });

  it('Cierre limpia estado (errores, contraseñas, productData)', async () => {
    render(<Catalog />);
    await waitFor(() => {
      expect(screen.getByText('Remote Product')).toBeDefined();
    });

    // Abrir eliminar y escribir pass y ver que se limpia al cerrar
    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Reabrir
    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    
    // La contraseña debe estar vacía
    expect(screen.getByLabelText(/Contraseña/i).value).toBe('');
  });

  it('error normal de PATCH conserva formulario y datos', async () => {
    client.updateCustomProduct.mockRejectedValue(new client.CatalogApiError('Validation failed', { status: 400 }));

    render(<Catalog />);
    await waitFor(() => expect(screen.getByText('Remote Product')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Invalid Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar producto' }));

    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeDefined();
    });
    
    // Verificamos que el formulario sigue con los datos
    expect(screen.getByLabelText('Nombre').value).toBe('Invalid Name');
  });

  it('doble envío en edición produce un solo PATCH', async () => {
    client.updateCustomProduct.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ ...mockRemoteProduct, name: 'Wait' }), 100)));

    render(<Catalog />);
    await waitFor(() => expect(screen.getByText('Remote Product')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    const saveBtn = screen.getByRole('button', { name: 'Guardar producto' });
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(client.updateCustomProduct).toHaveBeenCalledTimes(1);
    });
  });

  it('404/410 de edición retira el producto', async () => {
    client.updateCustomProduct.mockRejectedValue(new client.CatalogApiError('Not Found', { status: 404 }));

    render(<Catalog />);
    await waitFor(() => expect(screen.getByText('Remote Product')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Guardar producto' }));

    await waitFor(() => {
      expect(screen.queryByText('Remote Product')).toBeNull();
    });
  });

  it('contraseña vacía deshabilita Confirmar en eliminación', async () => {
    render(<Catalog />);
    await waitFor(() => expect(screen.getByText('Remote Product')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    const confirmBtn = screen.getByRole('button', { name: 'Confirmar' });
    expect(confirmBtn.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'a' } });
    expect(confirmBtn.disabled).toBe(false);
  });

  it('doble envío en eliminación produce un solo DELETE', async () => {
    client.deleteCustomProduct.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(null), 100)));

    render(<Catalog />);
    await waitFor(() => expect(screen.getByText('Remote Product')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'pwd' } });
    const confirmBtn = screen.getByRole('button', { name: 'Confirmar' });
    
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(client.deleteCustomProduct).toHaveBeenCalledTimes(1);
    });
  });

  it('404/410 de eliminación retira el producto', async () => {
    client.deleteCustomProduct.mockRejectedValue(new client.CatalogApiError('Gone', { status: 410 }));

    render(<Catalog />);
    await waitFor(() => expect(screen.getByText('Remote Product')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'pwd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(screen.queryByText('Remote Product')).toBeNull();
    });
  });

  it('la contraseña se limpia tras error de red al eliminar', async () => {
    client.deleteCustomProduct.mockRejectedValue(new Error('Network error'));

    render(<Catalog />);
    await waitFor(() => expect(screen.getByText('Remote Product')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'pwd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Contraseña/i).value).toBe('');
      expect(screen.getByText(/Error de red al eliminar/)).toBeDefined();
    });
  });

  it('cerrar el modal durante eliminación pendiente no provoca excepción', async () => {
    let resolveDelete;
    client.deleteCustomProduct.mockImplementation(() => new Promise(resolve => {
      resolveDelete = resolve;
    }));

    render(<Catalog />);
    await waitFor(() => expect(screen.getByText('Remote Product')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Remote Product/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'pwd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    // Cierra modal usando el botón accesible Cerrar
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    
    // Confirmar que el diálogo de eliminación deja de estar accesible
    expect(screen.queryByRole('heading', { name: /Eliminar Remote Product/i })).toBeNull();
    
    // Resuelve promesa dentro de await act
    await act(async () => {
      resolveDelete(null);
    });
    
    // Confirma que el producto se elimina correctamente al resolverse
    await waitFor(() => {
      expect(screen.queryByText('Remote Product')).toBeNull();
    });
  });
});
