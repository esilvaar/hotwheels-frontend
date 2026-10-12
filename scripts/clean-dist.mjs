import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// onnxruntime-web declara su WASM con `new URL('ort-wasm...wasm', import.meta.url)`,
// así que Vite lo copia a dist (~23 MB). Ese runtime nunca se pide a nuestro hosting:
// @imgly/background-removal carga el suyo desde su CDN (staticimgly.com) y el
// navegador lo cachea. Se elimina para no subir 23 MB inútiles en cada despliegue.
const assets = fileURLToPath(new URL('../dist/assets', import.meta.url));
const removed = [];
for (const file of await readdir(assets)) {
  if (/^ort-wasm.*\.wasm$/.test(file)) {
    await unlink(join(assets, file));
    removed.push(file);
  }
}

if (removed.length) {
  console.log(`Se descartaron ${removed.length} runtime(s) de ONNX de dist: ${removed.join(', ')}`);
  console.log('El modelo de recorte lo sirve el CDN de IMG.LY; no hace falta incluirlos en el hosting.');
}
