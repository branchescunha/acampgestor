import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfirmProvider } from './components/ConfirmProvider'
import { ToastProvider } from './components/ToastProvider'
import { AuthProvider } from './hooks/useAuth'
import ThemeToolbar from './components/ThemeToolbar'
import { applyTheme, readTheme } from './utils/theme'
import './index.css'
import App from './App.jsx'

let initialTheme = 'dark'
try {
  initialTheme = readTheme(window.localStorage, window.matchMedia('(prefers-color-scheme: dark)').matches)
} catch {
  // The application remains usable when browser storage is disabled.
}
applyTheme(document, initialTheme)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <ThemeToolbar />
          <div id="main-content" tabIndex={-1}>
            <App />
          </div>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  </StrictMode>
)
