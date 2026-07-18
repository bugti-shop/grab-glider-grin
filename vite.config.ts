import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// Resolve `sonner-real` to the installed package when present, otherwise to a
// local no-op fallback. Prevents `ENOENT: node_modules/sonner` build failures
// when a partial install leaves the package missing.
const sonnerPkgPath = path.resolve(__dirname, "node_modules/sonner");
const sonnerRealTarget = fs.existsSync(sonnerPkgPath)
  ? sonnerPkgPath
  : path.resolve(__dirname, "./src/lib/sonnerFallback.ts");
if (!fs.existsSync(sonnerPkgPath)) {
  console.warn(
    "[vite] `sonner` not found in node_modules — using no-op fallback. Run `npm install` to restore toasts.",
  );
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      workbox: {
        // Force the new SW to take over immediately for returning users
        // and evict any stale precache from the previous deploy.
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ["**/*.{css,html,ico,png,svg,woff2,webp,webmanifest}"],
        // HTML must be network-first so users always see the newest
        // index.html referencing the latest hashed JS/CSS bundle.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
          {
            // App shell navigations: always try network first so a fresh
            // deploy is picked up on the very next page load.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-shell-v3",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Hashed JS chunks are content-addressed, so cache-first is
            // safe and fast. Old chunk names simply stop being requested.
            urlPattern: /\/assets\/.*\.js$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "js-chunks-v3",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\/assets\/.*\.css$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "css-chunks-v3",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-css",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-woff2",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      manifest: {
        name: "Flowist - Notes & Todo",
        short_name: "Flowist",
        description: "Your personal notes and todo app",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/launcher-icon.webp", sizes: "192x192", type: "image/webp" },
          { src: "/launcher-icon.webp", sizes: "512x512", type: "image/webp", purpose: "any maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "sonner-real": sonnerRealTarget,
      "sonner": path.resolve(__dirname, "./src/lib/sonnerShim.ts"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      mangle: {
        toplevel: true,
        properties: false,
      },
      compress: {
        passes: 2,
        toplevel: true,
      },
    },
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@revenuecat')) return 'vendor-revenuecat';
          if (id.includes('@hello-pangea/dnd')) return 'vendor-dnd';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-recharts';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('i18next')) return 'vendor-i18n';
          if (id.includes('date-fns')) return 'vendor-date';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('mapbox-gl')) return 'vendor-mapbox';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('@capacitor')) return 'vendor-capacitor';
          if (id.includes('@capgo')) return 'vendor-capacitor';
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"],
  },
}));