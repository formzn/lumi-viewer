import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // The Arena preview proxies through its own host, so accept any origin/host.
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
  },
})
