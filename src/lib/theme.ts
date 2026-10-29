/**
 * Theme control.
 *
 * Three modes: 'light' | 'dark' | 'system'. 'system' follows the OS
 * `prefers-color-scheme` and keeps following it live — if the user flips
 * their OS theme while PayLens is open, the app follows without a reload.
 *
 * The mode is persisted in localStorage under `paylens.theme`. When nothing
 * is stored we fall back to 'system', so a first-time visitor gets the
 * theme their OS already prefers.
 */

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'paylens.theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The mode the user last chose, defaulting to 'system'. */
export function getStoredTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'system'
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

/** The OS preference, independent of what the user chose. */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/** Collapse a mode into the concrete theme that should be painted. */
export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme
}

/** Paint the resolved theme onto <html> by toggling the `.dark` class. */
export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', resolveTheme(theme) === 'dark')
}

/** Persist the mode and paint it immediately. */
export function setTheme(theme: Theme) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_STORAGE_KEY, theme)
  applyTheme(theme)
}

/**
 * Call `onChange` whenever the OS color scheme flips. Only meaningful while
 * the active mode is 'system' — returns an unsubscribe function either way.
 */
export function watchSystemTheme(onChange: (theme: ResolvedTheme) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia(DARK_QUERY)
  const handler = (e: MediaQueryListEvent) => onChange(e.matches ? 'dark' : 'light')
  mql.addEventListener('change', handler)
  return () => mql.removeEventListener('change', handler)
}
