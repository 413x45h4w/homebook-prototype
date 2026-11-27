import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const previewId = process.env.VITE_PREVIEW_ID || '';
const base = process.env.VITE_BASE || (previewId ? `/homebook-prototype/preview/${previewId}/` : '/homebook-prototype/');

// GitHub Pages project site: https://alexforshaw.github.io/homebook-prototype/
export default defineConfig({
  base,
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    __APP_COMMIT__: JSON.stringify(process.env.GITHUB_SHA || 'local'),
    __PREVIEW_ID__: JSON.stringify(previewId),
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
});
