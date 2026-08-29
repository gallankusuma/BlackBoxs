import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

// Versi & waktu build disuntikkan saat build, bukan ditulis tangan di layar —
// baris yang harus diperbarui manual akan berhenti diperbarui.
const versiApp = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const waktuBuild = new Date().toISOString();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(versiApp),
    __BUILD_TIME__: JSON.stringify(waktuBuild),
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Blackboxs — Employee Portal',
        short_name: 'Blackboxs',
        description: 'Absensi & Slip Gaji Karyawan Blackboxs',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/mobile',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        shortcuts: [
          { name: 'Absen Sekarang', short_name: 'Absen', url: '/mobile/attend', icons: [{ src: '/blackbox-logo.png', sizes: '192x192' }] },
          { name: 'Slip Gaji', short_name: 'Slip', url: '/mobile/payslip', icons: [{ src: '/blackbox-logo.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Exclude /uploads/ and /api/ from SW navigation fallback
        // so nginx serves files directly without SW interception
        navigateFallbackDenylist: [/^\/uploads\//, /^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https?.*\/api\/hr\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-hr-cache', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
          },
          {
            // Serve uploaded files directly from network, never cache
            urlPattern: /^https?.*\/uploads\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: 'http://localhost:3005', changeOrigin: true },
    },
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'js/[name].[hash].js',
        chunkFileNames: 'js/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },
});


