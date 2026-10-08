import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The admin panel is a separate app served under /v2admin/ (see docs/deployment.md).
export default defineConfig({
  base: '/v2admin/',
  plugins: [react()],
  server: { port: 5174, proxy: { '/api': process.env.VITE_DEV_API_TARGET || 'http://localhost:4000', '/media': process.env.VITE_DEV_API_TARGET || 'http://localhost:4000' } },
  build: { target: 'es2022', sourcemap: true },
});
