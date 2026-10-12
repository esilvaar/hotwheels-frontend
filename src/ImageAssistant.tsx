import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { Scissors, Undo2, Download, WandSparkles } from 'lucide-react';
import { automaticCrop } from './automaticCrop';
import { cropBlister, encodePhoto, imageCanvas, type Point } from './imageTools';
import type { Car } from './types';

export function ImageAssistant({ car, update, onBusy }: { car: Car; update: (car: Car) => void; onBusy: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [original] = useState(car.photo);
  const [points, setPoints] = useState<Point[]>([]);
  const [editing, setEditing] = useState(false);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(car); latest.current = car;
  const maskId = useId();
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); onBusy(false); }; }, [onBusy]);

  async function detect() {
    if (busy) return;
    setBusy(true); onBusy(true);
    const source = car.photo;
    const abort = new AbortController(); controller.current = abort;
    try {
      const result = await automaticCrop(original, message => { if (alive.current) setStatus(message); }, abort.signal);
      if (!alive.current || latest.current.photo !== source) return;
      setPoints(result.points); setEditing(false);
      update({ ...latest.current, photo: result.image });
      setStatus('Recorte automático aplicado. Revisa el gancho y el plástico; puedes ajustar el contorno. Guarda la ficha para conservar el PNG.');
    } catch (error) {
      if (alive.current) setStatus(abort.signal.aborted ? 'Recorte cancelado. La foto no se ha cambiado.' : error instanceof Error ? error.message : 'No se pudo recortar. Prueba el ajuste manual.');
    } finally {
      controller.current = null;
      if (alive.current) { setBusy(false); onBusy(false); }
    }
  }

  function position(event: PointerEvent<SVGElement>): Point {
    const rect = svg.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  }

  async function run(download = false) {
    if (busy) return;
    setBusy(true); onBusy(true); setStatus(download ? 'Preparando PNG…' : 'Recortando el contorno…');
    const source = car.photo;
    try {
      const image = download ? encodePhoto(await imageCanvas(source)) : await cropBlister(original, points);
      if (!alive.current || latest.current.photo !== source) return;
      if (download) {
        const link = document.createElement('a'); link.href = image;
        link.download = `${car.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'blister'}.png`;
        link.click(); setStatus('PNG preparado para descargar.');
      } else {
        update({ ...latest.current, photo: image }); setEditing(false);
        setStatus('Recorte aplicado: PNG transparente. Guarda la ficha para conservarlo.');
      }
    } catch (error) {
      if (alive.current) setStatus(error instanceof Error && !/load|decode|tainted|insecure/i.test(error.message) ? error.message : 'No se pudo abrir la foto. Vuelve a subirla desde tu dispositivo para recortarla.');
    } finally { if (alive.current) { setBusy(false); onBusy(false); } }
  }

  const polygon = points.map(p => `${p.x * size.width},${p.y * size.height}`).join(' ');
  const radius = Math.max(size.width, size.height) / (50 * zoom);
  return <section className="image-assistant">
    <strong>Recortar el blister · PNG transparente</strong>
    <p>Detecta el borde del empaque y elimina el fondo automáticamente. El recorte se hace en tu dispositivo; la primera vez descarga un modelo de unos 80 MB y necesita internet.</p>
    <div className="image-actions">
      <button type="button" disabled={busy} onClick={() => void detect()}><WandSparkles size={16}/> Recortar automáticamente</button>
      <button type="button" disabled={busy} onClick={() => setEditing(!editing)}><Scissors size={16}/>{editing ? 'Ocultar editor' : points.length ? 'Ajustar contorno' : 'Marcar contorno'}</button>
      <button type="button" disabled={busy || editing} onClick={() => void run(true)}><Download size={16}/> Descargar PNG</button>
    </div>
    {busy && controller.current && <button type="button" className="text-button" onClick={() => controller.current?.abort()}>Cancelar recorte</button>}
    {editing && <>
      <p id={`${maskId}-help`}>Toca el borde en orden para añadir puntos. Arrástralos para ajustar; usa más puntos en curvas. Con teclado: enfoca un punto y usa las flechas (Mayús para mover más) o Suprimir. El área oscura se eliminará.</p>
      <label className="crop-zoom">Ampliación: {zoom}×<input type="range" min="1" max="3" step=".5" value={zoom} disabled={busy} onChange={e => setZoom(Number(e.target.value))}/></label>
      <div className="image-actions"><button type="button" disabled={busy} aria-pressed={pan} onClick={() => setPan(!pan)}>{pan ? 'Volver a marcar puntos' : 'Mover imagen / desplazar'}</button></div>
      <div className="crop-scroll">
        <div className="crop-stage" style={{ width: `${zoom * 100}%` }}>
          <img src={original} alt="Foto original para trazar el contorno del blister" draggable={false} onLoad={e => { setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight }); setLoaded(true); }} onError={() => { setLoaded(false); setStatus('No se pudo cargar la foto. Vuelve a subirla desde tu dispositivo.'); }}/>
          {loaded && <svg ref={svg} style={pan ? { pointerEvents: 'none', touchAction: 'auto' } : undefined} viewBox={`0 0 ${size.width} ${size.height}`} aria-label="Editor del contorno" aria-describedby={`${maskId}-help`}
            onPointerDown={e => { if (busy || e.button !== 0 || !e.isPrimary) return; e.preventDefault(); setPoints(current => [...current, position(e)]); }}
            onPointerMove={e => { if (drag.current === null || busy) return; const next = position(e); const index = drag.current; setPoints(current => current.map((p, i) => i === index ? next : p)); }}
            onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
            <defs><mask id={maskId}><rect width={size.width} height={size.height} fill="white"/>{points.length >= 3 && <polygon points={polygon} fill="black"/>}</mask></defs>
            <rect width={size.width} height={size.height} fill="#101b16" opacity=".55" mask={`url(#${maskId})`} pointerEvents="none"/>
            <polyline points={polygon} fill="none" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
            {points.length >= 3 && <line x1={points.at(-1)!.x * size.width} y1={points.at(-1)!.y * size.height} x2={points[0].x * size.width} y2={points[0].y * size.height} stroke="#fff" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
            {points.map((p, index) => <circle key={index} cx={p.x * size.width} cy={p.y * size.height} r={radius} fill={index === 0 ? '#e75631' : '#263e32'} stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" tabIndex={busy ? -1 : 0} role="button" aria-label={`Punto ${index + 1} del contorno`}
              onPointerDown={e => { e.stopPropagation(); if (busy || e.button !== 0 || !e.isPrimary) return; drag.current = index; e.currentTarget.setPointerCapture(e.pointerId); }}
              onKeyDown={e => {
                if (busy) return;
                if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); setPoints(current => current.filter((_, i) => i !== index)); return; }
                const delta = e.shiftKey ? .01 : .001;
                const dx = e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0;
                const dy = e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0;
                if (dx || dy) { e.preventDefault(); setPoints(current => current.map((point, i) => i === index ? { x: Math.max(0, Math.min(1, point.x + dx)), y: Math.max(0, Math.min(1, point.y + dy)) } : point)); }
              }}/>) }
          </svg>}
        </div>
      </div>
      <div className="image-actions">
        <button type="button" disabled={busy || !points.length} onClick={() => setPoints(points.slice(0, -1))}><Undo2 size={15}/> Quitar último punto</button>
        <button type="button" disabled={busy || !points.length} onClick={() => { setPoints([]); setStatus(''); }}>Reiniciar contorno</button>
        <button type="button" disabled={busy || !loaded || points.length < 3} onClick={() => void run()}><Scissors size={16}/> Aplicar recorte ({points.length} puntos)</button>
      </div>
    </>}
    {car.photo !== original && <button type="button" className="text-button" disabled={busy} onClick={() => { update({ ...car, photo: original }); setStatus('Foto original restaurada.'); }}><Undo2 size={15}/> Restaurar original</button>}
    {status && <p role="status">{status}</p>}
  </section>;
}
