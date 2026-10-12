import { cropBlister, imageCanvas, type Point } from './imageTools';

// Retiene el componente principal, evitando objetos separados (cables, motas).
// Su contorno exterior conserva el cartón y el contenido impreso del empaque.
export function maskContour(alpha: Uint8Array, width: number, height: number): Point[] {
  const labels = new Int32Array(width * height);
  const queue = new Int32Array(labels.length);
  let label = 0, largest = 0, largestSize = 0;
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] || alpha[start] < 128) continue;
    label++;
    let head = 0, tail = 1; queue[0] = start; labels[start] = label;
    const visit = (index: number) => { if (!labels[index] && alpha[index] >= 128) { labels[index] = label; queue[tail++] = index; } };
    while (head < tail) {
      const index = queue[head++], x = index % width;
      if (x > 0) visit(index - 1);
      if (x < width - 1) visit(index + 1);
      if (index >= width) visit(index - width);
      if (index < labels.length - width) visit(index + width);
    }
    if (tail > largestSize) { largest = label; largestSize = tail; }
  }
  if (largestSize < width * height * .01 || largestSize > width * height * .98) throw new Error('No se distinguió el blister del fondo. Prueba una foto con el empaque completo y algo de margen, o ajusta el contorno manualmente.');

  // Aristas orientadas de la máscara; se sigue el lazo exterior más largo.
  const stride = width + 1;
  const edges = new Map<number, number[]>();
  const edge = (a: number, b: number) => { const list = edges.get(a) || []; list.push(b); edges.set(a, list); };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && labels[y * width + x] === largest;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!inside(x, y)) continue;
    const a = y * stride + x, b = a + 1, d = a + stride, c = d + 1;
    if (!inside(x, y - 1)) edge(a, b);
    if (!inside(x + 1, y)) edge(b, c);
    if (!inside(x, y + 1)) edge(c, d);
    if (!inside(x - 1, y)) edge(d, a);
  }
  let contour: Point[] = [], largestArea = 0;
  while (edges.size) {
    const start = edges.keys().next().value!;
    let current = start, area = 0;
    const loop: Point[] = [];
    do {
      const next = edges.get(current)?.pop();
      if (next === undefined) break;
      if (!edges.get(current)!.length) edges.delete(current);
      const p = { x: current % stride, y: Math.floor(current / stride) };
      const q = { x: next % stride, y: Math.floor(next / stride) };
      loop.push(p); area += p.x * q.y - q.x * p.y; current = next;
    } while (current !== start);
    if (current === start && area > largestArea) { contour = loop; largestArea = area; }
  }
  if (contour.length < 3) throw new Error('No se pudo obtener un borde cerrado. Prueba otra foto o usa el ajuste manual.');
  // Simplificación por distancia, sin convertirlo en un rectángulo o casco convexo:
  // conserva entrantes como el gancho abierto del blister.
  const simplify = (points: Point[]): Point[] => {
    const a = points[0], b = points.at(-1)!;
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    let farthest = 0, distance = 1.5 * 1.5;
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i];
      const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
      const d = (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
      if (d > distance) { distance = d; farthest = i; }
    }
    return farthest ? [...simplify(points.slice(0, farthest + 1)).slice(0, -1), ...simplify(points.slice(farthest))] : [a, b];
  };
  const middle = Math.floor(contour.length / 2);
  return [...simplify(contour.slice(0, middle + 1)).slice(0, -1), ...simplify([...contour.slice(middle), contour[0]]).slice(0, -1)]
    .map(p => ({ x: p.x / width, y: p.y / height }));
}

export async function automaticCrop(source: string, progress: (message: string) => void, signal: AbortSignal) {
  progress('Preparando la foto…');
  const canvas = await imageCanvas(source);
  const input = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo preparar la imagen.')), 'image/png'));
  if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
  progress('Cargando el modelo de recorte. La primera vez puede tardar…');
  const result = await new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL('./background.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); worker.terminate(); };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const abort = () => fail(new DOMException('Cancelado', 'AbortError'));
    const timer = window.setTimeout(() => fail(new Error('El recorte tardó demasiado. Intenta nuevamente o usa el ajuste manual.')), 240_000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = () => fail(new Error('No se pudo iniciar el recorte automático. Comprueba la conexión y usa un navegador actualizado.'));
    worker.onmessage = event => {
      const data = event.data;
      if (data.type === 'result') { cleanup(); resolve(data.result); }
      else if (data.type === 'error') fail(new Error('No se pudo ejecutar el modelo. Revisa tu conexión o prueba el ajuste manual.'));
      else if (data.type === 'progress') {
        progress(data.key.startsWith('fetch:') ? `Descargando recursos del modelo… ${data.total ? Math.round(data.current / data.total * 100) : 0} %` : 'Detectando el contorno del empaque…');
      }
    };
    worker.postMessage(input);
  });
  if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
  progress('Ajustando el borde del blister…');
  const url = URL.createObjectURL(result);
  try {
    const mask = await imageCanvas(url, 768);
    const rgba = mask.getContext('2d')!.getImageData(0, 0, mask.width, mask.height).data;
    const alpha = new Uint8Array(mask.width * mask.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    const points = maskContour(alpha, mask.width, mask.height);
    const image = await cropBlister(source, points);
    if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
    return { image, points };
  } finally { URL.revokeObjectURL(url); }
}
