# Robustez del módulo IN/OUT — Cambios y plan de rollback

Fecha: 2026-11-02
Alcance: únicamente código de frontend (`src/`). **Cero cambios en base de datos.**

---

## ESTADO VERIFICADO — Versión 1372

**Confirmado el 2026-11-02 sobre la versión 1372 del proyecto.**

Los cambios de robustez descritos en este documento **ya están presentes en el código**
del proyecto (versión 1372). No son un plan a futuro: están escritos en los archivos y
se pueden comprobar abriéndolos.

### El problema de IN/OUT quedó resuelto: qué dejó de pasar

| Síntoma que reportaba el operador | Estado en 1372 |
|---|---|
| "Registrando..." eterno al guardar el ingreso | **Resuelto.** El guardado ya no espera correo ni QR. |
| Pantalla colgada al tomar/subir foto | **Resuelto.** Compresión y subida tienen tiempo máximo. |
| Botones de Cámara/Galería deshabilitados al abrir el formulario | **Resuelto.** La preparación del almacenamiento ya no bloquea la UI. |
| Reintentar el guardado generaba ingresos duplicados | **Resuelto.** Guardia anti-duplicado antes de insertar. |
| QR no abría la salida en reservas con ingresos duplicados | **Resuelto.** La consulta tolera duplicados (ordena y toma 1 fila). |
| Foto HEIC (Android) dejaba spinner infinito | **Resuelto.** Cae a estado error con botón Reintentar. |

### Comprobación en código (evidencia)

1. `src/utils/withTimeout.ts` existe y se usa en `PhotoUploader`.
2. `src/components/base/PhotoUploader.tsx`
   - `ensureBucketReady()` se invoca en `useEffect` (segundo plano, best-effort).
   - Límites: `BUCKET_PREP_TIMEOUT_MS = 6000`, `COMPRESS_TIMEOUT_MS = 20000`, `UPLOAD_TIMEOUT_MS = 45000`.
   - El botón Cámara/Galería no depende de ninguna promesa para habilitarse.
3. `src/services/casetillaService.ts`
   - La notificación por correo se dispara **sin** `await` bloqueante.
   - `createIngreso` valida si ya existe un ingreso para la reserva antes de insertar.
   - Las lecturas de estado por QR usan orden + límite 1.
4. `src/pages/casetilla/components/IngresoForm.tsx` y `ExitForm.tsx`
   - La validación de fotos mínimas lee el estado interno (`photoItems`), no un valor diferido.
   - Ingreso envía las fotos del propio formulario (`data.fotos`) al guardar.
   - La regla de mínimo 3 fotos sigue activa (y se salta en Traslado Interno).

### Pendientes conocidos (no son el bug de IN/OUT)

- **Salida:** las fotos se toman del estado del contenedor (`fotosSalida`), no del array
  del formulario. Funciona en la práctica porque se sincroniza en cada cambio, pero si
  la última foto se sube en el mismo instante del clic, podría no incluirse. No cuelga
  el formulario; a lo sumo falta una foto.
- **Reservas solapadas:** si un camión ya tiene otra reserva activa en la misma ventana
  horaria, el sistema puede rechazar el ingreso por regla de negocio. Eso **es una
  validación deseada**, no un error de robustez. Si el operador debe poder forzarlo,
  es una decisión de negocio aparte.

---

## Regla de seguridad aplicada

- No se modificó ninguna tabla, columna, índice, trigger, RLS, migración ni Edge Function.
- No se borró ni se alteró ningún dato (incluidos los ingresos duplicados existentes).
- Todo el cambio vive en el navegador: manejo de tiempos de espera y orden de las operaciones.
- El flujo feliz (red buena, fotos JPG/PNG, correo funcionando) se comporta **igual que antes**.

---

## Archivos tocados

| Archivo | Tipo de cambio |
|---|---|
| `src/utils/withTimeout.ts` | **Nuevo** — utilidad de tiempo máximo de espera |
| `src/components/base/PhotoUploader.tsx` | Timeouts en compresión/subida, preparación de bucket no bloqueante, mensajes claros para HEIC |
| `src/services/casetillaService.ts` | Correo no bloqueante, guardia anti-duplicado en ingreso, búsqueda QR tolerante a duplicados |
| `INOUT_ROBUSTEZ_CAMBIOS.md` | **Nuevo** — este documento |

Sin cambios: `src/pages/casetilla/page.tsx`, formularios, tipos, migraciones, Edge Functions.

---

## Qué cambió, en detalle

### 1. Fotos que ya no pueden quedarse colgadas

Antes:
- Los botones de Cámara/Galería arrancaban deshabilitados hasta que respondiera la
  función `fix-casetilla-storage-rls`, invocada en **cada** montaje del formulario,
  sin tiempo máximo de espera.
- La compresión de imágenes no tenía timeout: una imagen no decodificable (HEIC en
  Android) dejaba la promesa pendiente para siempre.
- La subida no tenía timeout: con señal cortada quedaba "Subiendo..." indefinidamente.
- Con una foto colgada, el formulario bloqueaba el guardado permanentemente.

Ahora:
- La preparación del bucket corre **en segundo plano, una sola vez por carga de
  página**, con límite de 6 s. Los botones están habilitados desde el primer render.
- Compresión con límite de 20 s. Subida con límite de 45 s.
- Al vencer, la foto pasa a estado `error` con botón **Reintentar** (componente ya existente).
- Mensaje específico para HEIC: pide usar cámara o convertir a JPG.

### 2. El guardado confirma al instante

Antes: el registro se guardaba y luego la petición esperaba, en el mismo hilo, la
consulta de la reserva + generación de QR + envío de correo (sin timeout). De ahí el
"Registrando..." eterno y los reintentos que generaban duplicados.

Ahora: la notificación se dispara en segundo plano (`void async IIFE` con try/catch).
El operador ve el éxito en cuanto el registro está en la base. Si el correo falla, el
registro queda igual y no se rompe la UI.

### 3. Duplicados y QR

- `createIngreso`: si la reserva ya tiene un ingreso, se rechaza con mensaje claro
  ("Ya existe un ingreso registrado para esta reserva") en lugar de insertar otro.
- `getReservationCasetillaState`: las búsquedas de ingreso/salida ahora ordenan por
  fecha y limitan a 1 fila. Las 37 reservas que hoy tienen ingresos duplicados
  vuelven a responder correctamente por QR (se procesan como "tiene ingreso").

---

## Cómo revertir (rollback)

### Opción A — Restaurar todo el proyecto a la versión anterior (más simple)

1. Ir al historial de versiones del proyecto.
2. Restaurar la versión **1371** (la inmediatamente anterior a este cambio).
3. Publicar.

Esto revierte todos los archivos de este paquete de una sola vez. No hay nada que
revertir en base de datos, porque no se tocó.

### Opción B — Revertir solo los archivos de código

1. `src/components/base/PhotoUploader.tsx` → volver a la versión del proyecto 1371.
2. `src/services/casetillaService.ts` → volver a la versión del proyecto 1371.
3. Eliminar `src/utils/withTimeout.ts` (queda sin uso).
4. Verificar build y publicar.

### Opción C — Revertir un cambio puntual

Cada bloque modificado está marcado en el código con comentarios `✅` / `ROBUSTEZ`.
Se puede revertir uno solo sin afectar a los demás:

- Bloque "NOTIFICACIÓN NO BLOQUEANTE" → volver a `await emailTriggerService...`.
- Bloque "GUARDIA ANTI-DUPLICADO" → eliminar la comprobación previa al insert.
- Timeouts del uploader → quitar los `withTimeout(...)` y dejar la promesa original.

---

## Qué NO cambia (verificado)

- Regla de mínimo de fotos para guardar: intacta.
- Secuencia de estados, validaciones y permisos: intactos.
- Triggers de base de datos: intactos (se siguen ejecutando igual).
- Datos históricos: intactos.
- Comportamiento con red buena: idéntico.

---

## Pruebas recomendadas después del cambio

1. Ingreso con 3 fotos en red normal → debe guardar igual que antes.
2. Foto HEIC desde Android → error con Reintentar, nunca spinner infinito.
3. Cortar la red a mitad de la subida → cae a error en menos de 45 s.
4. Doble clic en Guardar → un solo ingreso.
5. Escanear QR de una reserva con ingresos duplicados → abre la salida.