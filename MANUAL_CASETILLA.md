# Manual de Usuario — Módulo Punto Control IN/OUT
## Rol: Casetilla (Operador de Portería / Control de Acceso)

---

> **¿Para quién es este manual?**  
> Este documento está dirigido exclusivamente a los operadores del **Punto de Control**, también llamados **Casetilla**. Son las personas responsables de registrar el ingreso y la salida de los vehículos en el almacén.

---

## Tabla de Contenidos

1. [¿Qué es el Módulo Casetilla?](#1-qué-es-el-módulo-casetilla)
2. [Pantalla Principal — Las Tres Opciones](#2-pantalla-principal--las-tres-opciones)
3. [Flujo Completo de Trabajo](#3-flujo-completo-de-trabajo)
4. [Opción 1 — Reservas Pendientes (Preparar un Ingreso)](#4-opción-1--reservas-pendientes-preparar-un-ingreso)
5. [Opción 2 — Registrar Ingreso (Formulario)](#5-opción-2--registrar-ingreso-formulario)
6. [Opción 3 — Registrar Salida](#6-opción-3--registrar-salida)
7. [Reporte de Duración en Punto Control](#7-reporte-de-duración-en-punto-control)
8. [Gestión de Fotos](#8-gestión-de-fotos)
9. [Casos Especiales y Solución de Problemas](#9-casos-especiales-y-solución-de-problemas)
10. [Resumen Visual del Flujo](#10-resumen-visual-del-flujo)

---

## 1. ¿Qué es el Módulo Casetilla?

El módulo **Punto Control IN/OUT** es la herramienta digital que reemplaza el libro físico o planilla de portería. Su función principal es:

1. **Registrar el INGRESO** de un vehículo al almacén (con foto y datos del chofer/matrícula).
2. **Registrar la SALIDA** del mismo vehículo cuando termina su operación.
3. **Generar un reporte** con los tiempos de permanencia de cada vehículo.

> **Importante:** Cada vez que un camión/vehículo llega al almacén, el operador de Casetilla debe registrar su ingreso. Cuando ese mismo vehículo sale, se registra su salida. El sistema calcula automáticamente cuánto tiempo estuvo dentro.

---

## 2. Pantalla Principal — Las Tres Opciones

Al abrir el módulo **Punto Control IN/OUT**, verás una pantalla con tres tarjetas de acción:

```
┌─────────────────────────────────────────────────────────────┐
│                 Punto Control IN/OUT                        │
│         Gestión de ingresos, salidas y reportes             │
├───────────────────┬───────────────────┬─────────────────────┤
│  🟡 Reservas      │  🟢 Registrar     │  🔵 Duración en     │
│     Pendientes    │     Salida        │     Punto Control   │
│                   │                   │                     │
│  Consulta y       │  Registra la      │  Reporte de         │
│  registra el      │  salida de        │  tiempos de         │
│  ingreso de       │  vehículos que    │  permanencia en     │
│  reservas         │  ya arribaron     │  el almacén         │
│  pendientes       │  al almacén       │                     │
│                   │                   │                     │
│  [Ver Pendientes] │  [Registrar       │  [Ver Reporte]      │
│                   │   Salida]         │                     │
└───────────────────┴───────────────────┴─────────────────────┘
```

| Tarjeta | Color | ¿Cuándo la usás? |
|---------|-------|------------------|
| **Reservas Pendientes** | Naranja/Amarillo | Cuando llega un camión que TIENE una reserva registrada en el sistema |
| **Registrar Salida** | Verde | Cuando un vehículo que ya está dentro del almacén va a salir |
| **Duración en Punto Control** | Azul | Para consultar el historial de tiempos de permanencia |

---

## 3. Flujo Completo de Trabajo

El proceso típico de un vehículo en el almacén es el siguiente:

```
LLEGADA DEL CAMIÓN
        │
        ▼
¿Tiene reserva en el sistema?
        │
   SÍ ─────────────────────────► Ir a "Reservas Pendientes"
        │                         Buscar la reserva
        │                         Hacer clic en "Abrir Ingreso"
   NO   │                         Completar el formulario
        │                         Subir 3 fotos mínimo
        ▼                         Hacer clic en "Registrar Ingreso"
Ir a "Registrar Ingreso"                   │
directamente (sin reserva                  ▼
previa)                           Ingreso registrado ✓
        │                         El vehículo está DENTRO
        │                               │
        │                               │ (tiempo de operación)
        │                               │
        ▼                               ▼
Completar el formulario        CAMIÓN LISTO PARA SALIR
con los datos a mano                    │
        │                               ▼
        ▼                    Ir a "Registrar Salida"
Subir 3 fotos mínimo         Buscar la reserva en la lista
        │                    Hacer clic en "Registrar Salida"
        ▼                    Subir 3 fotos mínimo
Hacer clic en                Confirmar la salida
"Registrar Ingreso"                     │
        │                               ▼
        ▼                    Salida registrada ✓
Ingreso registrado ✓         Sistema calcula el tiempo
```

---

## 4. Opción 1 — Reservas Pendientes (Preparar un Ingreso)

Cuando un vehículo llega al almacén y **tiene una reserva registrada en el sistema**, seguí estos pasos:

### Paso 1: Abrir la pantalla de Reservas Pendientes

Hacé clic en el botón naranja **"Ver Pendientes"** en la pantalla principal.

Se abre una pantalla que muestra **todas las reservas que están en estado Pendiente o Confirmado** y que aún no han registrado ingreso.

### Paso 2: Buscar la reserva del vehículo

En la parte superior hay un campo de búsqueda. Podés escribir cualquiera de estos datos para encontrar la reserva rápidamente:

- **DUA** (número de documento de aduana)
- **Nombre del chofer**
- **Proveedor** (nombre del transportista)
- **Matrícula/Placa** del vehículo
- **Número de Orden de Compra (OC)**

A medida que escribís, la lista se filtra automáticamente.

### ¿Qué información muestra la tabla?

| Columna | Descripción |
|---------|-------------|
| **DUA** | Número de documento aduanero |
| **Matrícula** | Placa del vehículo |
| **Chofer** | Nombre del conductor |
| **Proveedor** | Empresa transportista |
| **Almacén** | Almacén destino |
| **OC** | Orden de Compra asociada |
| **Acción** | Botón "Abrir Ingreso" |

En dispositivos móviles, la información se muestra en tarjetas (cards) en lugar de tabla, con el mismo contenido.

### Paso 3: Abrir el Ingreso de una reserva

1. Encontrá la reserva del vehículo en la lista.
2. Hacé clic en el botón **"Abrir Ingreso"** (color teal) de esa fila.
3. El sistema abre automáticamente el formulario de ingreso con los datos de la reserva **ya precargados** (chofer, matrícula, DUA, orden de compra, número de pedido).

> **Ventaja de usar "Reservas Pendientes":** Los datos ya vienen cargados desde la reserva, reduciendo la posibilidad de errores de carga manual.

---

## 5. Opción 2 — Registrar Ingreso (Formulario)

El formulario de ingreso se puede llegar de dos maneras:
1. **Desde "Reservas Pendientes"** (con datos precargados de la reserva).
2. **Directamente desde la pantalla principal** (sin reserva previa, todos los datos a mano).

### Campos del Formulario de Ingreso

| Campo | Obligatorio | Descripción |
|-------|-------------|-------------|
| **DUA** | ✅ Sí | Número de Declaración Única Aduanera |
| **Matrícula** | ✅ Sí | Placa/matrícula del vehículo |
| **Chofer** | ✅ Sí | Nombre completo del conductor |
| **Cédula** | No | Número de documento de identidad del chofer |
| **Orden de Compra** | No | Número de OC asociado a la entrega |
| **Número de Pedido** | No | Número de pedido interno |
| **Observaciones** | No | Cualquier nota relevante sobre el ingreso |

> **Campos con asterisco rojo (\*)** son obligatorios. No podés enviar el formulario sin completarlos.

### Banner informativo (cuando viene de una reserva)

Si abriste el ingreso desde "Reservas Pendientes", verás un banner teal que dice:

> *"Este ingreso actualizará automáticamente el estado de la reserva seleccionada."*

Esto significa que al guardar el ingreso, la reserva en el Calendario cambiará de estado automáticamente.

### Fotos (Obligatorio: mínimo 3)

El formulario incluye una sección de carga de fotos. **Es obligatorio subir al menos 3 fotos** para poder registrar el ingreso. Si intentás guardar sin las fotos mínimas, el sistema muestra el mensaje:

> *"Se requieren al menos 3 fotos. Faltan X foto/s."*

Consultá la sección [Gestión de Fotos](#8-gestión-de-fotos) para instrucciones detalladas sobre cómo subir imágenes.

### Guardar el Ingreso

Una vez completados los campos obligatorios y subidas las 3 fotos mínimas:

1. Hacé clic en el botón verde **"Registrar Ingreso"**.
2. El botón mostrará "Registrando..." mientras procesa.
3. Aparece un mensaje de **Éxito** cuando el ingreso se guardó correctamente.
4. Al confirmar el mensaje, el sistema vuelve a la pantalla principal automáticamente.

### Botón "Volver" / Cancelar

Si necesitás salir del formulario sin guardar:
- Hacé clic en **"Volver"** (botón gris en la parte superior).
- O hacé clic en **"Cancelar"** (botón gris al final del formulario).

El ingreso **no se guarda** y volvés a la pantalla anterior.

> **Nota importante:** Si volvés a la pantalla principal sin registrar el ingreso, el formulario se descarta. El sistema NO guarda borradores de ingresos.

---

## 6. Opción 3 — Registrar Salida

### ¿Cuándo se usa?

Cuando un vehículo que **ya tiene un ingreso registrado** termina su operación en el almacén y está listo para salir.

### Paso 1: Abrir "Registrar Salida"

Hacé clic en el botón verde **"Registrar Salida"** en la pantalla principal.

Se abre la pantalla con la lista de vehículos que **tienen ingreso registrado** y **aún no tienen salida**. Estos son los vehículos que actualmente están dentro del almacén.

### Paso 2: Buscar el vehículo que va a salir

Usá el campo de búsqueda para encontrar el vehículo. Podés buscar por:
- **DUA**
- **Chofer**
- **Matrícula**
- **Proveedor**
- **Orden de Compra**

### Paso 3: Seleccionar la reserva

Hacé clic en el botón verde **"Registrar Salida"** de la fila correspondiente al vehículo.

Se abre el **formulario de salida**.

### Formulario de Salida

El formulario de salida muestra la información de la reserva en **campos de solo lectura** (no se pueden modificar):

| Campo | Descripción |
|-------|-------------|
| **Matrícula** | Placa del vehículo |
| **Chofer** | Nombre del conductor |
| **Proveedor** | Empresa transportista |
| **Almacén** | Almacén donde estuvo el vehículo |
| **DUA** | Si fue cargado en el ingreso |

> *"Los datos mostrados provienen de la reserva seleccionada y no pueden ser modificados."*

Esto garantiza que la salida quede vinculada al ingreso correcto.

### Fotos de Salida (Obligatorio: mínimo 3)

Al igual que en el ingreso, debés subir **mínimo 3 fotos** del vehículo al momento de la salida. Estas fotos documentan el estado del vehículo al salir.

Consultá la sección [Gestión de Fotos](#8-gestión-de-fotos) para instrucciones.

### Confirmar la Salida

1. Una vez subidas las 3 fotos, hacé clic en **"Registrar Salida"** (botón verde).
2. Aparece un **modal de confirmación** que muestra:
   > *"Se registrará la salida del vehículo [MATRÍCULA] conducido por [CHOFER]."*
3. Hacé clic en **"Aceptar"** para confirmar.
   - O hacé clic en **"Cancelar"** para volver sin registrar.
4. El sistema registra la salida y calcula automáticamente el tiempo de permanencia.
5. Aparece un mensaje de **Éxito** y volvés a la pantalla principal.

### ¿Qué pasa si no encuentro el vehículo en la lista de salida?

Significa que ese vehículo **no tiene un ingreso registrado en el sistema**. Posibles causas:
- El operador de turno anterior no registró el ingreso.
- El ingreso fue registrado en otra sucursal o almacén.
- Hubo un error en el registro anterior.

En este caso, contactá a tu supervisor. No podés registrar una salida sin ingreso previo.

---

## 7. Reporte de Duración en Punto Control

Este reporte muestra el **historial de todas las salidas registradas** junto con los tiempos de permanencia calculados automáticamente.

### ¿Cómo acceder?

Hacé clic en el botón azul **"Ver Reporte"** en la pantalla principal.

### Panel de Resumen (Tarjetas superiores)

Al entrar al reporte, verás 4 tarjetas con estadísticas:

| Tarjeta | Descripción |
|---------|-------------|
| **Total Salidas** | Cantidad total de registros de salida (aplicando los filtros activos) |
| **Promedio** | Tiempo promedio de permanencia en formato HH:MM (y en minutos) |
| **Máximo** | El tiempo de permanencia más largo registrado |
| **Mínimo** | El tiempo de permanencia más corto registrado |

> Estas estadísticas se actualizan dinámicamente según los filtros que apliques.

### Filtros del Reporte

| Filtro | Descripción |
|--------|-------------|
| **Buscar** | Texto libre: filtra por Chofer, Matrícula o DUA |
| **Desde** | Fecha de inicio del rango (filtra por fecha de ingreso) |
| **Hasta** | Fecha de fin del rango (filtra por fecha de ingreso) |

Hacé clic en **"Limpiar Filtros"** para eliminar todos los filtros aplicados.

Hacé clic en **"Actualizar"** para recargar los datos desde el servidor (útil si otro operador registró algo mientras tenés el reporte abierto).

### Columnas de la tabla

| Columna | Descripción |
|---------|-------------|
| **Chofer** | Nombre del conductor |
| **Matrícula** | Placa del vehículo |
| **DUA** | Documento aduanero (si fue ingresado) |
| **Ingreso** | Fecha y hora exacta del ingreso al almacén |
| **Salida** | Fecha y hora exacta de la salida del almacén |
| **Duración** | Tiempo total en formato **HH:MM** y en minutos |
| **Fotos** | Miniaturas de las fotos de ingreso y salida |

### Paginación del Reporte

El reporte permite controlar cuántos registros ver por vez:
- **10, 30, 50, 100** registros por página.
- **TODOS:** Muestra todos los registros sin paginar (útil para exportar o revisar el historial completo).

Usá los botones **← →** para navegar entre páginas cuando hay más registros que los seleccionados.

### Ver fotos del historial

Para cada registro en la tabla hay miniaturas de fotos:
- **Fotos de Entrada** (etiqueta teal)
- **Fotos de Salida** (etiqueta verde)

Hacé clic en cualquier miniatura para abrir el **visor de fotos** en pantalla completa. Podés navegar entre todas las fotos de ese registro con las flechas.

En dispositivos móviles, las fotos aparecen como badges/botones (ej. "3 fotos entrada"). Hacé clic para abrir el visor.

---

## 8. Gestión de Fotos

Las fotos son evidencia del estado del vehículo al ingresar y salir del almacén. El sistema las almacena de forma segura y permanente.

### Requisito mínimo

**Siempre se requieren al menos 3 fotos** tanto para el ingreso como para la salida. Sin las 3 fotos no es posible registrar el evento.

### ¿Cómo subir fotos?

La sección de fotos aparece en la parte inferior del formulario (antes de los botones de guardar):

1. **Desde dispositivo móvil:**
   - Hacé clic en el área de subida o en el botón de cámara.
   - Podés tomar una foto en ese momento con la cámara del dispositivo.
   - O elegir una foto existente de la galería.

2. **Desde computadora (escritorio):**
   - Hacé clic en el área de subida.
   - Se abre el explorador de archivos.
   - Seleccioná uno o varios archivos de imagen (JPG, PNG, WEBP).

3. Podés subir **hasta 5 fotos** por registro (mínimo 3, máximo 5).

### Barra de progreso

Al subir una foto, verás una barra de progreso indicando el porcentaje de carga. Esperá a que llegue al 100% antes de intentar guardar el formulario.

### Eliminar una foto

Si subiste una foto por error:
- Hacé clic en el botón **×** (o ícono de papelera) que aparece sobre la miniatura de la foto.
- La foto se elimina del registro (no se puede deshacer).

### Persistencia durante el proceso

Si estás cargando fotos y por algún motivo el sistema se refresca o la conexión se interrumpe brevemente, las fotos que ya subiste se **conservan en sesión**. Al volver al formulario, las fotos cargadas seguirán ahí.

> **Importante:** Esto funciona solo en la misma sesión del navegador. Si cerrás el navegador por completo y abrís uno nuevo, las fotos en proceso se pierden y deberás subirlas nuevamente.

### ¿Qué fotos tomar?

Se recomienda documentar:
- **Ingreso:** Frente del vehículo, matrícula visible, estado general, DUA/documentos si aplica.
- **Salida:** Frente y parte trasera del vehículo, matrícula visible, estado al salir.

---

## 9. Casos Especiales y Solución de Problemas

### ¿Qué hago si el camión llega pero NO aparece en "Reservas Pendientes"?

**Posibles causas:**
1. La reserva no fue creada en el Calendario antes de la llegada.
2. La reserva está en estado "Cancelada" o ya fue procesada.
3. Error en los datos de búsqueda (buscar por DUA diferente al registrado, etc.).

**Qué hacer:**
- Verificá la búsqueda probando con otro dato (chofer, matrícula, proveedor).
- Si definitivamente no existe la reserva, registrá el ingreso directamente desde la pantalla principal, completando todos los datos a mano, **sin usar "Reservas Pendientes"**.
- Notificá al coordinador o al área de logística para que creen la reserva retroactivamente si es necesario.

---

### ¿Qué hago si el camión no aparece en "Registrar Salida"?

Si un vehículo que está físicamente en el almacén no aparece en la lista de salidas:

1. El ingreso podría no haber sido registrado en el sistema.
2. El ingreso fue registrado en otro turno o por otro operador en una sesión diferente.

**Qué hacer:**
- Consultá el historial en el **Reporte de Duración** para ver si hay un ingreso registrado recientemente para esa matrícula.
- Si el ingreso existe, buscalo en la lista de salida con otro término (nombre del chofer, DUA).
- Si el ingreso NO existe, es un caso especial: registrá el ingreso primero, y luego la salida. Dejá una nota en "Observaciones" explicando la situación.

---

### El formulario de ingreso/salida no guarda y muestra un error

Verificá lo siguiente en orden:
1. ¿Están completos todos los campos obligatorios (DUA, Matrícula, Chofer)?
2. ¿Subiste al menos 3 fotos y todas llegaron al 100% de carga?
3. ¿Tenés conexión a internet estable?

Si el error persiste después de verificar todo lo anterior, notificá al administrador del sistema con el mensaje exacto que muestra la pantalla.

---

### El sistema se "cuelga" o no responde al guardar

Esto puede ocurrir si la conexión a internet es lenta al momento de subir las fotos. 

**Qué hacer:**
- No cerrés el navegador ni hagas clic múltiples veces en "Registrar Ingreso".
- Esperá al menos 30 segundos.
- Si después de ese tiempo no hubo respuesta, revisá si tenés conexión a internet.
- Si la conexión está bien y sigue sin responder, recargá la página. El sistema puede haber guardado parcialmente; verificá en el **Reporte de Duración** si el registro aparece.

---

### ¿Puedo editar un ingreso ya registrado?

**No.** Una vez que un ingreso o salida se registra, no puede editarse desde el módulo Casetilla. Solo un **Administrador** puede modificar o eliminar registros ya creados.

Si cometiste un error (por ejemplo, escribiste mal la matrícula), contactá inmediatamente a tu supervisor o administrador.

---

### ¿Qué pasa si registro el ingreso dos veces?

El sistema permite múltiples ingresos para la misma reserva, pero en la lista de salida aparecerán como registros separados. 

Para evitar duplicados:
- Antes de registrar un ingreso, buscá la matrícula en el campo de búsqueda de "Reservas Pendientes".
- Si ya no aparece en esa lista (porque ya fue procesada), buscala en el Reporte de Duración para confirmar que ya fue registrada.

---

## 10. Resumen Visual del Flujo

### Flujo de Ingreso

```
LLEGADA DEL VEHÍCULO
        │
        ▼
Abrir "Reservas Pendientes"
        │
        ▼
Buscar por DUA / Chofer / Matrícula / OC
        │
    ¿Lo encontraste?
    │           │
   SÍ          NO
    │           │
    ▼           ▼
Clic en     Ir directo a
"Abrir       "Registrar Ingreso"
Ingreso"     desde pantalla
    │        principal
    │           │
    └─────┬─────┘
          │
          ▼
  FORMULARIO DE INGRESO
  ┌─────────────────────┐
  │ ✅ DUA              │
  │ ✅ Matrícula        │
  │ ✅ Chofer           │
  │ ○  Cédula           │
  │ ○  Orden de Compra  │
  │ ○  Número Pedido    │
  │ ○  Observaciones    │
  │                     │
  │ 📷 3-5 FOTOS        │
  │    (obligatorio)    │
  └─────────────────────┘
          │
          ▼
  Clic "Registrar Ingreso"
          │
          ▼
  ✅ INGRESO REGISTRADO
  (Vehículo está DENTRO)
```

### Flujo de Salida

```
VEHÍCULO LISTO PARA SALIR
        │
        ▼
Abrir "Registrar Salida"
        │
        ▼
Buscar por DUA / Chofer / Matrícula / OC
        │
        ▼
Clic en "Registrar Salida" en la fila
        │
        ▼
FORMULARIO DE SALIDA
(datos de la reserva en solo lectura)
        │
        ▼
📷 Subir 3-5 FOTOS de salida
(obligatorio)
        │
        ▼
Clic "Registrar Salida"
        │
        ▼
Modal de confirmación:
"¿Registrar salida del vehículo [X]?"
        │
    ┌───┴───┐
  Aceptar  Cancelar
    │
    ▼
✅ SALIDA REGISTRADA
(Sistema calcula tiempo automáticamente)
```

---

## Tabla de Referencia Rápida

| Situación | Acción |
|-----------|--------|
| Llega un vehículo CON reserva | Reservas Pendientes → Buscar → Abrir Ingreso → Fotos → Registrar |
| Llega un vehículo SIN reserva | Pantalla principal → Sin usar pendientes → Completar formulario a mano → Fotos → Registrar |
| Sale un vehículo | Registrar Salida → Buscar → Abrir formulario → Fotos → Confirmar |
| Ver tiempos de permanencia | Reporte de Duración → Filtrar si necesitás → Revisar tabla |
| No encuentro el vehículo en pendientes | Buscar con otros datos; si no aparece, registrar ingreso manual |
| No encuentro el vehículo en salidas | Buscar con otros datos; si no aparece, registrar ingreso primero |
| Error al guardar | Verificar campos obligatorios y 3 fotos cargadas al 100% |

---

## Buenas Prácticas para Operadores de Casetilla

1. **Siempre buscá la reserva antes de crear un ingreso nuevo.** Evita duplicados y vincula el ingreso a la reserva correcta.

2. **Tomá fotos claras y con buena iluminación.** Las fotos son evidencia. Asegurate de que la matrícula sea legible en al menos una foto.

3. **No dejes el formulario a medias.** Terminá de registrar el ingreso o salida antes de atender otra tarea. Un formulario sin guardar no registra nada.

4. **Registrá la salida lo antes posible.** No esperes al final del turno para registrar todas las salidas. El sistema calcula tiempos en tiempo real.

5. **Completá el campo de Observaciones** cuando haya algo inusual: vehículo dañado, documentación incompleta, chofer distinto al esperado, etc.

6. **Verificá la matrícula** antes de guardar. Es el dato más crítico para identificar al vehículo en el historial.

7. **Si tenés dudas, no adivines.** Preguntá al chofer o al coordinador antes de registrar datos incorrectos.

---

*Última actualización: Sistema SRO — Manual Casetilla / Punto Control IN/OUT v1.0*
