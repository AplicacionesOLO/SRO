# MANUAL COMPLETO DEL SISTEMA SRO — Schedule, Receive & Operate

## Índice

1. [Visión General del Sistema](#1-visión-general-del-sistema)
2. [Dashboard](#2-dashboard)
3. [Calendario de Reservas](#3-calendario-de-reservas)
4. [Gestión de Andenes](#4-gestión-de-andenes)
5. [Listado de Reservas](#5-listado-de-reservas)
6. [Punto Control IN/OUT (Casetilla)](#6-punto-control-inout-casetilla)
7. [Reportes desde Punto de Control](#7-reportes-desde-punto-de-control)
8. [Administración — Catálogos](#8-administración--catálogos)
9. [Administración — Clientes](#9-administración--clientes)
10. [Administración — Almacenes](#10-administración--almacenes)
11. [Administración — Correspondencia](#11-administración--correspondencia)
12. [Administración — Usuarios](#12-administración--usuarios)
13. [Administración — Roles](#13-administración--roles)
14. [Administración — Matriz de Permisos](#14-administración--matriz-de-permisos)
15. [Manpower — Control de Personal](#15-manpower--control-de-personal)
16. [Base de Conocimiento](#16-base-de-conocimiento)
17. [Chat y Asistente IA (SRObot)](#17-chat-y-asistente-ia-srobot)
18. [Perfil de Usuario](#18-perfil-de-usuario)
19. [Correspondencia Automatizada](#19-correspondencia-automatizada)
20. [Preguntas Frecuentes](#20-preguntas-frecuentes)

---

## 1. Visión General del Sistema

### ¿Qué es SRO?

SRO (Schedule, Receive & Operate) es un sistema integral de gestión logística para la administración de reservas de andenes en almacenes y bodegas. Permite calendarizar recepciones y despachos de mercancía, controlar el acceso de usuarios por cliente y almacén, gestionar bloqueos de horario, registrar el ingreso y salida de vehículos en el punto de control (casetilla), y administrar reglas operativas.

### Módulos del Sistema

El sistema está compuesto por los siguientes módulos principales:

- **Dashboard**: Panel de control con indicadores clave de rendimiento (KPIs), tendencias de reservas, y métricas operativas.
- **Calendario**: Vista de calendario interactiva para crear, editar, mover y gestionar reservas de andenes, con soporte para drag & drop, búsqueda, y filtrado por almacén, cliente y categoría.
- **Andenes**: Administración completa de andenes: crear, editar, activar/desactivar, asignar a almacenes, categorías y estados operativos.
- **Reservas**: Listado completo de reservas con filtros avanzados, búsqueda por DUA, factura, matrícula o chofer.
- **Punto Control IN/OUT (Casetilla)**: Módulo para el punto de control físico del almacén. Permite registrar ingresos y salidas de vehículos, escanear códigos QR, consultar reservas pendientes, y generar reportes de tiempos de permanencia.
- **Manpower**: Gestión de colaboradores y asignación de personal a almacenes, con control de tipos de trabajo, países y fichas.
- **Base de Conocimiento**: Repositorio de documentos PDF indexados con IA para consultas del asistente virtual.
- **Chat**: Comunicación interna con asistente IA (SRObot) que responde preguntas basadas en los documentos de la base de conocimiento.

### Módulos de Administración

- **Catálogos**: Gestión de proveedores, tipos de carga, perfiles de tiempo, orígenes de proveedores y asignaciones.
- **Clientes**: Administración de clientes, reglas operativas, asignación de andenes y proveedores por cliente.
- **Almacenes**: Creación y configuración de almacenes con sus países, horarios, timezone, y tolerancias.
- **Correspondencia**: Configuración de reglas de envío automático de correos (Gmail y SMTP), triggers por cambio de estado de reserva, y logs de envíos.
- **Usuarios**: Gestión de usuarios del sistema, asignación de roles, organizaciones, almacenes, países, clientes y proveedores.
- **Roles**: Definición de roles del sistema y sus permisos asociados.
- **Matriz de Permisos**: Vista matricial de todos los permisos del sistema organizados por módulo y rol.

### Roles de Usuario

El sistema maneja una jerarquía de roles con permisos granulares:

- **ADMIN**: Acceso completo a todos los módulos, incluyendo administración, configuración del sistema, y gestión de usuarios y roles.
- **Full Access**: Acceso a todos los módulos operativos y de administración (similar a ADMIN pero sin ciertas configuraciones de sistema).
- **Manager**: Acceso a funciones de gestión de almacenes, clientes, catálogos, reportes y dashboards.
- **Operador**: Acceso limitado a calendario, reservas, punto de control y consultas básicas.
- **Usuario Básico**: Acceso mínimo, generalmente restringido a un cliente o almacén específico.

### Conceptos Clave

#### Almacenes (Warehouses)
Unidades operativas independientes que agrupan andenes, cada una con su propia zona horaria (timezone), horario hábil (business hours), intervalo de slots, y configuraciones de tolerancia para "No arribó" (no-show).

#### Andenes (Docks)
Espacios físicos de carga y descarga dentro de un almacén. Cada andén pertenece a una categoría y tiene un estado operativo. Los andenes pueden asignarse a clientes específicos mediante reglas de asignación (secuencial o intercalado).

#### Reservas (Reservations)
Agendamiento de un vehículo en un andén para un rango de fecha y hora específico. Cada reserva tiene un estado (pendiente, confirmada, en progreso, completada, cancelada, etc.), un proveedor asociado, datos del chofer, matrícula del vehículo, DUA (Documento Único Aduanero para importaciones), y notas operativas.

#### Clientes (Clients)
Organizaciones que utilizan los servicios del almacén. Cada cliente puede tener asignados andenes específicos, proveedores, reglas de pickup, reglas de corte del mismo día (same-day cutoff), y configuraciones de estados bloqueados.

#### Proveedores (Providers)
Empresas o transportistas que entregan o retiran mercancía. Pueden ser nacionales o importadores. Se vinculan a clientes, tipos de carga, y perfiles de tiempo.

#### Tipos de Carga (Cargo Types)
Clasificación de la mercancía transportada: contendedores, carga suelta, pallets, etc. Determinan los tiempos teóricos de operación en combinación con el proveedor mediante perfiles de tiempo.

#### Estados de Reserva (Reservation Statuses)
Configurables por organización, con código, nombre, color y orden. Los estados principales incluyen: Pendiente, Confirmada, En Progreso, Arribó (pendiente descarga), Completada/Despachada, Cancelada, No Arribó. Cada estado tiene comportamientos asociados (bloqueos de edición, triggers de email, etc.).

---

## 2. Dashboard

### Acceso y Propósito

El Dashboard es la página principal de inicio del sistema. Muestra un resumen operativo en tiempo real del almacén seleccionado, con indicadores clave de rendimiento que permiten tomar decisiones rápidas.

### Funcionalidades

#### Selector de Período
- **Presets rápidos**: Hoy, Esta Semana, Este Mes, Este Año, Todo.
- **Rango personalizado**: Selección de fecha de inicio y fin para análisis específicos.
- **Selector de Almacén**: Filtra todos los indicadores por un almacén específico.

#### KPIs Principales
El dashboard muestra los siguientes indicadores en tarjetas:

- **Reservas en período**: Total de reservas programadas en el rango seleccionado, con comparativa porcentual vs el período anterior.
- **Pendientes**: Reservas con estado "Pendiente" que aún no han sido confirmadas.
- **Confirmadas**: Reservas en estado "Confirmada", con tasa de confirmación porcentual.
- **En Proceso**: Reservas que están siendo atendidas activamente (estado "En Progreso" o "Arribó pendiente descarga").

#### Resumen Rápido por Período Fijo
Tres tarjetas que muestran los conteos para Hoy, Esta Semana y Este Mes, independientemente del período seleccionado.

#### Reservas por Tipo de Proveedor
Gráfico de barras y porcentajes que muestra la distribución entre:
- **Nacional**: Proveedores que operan dentro del país.
- **Importado**: Proveedores que traen mercancía del extranjero (requieren DUA).

#### Tendencia de Reservas
Gráfico de barras que muestra la evolución temporal de reservas. Según el período seleccionado:
- **Hoy**: Agrupado por hora.
- **Semana / Mes**: Agrupado por día.
- **Año**: Agrupado por mes.
- **Rango personalizado**: Adaptativo según la duración del rango (días, semanas o meses).

#### Distribución por Estado
Barras de progreso con colores que muestran cuántas reservas hay en cada estado operativo.

#### Recursos Operativos
- Andenes activos / totales.
- Almacenes configurados.
- Colaboradores activos.
- Tasa de cumplimiento (reservas finalizadas).

#### Top Proveedores
Ranking de los 5 proveedores con más reservas en el período.

#### Horas Pico
Las 5 horas del día con mayor concentración de reservas.

#### Andenes más Usados
Ranking de los 5 andenes con más reservas asignadas.

#### Rendimiento por Almacén
Tabla comparativa entre almacenes con número de reservas, cantidad de andenes y porcentaje de ocupación relativa.

#### Acciones Rápidas
Botones de acceso directo a:
- **Nueva Reserva**: Va al calendario.
- **Ver Andenes**: Va a la gestión de andenes.
- **Casetilla**: Va al punto de control IN/OUT.

---

## 3. Calendario de Reservas

### Acceso y Propósito

El Calendario es el módulo central del sistema. Ofrece una vista de parrilla (grid) donde cada columna es un andén y cada fila es un intervalo de tiempo (slot), permitiendo visualizar, crear, editar, mover y gestionar reservas de forma intuitiva.

### Selector de Almacén

- Si el usuario tiene acceso a un solo almacén, se selecciona automáticamente.
- Si tiene acceso a múltiples almacenes, se muestra un modal de selección al entrar.
- El botón "Cambiar Almacén" permite alternar entre almacenes disponibles.
- Opción "Ver todos los andenes" (solo para usuarios con acceso global) muestra los andenes de todos los almacenes simultáneamente.

### Navegación Temporal

- **Hoy**: Botón rápido para volver al día actual.
- **Selector de fecha**: Input de fecha para saltar a un día específico.
- **Flechas de navegación**: Avanzar o retroceder en el tiempo.
- **Modos de vista**: 1 día, 3 días, 7 días.

### Controles y Filtros

- **Búsqueda**: Campo de texto para buscar reservas por DUA, Factura o nombre del Chofer.
- **Filtro por Categoría**: Selector para mostrar solo andenes de una categoría específica.
- **Nueva Reserva**: Botón principal para crear una reserva (activa el flujo de pre-reserva).
- **Bloquear Tiempo**: Botón para crear bloqueos de horario en andenes (solo usuarios con permiso).

### Cabeceras del Calendario

- **Fila de fechas**: Muestra el nombre del día (ej: "Lunes, 15 de enero de 2026") con indicador verde para el día actual.
- **Fila de andenes**: Cada columna muestra el nombre y referencia del andén. El color de fondo de la cabecera puede ser personalizado por andén o usar el color de su categoría.

### Columna de Horarios

A la izquierda del grid, una columna fija muestra los intervalos de tiempo (slots) del horario hábil del almacén. Los intervalos fuera del horario hábil se muestran en gris claro con patrón rayado. El intervalo de cada slot está definido en la configuración del almacén (ej: 60 minutos).

### Eventos en el Calendario

#### Reservas
Se muestran como tarjetas coloreadas dentro de la columna del andén correspondiente. Al posicionar el cursor sobre una reserva (hover), se despliega una tarjeta flotante con información detallada.

**Colores de reservas**:
- El borde izquierdo y el color de fondo se derivan del color del estado de la reserva.
- Las reservas que se extienden fuera del horario hábil muestran un borde ámbar de advertencia.

**Información visible en la tarjeta**:
- ID de reserva (8 caracteres).
- Nombre del proveedor.
- DUA (si aplica).
- Número de pedido.
- BL (Bill of Lading, si aplica y la tarjeta es suficientemente alta).
- Factura.
- Matrícula del vehículo.
- Nombre del chofer.
- Usuario que creó la reserva.
- Orden de compra.

**Información en la tarjeta flotante (hover card)**:
- Todos los campos anteriores más:
- Nombre del andén.
- Estado actual con etiqueta de color.
- Horario (hora inicio - hora fin).
- Tipo de operación (Distribución, Almacén, Zona Franca).
- Origen de la carga.
- Creado por (nombre y email).

**Restricción de visibilidad**: Los usuarios con acceso limitado (no propietarios, no administradores, y sin el proveedor en su lista) solo ven información básica y un ícono de "Info limitada".

#### Bloqueos de Tiempo
Se muestran como barras grises con el texto "Bloqueado" y opcionalmente el motivo del bloqueo. Indican períodos donde el andén no está disponible para reservas.

#### Indicador de Hora Actual
Una línea roja horizontal con un punto rojo a la izquierda marca la hora actual en el calendario, actualizándose cada minuto.

### Interacción con Reservas

#### Crear una Nueva Reserva

1. Hacer clic en "Nueva Reserva".
2. Se abre el **Pre-Modal de Reserva** donde se debe seleccionar:
   - **Tipo de carga**: Obligatorio. Determina la duración teórica de la operación.
   - **Proveedor**: Búsqueda y selección del proveedor/transportista.
   - **Cliente**: Se asigna automáticamente desde el proveedor, o se selecciona manualmente.
   - **Cantidad**: Número de bultos, contenedores o líneas (según el tipo de carga).
   - **¿Es consolidado?**: Checkbox para indicar si la reserva incluye múltiples proveedores.
3. Al confirmar, el sistema:
   - Calcula la duración requerida según el perfil de tiempo del proveedor y tipo de carga.
   - Carga las reglas de asignación de andenes para el cliente (secuencial o intercalado).
   - Verifica el corte del mismo día (same-day cutoff) si la reserva es para hoy.
   - Entra en **Modo Selección**, donde los slots disponibles se iluminan en verde.
4. El usuario hace clic en un slot verde para crear la reserva.
5. Se abre el **Modal de Reserva** con los datos pre-llenados para completar campos adicionales:
   - Matrícula del vehículo.
   - Nombre del chofer.
   - DUA (si es importado).
   - Factura.
   - Orden de compra.
   - Número de pedido.
   - Notas.
   - Tipo de operación (Distribución, Almacén, Zona Franca).
   - BL Number (para Zona Franca importado).
   - Archivos adjuntos.
6. Al guardar, el sistema crea la reserva, genera el código QR y la ficha de cita, y dispara los correos electrónicos configurados.

#### Reservas Consolidadas
Cuando se marca "Es consolidado", el modal permite agregar múltiples proveedores, cada uno con su cantidad de bultos. La asignación de andenes calcula la intersección de los andenes disponibles para todos los proveedores del consolidado. La duración se calcula sumando los tiempos de todos los proveedores.

#### Editar una Reserva
Hacer clic en una reserva existente abre el modal de edición donde se pueden modificar todos los campos, cambiar el estado, agregar o quitar archivos, y gestionar proveedores consolidados.

#### Mover una Reserva (Drag & Drop)
Los usuarios con permiso pueden arrastrar una reserva a otro andén o a otro horario. El sistema valida que:
- No haya conflicto con otra reserva.
- No haya conflicto con un bloqueo.
- La reserva no cruce al día siguiente.
- La reserva esté dentro del horario hábil.
- El estado de la reserva no esté bloqueado para edición.

#### Copiar una Reserva
Desde el modal de una reserva existente, el botón "Copiar" permite duplicar la reserva. Se activa el modo selección mostrando los slots disponibles en verde. La reserva original no se modifica; solo se crea una nueva con los mismos datos.

#### Cancelar una Reserva
Desde el modal de edición, se puede cancelar una reserva proporcionando un motivo. La reserva cancelada permanece visible en el calendario con apariencia atenuada pero no ocupa espacio operativo.

### Crear una Reserva Recurrente
Al crear o editar una reserva, se puede activar la opción de recurrencia para:
- Seleccionar días de la semana (Lunes a Sábado).
- Definir cuántas semanas adelante se repite.
- El sistema crea automáticamente las ocurrencias adicionales, omitiendo aquellas que tengan conflicto de horario.
- Cada ocurrencia es una reserva independiente con su propio QR.

### Bloqueos de Tiempo (Time Blocks)
Los administradores pueden crear bloqueos de horario para impedir reservas en andenes específicos durante ciertos períodos. Al hacer clic en "Bloquear Tiempo":
1. Se abre el modal de bloqueo.
2. Seleccionar el andén.
3. Definir fecha, hora de inicio y hora de fin.
4. Opcionalmente agregar un motivo.
5. Para bloqueos recurrentes: seleccionar días de la semana y semanas adelante.
6. El sistema valida que no haya conflicto con reglas de cliente (los bloqueos de cliente tienen prioridad).

### Pestañas del Calendario

#### Calendario (vista principal)
La parrilla de reservas descrita arriba.

#### Estatus Op (Operational Statuses)
Tabla de configuración de estados operativos de reservas. Solo visible para ADMIN y Full Access. Permite:
- Ver todos los estados con su código, nombre, color y orden.
- Activar/desactivar estados.
- Reordenar estados (arrastrando).
- Cada estado tiene un código único (ej: PENDING, CONFIRMED, IN_PROGRESS, DISPATCHED, CANCELLED, NO_SHOW).

#### Bloqueos (Blocks Management)
Vista de gestión de todos los bloqueos de tiempo existentes. Solo visible para ADMIN y Full Access. Permite:
- Ver todos los bloqueos con su andén, rango de fechas, motivo y creador.
- Editar o eliminar bloqueos existentes.

---

## 4. Gestión de Andenes

### Acceso
Página accesible desde el menú lateral en "Andenes". Requiere permiso `docks.view`.

### Funcionalidades

#### Listado de Andenes
Tabla con todos los andenes de la organización, mostrando:
- **Nombre**: Identificador del andén.
- **Referencia**: Texto opcional para identificar el andén (ej: "Puerta 1", "Muelle A").
- **Color de cabecera**: Color personalizado opcional para la cabecera del andén en el calendario.
- **Almacén**: Almacén al que pertenece el andén.
- **Categoría**: Clasificación del andén (ej: "Carga Seca", "Refrigerado", "Peligroso").
- **Estado**: Estado operativo actual (ej: "Operativo", "En Mantenimiento", "Fuera de Servicio").
- **Activo**: Ícono verde si está activo, rojo si está inactivo.

#### Filtros
- **Búsqueda**: Por nombre o referencia.
- **Categoría**: Filtrar por tipo de andén.
- **Estado**: Filtrar por estado operativo.
- **Almacén**: Filtrar por almacén asignado.
- **Solo activos**: Toggle para ocultar andenes inactivos.

#### Crear un Nuevo Andén
1. Hacer clic en "Nuevo Andén".
2. Completar el formulario:
   - Nombre (obligatorio).
   - Referencia (opcional).
   - Almacén al que pertenece.
   - Categoría.
   - Estado.
   - Color de cabecera (opcional).
3. Guardar.

#### Editar un Andén
Hacer clic en el ícono de lápiz para modificar cualquier campo del andén.

#### Activar / Desactivar
Botón de toggle para cambiar el estado activo/inactivo. Un andén inactivo no aparece en el calendario ni puede recibir reservas.

### Categorías de Andenes
Las categorías se gestionan dentro del modal de creación/edición de andenes. Definen el color de fondo de las cabeceras en el calendario y agrupan andenes por tipo.

### Estados de Andenes
Definen si el andén está operativo y si bloquea nuevas reservas. Estados típicos:
- Operativo: Disponible para reservas.
- En mantenimiento: No disponible temporalmente.
- Fuera de servicio: Inactivo por período prolongado.

---

## 5. Listado de Reservas

### Acceso
Página accesible desde el menú lateral en "Reservas". Muestra todas las reservas (incluyendo canceladas) en formato de tabla con filtros avanzados.

### Funcionalidades

- **Búsqueda**: Por DUA, factura, matrícula, nombre de chofer, o ID de reserva.
- **Filtros**: Por almacén, andén, estado, rango de fechas, proveedor y cliente.
- **Columnas**: ID, fecha, horario, andén, proveedor, chofer, matrícula, DUA, estado, tipo de operación.
- **Acciones**: Ver detalle, editar, cambiar estado, cancelar.
- **Exportación**: Posibilidad de exportar datos a Excel (según configuración).

---

## 6. Punto Control IN/OUT (Casetilla)

### Acceso y Propósito

El módulo de Punto Control IN/OUT es la interfaz para el personal de casetilla en la entrada física del almacén. Permite registrar el ingreso y salida de vehículos, verificar reservas, y gestionar el flujo de camiones en tiempo real. Se accede desde el menú lateral en "Punto Control IN/OUT".

### Permisos Requeridos

- `casetilla.view`: Ver el módulo.
- `casetilla.create` o `casetilla.manage`: Registrar ingresos y salidas.
- `casetilla.no_show.view`: Ver la lista de "No arribó".
- `casetilla.provider_distribution.view`: Ver reporte de distribución por proveedor.

### Selector de Fecha y Almacén

- **Fecha**: Selector de fecha para consultar reservas de un día específico (por defecto hoy).
- **Cliente**: Filtro opcional por cliente para segregar la vista.
- **Almacén**: Selector de almacén (si el usuario tiene acceso a múltiples).

### Pantalla Principal (HOME)

La pantalla principal muestra tarjetas de acceso rápido:

1. **Leer QR Inteligente**: Escanea un código QR y detecta automáticamente si el vehículo debe registrar ingreso o salida.
2. **Reservas Pendientes**: Lista de reservas del día que aún no han registrado ingreso.
3. **Registrar Salida**: Lista de vehículos que ya ingresaron y están pendientes de salida.
4. **No Arribó**: Reservas que superaron el tiempo de tolerancia sin registrar ingreso (solo usuarios con permiso).
5. **Reportes y Análisis**: Acceso a reportes de duración en punto de control y distribución por proveedor.

### Registro de Ingreso

#### Desde la Lista de Pendientes
1. Navegar a "Reservas Pendientes".
2. Localizar la reserva en la lista (se puede buscar por DUA, matrícula, chofer o proveedor).
3. Hacer clic en "Registrar Ingreso".
4. Se abre el formulario de ingreso con datos pre-llenados de la reserva.
5. Verificar o completar:
   - Chofer.
   - Matrícula.
   - DUA (si es importado).
   - Factura.
   - Cédula del chofer.
   - Orden de compra.
   - Número de pedido.
   - Observaciones.
   - Fotos del vehículo (opcional, máximo 4).
6. Hacer clic en "Registrar Ingreso".
7. El sistema:
   - Cambia el estado de la reserva a "Arribó (pendiente descarga)".
   - Sincroniza los datos del ingreso con la reserva (matrícula, chofer, DUA, etc.).
   - Crea el registro en casetilla_ingresos.
   - Dispara los correos electrónicos configurados para el cambio de estado.
   - Las fotos quedan almacenadas en Supabase Storage.

#### Desde QR Inteligente
1. En la pantalla principal, clic en "Escanear QR".
2. Se abre la cámara para escanear el código QR de la reserva.
3. El sistema detecta automáticamente el estado de la reserva:
   - Si no tiene ingreso ni salida → Abre el formulario de ingreso.
   - Si tiene ingreso sin salida → Abre el formulario de salida.
   - Si ya completó salida → Muestra mensaje informativo.
   - Si está cancelada → Muestra error.
   - Si está marcada como "No arribó" → Muestra error.
   - Si venció por tolerancia → Muestra error.

### Registro de Salida

#### Desde la Lista de Salidas
1. Navegar a "Registrar Salida".
2. Localizar la reserva con ingreso registrado.
3. Hacer clic en "Registrar Salida".
4. Se abre el formulario de salida mostrando:
   - Datos del vehículo y chofer.
   - Fecha y hora de ingreso.
   - Tiempo transcurrido desde el ingreso.
5. Opcionalmente adjuntar fotos de salida.
6. Hacer clic en "Registrar Salida".
7. El sistema:
   - Cambia el estado de la reserva a "Despachada" (DISPATCHED).
   - Crea el registro en casetilla_salidas con fecha y hora de salida.
   - Dispara los correos electrónicos configurados para el cambio de estado.

#### Validaciones de Salida
- No se puede registrar salida si la reserva no tiene ingreso previo.
- No se puede registrar más de una salida para la misma reserva (restricción única).
- La salida registra automáticamente la fecha y hora actual como `exit_at`.

### Reservas No Arribó

Lista de reservas que fueron marcadas con estado "No Arribó" (NO_SHOW) por el sistema automático. Muestra:
- DUA, matrícula, chofer, proveedor.
- Hora programada de la cita.
- Motivo: "No asistió dentro del tiempo permitido".

### Actualización en Tiempo Real
El módulo de Punto Control escucha cambios en tiempo real (Realtime) en la tabla de reservas. Si el estado de una reserva cambia (por ejemplo, marcada como No Arribó por el proceso automático), la lista se actualiza automáticamente. Si el usuario está llenando un formulario, aparece un banner indicando que hay actualizaciones pendientes, que se aplicarán al volver a la vista de lista.

---

## 7. Reportes desde Punto de Control

### Acceso a Reportes
Los reportes se encuentran en la tarjeta "Reportes y Análisis" de la pantalla principal del Punto Control. Dependiendo de los permisos del usuario, verá diferentes opciones de reporte.

### 7.1 Reporte de Duración en Punto Control

#### ¿Qué muestra?
El tiempo que cada vehículo permaneció dentro del almacén, calculado como la diferencia entre la hora de ingreso (casetilla_ingresos.created_at) y la hora de salida (casetilla_salidas.exit_at).

#### Columnas del Reporte
- **Reserva ID**: Identificador de la reserva.
- **Chofer**: Nombre del chofer registrado.
- **Matrícula**: Placa del vehículo.
- **DUA**: Documento Único Aduanero (si aplica).
- **Proveedor**: Nombre del proveedor/transportista.
- **Ingreso**: Fecha y hora en que se registró el ingreso.
- **Salida**: Fecha y hora en que se registró la salida.
- **Duración Real**: Tiempo total de permanencia en formato HH:MM.
- **Duración Teórica**: Tiempo programado de la reserva (rango start_datetime - end_datetime).
- **Diferencia**: Comparación entre la duración real y la teórica (+N min si excedió, -N min si fue más rápido).
- **Fotos Ingreso**: Cantidad de fotos adjuntas al ingreso.
- **Fotos Salida**: Cantidad de fotos adjuntas a la salida.

#### Filtros Disponibles
- **Búsqueda**: Por chofer, matrícula o DUA.
- **Rango de fechas**: Desde y hasta para acotar el período de análisis.
- **Ordenamiento**: Por defecto, ordenado de mayor a menor duración.

#### ¿Cómo se calcula la duración?
- Solo se incluyen reservas que tengan TANTO ingreso como salida registrados.
- La duración real = fecha_hora_salida - fecha_hora_ingreso (en minutos).
- El tiempo se muestra en formato HH:MM (horas:minutos).

### 7.2 Reporte de Distribución por Proveedor

#### ¿Qué muestra?
Un análisis agregado por proveedor que compara los tiempos teóricos programados contra los tiempos reales de permanencia en el almacén. Disponible solo para usuarios con permiso `casetilla.provider_distribution.view`.

#### Columnas del Reporte
- **Proveedor**: Nombre del proveedor.
- **Código**: Código del proveedor (si está configurado).
- **Cliente**: Cliente asociado al proveedor.
- **Tipo**: Tipo de proveedor (ej: almacenaje, transporte).
- **Citas Programadas**: Total de reservas del proveedor en el período.
- **Citas con Ingreso**: Cuántas de esas reservas registraron ingreso.
- **Citas con Salida**: Cuántas completaron el ciclo ingreso + salida.
- **Pendientes de Salida**: Diferencia entre citas con ingreso y citas con salida.
- **Tiempo Teórico Total**: Suma de las duraciones programadas (HH:MM).
- **Tiempo Real Total**: Suma de las duraciones reales (HH:MM).
- **Diferencia**: Comparación entre tiempo real total y teórico total (+N min si excedió).
- **Promedio Teórico**: Duración promedio programada por cita (HH:MM).
- **Promedio Real**: Duración promedio real por cita (HH:MM).

#### ¿Cómo se calcula?
- Se toman todas las reservas del período seleccionado (según su start_datetime).
- Se agrupan por proveedor.
- Para cada proveedor, se calculan métricas agregadas.
- El tiempo teórico se obtiene del rango start_datetime - end_datetime de cada reserva.
- El tiempo real se obtiene de casetilla_ingresos.created_at a casetilla_salidas.exit_at.
- Solo las reservas con ingreso y salida completados contribuyen al tiempo real y los promedios reales.

#### Filtros
- **Selector de fecha**: Día específico a analizar (por defecto hoy).
- **Selector de almacén**: Filtra los datos por almacén.
- **Selector de cliente**: Filtra los datos por cliente específico.

### 7.3 ¿Cómo interpretar los reportes?

#### Indicadores de Eficiencia
- **Diferencia negativa** (-N min): La operación fue más rápida de lo programado (eficiencia positiva).
- **Diferencia positiva** (+N min): La operación tomó más tiempo del programado (posible cuello de botella).
- **Tiempo Real >> Tiempo Teórico**: Puede indicar congestión en el almacén, mala planificación de tiempos, o procesos ineficientes.
- **Muchas citas con ingreso pero pocas con salida**: Indica acumulación de vehículos dentro del almacén.

#### Acciones Recomendadas
- Si un proveedor consistentemente excede sus tiempos teóricos, revisar y ajustar su perfil de tiempo en Catálogos → Tiempos (Proveedor x Tipo de carga).
- Si el tiempo promedio real es consistentemente mayor al teórico en todos los proveedores, revisar la configuración de horarios y slots del almacén.
- Si hay muchas citas pendientes de salida, verificar que el personal de casetilla esté registrando las salidas correctamente.

---

## 8. Administración — Catálogos

### Acceso
Menú lateral → Administración → Catálogos. Requiere permisos de administración.

### Pestañas del Módulo

#### 8.1 Proveedores
Gestión de proveedores (transportistas, importadores, etc.).

**Funcionalidades**:
- **Listado**: Tabla con todos los proveedores, mostrando nombre, código, tipo (almacenaje/transporte), país, cliente asociado, y estado.
- **Búsqueda**: Por nombre o código.
- **Crear proveedor**: Modal con campos: nombre, código, tipo de proveedor, país, cliente, email, teléfono, dirección, notas.
- **Editar proveedor**: Modificar cualquier campo.
- **Activar/Desactivar**: Control de estado activo/inactivo.
- **Importar desde Excel**: Carga masiva de proveedores desde archivo Excel.
- **Sincronizar desde Excel**: Sincronización avanzada con mapeo de columnas, asignación de cliente por origen (ORIGEN), y preview antes de confirmar.

**Campos del Proveedor**:
- Nombre (obligatorio).
- Código de proveedor.
- Tipo (almacenaje/transporte).
- País.
- Cliente asociado.
- Email, teléfono, dirección, notas.

#### 8.2 Tipos de Carga
Clasificación de los tipos de mercancía transportada.

**Funcionalidades**:
- Listar, crear, editar y eliminar tipos de carga.
- **Campos**: Nombre, código, descripción, unidad de medida (bultos, contenedores, líneas, pallets, etc.), si es dinámico (permite al usuario ingresar cantidad), y color identificativo.
- Los tipos de carga dinámicos permiten al usuario especificar la cantidad exacta al crear una reserva.

#### 8.3 Tiempos (Proveedor x Tipo de Carga)
Configuración de la duración teórica de operación para cada combinación de proveedor y tipo de carga.

**Funcionalidades**:
- Tabla de perfiles de tiempo que muestra: proveedor, tipo de carga, duración en minutos, y almacén.
- Crear perfil: Seleccionar proveedor, tipo de carga, duración en minutos, y almacén (opcional).
- Editar y eliminar perfiles existentes.
- Importación masiva desde Excel.

**Uso en el sistema**:
Cuando un usuario crea una reserva y selecciona un proveedor y tipo de carga, el sistema busca el perfil de tiempo correspondiente para determinar la duración de la reserva. Si hay un perfil específico para el almacén, se usa ese; si no, se usa el perfil general.

#### 8.4 Orígenes de Proveedores
Mapeo entre orígenes de datos externos (ej: sistemas legacy, archivos Excel) y los clientes del sistema.

**Funcionalidades**:
- Tabla con código de origen, nombre, y cliente asociado.
- Crear nuevo origen: código, nombre descriptivo, y cliente vinculado.
- Editar o eliminar orígenes existentes.
- Este mapeo es usado por la sincronización desde Excel para asignar automáticamente el cliente correcto a cada proveedor según su ORIGEN.

#### 8.5 Asignaciones
Gestión de relaciones entre entidades del sistema:

- **Asignación de usuarios a clientes**: Controla qué usuarios pueden ver y gestionar qué clientes.
- **Asignación de usuarios a proveedores**: Controla qué usuarios pueden ver qué proveedores en el calendario.
- **Clusters de proveedores**: Agrupación de proveedores para asignación masiva a usuarios.
- **Copia de asignaciones**: Permite copiar las asignaciones de un usuario a otro.
- **Importación masiva**: Carga de asignaciones desde Excel.
- **Panel de usuarios**: Vista detallada de cada usuario con sus almacenes, países y clientes asignados.

---

## 9. Administración — Clientes

### Acceso
Menú lateral → Administración → Clientes. Requiere permiso `admin.clients.view`.

### Funcionalidades

#### Listado de Clientes
- Filtro por almacén.
- Búsqueda por nombre, RUT/identificación fiscal, o email.
- Cada tarjeta de cliente muestra: nombre, identificación legal, email, teléfono, estado (activo/inactivo) y fecha de creación.

#### Crear Cliente
Modal con campos: nombre, identificación legal (RUT, cédula jurídica, etc.), email, teléfono, dirección, notas. Se puede asignar a un almacén al momento de crear.

#### Editar Cliente
Modal de edición con los mismos campos de creación.

#### Desactivar Cliente
Confirmación antes de desactivar. Un cliente inactivo no aparece en los selectores de nuevos registros pero sus datos históricos se conservan.

#### Detalle de Cliente (Drawer)
Al hacer clic en "Ver detalle", se abre un panel lateral con:

- **Información general**: Nombre, identificación, email, teléfono, dirección, notas, estado activo.
- **Reglas operativas**: Configuración de reglas para el cliente (asignación de andenes, modo secuencial/intercalado).
- **Andenes asignados**: Lista de andenes donde el cliente puede operar.
- **Proveedores**: Lista de proveedores vinculados al cliente, con opción de marcar proveedor por defecto.
- **Reglas de Pickup**: Configuración avanzada de reglas de retiro (misma página de ClientPickupRules).

**Actualización en tiempo real**: Los cambios en el drawer (información, reglas, andenes, proveedores) se guardan inmediatamente y se reflejan en la lista de clientes.

### Reglas de Cliente

- **Modo de asignación de andenes**: Secuencial (los andenes se asignan en orden) o Intercalado (ODD_FIRST — se alternan entre pares e impares para distribuir la carga).
- **Andenes del cliente**: Lista de andenes permitidos para el cliente. Solo estos andenes aparecen como disponibles al crear reservas para este cliente.
- **Proveedores del cliente**: Lista de proveedores asociados al cliente.

---

## 10. Administración — Almacenes

### Acceso
Menú lateral → Administración → Almacenes. Requiere permisos de administración.

### Funcionalidades

#### Listado de Almacenes
Tabla que muestra: nombre, ubicación, país, timezone, horario hábil, intervalo de slots, y tolerancia de "No Arribó".

#### Crear / Editar Almacén
Modal con campos:

- **Nombre**: Identificador del almacén (ej: "Bodega Central", "Centro de Distribución Norte").
- **Ubicación**: Dirección física o descripción de la ubicación.
- **País**: País donde opera el almacén.
- **Timezone**: Zona horaria IANA (ej: "America/Costa_Rica", "America/Caracas", "America/Panama"). Crucial para el correcto funcionamiento del calendario y los reportes.
- **Horario hábil**: Hora de inicio (business_start_time) y hora de fin (business_end_time) en formato HH:MM:SS. Define el rango visible en el calendario.
- **Intervalo de slots**: Duración en minutos de cada casilla del calendario (15, 30 o 60 minutos).
- **Tolerancia No Arribó (minutos)**: Tiempo después de la hora programada en que una reserva se considera "No arribó". Si se deja en 0 o null, no se aplica tolerancia.

---

## 11. Administración — Correspondencia

### Acceso
Menú lateral → Administración → Correspondencia. Requiere permisos de administración.

### Funcionalidades

#### Pestañas del Módulo

##### Cuenta Gmail
Conexión y gestión de cuentas de Gmail para envío automatizado de correos.

- **Conectar cuenta**: Proceso OAuth 2.0 para autorizar una cuenta de Gmail.
- **Estado de conexión**: Indicador de si la cuenta está conectada y funcional.
- **Desconectar**: Revocar el acceso de la cuenta.

##### Servicio SMTP
Configuración de servidor SMTP como alternativa a Gmail.

- **Configuración**: Host, puerto, usuario, contraseña, usar TLS/SSL.
- **Probar conexión**: Enviar un correo de prueba.

##### Reglas de Correspondencia
Configuración de triggers automáticos de envío de correos basados en eventos del sistema.

**Tipos de eventos**:
- **Cambio de estado de reserva**: Cuando una reserva pasa de un estado a otro (ej: de "Pendiente" a "Confirmada").
- **Creación de reserva**: Cuando se crea una nueva reserva.
- **Ingreso registrado**: Cuando se registra un ingreso en casetilla.
- **Salida registrada**: Cuando se registra una salida en casetilla.

**Configuración de cada regla**:
- Estado origen (from_status).
- Estado destino (to_status).
- Destinatarios (to, cc, bcc).
- Asunto del correo (con variables dinámicas).
- Plantilla del cuerpo del correo (HTML, con variables dinámicas).
- Adjuntar ficha de cita (QR card).

**Variables dinámicas disponibles**:
- `{{reservation_id}}`: ID de la reserva.
- `{{provider_name}}`: Nombre del proveedor.
- `{{client_name}}`: Nombre del cliente.
- `{{dock_name}}`: Nombre del andén.
- `{{start_datetime}}`: Fecha y hora de inicio.
- `{{end_datetime}}`: Fecha y hora de fin.
- `{{driver}}`: Nombre del chofer.
- `{{truck_plate}}`: Matrícula del vehículo.
- `{{dua}}`: DUA.
- `{{status_name}}`: Nombre del nuevo estado.
- `{{warehouse_name}}`: Nombre del almacén.

##### Logs de Correo
Historial de todos los correos enviados, con:
- Fecha y hora de envío.
- Regla que disparó el correo.
- Destinatario.
- Asunto.
- Estado (enviado, error, rebotado).
- Detalles del error (si falló).

---

## 12. Administración — Usuarios

### Acceso
Menú lateral → Administración → Usuarios. Requiere permisos de administración.

### Funcionalidades

#### Listado de Usuarios
Tabla con todos los usuarios de la organización: nombre, email, rol, estado, fecha de creación.

#### Gestión de Usuarios (modal o drawer)
- **Invitación**: Invitar nuevos usuarios por email.
- **Asignación de rol**: Seleccionar el rol del usuario en la organización.
- **Asignación de almacenes**: Seleccionar a qué almacenes tiene acceso.
- **Asignación de países**: Restringir acceso por país.
- **Asignación de clientes**: Restringir acceso por cliente.
- **Asignación de proveedores**: Restringir acceso por proveedor.
- **Activación / Desactivación**: Control de acceso al sistema.

#### Segregación de Acceso
El sistema implementa un modelo de segregación por múltiples dimensiones:

- **Almacenes**: user_warehouse_access determina qué almacenes ve el usuario.
- **Países**: user_country_access filtra por ubicación geográfica.
- **Clientes**: user_clients determina qué clientes puede gestionar.
- **Proveedores**: user_providers determina qué proveedores ve en el calendario.
- **Clusters de proveedores**: Asignación masiva mediante grupos predefinidos.

---

## 13. Administración — Roles

### Acceso
Menú lateral → Administración → Roles. Solo ADMIN.

### Funcionalidades

- **Listado de roles**: Nombre, descripción, cantidad de usuarios asignados.
- **Crear rol**: Nombre, descripción, y selección de permisos.
- **Editar rol**: Modificar nombre, descripción y permisos.
- **Eliminar rol**: Solo si no tiene usuarios asignados.

### Roles Predefinidos del Sistema
- **ADMIN**: Acceso total al sistema.
- **Full Access**: Acceso a todos los módulos excepto configuraciones críticas.
- **Manager**: Gestión de almacenes, clientes, catálogos y reportes.
- **Operador**: Acceso operativo a calendario, casetilla y reservas.
- **Usuario Básico**: Acceso mínimo personalizable.

---

## 14. Administración — Matriz de Permisos

### Acceso
Menú lateral → Administración → Matriz de Permisos. Solo ADMIN.

### Funcionalidades

Vista matricial (tabla de doble entrada) donde:
- **Filas**: Módulos y permisos específicos.
- **Columnas**: Roles del sistema.
- **Celdas**: Checkbox que indica si el rol tiene ese permiso.

**Módulos de permisos**:
- `dashboard`: Acceso al dashboard.
- `calendar`: Ver y gestionar calendario.
- `reservations`: Crear, editar, cancelar, mover reservas.
- `docks`: Ver y gestionar andenes.
- `dock_blocks`: Crear, editar, eliminar bloqueos de horario.
- `casetilla`: Ver y gestionar punto de control.
- `manpower`: Ver y gestionar colaboradores.
- `admin.*`: Permisos de administración (clientes, catálogos, almacenes, correspondencia, usuarios, roles).
- `chat.*`: Acceso al chat y asistente IA.
- `knowledge.*`: Gestión de base de conocimiento.

**Cambios en tiempo real**: Al marcar o desmarcar un permiso, se actualiza inmediatamente en la base de datos.

---

## 15. Manpower — Control de Personal

### Acceso
Menú lateral → Manpower. Requiere permiso `manpower.view` o `manpower.manage`.

### Funcionalidades

#### Listado de Colaboradores
Tabla con todos los colaboradores: nombre completo, ficha, cédula, país, almacenes asignados, tipo de trabajo, y estado.

#### Filtros
- **Ver Todo**: Muestra todos los colaboradores sin filtro de ubicación.
- **País**: Filtra colaboradores por país de asignación.
- **Almacén**: Filtra por almacén asignado (depende del país seleccionado).
- **Búsqueda**: Por nombre, ficha o cédula.

#### Crear Colaborador
Modal con campos:
- Nombre completo (obligatorio).
- Ficha (número de identificación interna).
- Cédula (documento de identidad).
- País de asignación.
- Almacenes (múltiples).
- Tipo de trabajo (work_type).
- Estado activo/inactivo.

#### Editar Colaborador
Modal de edición con los mismos campos.

#### Eliminar Colaborador
Confirmación antes de eliminar definitivamente.

#### Control de Personal (Manpower Control)
Modal adicional (botón "Control" en la cabecera) que muestra análisis y estadísticas de la fuerza laboral.

### Tipos de Trabajo
Clasificación de roles del personal: montacarguista, supervisor, operario, administrativo, etc. Se gestionan en la misma interfaz de colaboradores.

---

## 16. Base de Conocimiento

### Acceso
Menú lateral → Base de Conocimiento. Requiere permisos `knowledge.view`.

### Propósito
Repositorio de documentos PDF que alimentan al asistente IA (SRObot). Los documentos se procesan, se indexan en un vector store de OpenAI, y el chatbot puede buscar información en ellos para responder preguntas.

### Funcionalidades

#### Listado de Documentos
- Grid de tarjetas, cada una mostrando: título, descripción, nombre del archivo, etiquetas (tags), nivel de acceso, estado (borrador, procesando, activo, error, archivado), fecha de subida.
- **Filtros**: Por estado (todos, activos, borrador, procesando, error, archivados).
- **Búsqueda**: Por título, descripción o nombre de archivo.

#### Subir Documento
1. Hacer clic en "Subir PDF".
2. Seleccionar el archivo PDF.
3. Completar:
   - **Título**: Nombre descriptivo del documento.
   - **Descripción**: Resumen del contenido (opcional).
   - **Nivel de acceso**: basic, extended, o internal (determina qué permisos de chat pueden acceder).
   - **Modo de visibilidad**: public (todos), role_based (solo roles específicos), permission_based (solo permisos específicos), mixed.
   - **Etiquetas**: Palabras clave para categorizar (opcional).
   - **Roles**: Si la visibilidad es role_based, seleccionar qué roles pueden acceder.
   - **Permisos**: Si la visibilidad es permission_based, seleccionar qué permisos pueden acceder.
4. El documento se sube a Supabase Storage y se crea el registro en estado "draft".
5. Hacer clic en "Procesar" para enviarlo al pipeline de IA.

#### Pipeline de Procesamiento
1. El documento PDF se extrae y se divide en chunks de texto.
2. Se envía a OpenAI para generar embeddings vectoriales.
3. Los embeddings se almacenan en un vector store de OpenAI.
4. El estado del documento cambia a "processing" y luego a "active".
5. Una vez activo, el asistente IA puede buscar en él para responder preguntas.

#### Acciones por Documento
- **Editar**: Cambiar título, descripción, nivel de acceso, visibilidad, etiquetas, roles y permisos.
- **Procesar**: Iniciar o reintentar el procesamiento del documento.
- **Re-indexar**: Volver a generar embeddings (útil si se actualizó el contenido).
- **Archivar**: Desactivar el documento sin eliminarlo.

### Niveles de Acceso
- **basic** (nivel 1): Accesible para usuarios con permiso `chat.answers.basic`.
- **extended** (nivel 2): Accesible para usuarios con permiso `chat.answers.extended`.
- **internal** (nivel 3): Accesible para usuarios con permiso `chat.answers.internal`.

El asistente IA evalúa el nivel máximo de acceso del usuario y solo utiliza documentos cuyo nivel sea igual o inferior.

---

## 17. Chat y Asistente IA (SRObot)

### Acceso
- **Página de Chat**: Menú lateral → Chat. Interfaz completa de chat con barra lateral de sesiones.
- **Widget flotante**: Burbuja de chat en la esquina inferior derecha, disponible en todas las páginas.

### Funcionalidades

#### Widget Flotante (SRObot)
- **Burbuja de chat**: Ícono flotante siempre visible.
- **Panel de chat**: Se expande al hacer clic, mostrando:
  - Cabecera con nombre del asistente y botón de minimizar/cerrar.
  - Lista de mensajes (historial de la conversación actual).
  - Campo de entrada de texto.
- **Nueva conversación**: Botón para iniciar una sesión limpia.
- **Sugerencias**: Al responder, el asistente sugiere preguntas de seguimiento.

#### Página de Chat Completa
- **Barra lateral**: Lista de sesiones de chat previas, con posibilidad de crear nueva sesión, renombrar, o archivar.
- **Ventana de chat**: Área principal con el historial de mensajes de la sesión activa.
- **Mensajes**: Burbujas de chat diferenciadas (usuario en verde/teal, asistente en gris claro).
- **Adjuntos y citas**: Si el asistente usa documentos de la base de conocimiento, muestra citas con el nombre del documento fuente.

#### Auditoría de Chat
Página accesible en `/chat/auditoria` para administradores, mostrando logs de todas las interacciones: usuario, sesión, pregunta, respuesta, documentos citados, tokens utilizados, fecha y hora.

### Permisos del Chat
- `chat.ask`: Permiso básico para usar el asistente.
- `chat.answers.basic`: Acceso a documentos nivel basic.
- `chat.answers.extended`: Acceso a documentos nivel extended.
- `chat.answers.internal`: Acceso a documentos nivel internal.
- `chat.audit.view`: Ver logs de auditoría de chat.

---

## 18. Perfil de Usuario

### Acceso
Menú lateral → Mi Perfil (o haciendo clic en el avatar).

### Funcionalidades

- **Información personal**: Nombre, email, avatar.
- **Cambiar contraseña**: Formulario para actualizar la contraseña.
- **Preferencias**: Configuración de notificaciones, idioma, y tema (claro/oscuro).
- **Sesiones activas**: Ver y cerrar sesiones en otros dispositivos.

---

## 19. Correspondencia Automatizada

### Sistema de Correos

El sistema envía correos electrónicos automáticos en respuesta a eventos operativos. La configuración se realiza en Administración → Correspondencia.

### Eventos que Disparan Correos

1. **Creación de reserva**: Cuando se crea una nueva reserva, se dispara `onReservationCreated`. Se envía la ficha de cita (QR card) si está disponible.

2. **Cambio de estado de reserva**: Cuando una reserva cambia de estado (ej: Pendiente → Confirmada, o Arribó → Despachada), se dispara `onReservationStatusChanged`. El sistema busca reglas configuradas que coincidan con el estado origen y destino.

### Servicios de Correo Soportados

- **Gmail API**: Conexión OAuth 2.0. Los correos se envían desde la cuenta de Gmail autorizada. Gestionado por las Edge Functions `gmail-callback`, `gmail-connection-status`, y `gmail-send`.
- **SMTP**: Configuración manual de servidor SMTP. Gestionado por la Edge Function `smtp-send`.

### Procesamiento de Correspondencia
Las Edge Functions `correspondence-dispatch-event` y `correspondence-process-event` gestionan la cola de correos pendientes y el envío efectivo.

### Ficha de Cita (QR Card)
Al crear una reserva, el sistema genera automáticamente una imagen tipo tarjeta que incluye:
- Código QR único de la reserva.
- ID de la reserva.
- Nombre del proveedor.
- Fecha y hora de la cita.
- Tipo de operación.

Esta ficha se adjunta a los correos de confirmación y puede re-generarse desde el modal de edición de reserva.

---

## 20. Preguntas Frecuentes

### Sobre el Calendario

**P: ¿Por qué no veo andenes en el calendario?**
R: Posibles causas: (1) no has seleccionado un almacén, (2) el almacén seleccionado no tiene andenes asignados, (3) tus permisos no incluyen los clientes asociados a los andenes, o (4) los andenes están inactivos. Verificá en el selector de almacén y en la página de Andenes.

**P: ¿Cómo cambio la duración de una reserva?**
R: Solo se puede cambiar al editar la reserva, modificando la hora de fin. No es posible extender una reserva si hay conflicto con otra reserva o bloqueo en el mismo andén.

**P: ¿Qué significa que una reserva tenga borde ámbar?**
R: Significa que la reserva se extiende fuera del horario hábil del almacén. Esto puede pasar si el horario del almacén se modificó después de crear la reserva.

**P: ¿Por qué algunos slots aparecen en rojo en el modo selección?**
R: Los slots en rojo indican que NO están disponibles para el cliente/proveedor seleccionado, ya sea por reglas de asignación de andenes, conflicto con otra reserva, conflicto con un bloqueo, o por el corte del mismo día (same-day cutoff).

**P: ¿Puedo mover una reserva arrastrándola a otro andén?**
R: Sí, si tenés el permiso `reservations.move`. Solo podés moverla a slots donde no haya conflicto. El sistema valida automáticamente.

### Sobre el Punto de Control

**P: ¿Cómo registro el ingreso de un vehículo sin reserva?**
R: No es posible. Todo ingreso debe estar vinculado a una reserva existente. Si el vehículo no tiene reserva, debe crearse una desde el Calendario primero.

**P: ¿Qué pasa si un vehículo llega tarde?**
R: Si el almacén tiene configurada una tolerancia de "No Arribó" (no_show_tolerance_minutes), el sistema automáticamente marca la reserva como "No Arribó" una vez transcurrido ese tiempo sin ingreso. El proceso automático `auto-mark-no-show` se ejecuta periódicamente.

**P: ¿Se pueden adjuntar fotos al registrar ingreso o salida?**
R: Sí, el formulario de ingreso permite adjuntar hasta 4 fotos. Las fotos se almacenan en Supabase Storage y quedan vinculadas al registro de casetilla.

**P: ¿El código QR se puede usar múltiples veces?**
R: El QR es único por reserva. Al escanearlo, el sistema detecta automáticamente si el vehículo debe hacer ingreso o salida. Si ya completó salida, mostrará un mensaje indicándolo.

**P: ¿Por qué no aparece una reserva en la lista de pendientes?**
R: Posibles causas: (1) la reserva es de otro día (verificar la fecha seleccionada), (2) la reserva ya tiene ingreso registrado, (3) la reserva fue cancelada, (4) la reserva no está en un almacén al que tengas acceso, (5) la reserva ya superó la tolerancia de "No Arribó".

### Sobre Reportes

**P: ¿Cómo veo cuánto tiempo pasan los camiones en el almacén?**
R: Andá a Punto Control IN/OUT → tarjeta "Reportes y Análisis" → pestaña "Duración en Punto Control". Este reporte muestra el tiempo exacto entre ingreso y salida de cada vehículo, comparado con el tiempo programado.

**P: ¿Qué mide exactamente el reporte de duración?**
R: Mide la diferencia entre la fecha/hora de ingreso registrada en casetilla_ingresos y la fecha/hora de salida en casetilla_salidas. Solo incluye reservas que tengan AMBOS registros.

**P: ¿Puedo filtrar los reportes por proveedor?**
R: El reporte de "Distribución por Proveedor" agrupa automáticamente por proveedor. El reporte de "Duración" muestra filas individuales por reserva. Podés buscar por nombre de chofer, matrícula o DUA.

**P: ¿Los reportes incluyen datos históricos?**
R: Sí, los reportes toman los datos de la base de datos completa. Podés ajustar el rango de fechas para ver períodos anteriores.

### Sobre Administración

**P: ¿Cómo agrego un nuevo tipo de carga?**
R: Administración → Catálogos → pestaña "Tipos de carga" → botón "Nuevo tipo de carga". Completá nombre, código, descripción, unidad de medida, si es dinámico, y color.

**P: ¿Cómo configuro los tiempos de operación para un proveedor?**
R: Administración → Catálogos → pestaña "Tiempos (Proveedor x Tipo de carga)" → botón "Nuevo perfil". Seleccioná el proveedor, tipo de carga, duración en minutos, y almacén (opcional si aplica a todos).

**P: ¿Cómo asigno un cliente a un almacén?**
R: Al crear o editar un cliente, seleccioná el almacén en el campo correspondiente. También podés gestionar esto desde el drawer de detalle del cliente en la sección de andenes asignados.

**P: ¿Cómo agrego un nuevo usuario al sistema?**
R: Administración → Usuarios → Invitar usuario. Ingresá el email, seleccioná rol, almacenes, países, clientes y proveedores según corresponda. El usuario recibirá un email de invitación.

**P: ¿Cómo cambio los permisos de un rol?**
R: Administración → Matriz de Permisos. Usá los checkboxes en la intersección del módulo/permiso y el rol correspondiente. Los cambios se guardan automáticamente.

**P: ¿Qué significa "same-day cutoff"?**
R: Es una regla de cliente que impide crear reservas para el mismo día después de cierta hora. Por ejemplo, si el cutoff es a las 10:00 AM, después de esa hora no se pueden crear reservas para hoy para ese cliente. Se configura en las reglas del cliente.

### Sobre el Asistente IA

**P: ¿Cómo alimento al chatbot con información?**
R: Subí documentos PDF en la sección Base de Conocimiento. Una vez procesados e indexados, el asistente podrá buscar información en ellos para responder preguntas.

**P: ¿Qué tipo de documentos puede procesar el asistente?**
R: Actualmente solo documentos PDF. El sistema extrae el texto y lo indexa como embeddings vectoriales usando OpenAI.

**P: ¿Por qué el asistente dice que no encontró información?**
R: Posibles causas: (1) no hay documentos activos en la base de conocimiento, (2) los documentos existen pero tu nivel de acceso no te permite verlos, (3) la pregunta no tiene relación con el contenido de los documentos disponibles, (4) los documentos están en estado "draft" o "error" y no fueron procesados.

### Sobre Errores Comunes

**P: Error "No tenés permisos para acceder a esta página"**
R: Tu rol no tiene asignado el permiso necesario. Contactá a un administrador para que revise tus permisos en Administración → Roles o Matriz de Permisos.

**P: Error "No se pudo cargar el calendario"**
R: Generalmente es un error temporal de conexión con la base de datos. Intentá refrescar la página. Si persiste, verificá tu conexión a internet o contactá a soporte.

**P: Error al crear una reserva: "Ese andén ya está reservado en ese horario"**
R: Significa que hay un conflicto de horario. Elegí otro slot disponible (verde) u otro andén. Si creés que es un error, verificá que no haya un bloqueo de tiempo en ese andén.

**P: Error al importar Excel: "No se pudo asignar cliente"**
R: El ORIGEN del proveedor en el Excel no coincide con ningún código de origen registrado en Catálogos → Orígenes. Agregá el código faltante en esa sección.

---

## Flujos de Trabajo Comunes

### Flujo 1: Programar una Recepción de Mercancía

1. El cliente/envío solicita una cita.
2. El operador va al Calendario, selecciona el almacén correcto.
3. Hace clic en "Nueva Reserva".
4. Selecciona el tipo de carga, busca y selecciona el proveedor, y confirma.
5. El sistema muestra los slots disponibles en verde.
6. El operador selecciona un slot.
7. Completa los datos en el modal: matrícula, chofer, DUA (si es importado), factura, etc.
8. Guarda la reserva. El sistema genera QR y envía correo de confirmación.

### Flujo 2: Registrar Ingreso en Casetilla

1. El vehículo llega al punto de control.
2. El operador de casetilla va a Punto Control IN/OUT.
3. Opción A: Escanea el QR del vehículo → el sistema abre automáticamente el formulario de ingreso.
4. Opción B: Va a "Reservas Pendientes", busca la reserva por DUA o matrícula, y hace clic en "Registrar Ingreso".
5. Verifica los datos del vehículo y chofer.
6. Opcionalmente toma fotos del vehículo.
7. Hace clic en "Registrar Ingreso".
8. El sistema cambia el estado a "Arribó (pendiente descarga)" y dispara notificaciones.

### Flujo 3: Registrar Salida en Casetilla

1. El vehículo termina su operación y se presenta en el punto de control para salir.
2. El operador de casetilla va a Punto Control IN/OUT.
3. Opción A: Escanea el QR → el sistema detecta que tiene ingreso y abre formulario de salida.
4. Opción B: Va a "Registrar Salida", busca el vehículo y hace clic en "Registrar Salida".
5. Verifica los datos y opcionalmente toma fotos de salida.
6. Hace clic en "Registrar Salida".
7. El sistema cambia el estado a "Despachada" y registra la fecha/hora de salida.

### Flujo 4: Generar Reporte de Eficiencia

1. Ir a Punto Control IN/OUT.
2. Seleccionar la fecha deseada (o rango en reportes avanzados).
3. Clic en "Reportes y Análisis".
4. Seleccionar el tipo de reporte: "Duración en Punto Control" o "Distribución por Proveedor".
5. Analizar los tiempos reales vs teóricos.
6. Si un proveedor consistentemente excede sus tiempos, ir a Catálogos → Tiempos y ajustar el perfil.

### Flujo 5: Configurar un Nuevo Cliente

1. Ir a Administración → Clientes.
2. Hacer clic en "Nuevo Cliente".
3. Completar nombre, identificación legal, email, teléfono, dirección.
4. Seleccionar el almacén al que pertenece.
5. Guardar.
6. Hacer clic en "Ver detalle" del cliente recién creado.
7. En el drawer de detalle, asignar andenes (seleccionar de la lista de disponibles).
8. Asignar proveedores (vincular proveedores existentes al cliente).
9. Configurar reglas: modo de asignación de andenes (secuencial o intercalado).
10. Si aplica, configurar reglas de pickup y same-day cutoff.

---

## Glosario de Términos

- **Andén (Dock)**: Espacio físico de carga/descarga en un almacén.
- **BL (Bill of Lading)**: Conocimiento de embarque, documento de transporte marítimo.
- **Casetilla**: Punto de control físico en la entrada/salida del almacén.
- **Cliente (Client)**: Organización que utiliza los servicios del almacén.
- **Consolidado**: Reserva que agrupa múltiples proveedores en una sola cita.
- **DUA**: Documento Único Aduanero, requerido para importaciones.
- **Edge Function**: Función serverless de Supabase que ejecuta lógica de backend.
- **No Arribó (No Show)**: Reserva cuyo vehículo no se presentó dentro del tiempo de tolerancia.
- **Proveedor (Provider)**: Empresa transportista que entrega o retira mercancía.
- **QR**: Código de barras bidimensional único por reserva para identificación rápida.
- **RLS (Row Level Security)**: Seguridad a nivel de fila en la base de datos Supabase.
- **Same-day Cutoff**: Regla que impide crear reservas para el mismo día después de cierta hora.
- **Slot**: Intervalo de tiempo en la parrilla del calendario.
- **SRObot**: Nombre del asistente IA del sistema.
- **Timezone**: Zona horaria IANA del almacén, crítica para el cálculo correcto de horarios.
- **Vector Store**: Base de datos de embeddings de OpenAI donde se indexan los documentos de conocimiento.