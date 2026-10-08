import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:4000';
  return {
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: false,
        injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'] },
        manifest: {
          id: '/',
          name: 'QUIZ WAR: Bangladesh',
          short_name: 'QUIZ WAR',
          description: 'Realtime multiplayer quiz battles for Bangladesh — 1 VS 1, Duo, Squad and AI.',
          lang: 'bn',
          start_url: '/?source=pwa',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#f4f6fb',
          theme_color: '#1d4ed8',
          categories: ['games', 'education', 'trivia'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'Quick Battle', url: '/battle?quick=1', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Daily Challenge', url: '/battle?daily=1', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': apiTarget,
        '/media': apiTarget,
        '/socket.io': { target: apiTarget, ws: true },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: { react: ['react', 'react-dom', 'react-router'], net: ['socket.io-client', '@tanstack/react-query'] },
        },
      },
    },
  };
});
