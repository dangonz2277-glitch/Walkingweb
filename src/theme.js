export const THEME_KEY = 'walkingweb-theme';
export const isTheme = value => value === 'light' || value === 'dark';

// Runs before the body is painted; storage can be unavailable in private contexts.
export const themeInitScript = `(() => {
  let theme;
  try { theme = localStorage.getItem('${THEME_KEY}'); } catch {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
})();`;
