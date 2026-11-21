import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, SheetProvider, ToastProvider } from './lib/store'
import App from './App'
import './index.css'

// Light is the default for everyone. Dark only applies when the person picks it from the theme toggle.
let saved: string | null = null
try { saved = localStorage.getItem('deskbook-theme') } catch { /* storage blocked: stay light */ }
document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Transitions keep the current page on screen while the next one loads, instead of flashing a placeholder. */}
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <AuthProvider>
            <SheetProvider>
              <App />
            </SheetProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
