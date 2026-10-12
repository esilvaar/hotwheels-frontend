export type Point = { x: number; y: number };

export async function imageCanvas(source: string, maxSide = 1600) {
  const image = new Image(); image.crossOrigin = 'anonymous';
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// El límite coincide con la API y el bucket. PNG sigue siendo PNG al reducirlo.
export function encodePhoto(canvas: HTMLCanvasElement, format: 'image/png' | 'image/webp' = 'image/png') {
  let current = canvas;
  while (true) {
    const result = current.toDataURL(format, .88);
    if ((result.length - result.indexOf(',') - 1) * 3 / 4 <= 3 * 1024 * 1024) return result;
    const smaller = document.createElement('canvas');
    smaller.width = Math.max(1, Math.floor(current.width * .85));
    smaller.height = Math.max(1, Math.floor(current.height * .85));
    smaller.getContext('2d')!.drawImage(current, 0, 0, smaller.width, smaller.height);
    current = smaller;
  }
}

export async function preparePhoto(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Elige una imagen de menos de 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    return encodePhoto(await imageCanvas(url), file.type === 'image/png' ? 'image/png' : 'image/webp');
  } finally { URL.revokeObjectURL(url); }
}

export function validateContour(points: Point[]) {
  if (points.length < 3) throw new Error('Marca al menos tres puntos alrededor del blister.');
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) throw new Error('El contorno debe estar dentro de la foto.');
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < .00001) throw new Error('Separa los puntos superpuestos del contorno.');
    area += a.x * b.y - b.x * a.y;
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      const overlaps = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
      if (overlaps && cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0) throw new Error('El contorno se cruza. Ordena los puntos siguiendo el borde del blister.');
    }
  }
  if (Math.abs(area) < .0001) throw new Error('El contorno es demasiado pequeño. Rodea todo el blister.');
}

export async function cropBlister(source: string, points: Point[]) {
  validateContour(points);
  const image = await imageCanvas(source);
  const scaled = points.map(p => ({ x: p.x * image.width, y: p.y * image.height }));
  const left = Math.floor(Math.min(...scaled.map(p => p.x)));
  const top = Math.floor(Math.min(...scaled.map(p => p.y)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(Math.max(...scaled.map(p => p.x))) - left;
  canvas.height = Math.ceil(Math.max(...scaled.map(p => p.y))) - top;
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  scaled.forEach((p, index) => { if (index === 0) ctx.moveTo(p.x - left, p.y - top); else ctx.lineTo(p.x - left, p.y - top); });
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, -left, -top);
  return encodePhoto(canvas);
}
