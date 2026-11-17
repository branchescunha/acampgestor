export const THEME_STORAGE_KEY = 'acampgestor:theme'

export function resolveTheme(saved, prefersDark = true) {
  return saved === 'light' || saved === 'dark' ? saved : prefersDark ? 'dark' : 'light'
}

export function readTheme(storage, prefersDark) {
  try {
    return resolveTheme(storage.getItem(THEME_STORAGE_KEY), prefersDark)
  } catch {
    return resolveTheme(null, prefersDark)
  }
}

export function saveTheme(storage, theme) {
  if (theme !== 'light' && theme !== 'dark') return false
  try {
    storage.setItem(THEME_STORAGE_KEY, theme)
    return true
  } catch {
    return false
  }
}

export function applyTheme(doc, theme) {
  const value = resolveTheme(theme)
  doc.documentElement.dataset.theme = value
  doc.documentElement.style.colorScheme = value
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'light' ? '#f4f6f8' : '#101215')
}
