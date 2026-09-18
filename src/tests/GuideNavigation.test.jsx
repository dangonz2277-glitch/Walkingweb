import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Guide from '../components/Guide.jsx';

vi.mock('../data/store.js', () => ({ getGuide: () => [
  { sec: 'Identificación', icon: '', items: [{ q: '¿Qué modelo?', a: 'Revisa la etiqueta.' }] },
  { sec: 'Mantenimiento', icon: '', items: [{ q: '¿Cómo lubricar?', a: 'Consulta el manual.' }] }
] }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('Consulta de Guía', () => {
  it('filtra respuestas y permite recuperar todas desde el estado vacío', () => {
    render(<Guide />);
    fireEvent.change(screen.getByLabelText('Buscar guía'), { target: { value: 'lubricar' } });
    expect(screen.getByText('1 respuesta')).toBeTruthy();
    expect(screen.getByText('¿Cómo lubricar?').closest('details').open).toBe(true);
    expect(screen.queryByText('¿Qué modelo?')).toBeNull();
    fireEvent.change(screen.getByLabelText('Buscar guía'), { target: { value: 'sin-coincidencia' } });
    expect(screen.getByText('No encontramos coincidencias')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(screen.getByText('2 respuestas')).toBeTruthy();
  });
  it('lleva el foco al encabezado elegido desde el índice', () => {
    render(<Guide />);
    const heading = screen.getByRole('heading', { name: 'Mantenimiento' });
    heading.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole('button', { name: 'Mantenimiento' }));
    expect(document.activeElement).toBe(heading);
    expect(heading.scrollIntoView).toHaveBeenCalled();
  });
});
