import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { THEME_KEY, themeInitScript } from '../theme.js';

describe('theme preference', () => {
  let media;
  let onChange;
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    media = { matches:false, addEventListener:vi.fn((_, cb) => { onChange = cb; }), removeEventListener:vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete document.documentElement.dataset.theme; });

  it('follows system changes until the user chooses and persists that choice', () => {
    render(<ThemeToggle />);
    expect(document.documentElement.dataset.theme).toBe('light');
    act(() => onChange({ matches:true }));
    fireEvent.click(screen.getByRole('button', { name:'Activar tema claro' }));
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    act(() => onChange({ matches:true }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('restores a saved preference over the system preference', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    const { unmount } = render(<ThemeToggle />);
    expect(screen.getByRole('button', { name:'Activar tema claro' })).toBeTruthy();
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', onChange);
  });

  it('syncs preferences across tabs', () => {
    render(<ThemeToggle />);
    localStorage.setItem(THEME_KEY, 'dark');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key:THEME_KEY })));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('still toggles when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name:'Activar tema oscuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('initializes before hydration and rejects invalid stored values', () => {
    localStorage.setItem(THEME_KEY, 'invalid');
    media.matches = true;
    Function(themeInitScript)();
    expect(document.documentElement.dataset.theme).toBe('dark');
    localStorage.setItem(THEME_KEY, 'light');
    Function(themeInitScript)();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
