import { StrictMode, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { ThemeProvider } from './lib/theme'
import { useAuthStore } from './stores/auth'

function AuthInit({ children }: { children: ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize)
  useEffect(() => initialize(), [initialize])
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
