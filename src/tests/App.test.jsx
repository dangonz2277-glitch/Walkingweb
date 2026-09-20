import "./setup.js";

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
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
    expect(screen.getByText(/42 productos/)).toBeTruthy();
    const issue = getIssues(first.issueKey)[0];
    fireEvent.change(screen.getByLabelText('Buscar catálogo'), { target: { value: issue.code } });
    expect(screen.getByText(/^\d+ productos \|/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Buscar catálogo'), { target: { value: first.model } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(first.name) }));
    expect(screen.getByText('Errores conocidos')).toBeTruthy();
  });

  it('no muta las claves de almacenamiento local heredadas', async () => {
    const custom = JSON.stringify([{ name: 'X21', model: '—', speed: 'Rápido', isOverride: true }]);
    const locals = JSON.stringify([{ baseId: 'base:Vertical Fold|X21|—', name: 'X21', model: '—', speed: 'Lento', isOverride: true }]);
    const conflicts = JSON.stringify([{ existing: { speed: 'Lento' }, incoming: { speed: 'Rápido' } }]);

    localStorage.setItem('walkingpad_custom_products', custom);
    localStorage.setItem('walkingpad_local_products', locals);
    localStorage.setItem('walkingpad_migration_conflicts', conflicts);

    render(<App initialData={initialData} />);

    await act(async () => { await new Promise(r => setTimeout(r, 10)); });

    expect(localStorage.getItem('walkingpad_custom_products')).toBe(custom);
    expect(localStorage.getItem('walkingpad_local_products')).toBe(locals);
    expect(localStorage.getItem('walkingpad_migration_conflicts')).toBe(conflicts);
  });

  it('no emite errores de consola durante el montaje (evita fallos de hidratación)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<App initialData={initialData} />);
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
