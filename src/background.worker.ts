import { removeBackground } from '@imgly/background-removal';

self.onmessage = async (event: MessageEvent<Blob>) => {
  for (const device of ['gpu', 'cpu'] as const) {
    try {
      const result = await removeBackground(event.data, {
        model: 'isnet_fp16',
        device,
        output: { format: 'image/png' },
        progress: (key, current, total) => self.postMessage({ type: 'progress', key, current, total }),
      });
      self.postMessage({ type: 'result', result });
      return;
    } catch {
      // WebGPU puede existir y fallar al crear la sesión: se reintenta en CPU/WASM.
    }
  }
  self.postMessage({ type: 'error' });
};
