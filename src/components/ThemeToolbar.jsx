import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, readTheme, saveTheme, THEME_STORAGE_KEY } from '../utils/theme'

export default function ThemeToolbar() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')

  useEffect(() => {
    function synchronize(event) {
      if (event.key !== THEME_STORAGE_KEY) return
      const next = readTheme(window.localStorage, window.matchMedia('(prefers-color-scheme: dark)').matches)
      applyTheme(document, next)
      setTheme(next)
    }
    window.addEventListener('storage', synchronize)
    return () => window.removeEventListener('storage', synchronize)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(document, next)
    try { saveTheme(window.localStorage, next) } catch { /* Storage can be unavailable in private contexts. */ }
    setTheme(next)
  }

  const label = theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'
  const Icon = theme === 'dark' ? Sun : Moon

  return (
    <header className="app-toolbar">
      <a href="#main-content" className="skip-link">Ir para o conteúdo</a>
      <a href="/" className="app-wordmark" aria-label="AcampGestor — início">
        <img src="/favicon.svg" width="25" height="25" alt="" />
        AcampGestor
      </a>
      <button type="button" onClick={toggleTheme} aria-label={label} title={label} className="theme-toggle">
        <Icon size={19} aria-hidden="true" />
      </button>
    </header>
  )
}
