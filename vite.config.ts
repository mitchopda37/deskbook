import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // React, Supabase and Motion together are ~500 kB before gzip (~155 kB gzipped); pages are split already.
  build: { chunkSizeWarningLimit: 700 },
})
