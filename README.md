# Mi Garage · Frontend PWA

Colección de Hot Wheels básicos con React, TypeScript y Vite. Backend Django en `../hotwheels-backend`; datos y fotos en Supabase.

## Ejecutar

```sh
npm install
cp .env.example .env
npm run dev
```

El `.env` inicial apunta a `http://localhost:8000/api`. Inicia Django según el README de `hotwheels-backend`. Sin cuenta, la aplicación conserva el modo local y la colección creada en la primera versión.

En **Conectar cuenta** puedes registrarte o iniciar sesión. Dentro de tu cuenta puedes importar los autos guardados en modo local sin eliminarlos ni duplicar importaciones previas. Las colecciones locales y de cada usuario están separadas.

## Producción

Configura `VITE_API_URL=https://TU_BACKEND.onrender.com/api` y ejecuta:

```sh
npm run build
npm run preview
```

Publica `dist/` en un hosting estático HTTPS, en la raíz del dominio. Se incluye `render.yaml` para Render Static Site si esta carpeta es un repositorio independiente. En un monorepo configura Root Directory `hotwheels-frontend`, build `npm ci && npm run build` y publish directory `dist`.

Configura la URL del frontend en `CORS_ALLOWED_ORIGINS` del backend. Reinicia Vite o vuelve a compilar al cambiar `VITE_API_URL`. **Nunca pongas claves privadas de Supabase o la contraseña PostgreSQL en variables `VITE_`.**

En iPhone: Safari → Compartir → Agregar a pantalla de inicio. El service worker está habilitado en producción sobre HTTPS o localhost. Una dirección HTTP de la red local sirve para revisar el diseño, pero no activa el service worker. Para probar el frontend en otro dispositivo, `VITE_API_URL` debe apuntar a una dirección accesible desde él, no a localhost; agrega ese origen a CORS y el host local a `ALLOWED_HOSTS` de Django.

## Funciones

- Fichas con foto, modelo, año, serie, número, color, estado, unidades y notas.
- Buscar, filtrar, ordenar, marcar favoritos y alternar tarjetas/lista.
- Colección inicialmente vacía con seis ejemplos opcionales; las ilustraciones son genéricas.
- Registro/login, CRUD vía Django, importación local idempotente y actualización manual de cambios de otros dispositivos.
- Fotos reescaladas antes de subir; PostgreSQL y Storage de Supabase a través de Django.
- **Recorte automático del blister** con modelo de segmentación (isnet) en el dispositivo, con WebGPU/WASM y respaldo a CPU. Elimina mesa, cable y sombras, conserva el empaque entero (incluido el gancho) y ajusta el lienzo al contorno. La primera ejecución descarga ~80 MB del CDN de IMG.LY con progreso y cancelación; después se cachea.
- **Ajuste manual por contorno** como respaldo: puntos arrastrables, ampliación, previsualización del área exterior y restauración del original durante la edición.
- PNG transparente para descargar o guardar en la ficha, también en Supabase. Se conserva el interior del empaque y se ajusta el lienzo al contorno.
- Exportación JSON. En modo nube incluye URLs de las fotos, no un archivo con las imágenes. No hay importación general de archivos JSON; la importación implementada es desde la colección local anterior.

## Offline y almacenamiento

El modo local guarda fichas y fotos en `localStorage`. Con cuenta, PostgreSQL/Storage son la fuente de datos y el navegador guarda la última copia de las fichas por usuario para lectura offline. Las fotos remotas no se precargan: necesitan conexión salvo la caché habitual del navegador. No hay cola de escrituras offline.

El recorte funciona en el navegador con una foto disponible, sin enviar la imagen a servicios externos. Pulsa **Recortar automáticamente**: el modelo detecta el empaque, elimina el fondo y deja el interior intacto. La primera vez descarga ~80 MB del modelo y necesita internet; después se reutiliza la caché del navegador. Añade un poco de margen al fotografiar y usa buena luz para que distinga el borde. Si la detección se come un borde, pulsa **Ajustar contorno** y corrige los puntos a mano (arrastra, añade puntos en curvas, amplía hasta 3× o mueve puntos con las flechas del teclado). El área oscura queda fuera del PNG; el interior conserva sus colores y transparencia original. **Descargar PNG** exporta la imagen actual; **Guardar auto** conserva el recorte en la ficha. El original se puede restaurar mientras esa edición siga abierta. Las imágenes se limitan a 1600 px y se reducen si exceden 3 MB.

La sesión persiste en este navegador. Al cerrar sesión online se revoca el token en todos los dispositivos. Al cerrar sesión offline solo se borra la sesión y copia local de la cuenta en este dispositivo; el token remoto conserva su vencimiento. La colección de modo local no se elimina. No se almacenan respuestas de API en el service worker.

## Estructura

- `src/main.tsx`: interfaz de colección, formularios y cuenta.
- `src/useCollection.ts`: operaciones locales/nube, caché y sesiones.
- `src/api.ts`: cliente de la API Django; espera extendida para el arranque de Render Free.
- `src/types.ts`: contrato de ficha y sesión.
- `src/ImageAssistant.tsx`, `src/imageTools.ts`: editor de contorno y exportación PNG transparente.
- `src/automaticCrop.ts`, `src/background.worker.ts`: detección automática del empaque en Web Worker.
- `public/manifest.webmanifest`, `public/sw.js`, `public/icons/`: PWA.

`npm run build` verifica TypeScript y genera la distribución. La configuración detallada de Supabase y Render se encuentra en `../hotwheels-backend/README.md`.
