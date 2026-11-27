import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project site: https://413x45h4w.github.io/homebook-prototype/
export default defineConfig({
  base: '/homebook-prototype/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    __APP_COMMIT__: JSON.stringify(process.env.GITHUB_SHA || 'local'),
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
});
