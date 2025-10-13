import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const backendTarget = process.env.BACKEND_PROXY_TARGET ?? "http://localhost:8787";

export default defineConfig({
  base: "/ui/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    },
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true
      },
      '/ui/api': {
        target: backendTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ui/, '')
      }
    }
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        // Add timestamp to prevent caching
        entryFileNames: `assets/[name]-${Date.now()}.js`,
        chunkFileNames: `assets/[name]-${Date.now()}.js`,
        assetFileNames: `assets/[name]-${Date.now()}.[ext]`
      }
    }
  },
  // Development optimizations
  optimizeDeps: {
    force: true // Force dependency re-optimization
  }
});
