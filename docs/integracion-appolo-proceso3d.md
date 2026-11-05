# Integración AppOLO → SRO Proceso 3D (contrato v1)

**Objetivo:** ver en el 3D de SRO los **despachos en tiempo real** (andenes de despacho, entre Zona Franca y Recepción) y el **acomodo (putaway)** posterior a la descarga, con montacargas y apiladores, **sin copiar datos de AppOLO en SRO**.

## Principios

| Regla | Detalle |
|---|---|
| Fuente de verdad | AppOLO es dueño de despachos, recepciones/acomodo y equipos. SRO es dueño de citas, andenes y casetilla. |
| Sin duplicar | SRO **no guarda** datos de AppOLO. Los consulta en vivo y escucha avisos. |
| Solo lectura | La integración del 3D no escribe en AppOLO ni cambia estados. La sincronización existente de estados de citas (`sroSyncAccionDescarga` / `sroSyncBarrido`) **no se modifica**. |
| Falla aislada | Si AppOLO no responde, el 3D de SRO sigue funcionando y muestra "AppOLO · sin conexión". |
| Versionado | Toda respuesta lleva `version: 1`. Un cambio incompatible sube la versión; SRO rechaza versiones que no conoce en lugar de romperse. |

## Arquitectura

```
SRO (navegador, usuario Full Access)
  │ 1. GET ops-3d-snapshot  (Authorization: Bearer <JWT de sesión de SRO>)
  ▼
AppOLO · Edge Function `ops-3d-snapshot` (Supabase azwuzsukvqjogcfqljhg)
  ├─ valida el JWT contra SRO (GET {SRO_URL}/auth/v1/user)
  ├─ verifica rol "Full Access" en SRO (consulta con el mismo JWT)
  ├─ resuelve bodega AppOLO a partir de sro_warehouse_id (tabla de equivalencia en AppOLO)
  ├─ lee despacho_dev_* + Firestore accion_recepcion + equipos (con credenciales de servidor)
  └─ responde la foto del día + permiso temporal para el canal de avisos
  │
  │ 2. Realtime (broadcast privado, NO se guarda nada)
  ▼
Canal "ops3d:<bodega_id>"  ← triggers de AppOLO publican { entity, id, at }
  │
  └─ SRO recibe el aviso y vuelve a pedir la foto (agrupando ráfagas de 1 s)
```

## 1. Consulta: `GET <URL de la Cloud Function ops-3d-snapshot>`

Se implementa como **Edge Function de Supabase**, en línea con la migración de AppOLO de Firebase a Supabase. Para SRO solo importa la URL (`VITE_APPOLO_OPS_URL`).

**Por etapas, sin cambiar el contrato:**
- **Etapa A (ya posible):** solo `dispatches` (todo está en Supabase). `receptions: []` y `equipment: null`; SRO lo acepta y usa una dotación por defecto.
- **Etapa B:** cuando `accion_descarga`, `accion_recepcion` y `equipos` estén migrados a Supabase, la función agrega `receptions` y `equipment`. No se construye nada sobre Firestore que después haya que tirar.

**Parámetros (query):**

| Parámetro | Ejemplo | Descripción |
|---|---|---|
| `sro_warehouse_id` | `uuid` | Almacén de SRO que se está viendo. AppOLO lo traduce a su `bodega_id`. |
| `date` | `2026-11-03` | Día (en la zona horaria `tz`). |
| `tz` | `America/Costa_Rica` | Zona horaria del almacén. |
| `v` | `1` | Versión de contrato que espera SRO. |

**Encabezados:** `Authorization: Bearer <access_token de SRO>`.

**Respuestas:** `200` JSON · `401/403` sin permiso · `404` almacén sin bodega asociada · `5xx` error. CORS debe permitir el dominio de SRO.

**Cuerpo `200`:**

```jsonc
{
  "version": 1,
  "generated_at": "2026-11-03T14:05:00Z",
  "bodega": { "id": "bodega-olo", "nombre": "OLO" },

  // Catálogo de puertas de despacho (para dibujar las que aún no existen en SRO)
  "doors": ["0114", "0115", "0116", "0117", "0118"],

  "dispatches": [
    {
      "id": "uuid",
      "estado": "en proceso",            // despacho_dev_estados.codigo
      "estado_nombre": "En proceso",
      "puerta": "Puerta 15",             // se relaciona por número con el andén de SRO
      "placa": "C-148203",
      "chofer": "J. Mora",
      "transportista": "Transportes Herrera",
      "tienda": "Tienda Escazú",
      "referencia": "DSP-2401",
      "tipo": "Distribución",
      "tarimas_s": 18,
      "tarimas_d": 2,
      "layout": ["S","S","D","E", "..."],  // 24 posiciones (despacho_dev_layout.slots[].type), opcional
      "created_at": "2026-11-03T12:40:00Z",
      "updated_at": "2026-11-03T13:50:00Z",
      "finalized_at": null,
      "history": [                        // despacho_dev_actividad (estadoAnterior → estadoNuevo)
        { "estado": "creado",     "at": "2026-11-03T12:40:00Z" },
        { "estado": "en proceso", "at": "2026-11-03T13:20:00Z" }
      ],
      "fotos_count": 4                    // cantidad de fotos de carga; las fotos se piden aparte (sección 1b)
    }
  ],

  "receptions": [                         // Firestore accion_recepcion (acomodo)
    {
      "id": "firestore-doc-id",
      "reserva_id": "uuid-reserva-SRO",   // accion_recepcion.reservaId
      "puerta": "0105",                   // idAnden
      "proveedor": "Proveedor X",
      "tipo_descarga": "Entarimado",      // de accion_descarga
      "bultos": 300,                      // de accion_descarga.cantidadBultos
      "started_at": "2026-11-03T13:10:00Z",
      "completed_at": null,
      "fotos": ["https://…/sign/…"]       // opcional: URLs firmadas de las fotos de la recepción
    }
  ],

  "equipment": [                          // conteo por familia (colección equipos)
    { "familia": "Montacargas", "activos": 3, "mantenimiento": 1, "inactivos": 0 },
    { "familia": "Apilador",    "activos": 3, "mantenimiento": 0, "inactivos": 0 },
    { "familia": "Carretilla",  "activos": 5, "mantenimiento": 1, "inactivos": 0 }
  ],

  "realtime": {
    "url": "https://azwuzsukvqjogcfqljhg.supabase.co",
    "anon_key": "<llave pública anon de AppOLO>",
    "token": "<JWT corto (≤ 60 min) que SOLO permite escuchar el canal>",
    "channel": "ops3d:bodega-olo",
    "expires_at": "2026-11-03T15:05:00Z"
  }
}
```

**Qué incluir:** despachos creados ese día y los que siguen abiertos de días anteriores. Recepciones con `started_at` ese día o abiertas. No se requieren datos personales más allá de lo listado (no enviar cédulas ni firmas). El snapshot **no trae fotos**, solo `fotos_count`: SRO lo vuelve a pedir en cada aviso y firmar cientos de URLs por llamada sería pesado y cambiaría las URLs cada vez.

## 1b. Fotos a pedido

`GET <URL de ops-3d-snapshot>?sro_warehouse_id=<uuid>&fotos_despacho=<despacho_id>&v=1`

SRO la llama al seleccionar un camión.

- **Validación:** la misma del snapshot (sesión de SRO y permiso `proceso3d.view` de la Matriz de Permisos).
- **Pertenencia:** AppOLO resuelve la bodega del almacén y verifica que el despacho sea de esa bodega y no esté borrado. Si no → **404** (no se pueden pedir fotos de otra bodega cambiando el id).
- **Qué fotos:** solo las rutas registradas en `despacho_dev_fotos` para ese despacho (nunca se lista el bucket), las **60 más recientes** por `taken_at`. Se descarta cualquier ruta que no empiece por `{tenant}/{company}/{bodega}/{despacho_id}/` o que contenga `/choferes/` o `/boletas/`: **nunca** fotos de cédula ni firmas.
- **URLs:** firmadas https, vigencia **3600 s**, redimensionadas a ~1280 px de ancho (las originales pesan ~2,3 MB).
- **Errores:** si la firma falla → **200** con `"fotos": []` (no 500).
- **Caché:** `Cache-Control: private, max-age=300`.

**Cuerpo `200`:**

```jsonc
{
  "despacho_id": "uuid",
  "fotos": [
    { "url": "https://…/render/image/sign/…", "taken_at": "2026-11-05T02:23:44Z", "tarima": "S" }  // tarima: "S" | "D" | null
  ]
}
```

**Recepciones:** cuando `accion_descarga` / `accion_recepcion` estén en Supabase (etapa B), las fotos de recepción usarán el mismo mecanismo de firma (módulo común de AppOLO). Hasta entonces `receptions` va vacío.

## 1c. Chofer y boleta a pedido

`GET <URL de ops-3d-snapshot>?sro_warehouse_id=<uuid>&chofer_despacho=<despacho_id>&v=1`

Devuelve los datos ya registrados del chofer del despacho (incluida la foto de su cédula) y su boleta de salida (checklist y firma). Es solo consulta: no cambia nada en AppOLO.

- **Acceso (decisión tomada, 05/11/2026):** la misma validación que el snapshot y las fotos. **Quien tiene `proceso3d.view` puede consultar el chofer, su cédula, su celular y la boleta** del despacho que selecciona. No hay un permiso aparte.
- **Pertenencia:** el despacho debe ser de la bodega del almacén y no estar borrado; si no → **404**.
- **Qué imágenes se firman:** solo dos rutas, nunca se lista el bucket:
  - la `cedula_foto_path` del chofer ligado al despacho, que debe estar en `{tenant}/{company}/{bodega}/choferes/{chofer_id}/`;
  - la `firma_path` de su boleta, que debe ser `{tenant}/{company}/{bodega}/boletas/{boleta_id}/firma_…` (patrón actual) o `{tenant}/{company}/{bodega}/firmas/{boleta_id}-…` (patrón viejo).
  Si una ruta no cumple, ese campo va en `null`.
- **URLs:** firmadas https, **3600 s**. La cédula redimensionada a ~1280 px; la firma (PNG) sin transformar.
- **Boleta elegida:** la última validada; si ninguna está validada, la última creada. Hoy cada despacho tiene una sola.
- **Datos de la boleta:** salen de la copia guardada en la boleta (lo que se firmó), no de los datos actuales del chofer.
- **Nunca se envía** el PIN del chofer.
- **Errores:** si la firma de URL falla → **200** con esa imagen en `null`. Si el chofer o la boleta no existen todavía → `null` en ese bloque (no es error).
- **Caché:** `Cache-Control: private, max-age=300`.

**Cuerpo `200`:**

```jsonc
{
  "despacho_id": "uuid",
  "chofer": {                                 // null si el despacho no tiene chofer
    "nombre": "…",
    "cedula": "…",
    "compania": "MURBE",                      // o null
    "placa_camion": "C175055",                // o null
    "tipo_vehiculo": null,
    "celular": "88887777",                    // o null
    "cedula_foto": "https://…/render/image/sign/…"   // o null
  },
  "boleta": {                                 // null si todavía no hay boleta
    "id": "uuid",
    "estado": "despachado",                   // pendiente_validacion | despachado | rechazado | anulada
    "validada_at": "2026-11-04T15:07:07Z",    // o null
    "validada_por": "Yustin Jesus Campos Rodriguez",   // o "Aplicaciones OLO (regularización)" o null
    "checklist": [
      { "item": "¿La identidad del chofer es correcta?", "ok": true },
      { "item": "¿La placa del camión es correcta?", "ok": true },
      { "item": "¿La placa del contenedor es correcta?", "ok": true }
    ],
    "firma": "https://…/object/sign/…",       // o null
    "placa_contenedor": "23162"               // o null
  }
}
```

**Checklist:** las respuestas de la app ("si"/"no") se convierten a `ok: true/false`, con el texto que muestra la app. Las boletas cerradas por regularización (sin checklist ni firma) traen un solo ítem `{ "item": "Regularización: <nota>", "ok": null }` y `validada_por: "Aplicaciones OLO (regularización)"`. Tres boletas manuales viejas (agosto 2026) traen las claves de una versión anterior de la app (Carga, Documentos, Identidad, Marchamo, Placas, Vehículo).

## 1d. Personal en sitio (BIT2)

`GET <URL de ops-3d-snapshot>?sro_warehouse_id=<uuid>&personal=1&v=1`

Personal marcado **hoy** (America/Costa_Rica) en el reloj BIT2 de OLO: quién está en sitio, quién está en pausa y quién ya salió, para agruparlo por escala (gerente → coordinador → colaborador). Es solo consulta.

- **Acceso:** misma validación de sesión de SRO que el snapshot, pero exige el permiso **`proceso3d.personal.view`** de la Matriz de Permisos (hoy solo Full Access). Sin él → **403** (no basta `proceso3d.view`).
- **Solo OLO:** el reloj marcador existe únicamente en OLO (bodega `CR-OLO-CLIRO`). Cualquier otro almacén, o uno sin bodega asociada → **200** con `{ "disponible": false }`.
- **De dónde sale:** `bit2-api` (en la red interna de OLO) lee cada 60 s las marcas del día de `dbo.GLogs` y las guarda en Supabase (`ops3d_personal_dia`, `ops3d_personal_sync`). La función solo lee esas tablas.
- **Nunca se envía** la cédula (`codeEmployee` de BIT2) ni datos de horas extra. `id` es el id interno de BIT2.
- **Caché:** `Cache-Control: no-store`.

**Cuerpo `200` (OLO):**

```jsonc
{
  "disponible": true,
  "fecha": "2026-11-05",
  "actualizado_at": "2026-11-05T16:01:15-06:00",   // = ultima_sync (se mantiene por compatibilidad)
  "ultima_sync": "2026-11-05T16:01:15-06:00",      // última vuelta exitosa de bit2-api; null si nunca
  "marcas_hasta": "2026-11-05T15:56:50-06:00",     // cuándo entró a BIT2 la última marca (última descarga del reloj)
  "desactualizado": false,
  "resumen": {
    "en_sitio": 74, "en_pausa": 11, "salieron": 12,
    "por_escala": { "gerente": 0, "coordinador": 7, "colaborador": 90 }   // todas las personas que marcaron hoy
  },
  "presentes_por_hora": [0,0,0,0,16,27,61,72,71,69,70,70,71,70,90,78,74,0,0,0,0,0,0,0],
  "personas": [
    {
      "id": "36",
      "nombre": "CARLOS ANTONIO MOLINA GRANADOS",
      "puesto": "MONTACARGUISTA",                 // o null
      "departamento": "CEDI",                     // o null
      "escala": "colaborador",                    // gerente | coordinador | colaborador
      "coordinador": "GILBERT NUÑEZ PICHARDO",    // siempre texto
      "gerente": "ARGUELLO UGALDE FELIPE",        // siempre texto
      "estado": "en_sitio",                       // en_sitio | pausa | salio
      "entrada": "2026-11-05T06:53:00-06:00",     // primera marca
      "salida": null,                             // última marca, solo si estado = salio
      "marcas": ["06:53", "09:32", "10:00", "13:24", "14:24"],
      "horario": { "entrada": "07:00", "salida": "17:30" },   // o null cada uno
      "tarde": false
    }
  ]
}
```

**Reglas (acordadas el 05/11/2026):**

- **Horas:** BIT2 guarda hora local de Costa Rica sin zona; se envían en ISO con `-06:00` (Costa Rica no tiene horario de verano). `marcas` en `HH:MM` local.
- **Marcas dobles:** se ignora la marca que llega **2 minutos o menos** después de la anterior.
- **Estado:** el reloj no indica si una marca es entrada o salida (el campo `mode` no sirve), así que se cuentan las marcas del día:
  - número **impar** → `en_sitio`;
  - **par** y todavía no llega su `horario.salida` + 30 min → `pausa` (merienda, almuerzo);
  - **par** y ya pasó su `horario.salida` + 30 min, o no tiene horario → `salio`.
- **`tarde`:** primera marca > `horario.entrada` + 5 min. Sin horario → `false`.
- **`presentes_por_hora`:** 24 valores (hora de Costa Rica, 0–23). Cuenta a quien estuvo dentro en algún momento de esa hora: tramos entrada→salida por pares de marcas; el último sin pareja sigue abierto hasta ahora. Las pausas no cuentan y las horas futuras valen 0.
- **Escala** (con la configuración de Horas Extra que ya existe en AppOLO):
  1. **gerente:** el nombre coincide con una entrada *Gerente* de la configuración de coordinadores;
  2. **coordinador:** coincide con una entrada *Coordinador*, o su puesto dice `COORDINADOR` (o `COORINADOR`, error de dedo en BIT2);
  3. **colaborador:** el resto.
  Los nombres se comparan por palabras, sin orden ni tildes ("GREGORIO POVEDA LOPEZ" = "GREGORIO GERARDO LOPEZ POVEDA").
- **`coordinador` / `gerente`** (siempre texto, para agrupar):
  - colaborador: `coordinador` = su grupo de BIT2; `gerente` = el de la relación coordinador → gerente de AppOLO o, si falta, el grupo de BIT2 en el que está ese coordinador;
  - coordinador: `coordinador` = él mismo; `gerente` = su relación o su grupo de BIT2 (los coordinadores están en el grupo de su gerente);
  - gerente: `coordinador` = `"Sin coordinador"`, `gerente` = él mismo. Hoy **ningún gerente marca** en BIT2, así que `por_escala.gerente` es 0;
  - sin dato: `"Sin coordinador"` / `"Sin gerente"`.
- **`desactualizado: true`** si la última sincronización de bit2-api tiene más de **5 min**, o si entre **06:00 y 22:30** `marcas_hasta` tiene más de **30 min** de atraso.

**Ojo con la frescura:** el reloj **no envía las marcas solo**; alguien las descarga a BIT2 a mano y de forma irregular (a veces pasan horas o días). bit2-api sincroniza cada 60 s, pero solo ve lo que ya está en BIT2: por eso existe `marcas_hasta`. SRO debería mostrar el aviso "datos del reloj atrasados" cuando `desactualizado` sea `true`. Mientras la descarga no sea automática (configuración de BIT2), lo de "en sitio" puede ir horas atrás.

**Avisos:** cuando cambia alguna persona, bit2-api publica en el canal `ops3d:CR-OLO-CLIRO` el evento `change` con `{ "entity": "personal", "id": "<fecha>", "at": "ISO" }` (ver sección 2). Al recibirlo, SRO vuelve a pedir `?personal=1`.

## 2. Avisos en tiempo real

- **Tipo:** Supabase Realtime **Broadcast privado** (`config.private = true`). Los avisos no se guardan en tablas: **no ocupan almacenamiento**.
- **Canal:** `ops3d:<bodega_id>`. **Evento:** `change`.
- **Payload:** `{ "entity": "dispatch" | "reception" | "equipment" | "personal", "id": "...", "at": "ISO" }`.
- **Quién publica:**
  - Despachos: trigger `AFTER INSERT OR UPDATE` en `despacho_dev_despachos` y `despacho_dev_layout` → `realtime.send(...)`.
  - Personal (§1d): bit2-api, una vez por vuelta y solo si cambió alguna persona, vía la función `ops3d_notify_personal` (`id` = fecha del día).
  - Recepciones y equipos: trigger en sus tablas de Supabase una vez migradas (etapa B). No se hace puente desde Firestore.
- **Autorización:** política RLS sobre `realtime.messages` que solo permite `SELECT` cuando el claim del token coincide con el canal, por ejemplo `(auth.jwt() ->> 'ops3d_channel') = realtime.topic()`. El token lo firma la función con el JWT secret del proyecto de despachos.
- **Si el proyecto ya usa las llaves JWT nuevas (asimétricas)** y no se puede firmar: se omite `realtime` en la respuesta y SRO consulta cada 2 minutos (ya implementado). Alternativa: canal con nombre aleatorio que rota en cada consulta; los avisos solo llevan ids, sin datos.
- **SRO:** al recibir un aviso, vuelve a pedir la foto (1 s de agrupación). Renueva el token antes de `expires_at`. Respaldo: consulta cada 2 min si el canal no conecta, cada 10 min si conecta.

## 3. Cómo se ve en el 3D

**Despachos.** Las puertas de AppOLO son **distintas** de los andenes de SRO (todavía no se homologan). Cada `puerta` ("Puerta 11" → P11) se dibuja como andén propio del grupo **Despacho AppOLO**, entre Zona Franca y Recepción. No se crean en SRO.

| Estado AppOLO | En el 3D |
|---|---|
| `creado` | Camión acoplado; montacargas surte tarimas de racks a la zona de preparación |
| `en proceso` | Carretillas eléctricas cargan el contenedor; el avance es el de AppOLO: posiciones ocupadas de `layout` / 24 (sin `layout`, se estima por el tiempo transcurrido) |
| `chofer_pendiente` | Pasa al **patio de espera de salida de despachos** (propio, separado de la fila de SRO, junto al retorno). Se muestran **todos**, con nube y contador, para ver lo atrasado tal cual |
| `completo`, `pendiente_validacion` | Puertas cerradas; nube "Validando boleta" con contador |
| `rechazado` | Camión marcado en rojo |
| `despachado`, `finalizado` | Sale del sitio (visible 12 min) |
| `eliminado` | No se dibuja |

Si una cita de SRO ocupa el mismo andén, la cita tiene prioridad y el despacho se lista como "andén ocupado".

**Acomodo.** Entre `started_at` y `completed_at` de la recepción, montacargas y apiladores llevan las tarimas de la zona de recepción del andén de la cita a los racks. La cantidad de tarimas se estima a partir de los bultos. **Las posiciones en rack son ilustrativas** (AppOLO no registra ubicación).

**Equipos.** Solo se dibujan tantas máquinas como equipos **Activos** reporte AppOLO, repartidas entre las cargas y los acomodos visibles.

## 4. Tareas por sistema

**AppOLO (Claude / Kiro de AppOLO):**
1. Tabla de equivalencia `sro_warehouse_id → bodega_id` (y, opcional, `puerta → andén SRO`).
2. Edge Function `ops-3d-snapshot` según la sección 1 (etapa A con despachos; etapa B al migrar recepciones y equipos).
3. Triggers / Functions que publican avisos (sección 2) y política RLS de `realtime.messages`.
4. **Seguridad:** hoy las tablas `despacho_dev_*` permiten lectura a `anon` con `using (true)` (migración `20260728_despacho_dev_anon_read.sql`). Conviene restringirla: la llave anon está en el frontend y expone despachos de todas las empresas.
5. Recomendado: que `puerta` se elija de un catálogo (los nombres de andén de SRO) en lugar de texto libre.

**SRO (hecho en este repositorio):**
- `src/services/appoloOpsService.ts`: cliente del contrato, validación de versión y canal de avisos.
- `src/pages/proceso3d/lib/appolo.ts`: relación de puertas, estados, avance, acomodo, equipos y datos de demostración.
- `src/pages/proceso3d/useAppolo.ts`: consulta, tiempo real y animación de camiones de despacho.
- `src/pages/proceso3d/components/AppoloOps.tsx` y `AppoloPanel.tsx`: animación y panel.
- **Activación:** variable `VITE_APPOLO_OPS_URL` con la URL completa de la función. Sin ella, la integración queda apagada; el modo **Demo** permite validar la vista con datos de ejemplo.

## 5. Futuro (sin cambiar el contrato base)

- Acomodo por tarima con ubicación (`rack`, `nivel`, `posición`) y `equipo_id` → el 3D lo dibuja real en lugar de ilustrativo (`receptions[].pallets[]`, contrato v1 compatible si es opcional).
- Equipo y operador asignados a cada carga de despacho.

## Mapa del contenedor (`layout`)

- 24 posiciones (`despacho_dev_layout.slots[].type`), 12 filas × 2 columnas: posición *p* ↔ índice *p − 1*, impares a la izquierda.
- `E` libre · `S` simple · `D` doble · `T` triple · `C` cuádruple (mismos colores que AppOLO).
- Avance de carga = posiciones ocupadas / 24, igual que la tarjeta de AppOLO.
- En el 3D se dibujan las 24 posiciones dentro del contenedor (libres marcadas en el piso, ocupadas con su tarima) y la tarjeta del despacho muestra el mismo mapa 12 × 2.
- Se asume que la posición 1–2 es el fondo del contenedor y la 23–24 la puerta.
