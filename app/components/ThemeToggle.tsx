'use client';

export default function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const isDark = root.getAttribute('data-theme') === 'dark';

    if (isDark) {
      root.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    } else {
      root.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle-button"
      onClick={toggleTheme}
      aria-label="Cambiar entre modo claro y modo oscuro"
    >
      <span className="theme-toggle-icon-light" aria-hidden="true">🌙</span>
      <span className="theme-toggle-icon-dark" aria-hidden="true">☀️</span>
    </button>
  );
}
