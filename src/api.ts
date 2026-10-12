import type { Car, Session } from './types';

export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function request<T>(path: string, session: Session | null, options: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new Error('Configura VITE_API_URL para conectar Django.');
  const controller = new AbortController();
  // Render gratis puede tardar alrededor de un minuto en despertar.
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options, signal: controller.signal, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Token ${session.token}` } : {}), ...options.headers },
    });
    if (response.status === 204) return undefined as T;
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data?.detail || (data && Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(' ') : String(value)}`).join(' '));
      throw new ApiError(detail || `No se pudo completar la solicitud (${response.status}).`, response.status);
    }
    if (!data) throw new Error('El servidor aún no está listo. Espera unos segundos y vuelve a intentar.');
    return data as T;
  } catch (error) {
    if (error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new Error('No se pudo conectar con Django. Render gratis puede tardar un minuto en despertar. Intenta nuevamente.');
    }
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function listCars(session: Session): Promise<Car[]> {
  const cars: Car[] = [];
  for (let page = 1; ; page++) {
    const data = await request<{ results: Car[]; next: string | null }>(`/cars/?page=${page}`, session);
    cars.push(...data.results);
    if (!data.next) return cars;
  }
}

export function writeCar(car: Car, session: Session, exists: boolean): Promise<Car> {
  const { id, client_id, photo, ...fields } = car;
  const payload = { ...fields, client_id: client_id || id,
    ...(photo.startsWith('data:image/') || photo === '' ? { photo_upload: photo } : {}),
  };
  return request<Car>(exists ? `/cars/${id}/` : '/cars/', session, {
    method: exists ? 'PATCH' : 'POST', body: JSON.stringify(payload),
  });
}
