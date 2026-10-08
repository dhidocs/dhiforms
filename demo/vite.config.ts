import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The demo imports the package from source, so edits show without a build.
export default defineConfig({
  root: 'demo',
  plugins: [react()],
  css: { modules: { generateScopedName: 'df-[local]-[hash:base64:5]' } },
})
