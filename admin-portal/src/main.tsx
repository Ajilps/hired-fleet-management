import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './shared/styles/index.css'
import App from './app/App'
import { QueryProvider } from './app/providers/QueryProvider'
import { AuthSessionMonitor, AuthSessionBootstrap } from './features/auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <AuthSessionBootstrap>
        <AuthSessionMonitor />
        <BrowserRouter><App /></BrowserRouter>
      </AuthSessionBootstrap>
    </QueryProvider>
  </StrictMode>,
)
