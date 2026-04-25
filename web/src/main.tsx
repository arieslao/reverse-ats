import { StrictMode, useEffect, useRef, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { ThemeProvider } from './lib/theme'
import { useAuthStore } from './stores/auth'

// Initialize Supabase auth subscription exactly once for the page's lifetime.
// StrictMode double-invokes effects in dev — the ref guard prevents a second
// subscription on re-mount, and we deliberately do NOT return a cleanup:
// AuthInit lives at the root of the tree and never unmounts in production,
// and unsubscribing on the StrictMode tear-down would leave the app with no
// listener for INITIAL_SESSION on re-mount.
function AuthInit({ children }: { children: ReactNode }) {
  const initialized = useRef(false)
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    useAuthStore.getState().initialize()
  }, [])
  return <>{children}</>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthInit>
        <App />
      </AuthInit>
    </ThemeProvider>
  </StrictMode>,
)
