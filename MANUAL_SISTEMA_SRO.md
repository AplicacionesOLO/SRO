# Manual Completo del Sistema SRO
### Sistema de Reservas OLO — Guía paso a paso para Administradores y usuarios Full Access

---

> **Para quién es este documento:**
> Este manual está pensado para Administradores y usuarios con acceso completo (Full Access).
> Contiene la descripción de TODOS los módulos, cómo configurarlos y cómo usarlos desde cero.
> Está escrito para ser entendido sin conocimientos técnicos previos.

---

## ÍNDICE

1. [Conceptos fundamentales del sistema](#1-conceptos-fundamentales-del-sistema)
2. [Primeros pasos: orden recomendado de configuración](#2-primeros-pasos-orden-recomendado-de-configuración)
3. [Módulo: Administración de Usuarios](#3-módulo-administración-de-usuarios)
4. [Módulo: Roles y Permisos](#4-módulo-roles-y-permisos)
5. [Módulo: Almacenes](#5-módulo-almacenes)
6. [Módulo: Catálogos](#6-módulo-catálogos)
7. [Módulo: Clientes](#7-módulo-clientes)
8. [Módulo: Andenes](#8-módulo-andenes)
9. [Módulo: Calendario y Reservas](#9-módulo-calendario-y-reservas)
10. [Módulo: Manpower (Control de Personal)](#10-módulo-manpower-control-de-personal)
11. [Módulo: Punto de Control IN/OUT (Casetilla)](#11-módulo-punto-de-control-inout-casetilla)
12. [Módulo: Reservas (Vista de listado)](#12-módulo-reservas-vista-de-listado)
13. [Módulo: Dashboard](#13-módulo-dashboard)
14. [Módulo: Correspondencia (Correo automático)](#14-módulo-correspondencia-correo-automático)
15. [Módulo: Base de Conocimiento (Documentos IA)](#15-módulo-base-de-conocimiento-documentos-ia)
16. [Módulo: Asistente SRO (Chat IA flotante)](#16-módulo-asistente-sro-chat-ia-flotante)
17. [Módulo: Auditoría del Chat](#17-módulo-auditoría-del-chat)
18. [Módulo: Mi Perfil](#18-módulo-mi-perfil)
19. [Flujos completos de uso diario](#19-flujos-completos-de-uso-diario)
20. [Preguntas frecuentes y solución de problemas](#20-preguntas-frecuentes-y-solución-de-problemas)

---

## 1. Conceptos fundamentales del sistema

### ¿Qué es SRO?
SRO (Sistema de Reservas OLO) es una plataforma web para gestionar la logística de entrada y salida de camiones, la asignación de andenes (docks), el control de personal (manpower) y el registro documental de toda la operación.

### Glosario básico

| Término | Significado |
|---|---|
| **Organización** | La empresa o unidad que usa el sistema. Cada usuario pertenece a una organización. |
| **Almacén** | Depósito o bodega donde ocurren las operaciones. Puede haber más de uno. |
| **Andén** | Puesto físico donde un camión se estaciona para cargar/descargar. |
| **Reserva** | El turno programado de un camión/proveedor en un andén. |
| **Rol** | Conjunto de permisos que define qué puede hacer un usuario. |
| **Permiso** | Autorización específica para ver, crear, editar o eliminar algo en el sistema. |
| **Proveedor** | Empresa o transportista que realiza la entrega o retiro. |
| **Cliente** | Empresa destinataria o remitente de la carga. |
| **Manpower** | Registro del personal (colaboradores) que trabaja en cada reserva. |
| **Casetilla** | Punto de control físico donde se registran los ingresos y egresos de camiones. |
| **Bloqueo** | Período en el calendario donde no se pueden hacer reservas (feriado, mantenimiento, etc.). |
| **Perfil de tiempo** | Configuración que define cuánto tiempo tarda cada operación según el tipo de carga. |

---

## 2. Primeros pasos: orden recomendado de configuración

> ⚠️ **Importante:** Antes de operar el sistema, seguí este orden. Si lo saltás, algunas funciones no estarán disponibles.

### Orden de configuración inicial

```
1. Configurar el Almacén
2. Crear Catálogos: Tipos de Carga → Proveedores → Perfiles de Tiempo
3. Crear Clientes y asignarles reglas de retiro
4. Crear Andenes y asignarlos al almacén
5. Crear Roles con sus permisos
6. Crear Usuarios y asignarles roles
7. Configurar Correspondencia (correo automático)
8. Subir documentos a la Base de Conocimiento (opcional)
```

---

## 3. Módulo: Administración de Usuarios

**Ruta en el menú:** Administración → Usuarios

### ¿Qué hace este módulo?
Permite crear, editar, activar y desactivar los usuarios que pueden iniciar sesión en el sistema.

### Cómo crear un usuario nuevo

**Paso 1:** Ir a Administración → Usuarios.

**Paso 2:** Hacer clic en el botón **"Nuevo usuario"** (esquina superior derecha).

**Paso 3:** Completar el formulario:
- **Nombre completo:** Nombre y apellido del usuario.
- **Correo electrónico:** El correo que usará para iniciar sesión. Debe ser válido.
- **Contraseña temporal:** Se le enviará al usuario para que pueda ingresar por primera vez.
- **Rol:** Seleccionar qué rol tendrá. (Ver sección 4 para entender los roles.)
- **Almacén:** Asignar a qué almacén tendrá acceso.

**Paso 4:** Hacer clic en **"Guardar"**. El usuario recibirá un correo de bienvenida (si la correspondencia está configurada).

### Cómo editar un usuario existente

**Paso 1:** Buscar el usuario en la lista usando el buscador o los filtros.

**Paso 2:** Hacer clic en el botón de editar (ícono de lápiz) en la fila del usuario.

**Paso 3:** Modificar los campos necesarios y guardar.

### Cómo desactivar un usuario

Un usuario desactivado no puede iniciar sesión, pero sus registros históricos se conservan.

**Paso 1:** Buscar el usuario en la lista.

**Paso 2:** Hacer clic en el menú de opciones (tres puntos) → **"Desactivar"**.

**Paso 3:** Confirmar la acción.

### Campos visibles en la lista de usuarios

| Campo | Descripción |
|---|---|
| Nombre | Nombre completo del usuario |
| Correo | Dirección de correo electrónico |
| Rol | Rol asignado en el sistema |
| Almacén | Almacén al que pertenece |
| Estado | Activo / Inactivo |
| Último acceso | Fecha y hora del último ingreso |

---

## 4. Módulo: Roles y Permisos

**Ruta en el menú:** Administración → Roles / Administración → Matriz de Permisos

### ¿Qué es un Rol?
Un rol es un conjunto de permisos agrupados bajo un nombre. En lugar de configurar permisos uno por uno para cada usuario, se asigna un rol con los permisos ya definidos.

### Roles predeterminados del sistema

| Rol | Descripción típica |
|---|---|
| **Full Access** | Acceso total a todos los módulos y configuraciones. |
| **Admin** | Administración completa menos configuraciones técnicas críticas. |
| **Supervisor** | Puede ver y gestionar reservas, andenes y manpower. No puede cambiar configuración. |
| **Operador** | Puede crear y gestionar reservas propias. Acceso limitado. |
| **Seguridad** | Solo accede al Punto de Control IN/OUT (Casetilla). |
| **Invitado** | Solo puede consultar. No puede crear ni modificar. |

> Estos son los roles base. El administrador puede crear roles personalizados.

### Cómo crear un Rol nuevo

**Ruta:** Administración → Roles → "Nuevo rol"

**Paso 1:** Ingresar el nombre del rol (ej: "Coordinador Logístico").

**Paso 2:** Ingresar una descripción opcional.

**Paso 3:** Guardar el rol.

**Paso 4:** Ir a **Administración → Matriz de Permisos** para asignar qué permisos tiene ese rol.

### Cómo funciona la Matriz de Permisos

La matriz muestra todos los permisos del sistema en filas, y todos los roles en columnas. Cada celda tiene un checkbox.

- **Checkbox marcado:** ese rol tiene ese permiso.
- **Checkbox desmarcado:** ese rol NO tiene ese permiso.

**Para asignar un permiso:**
1. Ir a Administración → Matriz de Permisos.
2. Encontrar el permiso en la lista (están agrupados por módulo).
3. Marcar el checkbox en la columna del rol al que querés dar ese permiso.
4. Los cambios se guardan automáticamente.

### Categorías de permisos importantes

| Prefijo del permiso | Módulo que controla |
|---|---|
| `menu.*` | Qué ítems del menú lateral puede ver |
| `reservas.*` | Crear, editar, cancelar reservas |
| `andenes.*` | Gestionar andenes |
| `manpower.*` | Registrar colaboradores y control de personal |
| `casetilla.*` | Registrar ingresos/egresos en casetilla |
| `admin.*` | Acceso a secciones de administración |
| `chat.*` | Uso del asistente IA y base de conocimiento |

---

## 5. Módulo: Almacenes

**Ruta en el menú:** Administración → Almacenes

### ¿Qué es un Almacén?
Es el depósito o instalación física donde operan los andenes y reservas. Puede haber uno o varios almacenes.

### Cómo crear un Almacén

**Paso 1:** Ir a Administración → Almacenes → "Nuevo almacén".

**Paso 2:** Completar:
- **Nombre:** Nombre identificatorio del almacén (ej: "Depósito Central", "Planta Norte").
- **Dirección:** Dirección física.
- **País:** País donde está ubicado.
- **Descripción:** Opcional, para notas internas.
- **Clientes asignados:** Qué clientes operan en este almacén.

**Paso 3:** Guardar. El almacén ya estará disponible para asignar usuarios y andenes.

### Cómo asignar usuarios a un Almacén

Un usuario solo puede operar dentro del almacén que tiene asignado.

**Paso 1:** Ir a Administración → Almacenes.
**Paso 2:** Abrir el almacén haciendo clic en él.
**Paso 3:** En la pestaña "Usuarios", agregar los usuarios correspondientes.

---

## 6. Módulo: Catálogos

**Ruta en el menú:** Administración → Catálogos

El módulo de Catálogos tiene tres secciones: **Tipos de Carga**, **Proveedores** y **Perfiles de Tiempo**.

---

### 6.1 Tipos de Carga

**¿Qué son?** Categorías que describen qué tipo de mercadería se mueve en una reserva.
Ejemplos: "Carga seca", "Refrigerado", "Peligroso", "Pallets", "Granel".

**Cómo crear un Tipo de Carga:**

**Paso 1:** Ir a Catálogos → pestaña "Tipos de Carga" → "Nuevo tipo".

**Paso 2:** Ingresar:
- **Nombre:** Nombre del tipo (ej: "Refrigerado").
- **Descripción:** Opcional.
- **Color:** Color identificatorio que aparecerá en el calendario.
- **Ícono:** Ícono visual representativo.

**Paso 3:** Guardar.

---

### 6.2 Proveedores

**¿Qué son?** Las empresas de transporte o proveedores que realizan las entregas.

**Cómo crear un Proveedor:**

**Paso 1:** Ir a Catálogos → pestaña "Proveedores" → "Nuevo proveedor".

**Paso 2:** Completar:
- **Nombre comercial:** Nombre de la empresa.
- **CUIT / RUT / Identificación fiscal:** Número de identificación.
- **Contacto:** Nombre de la persona de contacto.
- **Teléfono y correo:** Datos de contacto.
- **Tipos de carga que maneja:** Seleccionar qué tipos de carga puede transportar este proveedor.

**Paso 3:** Guardar. El proveedor ya estará disponible al crear reservas.

---

### 6.3 Perfiles de Tiempo

**¿Qué son?** Configuraciones que determinan cuánto tiempo ocupa una reserva según el proveedor y el tipo de carga. Esto permite que el calendario calcule automáticamente la duración de cada turno.

**Cómo crear un Perfil de Tiempo:**

**Paso 1:** Ir a Catálogos → pestaña "Perfiles de Tiempo" → "Nuevo perfil".

**Paso 2:** Completar:
- **Proveedor:** A qué proveedor aplica.
- **Tipo de carga:** Para qué tipo de carga aplica.
- **Duración en minutos:** Cuánto tiempo tarda esa combinación de proveedor + tipo de carga.

**Paso 3:** Guardar.

> **Ejemplo práctico:** El proveedor "Transportes López" con carga "Refrigerado" tarda 90 minutos. Si alguien crea una reserva con esa combinación, el sistema automáticamente reservará 90 minutos en el calendario.

---

## 7. Módulo: Clientes

**Ruta en el menú:** Administración → Clientes

### ¿Qué es un Cliente?
Es la empresa que recibe o despacha la carga. Los clientes se asocian a los andenes y almacenes donde operan.

### Cómo crear un Cliente

**Paso 1:** Ir a Administración → Clientes → "Nuevo cliente".

**Paso 2:** Completar:
- **Nombre:** Razón social del cliente.
- **CUIT/RUT:** Identificación fiscal.
- **Contacto principal:** Nombre, teléfono, correo.
- **Almacenes asignados:** En qué almacenes opera este cliente.
- **Proveedores habilitados:** Qué proveedores pueden traer carga para este cliente.
- **Andenes habilitados:** En qué andenes puede operar este cliente.

**Paso 3:** Guardar.

### Reglas de retiro de clientes (Client Pickup Rules)

Esta función avanzada permite controlar si un cliente puede retirar mercadería por su cuenta o si solo puede hacerlo a través de proveedores registrados.

**Cómo configurar:**
1. Abrir el cliente desde la lista.
2. Ir a la pestaña **"Reglas de retiro"**.
3. Activar o desactivar la regla según la política del cliente.
4. Guardar.

---

## 8. Módulo: Andenes

**Ruta en el menú:** Andenes

### ¿Qué es un Andén?
Es el espacio físico numerado donde un camión se estaciona para operar. Cada andén pertenece a un almacén.

### Cómo crear un Andén

**Paso 1:** Ir al módulo Andenes → "Nuevo andén".

**Paso 2:** Completar:
- **Número o nombre del andén:** Identificación única (ej: "Andén 1", "Dock A").
- **Almacén:** A qué almacén pertenece.
- **Descripción:** Notas opcionales sobre ese andén.
- **Tipos de carga habilitados:** Qué tipos de carga puede recibir.
- **Clientes habilitados:** Qué clientes pueden usar ese andén.
- **Estado:** Activo / Inactivo / En mantenimiento.

**Paso 3:** Guardar.

### Estados posibles de un Andén

| Estado | Descripción |
|---|---|
| **Activo** | Disponible para recibir reservas. |
| **Inactivo** | No disponible, no aparece en el calendario. |
| **En mantenimiento** | Bloqueado temporalmente. |

---

## 9. Módulo: Calendario y Reservas

**Ruta en el menú:** Calendario

### ¿Qué hace el Calendario?
Es el núcleo operativo del sistema. Muestra todos los andenes en forma de grilla de tiempo y permite ver, crear y gestionar reservas visualmente.

### Cómo leer el Calendario

- **Eje horizontal (columnas):** Tiempo del día, dividido en bloques según la configuración.
- **Eje vertical (filas):** Cada andén del almacén.
- **Bloques de color:** Cada reserva ocupa un bloque de color en la fila del andén asignado.
- **Bloques grises:** Bloqueos o períodos no disponibles.

### Cómo crear una Reserva desde el Calendario

**Paso 1:** Hacer clic en un espacio vacío de la grilla en el andén y horario deseado.

**Paso 2:** Se abre el formulario de reserva. Completar:
- **Proveedor:** Quién trae la carga.
- **Cliente:** Para quién es la carga.
- **Tipo de carga:** Qué tipo de mercadería es.
- **Andén:** Se pre-carga con el andén donde hiciste clic, pero podés cambiarlo.
- **Fecha y hora de inicio:** El turno programado.
- **Duración:** Se calcula automáticamente si hay un Perfil de Tiempo configurado.
- **Cantidad de bultos / pallets / kg:** Detalle de la carga.
- **Número de orden / remito:** Referencia documental.
- **Notas:** Cualquier indicación especial.
- **Fotos:** Se pueden adjuntar imágenes (documentos, precinto, etc.).

**Paso 3:** Hacer clic en **"Guardar reserva"**.

> **Borrador automático:** Si cerrás el formulario sin guardar, el sistema pregunta si querés conservar el borrador. La próxima vez que abras el formulario, podés retomarlo desde donde lo dejaste.

### Estados de una Reserva

| Estado | Color | Descripción |
|---|---|---|
| **Pendiente** | Naranja | La reserva está creada pero el camión aún no llegó. |
| **En proceso** | Azul | El camión ingresó y está operando. |
| **Completada** | Verde | La operación terminó correctamente. |
| **Cancelada** | Gris | La reserva fue anulada. |
| **No presentado** | Rojo | El camión no llegó en el horario reservado. |

### Cómo editar una Reserva

**Paso 1:** Hacer clic en el bloque de la reserva en el calendario.

**Paso 2:** En el modal que se abre, hacer clic en **"Editar"**.

**Paso 3:** Modificar los campos necesarios.

**Paso 4:** Guardar.

### Cómo cancelar una Reserva

**Paso 1:** Abrir la reserva desde el calendario.

**Paso 2:** Hacer clic en **"Cancelar reserva"**.

**Paso 3:** Ingresar el motivo de cancelación (requerido).

**Paso 4:** Confirmar.

### Cómo crear un Bloqueo en el Calendario

Los bloqueos impiden que se creen reservas en un período específico. Se usan para feriados, mantenimiento, limpieza, etc.

**Paso 1:** Ir al Calendario → pestaña **"Bloqueos"** (o hacer clic derecho en la grilla → "Crear bloqueo").

**Paso 2:** Completar:
- **Título del bloqueo:** Ej: "Feriado nacional", "Mantenimiento andén 3".
- **Fecha y hora de inicio y fin.**
- **Andenes afectados:** Podés bloquear uno, varios o todos los andenes.
- **¿Es permanente?:** Si aplica todos los días (ej: cierre de planta los domingos).
- **Recurrencia:** Si se repite semanalmente, mensualmente, etc.

**Paso 3:** Guardar.

### Vista del Calendario

| Botón en el calendario | Acción |
|---|---|
| **Hoy** | Vuelve a la fecha actual. |
| **← →** | Navega entre días. |
| **Día / Semana** | Cambia la escala de visualización. |
| **Filtro de andenes** | Muestra/oculta andenes específicos. |
| **Filtro de estado** | Muestra solo reservas en cierto estado. |

---

## 10. Módulo: Manpower (Control de Personal)

**Ruta en el menú:** Manpower

### ¿Qué hace este módulo?
Permite registrar qué colaboradores (personal) trabajaron en cada reserva, con sus horarios y rol dentro de la operación.

### Configuración previa: Colaboradores

Antes de asignar personal a una reserva, los colaboradores deben estar registrados en el sistema.

**Cómo registrar un Colaborador:**

**Paso 1:** Ir a Manpower → "Nuevo colaborador".

**Paso 2:** Completar:
- **Nombre completo.**
- **Documento de identidad.**
- **Rol o función:** Ej: Operario, Montacarguista, Supervisor.
- **Almacén donde trabaja.**

**Paso 3:** Guardar.

### Cómo registrar el control de Manpower en una Reserva

**Paso 1:** Ir a Manpower → "Nuevo registro" o hacerlo desde dentro de la reserva.

**Paso 2:** Seleccionar la **reserva** a la que aplica.

**Paso 3:** Agregar los colaboradores que participaron:
- Nombre del colaborador.
- Hora de ingreso al trabajo.
- Hora de egreso.
- Observaciones.

**Paso 4:** Guardar.

### Para qué sirve el registro de Manpower

- Auditoría de horas trabajadas.
- Control de presencia.
- Base para liquidación de haberes.
- Trazabilidad de quién operó en cada reserva.

---

## 11. Módulo: Punto de Control IN/OUT (Casetilla)

**Ruta en el menú:** Punto Control IN/OUT

### ¿Qué hace este módulo?
Es el registro físico de entrada y salida de camiones. El operador de la garita (casetilla) usa esta pantalla para confirmar el ingreso y egreso real de cada vehículo.

### Cómo registrar un Ingreso (IN)

**Paso 1:** El camión llega a la planta. El operador abre el módulo **Punto Control IN/OUT**.

**Paso 2:** En la sección **"Ingresos pendientes"**, buscar la reserva del camión por:
- Número de reserva.
- Proveedor.
- Patente del vehículo.

**Paso 3:** Hacer clic en la reserva correspondiente → **"Registrar ingreso"**.

**Paso 4:** Completar:
- **Patente del camión/acoplado.**
- **Nombre del chofer.**
- **Número de precinto** (si aplica).
- **Fotos** (opcional, se puede fotografiar la documentación).
- **Hora de ingreso** (se completa automáticamente con la hora actual, pero puede ajustarse).

**Paso 5:** Confirmar.

### Cómo registrar un Egreso (OUT)

**Paso 1:** El camión terminó su operación y va a salir.

**Paso 2:** En la sección **"Egresos pendientes"**, buscar la reserva activa.

**Paso 3:** Hacer clic en **"Registrar egreso"**.

**Paso 4:** Completar:
- **Hora de egreso** (automática, ajustable).
- **Observaciones** de salida.
- **Fotos adicionales** si corresponde.

**Paso 5:** Confirmar. La reserva pasa al estado **"Completada"**.

### Reportes de la Casetilla

El módulo también muestra reportes de duración promedio de estadía por proveedor, cliente o rango de fechas. Útil para identificar cuellos de botella.

---

## 12. Módulo: Reservas (Vista de listado)

**Ruta en el menú:** Reservas

### ¿Para qué sirve?
Es una vista en formato de tabla/listado de todas las reservas, a diferencia del Calendario que es visual. Permite búsquedas avanzadas y exportación.

### Filtros disponibles

| Filtro | Descripción |
|---|---|
| **Fecha desde / hasta** | Rango de fechas de las reservas. |
| **Estado** | Filtrar por pendiente, completada, cancelada, etc. |
| **Proveedor** | Mostrar solo las reservas de un proveedor específico. |
| **Cliente** | Mostrar solo las reservas de un cliente específico. |
| **Andén** | Filtrar por andén. |
| **Almacén** | Si hay múltiples almacenes. |

### Acciones disponibles desde el listado

- Ver detalle completo de una reserva.
- Editar una reserva.
- Cambiar el estado manualmente.
- Ver el historial de cambios de la reserva.
- Exportar el listado a Excel/CSV (si está habilitado).

---

## 13. Módulo: Dashboard

**Ruta en el menú:** Dashboard

### ¿Qué muestra?
El Dashboard es la pantalla de resumen con métricas clave de la operación en tiempo real.

### Indicadores principales

| Indicador | Descripción |
|---|---|
| **Reservas de hoy** | Total de reservas programadas para el día actual. |
| **En proceso ahora** | Reservas activas en este momento. |
| **Completadas hoy** | Cuántas terminaron exitosamente. |
| **Canceladas** | Cuántas fueron canceladas en el período. |
| **Ocupación de andenes** | Porcentaje de uso de cada andén. |
| **Tiempo promedio de estadía** | Promedio de tiempo que pasan los camiones en planta. |
| **Actividad reciente** | Log de las últimas acciones del sistema. |

### Cómo interpretar el Dashboard

- Si la **ocupación de andenes** está al 100% en ciertos horarios, considerá abrir más andenes o redistribuir los turnos.
- Si el **tiempo promedio de estadía** supera la duración reservada, hay un cuello de botella operativo.
- El **log de actividad** muestra quién hizo qué y cuándo, útil para auditoría rápida.

---

## 14. Módulo: Correspondencia (Correo automático)

**Ruta en el menú:** Administración → Correspondencia

### ¿Qué hace este módulo?
Permite configurar el envío automático de correos electrónicos cuando ocurren ciertos eventos en el sistema (nueva reserva, cancelación, recordatorio, etc.).

### Opciones de configuración de correo

El sistema soporta **dos métodos** para enviar correos:

**Opción A — Gmail (OAuth):**
- Conecta una cuenta de Gmail mediante autenticación segura.
- Sin necesidad de contraseñas.
- Recomendado para organizaciones que ya usan Google Workspace.

**Opción B — SMTP personalizado:**
- Conecta cualquier servidor de correo (Outlook, servidor propio, etc.).
- Requiere los datos SMTP: host, puerto, usuario, contraseña.

### Cómo configurar Gmail

**Paso 1:** Ir a Administración → Correspondencia → pestaña **"Cuenta Gmail"**.

**Paso 2:** Hacer clic en **"Conectar con Gmail"**.

**Paso 3:** El sistema abre una ventana de autenticación de Google. Iniciar sesión con la cuenta de Gmail que enviará los correos.

**Paso 4:** Aceptar los permisos solicitados.

**Paso 5:** El estado cambia a **"Conectado"** y muestra la cuenta vinculada.

### Cómo configurar reglas de correo automático

**Paso 1:** Ir a Administración → Correspondencia → pestaña **"Reglas"** → "Nueva regla".

**Paso 2:** Configurar:
- **Evento disparador:** Qué acción activa el envío (ej: "Nueva reserva creada", "Reserva cancelada", "Cambio de estado").
- **Destinatarios:** A quién se envía (proveedor, cliente, usuario interno, email fijo).
- **Plantilla del correo:** Asunto y cuerpo del mensaje. Se pueden usar variables como `{{nombre_proveedor}}`, `{{fecha_reserva}}`, `{{numero_reserva}}`.

**Paso 3:** Activar la regla y guardar.

### Cómo ver los logs de correos enviados

Ir a Administración → Correspondencia → pestaña **"Logs"**.

Muestra cada correo enviado con:
- Fecha y hora de envío.
- Destinatario.
- Asunto.
- Estado: Enviado / Fallido.
- Motivo del fallo (si aplica).

---

## 15. Módulo: Base de Conocimiento (Documentos IA)

**Ruta en el menú:** Administración → Base de Conocimiento

> **Requiere permiso:** `chat.documents.manage`
> **Disponible para:** Full Access y Admin (por defecto)

### ¿Qué es la Base de Conocimiento?
Es la biblioteca de documentos PDF que alimenta al Asistente IA (chatbot). Cualquier pregunta que haga un usuario al chat se responde basándose en estos documentos.

### Tipos de documentos recomendados

- Manuales de procedimientos internos.
- Reglamentos de operación.
- Políticas de la empresa.
- Instrucciones de uso del SRO.
- Normativas de seguridad.

### Niveles de acceso de documentos

| Nivel | Descripción |
|---|---|
| **basic** | Información general, visible para todos los roles con `chat.ask`. |
| **extended** | Información detallada, visible para usuarios con permiso `chat.answers.extended`. |
| **internal** | Información confidencial, solo visible con permiso `chat.answers.internal`. |

### Cómo subir un documento PDF

**Paso 1:** Ir a Administración → Base de Conocimiento → **"Subir documento"**.

**Paso 2:** Completar el formulario:
- **Título:** Nombre descriptivo del documento (ej: "Manual de Procedimientos de Reservas").
- **Descripción:** Resumen del contenido.
- **Archivo PDF:** Seleccionar el archivo desde tu computadora.
- **Nivel de acceso:** basic / extended / internal.
- **Roles permitidos:** Qué roles pueden ver las respuestas basadas en este documento.
- **Tags (etiquetas):** Palabras clave para organizar (ej: "procedimientos", "seguridad").

**Paso 3:** Hacer clic en **"Subir"**.

### Estados del documento

| Estado | Descripción |
|---|---|
| **draft** | Cargado pero aún no procesado. |
| **processing** | El sistema está indexando el documento (puede tardar 1-2 minutos). |
| **active** | Listo. El asistente ya puede responder con base en este documento. |
| **failed** | Hubo un error en el procesamiento. Intentar nuevamente. |
| **archived** | Desactivado temporalmente, no lo usa el chat. |

### Cómo editar un documento

**Paso 1:** Hacer clic en el documento de la lista.

**Paso 2:** Modificar título, descripción, tags, nivel de acceso o roles.

**Paso 3:** Guardar.

> **Nota:** Si el documento está en estado `active` y se cambia el archivo PDF, se debe **reindexar** para que el chat use la versión actualizada.

### Cómo reindexar un documento

Si el PDF fue actualizado o el procesamiento falló, se puede forzar un nuevo procesamiento:

**Paso 1:** Abrir el documento.

**Paso 2:** Hacer clic en **"Reindexar"**.

**Paso 3:** Esperar a que el estado vuelva a `active`.

---

## 16. Módulo: Asistente SRO (Chat IA flotante)

**Acceso:** Botón circular con ícono de robot, fijo en la esquina inferior derecha de CUALQUIER pantalla.

> **Requiere permiso:** `chat.view` o `chat.ask`

### ¿Qué es el Asistente SRO?
Es un chatbot inteligente que responde preguntas sobre los documentos cargados en la Base de Conocimiento. **Solo responde con información de documentos autorizados para tu perfil.** No ejecuta acciones en el sistema ni modifica reservas.

### Cómo usar el Asistente SRO

**Paso 1:** Hacer clic en el botón circular con el ícono de robot (esquina inferior derecha).

**Paso 2:** Se abre un panel flotante. El contenido del SRO que estabas viendo sigue visible detrás.

**Paso 3:** Escribir la pregunta en el campo de texto y presionar **Enter** o el botón de enviar.

**Paso 4:** El asistente responde en segundos. Si la respuesta viene de un documento específico, se muestran las **fuentes** debajo de la respuesta.

**Paso 5:** Para cerrar, hacer clic en la **X** del panel o presionar **Escape**.

### Cómo iniciar una nueva conversación

Hacer clic en el botón **"+"** (nuevo) en el encabezado del panel. La conversación anterior se guarda en el historial.

### Ejemplos de preguntas que puede responder

- "¿Cuáles son los pasos para crear una reserva?"
- "¿Qué documentación debe presentar el chofer al ingresar?"
- "¿Cómo se clasifica la carga peligrosa según nuestros procedimientos?"
- "¿Cuál es el protocolo si un camión llega tarde?"

### Lo que el Asistente NO puede hacer

- Crear, editar o cancelar reservas.
- Modificar datos de usuarios, clientes o proveedores.
- Acceder a información de otras organizaciones.
- Revelar contenido de documentos para los que no tenés permiso.

### Comportamiento cuando no tiene información

Si el asistente no encuentra la respuesta en los documentos disponibles para tu perfil, responde:
> *"No encontré información sobre ese tema en la base de conocimiento autorizada para tu perfil."*

Esto NO significa que la información no exista, sino que puede estar en un documento de nivel superior.

---

## 17. Módulo: Auditoría del Chat

**Ruta en el menú:** Administración → Auditoría Chat

> **Requiere permiso:** `chat.audit.view`
> **Disponible para:** Full Access y Admin (por defecto)

### ¿Qué muestra?
El historial completo de todas las preguntas realizadas al Asistente SRO en la organización. Es una herramienta de supervisión y seguridad.

### Información visible por pregunta

| Campo | Descripción |
|---|---|
| **Usuario** | Quién hizo la pregunta. |
| **Fecha y hora** | Cuándo se realizó. |
| **Sesión** | A qué conversación pertenece. |
| **Pregunta** | El texto exacto de la pregunta. |
| **Documentos usados** | Qué documentos se consultaron para responder. |
| **Estado** | success (respondida) / denied (sin permiso) / error (falla técnica). |

### Filtros disponibles

- Por usuario.
- Por rango de fechas.
- Por estado de la respuesta.
- Por documento utilizado.

### Para qué sirve la auditoría

- Verificar que el asistente está respondiendo correctamente.
- Detectar intentos de acceso a información no autorizada.
- Entender qué preguntas hacen los usuarios con más frecuencia (útil para mejorar los documentos).
- Cumplimiento normativo y trazabilidad de consultas.

---

## 18. Módulo: Mi Perfil

**Acceso:** Hacer clic en tu nombre/avatar en la parte inferior del menú lateral.

### ¿Qué podés hacer?

- Ver tu información personal registrada.
- Cambiar tu contraseña.
- Ver tu rol y permisos asignados.
- Ver a qué almacén(es) tenés acceso.
- Ver el historial de tu actividad reciente en el sistema.

### Cómo cambiar tu contraseña

**Paso 1:** Ir a Mi Perfil.

**Paso 2:** Hacer clic en **"Cambiar contraseña"**.

**Paso 3:** Ingresar la contraseña actual y la nueva contraseña dos veces.

**Paso 4:** Guardar.

> Si olvidaste tu contraseña, en la pantalla de inicio de sesión hay un enlace de **"¿Olvidé mi contraseña?"** que enviará un correo de recuperación.

---

## 19. Flujos completos de uso diario

### Flujo 1: Operación diaria completa (desde la reserva hasta el egreso)

```
1. [PLANNER] Crea la reserva en el Calendario con: proveedor, cliente, tipo de carga, andén y horario.
   → El sistema envía automáticamente un correo al proveedor con los detalles (si está configurado).

2. [CASETILLA] El día de la reserva, cuando llega el camión:
   → Abre Punto Control IN/OUT.
   → Busca la reserva por proveedor o número.
   → Registra el INGRESO con patente, chofer y datos del camión.
   → La reserva pasa a estado "En proceso".

3. [OPERADOR] Durante la operación:
   → Registra en Manpower los colaboradores asignados.
   → Puede adjuntar fotos o documentos a la reserva.

4. [CASETILLA] Cuando el camión termina y va a salir:
   → Registra el EGRESO en Punto Control IN/OUT.
   → La reserva pasa a estado "Completada".

5. [ADMIN/SUPERVISOR] Al final del día:
   → Revisa el Dashboard con las métricas del día.
   → Verifica el log de actividad y cualquier anomalía.
```

---

### Flujo 2: Configuración de un nuevo almacén

```
1. Crear el Almacén en Administración → Almacenes.
2. Crear los Tipos de Carga que se manejarán en ese almacén.
3. Crear los Proveedores que operan en ese almacén.
4. Crear los Perfiles de Tiempo (proveedor + tipo de carga + duración).
5. Crear los Clientes asociados al almacén.
6. Crear los Andenes del almacén.
7. Asignar los Usuarios al almacén.
8. Configurar las Reglas de Correspondencia para notificaciones automáticas.
9. Hacer una reserva de prueba para verificar que todo funciona.
```

---

### Flujo 3: Onboarding de un usuario nuevo

```
1. [ADMIN] Crear el usuario en Administración → Usuarios.
2. [ADMIN] Asignar el Rol correcto según las responsabilidades del usuario.
3. [ADMIN] Asignar el Almacén al que pertenece.
4. El usuario recibe el correo de bienvenida con sus credenciales.
5. El usuario inicia sesión en el sistema.
6. El usuario actualiza su contraseña en Mi Perfil.
7. [ADMIN] Verificar que el usuario puede ver solo lo que corresponde a su rol.
```

---

### Flujo 4: Bloquear el calendario por feriado

```
1. Ir al Calendario.
2. Abrir la pestaña de Bloqueos o hacer clic derecho en la grilla → "Crear bloqueo".
3. Completar:
   - Título: "Feriado nacional"
   - Fecha: día del feriado
   - Andenes afectados: todos
   - Horario: todo el día (00:00 a 23:59)
4. Guardar.
5. Verificar en el calendario que el día aparece bloqueado.
```

---

## 20. Preguntas frecuentes y solución de problemas

### "No veo el menú de Administración"
**Causa:** Tu usuario no tiene el permiso `menu.admin.view`.
**Solución:** Pedirle al administrador que asigne ese permiso a tu rol.

---

### "No puedo crear una reserva en cierto andén"
**Causas posibles:**
1. El andén está inactivo o bloqueado.
2. Tu usuario no tiene acceso a ese almacén.
3. El cliente seleccionado no tiene ese andén habilitado.
4. No tenés el permiso `reservas.create`.

**Solución:** Verificar el estado del andén, revisar los permisos del usuario y las asignaciones del cliente.

---

### "El correo automático no se envía"
**Causas posibles:**
1. No está configurada la cuenta de Gmail ni SMTP.
2. La regla de correo está desactivada.
3. El evento disparador no coincide con la acción realizada.

**Solución:** Ir a Administración → Correspondencia → verificar que la cuenta esté conectada y que la regla esté activa. Revisar los Logs para ver el error específico.

---

### "El Asistente SRO dice que no tiene información"
**Causas posibles:**
1. No hay documentos cargados en la Base de Conocimiento.
2. Los documentos están en estado `draft` o `processing` (no `active`).
3. Tu rol no tiene acceso al nivel de los documentos relevantes.
4. La pregunta no está relacionada con el contenido de los documentos cargados.

**Solución:** Verificar el estado de los documentos en Administración → Base de Conocimiento. Si los documentos están en `failed`, hacer clic en "Reindexar".

---

### "No puedo subir un PDF a la Base de Conocimiento"
**Causas posibles:**
1. No tenés el permiso `chat.documents.manage`.
2. El archivo supera el tamaño máximo permitido.
3. El archivo no es un PDF válido.

**Solución:** Verificar que el archivo sea un PDF real y que tu usuario tenga el permiso correcto.

---

### "Un usuario no puede acceder al sistema (queda en pantalla de espera)"
**Causa:** El usuario fue creado pero está en estado "pendiente de aprobación".
**Solución:** Ir a Administración → Usuarios → buscar al usuario → cambiar su estado a "Activo" y asignarle un rol y almacén.

---

### "Quiero desactivar el chat IA temporalmente"
**Solución para admins técnicos:** En el archivo `src/components/feature/chat-widget/config.ts`, cambiar `CHAT_WIDGET_ENABLED` de `true` a `false`. El botón flotante desaparece para todos los usuarios sin afectar ningún otro módulo.

---

## Apéndice: Permisos del módulo Chat IA

Para asignar correctamente los permisos del chat a los roles:

| Permiso | Descripción |
|---|---|
| `chat.view` | Ver el botón del chat (mínimo para acceder). |
| `chat.ask` | Poder hacer preguntas al asistente. |
| `chat.answers.basic` | Ver respuestas de documentos nivel "basic". |
| `chat.answers.extended` | Ver respuestas de documentos nivel "extended". |
| `chat.answers.internal` | Ver respuestas de documentos nivel "internal" (confidencial). |
| `chat.documents.manage` | Subir, editar y eliminar documentos de la base de conocimiento. |
| `chat.documents.view` | Solo ver los documentos sin poder editarlos. |
| `chat.audit.view` | Ver la auditoría completa de preguntas del chat. |

---

*Documento generado automáticamente para el Sistema SRO — Versión 1.0*
*Última actualización: 2026-03-30*
*Para soporte técnico, contactar al administrador del sistema.*
