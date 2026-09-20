import { useEffect, useRef, useState } from 'react';
import { THEME_KEY, isTheme } from '../theme.js';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('light');
  const explicitChoice = useRef(false);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = value => {
      document.documentElement.dataset.theme = value;
      setTheme(value);
    };
    const readPreference = () => {
      let stored;
      try { stored = localStorage.getItem(THEME_KEY); } catch { /* Use system preference. */ }
      explicitChoice.current = isTheme(stored);
      apply(explicitChoice.current ? stored : media?.matches ? 'dark' : 'light');
    };
    readPreference();
    const onSystemChange = event => {
      if (!explicitChoice.current) apply(event.matches ? 'dark' : 'light');
    };
    const onStorage = event => {
      if (event.key === THEME_KEY || event.key === null) readPreference();
    };
    media?.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorage);
    return () => {
      media?.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    explicitChoice.current = true;
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Keep the choice for this session. */ }
  };
  const label = theme === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro';
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
    <svg className="theme-icon-moon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z" /></svg>
    <svg className="theme-icon-sun" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
  </button>;
}
