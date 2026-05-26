import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'node:child_process';

// Lee info de git en tiempo de build/dev. Si git no está disponible, cae al fallback.
function safeExec(cmd, fallback) {
  try {
    return execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return fallback;
  }
}

// Fecha del último commit como BUILD_DATE (lo único que auto-derivamos).
// La versión la maneja manualmente APP_VERSION en src/lib/appInfo.js.
const gitDate = safeExec('git log -1 --format=%cd --date=short', new Date().toISOString().slice(0, 10));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5007", // 👈 puerto backend original
        changeOrigin: true,
      },
    },
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  define: {
    __APP_BUILD_DATE__: JSON.stringify(gitDate),
  },
});
