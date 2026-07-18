import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { compression } from "vite-plugin-compression2";


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