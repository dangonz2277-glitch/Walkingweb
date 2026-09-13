import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import App from '../App.jsx';
import { initStore, getBaseProducts, getIssues } from '../data/store.js';
import categories from '../../data/categories.json';
import products from '../../data/products.json';
import sourceIssues from '../../data/issues_complete.json';
import guide from '../../data/guia.json';
import generalIssues from '../../data/general_issues.json';

const initialData = { categories, products, sourceIssues, guide, generalIssues };
initStore(initialData);

const first = getBaseProducts().find(p => getIssues(p.issueKey).length);

describe('interfaz React', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it('muestra 42 productos, busca un error y abre su detalle', () => {
    render(<App initialData={initialData} />);
    expect(screen.getByText('42 productos')).toBeTruthy();
    const issue = getIssues(first.issueKey)[0];
    fireEvent.change(screen.getByLabelText('Buscar catálogo'), { target: { value: issue.code } });
    expect(screen.getByText(/productos$/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Buscar catálogo'), { target: { value: first.model } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(first.name) }));
    expect(screen.getByText('Errores conocidos')).toBeTruthy();
  });
  it('mantiene formulario de producto cuando falla el guardado', () => {
    render(<App initialData={initialData} />); fireEvent.click(screen.getByText('+ Producto'));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuevo' } });
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'N1' } });
    fireEvent.change(screen.getByLabelText('Capacidad'), { target: { value: '100 kg' } });
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) { if (key === 'walkingpad_custom_products') throw Error('quota'); return original.call(this, key, value); });
    fireEvent.click(screen.getByText('Guardar producto'));
    expect(screen.getByLabelText('Nombre').value).toBe('Nuevo');
    expect(screen.getByRole('status').textContent).toMatch(/No se pudo guardar/);
  });
  it('guarda un producto con enlace y precio manual', () => {
    render(<App initialData={initialData} />); fireEvent.click(screen.getByText('+ Producto'));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Local' } });
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'L1' } });
    fireEvent.change(screen.getByLabelText('Capacidad'), { target: { value: '100 kg' } });
    fireEvent.click(screen.getByText('+ Enlace'));
    fireEvent.change(screen.getByLabelText('URL 1'), { target: { value: 'https://example.com/producto' } });
    fireEvent.change(screen.getByLabelText('Precio 1'), { target: { value: '$100' } });
    fireEvent.click(screen.getByText('Guardar producto'));
    const saved = JSON.parse(localStorage.getItem('walkingpad_custom_products'));
    expect(saved[0].links[0].price).toBe('$100');
    expect(screen.getByText('43 productos')).toBeTruthy();
  });
  it('no muestra el módulo retirado', () => {
    render(<App initialData={initialData} />);
    expect(screen.queryByRole('button', { name: 'Trackings' })).toBeNull();
  });
});
