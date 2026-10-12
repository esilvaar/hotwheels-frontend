import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, ApiError, listCars, request, writeCar } from './api';
import type { Car, Session } from './types';

const LOCAL_KEY = 'mi-garage-cars-v1';
const SESSION_KEY = `mi-garage-session:${API_URL}`;
const cacheKey = (session: Session | null) => session ? `mi-garage-cloud:${API_URL}:${session.user.id}` : LOCAL_KEY;
function readCars(session: Session | null): Car[] {
  try {
    const data = JSON.parse(localStorage.getItem(cacheKey(session)) || '[]');
    return Array.isArray(data) ? data.filter(c => c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.series === 'string' && typeof c.photo === 'string' && Number.isInteger(c.quantity) && Number.isInteger(c.year)) : [];
  } catch { return []; }
}
function readSession(): Session | null {
  if (!API_URL) return null;
  try { const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); return typeof value?.token === 'string' && typeof value?.user?.id === 'number' ? value : null; } catch { return null; }
}

export function useCollection() {
  const [session, setSession] = useState<Session | null>(readSession);
  const [cars, setCars] = useState<Car[]>(() => readCars(session));
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(!session);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const lock = useRef(false);
  const currentSession = useRef(session);
  currentSession.current = session;

  const report = useCallback((error: unknown) => setError(error instanceof Error ? error.message : 'No se pudo completar la operación.'), []);
  const commit = useCallback((next: Car[], account: Session | null) => {
    try { localStorage.setItem(cacheKey(account), JSON.stringify(next)); }
    catch {
      if (!account) throw new Error('No hay espacio para guardar localmente. Usa fotos más pequeñas o conecta tu cuenta.');
      setError('Guardado en Supabase, pero no hay espacio para actualizar la copia sin conexión.');
    }
    if (currentSession.current?.token === account?.token) setCars(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!session || !navigator.onLine || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const next = await listCars(session);
      if (currentSession.current?.token === session.token) { commit(next, session); setReady(true); }
    } catch (error) { report(error); if (error instanceof ApiError && error.status === 401) setReady(false); }
    finally { lock.current = false; setBusy(false); }
  }, [session, commit, report]);

  useEffect(() => { void refresh(); }, [refresh, online]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  async function mutate(action: () => Promise<void>) {
    if (lock.current) return false;
    if (session && (!navigator.onLine || !ready)) { setError('Conéctate y actualiza tu colección antes de guardar cambios en la nube.'); return false; }
    lock.current = true; setBusy(true); setError('');
    try { await action(); return true; }
    catch (error) { report(error); if (error instanceof ApiError && error.status === 401) setReady(false); return false; }
    finally { lock.current = false; setBusy(false); }
  }

  async function saveCar(car: Car) {
    return mutate(async () => {
      const exists = cars.some(c => c.id === car.id);
      const saved = session ? await writeCar(car, session, exists) : car;
      commit(exists ? cars.map(c => c.id === car.id ? saved : c) : [...cars, saved], session);
    });
  }
  async function deleteCar(id: string) {
    return mutate(async () => {
      if (session) await request(`/cars/${id}/`, session, { method: 'DELETE' });
      commit(cars.filter(c => c.id !== id), session);
    });
  }
  async function loadExamples(examples: Car[]) {
    return mutate(async () => {
      let next = [...cars];
      for (const car of examples) {
        if (next.some(c => (c.client_id || c.id) === car.id)) continue;
        next = [...next, session ? await writeCar(car, session, false) : car];
        commit(next, session);
      }
    });
  }
  async function importLocal() {
    if (!session) return false;
    return mutate(async () => {
      // Releer primero permite reintentar una importación parcial sin duplicados.
      let next = await listCars(session);
      commit(next, session);
      for (const car of readCars(null)) {
        if (next.some(c => c.client_id === car.id)) continue;
        next = [...next, await writeCar(car, session, false)];
        commit(next, session);
      }
    });
  }
  async function login(username: string, password: string, register: boolean) {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError('');
    try {
      const account = await request<Session>(register ? '/auth/register/' : '/auth/login/', null, { method: 'POST', body: JSON.stringify({ username, password }) });
      localStorage.setItem(SESSION_KEY, JSON.stringify(account));
      currentSession.current = account;
      setCars(readCars(account)); setReady(false); setSession(account);
      return true;
    } catch (error) { report(error); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  async function logout() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (session && navigator.onLine) {
        try { await request('/auth/logout/', session, { method: 'POST' }); }
        catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error; }
      }
      localStorage.removeItem(SESSION_KEY);
      if (session) localStorage.removeItem(cacheKey(session));
      currentSession.current = null; setSession(null); setCars(readCars(null)); setReady(true);
    } catch (error) { report(error); }
    finally { lock.current = false; setBusy(false); }
  }
  return { cars, session, busy, ready, online, error, setError, saveCar, deleteCar, loadExamples, importLocal, login, logout, refresh, localCount: readCars(null).length };
}
