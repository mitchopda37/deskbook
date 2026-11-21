import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, SheetProvider, ToastProvider } from './lib/store'
import App from './App'
import './index.css'

const saved = localStorage.getItem('theme')
document.documentElement.dataset.theme =
  saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
