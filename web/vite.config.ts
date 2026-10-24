/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

// VITE_BASE lets the preview build live under a subpath (GitHub Pages: /coffee-tracker/)
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Coffee Tracker',
        short_name: 'Coffee',
        description: 'Beans, brews and cups at home',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        theme_color: '#121212',
        background_color: '#121212',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Web Push handler ("How's the cup?"), kept as a plain script next to the generated worker
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            // Thumbnails never change for a given id: keep them for offline browsing
            urlPattern: ({ url }) => url.pathname.includes('/api/photos/') && url.searchParams.get('size') === 'thumb',
            handler: 'CacheFirst',
            options: { cacheName: 'thumbs', expiration: { maxEntries: 800 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/api/photos/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'photos', expiration: { maxEntries: 40 } },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
