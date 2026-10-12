import { defineConfig } from 'vite';

export default defineConfig({
  // El worker importa onnxruntime-web y necesita ES modules para empaquetarlo.
  worker: { format: 'es' },
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
});
