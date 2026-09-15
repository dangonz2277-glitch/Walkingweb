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
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) { if (key === 'walkingpad_local_products') throw Error('quota'); return original.call(this, key, value); });
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
    const saved = JSON.parse(localStorage.getItem('walkingpad_local_products'));
    expect(saved[0].links[0].price).toBe('$100');
    expect(screen.getByText('43 productos')).toBeTruthy();
  });
  it('permite editar un producto base, creando un override local, y revertirlo', () => {
    render(<App initialData={initialData} />);
    
    // Editar el primer producto
    fireEvent.click(screen.getByRole('button', { name: new RegExp(first.name) }));
    fireEvent.click(screen.getByText('Editar'));
    
    // Modificar capacidad
    fireEvent.change(screen.getByLabelText('Capacidad'), { target: { value: '500 kg' } });
    fireEvent.click(screen.getByText('Guardar producto'));
    
    // Comprobar visualmente que dice Local Override y tiene 500 kg
    expect(screen.getByText(/Override Local/)).toBeTruthy();
    expect(screen.getByText(/500 kg/)).toBeTruthy();
    
    // Comprobar storage
    const saved = JSON.parse(localStorage.getItem('walkingpad_local_products'));
    expect(saved.length).toBe(1);
    expect(saved[0].isOverride).toBe(true);
    
    // Revertir
    window.confirm = () => true;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(first.name) })); // Expandir
    fireEvent.click(screen.getByText('Revertir a base'));
    
    const savedAfterRevert = JSON.parse(localStorage.getItem('walkingpad_local_products'));
    expect(savedAfterRevert.length).toBe(0);
  });
  it('no muestra el módulo retirado', () => {
    render(<App initialData={initialData} />);
    expect(screen.queryByRole('button', { name: 'Trackings' })).toBeNull();
  });
  
  it('renombra y revierte únicamente X21 entre los siete modelos —', () => {
    render(<App initialData={initialData} />);
    
    // Buscar X21
    fireEvent.change(screen.getByLabelText('Buscar catálogo'), { target: { value: 'X21' } });
    
    // Hay X21, X214, X218. Queremos exactamente X21. 
    // El texto del botón incluye nombre y modelo: "X21 —"
    const x21Button = screen.getAllByRole('button').find(b => b.textContent.includes('X21 —'));
    fireEvent.click(x21Button);
    fireEvent.click(screen.getByText('Editar'));
    
    // Renombrar a X21 Pro
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'X21 Pro' } });
    fireEvent.click(screen.getByText('Guardar producto'));
    
    // Debería encontrarse ahora el X21 Pro y el badge de Override Local
    expect(screen.getByText(/X21 Pro/)).toBeTruthy();
    expect(screen.getByText(/Override Local/)).toBeTruthy();
    
    // Limpiar búsqueda
    fireEvent.change(screen.getByLabelText('Buscar catálogo'), { target: { value: '' } });
    
    // Contar cuántos "Override Local" hay (debería ser 1, no 7)
    expect(screen.getAllByText(/Override Local/).length).toBe(1);
    
    // Revertir X21 Pro
    window.confirm = () => true;
    const x21ProButton = screen.getAllByRole('button').find(b => b.textContent.includes('X21 Pro —'));
    fireEvent.click(x21ProButton);
    fireEvent.click(screen.getByText('Revertir a base'));
    
    expect(screen.queryByText(/Override Local/)).toBeNull();
  });

  it('edita por separado los dos productos con modelo TRG1F', () => {
    render(<App initialData={initialData} />);
    
    fireEvent.change(screen.getByLabelText('Buscar catálogo'), { target: { value: 'TRG1F' } });
    
    // Ambos TRG1F (Denise Austin 2.0 y Denise Austin)
    const buttons = screen.getAllByRole('button', { name: /Denise Austin/ });
    expect(buttons.length).toBe(2);
    
    // Editar el primero
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getAllByText('Editar')[0]); // El botón editar del que está expandido
    
    fireEvent.change(screen.getByLabelText('Capacidad'), { target: { value: '999 kg' } });
    fireEvent.click(screen.getByText('Guardar producto'));
    
    // Contar overrides
    expect(screen.getAllByText(/Override Local/).length).toBe(1);
  });

  it('recarga tras editar y mantiene exactamente 42 productos base (sin duplicar)', async () => {
    // Simulamos que ya editamos un producto en storage
    localStorage.setItem('walkingpad_local_products', JSON.stringify([
      { baseId: 'base:Vertical Fold|X218|WP510B4', name: 'X218 Editado', isOverride: true }
    ]));
    
    render(<App initialData={initialData} />);
    // La suma de base + custom. Como hay 42 base y el override NO es custom (fusiona con la base), total debe ser 42.
    expect(screen.getByText('42 productos')).toBeTruthy();
    expect(await screen.findByText(/X218 Editado/)).toBeTruthy();
  });

  it('resuelve migración con ambas claves, conserva conflictos y no borra antigua si falla validación/cuota', async () => {
    localStorage.setItem('walkingpad_custom_products', JSON.stringify([
      { name: 'X21', model: '—', speed: 'Rápido', isOverride: true },
      { name: 'Nuevo1', model: 'N1', cat: 'Classic', id: 'c1' }
    ]));
    localStorage.setItem('walkingpad_local_products', JSON.stringify([
      { baseId: 'base:Vertical Fold|X21|—', name: 'X21', model: '—', speed: 'Lento', isOverride: true },
      { name: 'Nuevo1', model: 'N1', cat: 'Classic', id: 'c1' }
    ]));
    
    // Forzamos un fallo en VERIFICACIÓN (pero no en lectura inicial)
    const originalGet = Storage.prototype.getItem;
    let readCount = 0;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function(key) {
      if (key === 'walkingpad_local_products') {
        readCount++;
        // La lectura inicial pasa bien (readCount = 1).
        // La lectura de verificación (readCount = 2) simula fallo devolviendo '[]'
        if (readCount === 2) return '[]';
      }
      return originalGet.call(this, key);
    });

    render(<App initialData={initialData} />);
    
    // Verificamos que la clave antigua NO se borró porque falló la verificación
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(originalGet.call(localStorage, 'walkingpad_custom_products')).toBeTruthy();
    
    vi.restoreAllMocks();
    cleanup();
    
    // Ahora probamos que funciona y borra la antigua si la verificación es exitosa
    render(<App initialData={initialData} />);
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(localStorage.getItem('walkingpad_custom_products')).toBeNull();
    
    // Verificamos que se guardaron los conflictos
    const conflicts = JSON.parse(localStorage.getItem('walkingpad_migration_conflicts'));
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].existing.speed).toBe('Lento');
    expect(conflicts[0].incoming.speed).toBe('Rápido');
  });

  it('conserva visible un override antiguo huérfano (cero coincidencias) que ya estaba en locals', async () => {
    localStorage.setItem('walkingpad_local_products', JSON.stringify([
      { name: 'X21 Raro', model: 'Desconocido', speed: 'Rápido', isOverride: true } // isOverride sin baseId y con nombre raro para no hacer match
    ]));
    render(<App initialData={initialData} />);
    
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    
    // Debería encontrarse porque store.js lo marca con migrationConflict = true en lugar de omitirlo
    expect(await screen.findByText(/X21 Raro/)).toBeTruthy();
  });

  it('conserva productos personalizados históricos sin id como custom local estable', async () => {
    localStorage.setItem('walkingpad_custom_products', JSON.stringify([
      { name: 'Mi Invento', model: 'INV1', cat: 'Classic' } // Sin ID ni baseId, y no coincide con un base
    ]));
    render(<App initialData={initialData} />);
    
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    
    // Verificamos que se migró
    const locals = JSON.parse(localStorage.getItem('walkingpad_local_products'));
    expect(locals.length).toBe(1);
    expect(locals[0].isCustom).toBe(true);
    expect(locals[0].isOverride).toBe(false);
    expect(locals[0].id).toMatch(/^legacy_custom_INV1_MiInvento$/);
  });

  it('no borra la clave antigua si falla por cuota al guardar los conflictos', async () => {
    localStorage.setItem('walkingpad_custom_products', JSON.stringify([
      { name: 'X21', model: '—', speed: 'Rápido', isOverride: true }
    ]));
    localStorage.setItem('walkingpad_local_products', JSON.stringify([
      { baseId: 'base:Vertical Fold|X21|—', name: 'X21', model: '—', speed: 'Lento', isOverride: true }
    ]));

    // Simulamos fallo de cuota solo en la escritura de conflictos
    const originalSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
      if (key === 'walkingpad_migration_conflicts') throw new Error('quota');
      return originalSet.call(this, key, value);
    });

    render(<App initialData={initialData} />);
    
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    
    // Debería abortar la eliminación de la clave antigua
    expect(localStorage.getItem('walkingpad_custom_products')).toBeTruthy();
  });
  
  it('no emite errores de consola durante el montaje (evita fallos de hidratación)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<App initialData={initialData} />);
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
