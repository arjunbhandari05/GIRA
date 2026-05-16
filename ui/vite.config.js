import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/api/, ''),
        // Default proxy timeouts can kill /brief (~60s+); keep sockets open for the full pipeline.
        timeout: 600_000,
        proxyTimeout: 600_000,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            req.setTimeout(600_000);
            proxyReq.setTimeout(600_000);
          });
        },
      },
    },
  },
});
