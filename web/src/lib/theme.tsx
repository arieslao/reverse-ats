import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

// User-controlled light/dark theme.
//   1. Reads from localStorage on mount (persists across sessions)
//   2. Falls back to system preference if no stored value
//   3. Sets data-theme on <html> so CSS variables flip via :root[data-theme="dark"]
//   4. Reactively re-applies if the user changes their OS preference
//      and hasn't explicitly chosen a theme yet

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'reverse-ats-theme'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null
  if (stored === 'light' || stored === 'dark') return stored
  return getSystemTheme()
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme())

  // Apply theme to <html data-theme=...>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Track system preference changes for users who haven't explicitly chosen
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) return // user has chosen, ignore system
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setThemeState(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>')
  return ctx
}

// Inline script that runs BEFORE React hydrates — prevents the brief flash of
// wrong theme on first paint. Returns the script tag content as a string so
// it can be injected into index.html.
export const NO_FLASH_SCRIPT = `
  (function() {
    try {
      var stored = localStorage.getItem('${STORAGE_KEY}');
      var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {}
  })();
`
