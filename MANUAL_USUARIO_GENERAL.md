# Manual de Usuario — Sistema SRO
## Para usuarios con rol operativo (no Administrador)

---

> **¿Para quién es este manual?**  
> Este documento está dirigido a todos los usuarios del sistema SRO que **no** tienen el rol de Administrador ni Full Access. Cubre todas las funciones a las que tendrás acceso dependiendo del rol asignado por tu organización.

---

## Tabla de Contenidos

1. [Acceso al Sistema](#1-acceso-al-sistema)
2. [Navegación General](#2-navegación-general)
3. [Dashboard — Resumen Operativo](#3-dashboard--resumen-operativo)
4. [Calendario — Gestión de Reservas](#4-calendario--gestión-de-reservas)
5. [Reservas — Listado y Búsqueda](#5-reservas--listado-y-búsqueda)
6. [Andenes — Estado de los Muelles](#6-andenes--estado-de-los-muelles)
7. [Manpower — Gestión de Colaboradores](#7-manpower--gestión-de-colaboradores)
8. [Base de Conocimiento](#8-base-de-conocimiento)
9. [SRObot — Asistente de IA](#9-srobot--asistente-de-ia)
10. [Mi Perfil](#10-mi-perfil)
11. [Mensajes de Error Frecuentes](#11-mensajes-de-error-frecuentes)

---

## 1. Acceso al Sistema

### ¿Cómo entrar?

1. Abrí el sistema desde el navegador con la URL que te proporcionó tu organización.
2. En la pantalla de inicio de sesión, ingresá tu **correo electrónico** y **contraseña**.
3. Hacé clic en **Iniciar Sesión**.

### Primer acceso

Si es tu primer ingreso, es posible que tu cuenta muestre el mensaje **"Acceso Pendiente"**. Esto significa que un administrador debe asignarte los permisos correspondientes. Contactá a tu supervisor o administrador del sistema.

### Contraseña olvidada

Si no recordás tu contraseña, podés cambiarla desde tu perfil una vez dentro del sistema. Si no podés entrar, contactá al administrador para que restablezca tu acceso.

### Cierre de sesión

Para salir del sistema de forma segura:
1. Hacé clic en tu nombre o ícono de usuario (esquina superior o menú lateral).
2. Seleccioná **Mi Perfil**.
3. Hacé clic en **Cerrar Sesión** y confirmá.

---

## 2. Navegación General

### Barra lateral (Menú principal)

El menú lateral izquierdo muestra todas las secciones disponibles para tu rol:

| Ícono | Sección | ¿Qué hace? |
|-------|---------|-----------|
| 🏠 | **Dashboard** | Vista resumen con estadísticas y accesos rápidos |
| 📅 | **Calendario** | Ver y gestionar reservas en una grilla visual de tiempo |
| 📋 | **Reservas** | Listado completo de reservas con filtros y exportación |
| 🚛 | **Andenes** | Estado actual de los muelles/andenes del almacén |
| 👥 | **Manpower** | Registro de colaboradores por almacén y país |
| 📚 | **Conocimiento** | Base de documentos PDF para consultas con IA |
| 💬 | **SRObot** | Asistente de inteligencia artificial (chat flotante) |

> **Nota:** Las secciones visibles dependen de los permisos asignados por tu administrador. Es posible que no veas todas las opciones listadas arriba.

### Notificaciones y estado del sistema

Si ves un banner de color al iniciar sesión, puede indicar:
- **Verde/Teal:** Información importante, como un borrador guardado sin finalizar.
- **Amarillo:** Advertencia sobre algún proceso pendiente.
- **Rojo:** Error o acción que requiere atención.

---

## 3. Dashboard — Resumen Operativo

El Dashboard es la pantalla principal que verás al ingresar. Ofrece un resumen visual del estado operativo en tiempo real.

### ¿Qué muestra?

#### Tarjetas de métricas principales (fila superior)
Cuatro indicadores clave actualizados automáticamente:

| Indicador | Descripción |
|-----------|-------------|
| **Reservas este mes** | Cantidad total de reservas en el mes actual, con variación respecto al mes anterior (%) |
| **Por confirmar** | Reservas en estado "Pendiente" que aún no han sido confirmadas |
| **Confirmadas** | Reservas confirmadas; muestra también el porcentaje de confirmación del total |
| **En proceso** | Reservas que actualmente están en curso (vehículo presente) |

#### Panel "Hoy" y tendencia 7 días
- El panel verde muestra cuántas reservas hay programadas para **hoy** y para **esta semana**, junto con la comparación respecto a la semana anterior.
- El gráfico de barras muestra la **tendencia de reservas por día** en los últimos 7 días. Las barras más altas indican días con más actividad.

#### Distribución por Estado
Muestra cuántas reservas hay en cada estado (por ejemplo: Pendiente, Confirmada, En Proceso, Finalizada, Cancelada). Las barras de color permiten comparar visualmente el volumen de cada estado.

#### Recursos Operativos
Cuatro indicadores del estado de infraestructura:
- **Andenes:** Cuántos están activos vs. el total configurado.
- **Almacenes:** Cantidad de almacenes configurados en la organización.
- **Colaboradores:** Total de colaboradores activos registrados.
- **Cumplimiento:** Porcentaje de reservas que han sido finalizadas correctamente.

#### Top Proveedores, Horas Pico y Andenes más Usados
- **Top Proveedores:** Los proveedores con más reservas en el período actual.
- **Horas Pico:** Las franjas horarias con mayor concentración de actividad. El color rojo indica la hora más concurrida.
- **Andenes más Usados:** Los andenes con mayor cantidad de reservas asignadas.

#### Rendimiento por Almacén
Tabla que muestra para cada almacén: cantidad de reservas, número de andenes y un indicador de ocupación relativa (%).

### Acciones Rápidas

Al final del Dashboard hay 3 botones de acceso rápido:
- **Nueva Reserva** → Abre directamente el formulario de reserva en el Calendario.
- **Ver Andenes** → Navega al módulo de Andenes.
- **Casetilla** → Navega al módulo de Punto Control IN/OUT.

### ¿Cómo actualizar los datos?

Hacé clic en el botón **Actualizar** (ícono de flechas giratorias) en la esquina superior derecha del Dashboard para recargar todos los indicadores.

---

## 4. Calendario — Gestión de Reservas

El Calendario es el módulo central del sistema. Muestra de forma visual y en tiempo real todas las reservas y bloqueos de andenes en una grilla por horas.

### Pestañas del módulo

| Pestaña | Descripción |
|---------|-------------|
| **Calendario** | Vista principal de la grilla con reservas y bloqueos |
| **Estatus Op** | Gestión de estados operativos (si tenés el permiso) |
| **Bloqueos** | Listado de bloqueos de tiempo configurados (si tenés el permiso) |

---

### 4.1 Entendiendo la grilla

La grilla se organiza de la siguiente manera:

- **Eje vertical (izquierda):** Franjas de tiempo, desde la hora de inicio hasta el cierre del almacén (ej. 06:00 a 17:00).
- **Eje horizontal (arriba):** Cada columna representa un **andén** específico. Si hay varios días visibles, los andenes se repiten por cada día.
- **Línea roja horizontal:** Indica la **hora actual** (en tiempo real). Aparece únicamente en el día de hoy.
- **Bloques de colores:** Las reservas aparecen como tarjetas de color dentro de la grilla. El color del borde izquierdo indica el estado de la reserva.

#### ¿Qué muestra cada tarjeta de reserva?

Dentro de cada bloque de reserva podés ver:
- **ID de la reserva** (primeros 8 caracteres)
- **DUA** (documento de aduanas, si fue ingresado)
- **Número de Pedido** (si aplica)
- **Proveedor**
- **Estado** (etiqueta de color en la parte inferior)
- **Rango horario** (hora de inicio y fin)

---

### 4.2 Navegación y vistas

#### Cambiar el rango de días visible

Usá los botones en la barra superior:
- **1 día:** Muestra solo el día actual o el seleccionado.
- **3 días:** Muestra un rango de 3 días centrado en el día ancla.
- **7 días:** Muestra una semana completa.

#### Navegar entre fechas

- **Botón "Hoy":** Vuelve inmediatamente a la fecha actual.
- **Flechas ← →:** Avanza o retrocede el rango completo de días (si estás en vista de 3 días, salta de 3 en 3 días).
- **Selector de fecha (campo de texto tipo calendario):** Escribí o seleccioná una fecha específica para ir directo a ese día. Al elegir una fecha manualmente, la vista cambia automáticamente a **1 día**.

---

### 4.3 Seleccionar un almacén

Por defecto, el calendario muestra **todos los andenes** de todos los almacenes. Para filtrar por un almacén específico:

1. Hacé clic en el botón **Seleccionar Almacén**.
2. En la ventana emergente, elegí el almacén deseado de la lista.
   - La opción **"Ver todos los andenes"** muestra la vista global sin filtro.
   - Cada almacén muestra su nombre, ubicación y horario configurado.
3. Hacé clic en el almacén deseado. La grilla se actualiza automáticamente.

> **Tip:** Al seleccionar un almacén, el horario de la grilla y el intervalo de slots se ajustan a la configuración de ese almacén. Esto es importante para crear reservas correctamente.

El almacén seleccionado se guarda automáticamente y se restaurará la próxima vez que abras el calendario.

---

### 4.4 Filtros adicionales

- **Buscar por DUA, Factura o Chofer:** Campo de texto en la barra superior. Al escribir, las reservas que no coinciden se ocultan automáticamente. La búsqueda aplica sin necesidad de recargar los datos.
- **Filtro por Categoría:** Desplegable que filtra los andenes por su categoría (si existen categorías configuradas). Útil cuando hay muchos andenes de diferentes tipos.

---

### 4.5 Crear una nueva reserva (si tenés el permiso)

Para crear una reserva, el proceso tiene **dos pasos**:

#### Paso 1: Pre-selección (Mini Modal)

1. Hacé clic en **Nueva Reserva** (botón verde en la barra superior).
2. Se abre un pequeño formulario donde debés completar:
   - **Tipo de carga:** Seleccioná el tipo de mercadería o carga.
   - **Proveedor:** Seleccioná el proveedor que realizará la entrega.
   - **Cliente:** Se completa automáticamente según el proveedor.
   - **Duración requerida:** Indicá cuánto tiempo necesitás (en minutos).
3. Hacé clic en **Confirmar y seleccionar espacio**.

> **¿Por qué este paso existe?**  
> El sistema usa esta información para calcular qué andenes están disponibles para ese proveedor/cliente y qué espacios libres tiene la duración requerida. Así aplica las reglas de asignación de andenes configuradas por el administrador.

#### Paso 2: Selección de espacio en el calendario

Después de confirmar el paso 1, el calendario entra en **Modo Selección** (se muestra un banner teal en la parte superior indicando "Modo selección activo").

- Los espacios **disponibles y compatibles** se marcan en **verde claro**.
- Los espacios **no disponibles** (ocupados, bloqueados o fuera de horario) se muestran en **gris o rojo**.
- Hacé clic en un espacio verde para seleccionarlo. El formulario completo de la reserva se abrirá automáticamente con el andén, fecha y hora ya precargados.

Para salir del modo selección sin crear ninguna reserva, hacé clic en el botón **Salir** del banner teal.

#### Paso 3: Completar el formulario de reserva

Con los datos de tiempo y andén ya precargados, completá el resto de los campos:
- **DUA** (número de documento aduanero)
- **Chofer** (nombre del conductor)
- **Placa/Matrícula**
- **Orden de Compra / Número de Pedido**
- **Factura**
- **Tipo de transporte**
- **Notas adicionales**
- **Fotos** (opcionales)

Hacé clic en **Guardar** para confirmar la reserva. Aparecerá en la grilla inmediatamente.

---

### 4.6 Ver y editar una reserva existente

Hacé clic sobre cualquier tarjeta de reserva en la grilla para abrir su detalle. Desde ahí podés:
- Ver todos los datos completos.
- Editar campos (si tenés el permiso de actualizar reservas).
- Cambiar el estado de la reserva.
- Cancelar la reserva (si tenés el permiso y la reserva aún está activa).

---

### 4.7 Mover una reserva (Drag & Drop)

Si tenés el permiso de mover reservas, podés **arrastrar** una tarjeta de reserva y **soltarla** en otro slot de la grilla.

Restricciones del sistema al mover:
- No se puede cruzar a otro día.
- No se puede mover fuera del horario hábil del almacén.
- No se puede mover a un espacio que ya está ocupado por otra reserva o bloqueado.

Si alguna de estas reglas se viola, el sistema muestra un mensaje de advertencia y la reserva vuelve a su lugar original.

---

### 4.8 Bloques (áreas grises en el calendario)

Los bloques son franjas de tiempo que han sido **inhabilitadas intencionalmente** por un administrador o coordinador. Pueden deberse a mantenimiento, feriados, restricciones de clientes u otros motivos.

Los bloques aparecen como rectángulos grises con el texto **"Bloqueado"** y el motivo (si fue especificado).

- Si tenés el permiso de **crear bloqueos**, usá el botón **"Bloquear Tiempo"** (gris oscuro) en la barra superior.
- Si hacés clic sobre un bloque existente y tenés el permiso de editar/eliminar, se abrirá el formulario del bloque.

---

### 4.9 Borrador guardado automáticamente

Si estabas completando una reserva y cerraste el formulario sin terminar, el sistema guarda automáticamente un borrador. La próxima vez que abras el Calendario, verás un banner teal que dice:

**"Tenés un borrador de reserva sin finalizar (hace X min)"**

- **Continuar:** Abre el formulario con los datos que habías completado.
- **Descartar:** Elimina el borrador permanentemente.

---

## 5. Reservas — Listado y Búsqueda

El módulo de Reservas muestra **todas las reservas** en formato de tabla, con capacidad de búsqueda avanzada y exportación a Excel. Es la vista ideal para consultar, buscar y gestionar reservas sin necesidad de navegar por el calendario visual.

### Filtros disponibles

| Filtro | Descripción |
|--------|-------------|
| **Búsqueda de texto** | Filtra por DUA, Factura, Chofer, Orden de Compra, Proveedor o Placa |
| **Estado** | Filtra por un estado específico (Pendiente, Confirmada, En Proceso, etc.) |
| **Activas / Canceladas** | Muestra solo activas, solo canceladas, o todas |
| **Fecha Desde** | Filtra reservas con fecha de inicio igual o posterior a esta fecha |
| **Fecha Hasta** | Filtra reservas con fecha de inicio igual o anterior a esta fecha |

**Para limpiar todos los filtros** a la vez, hacé clic en **"Limpiar filtros"** (aparece cuando hay algún filtro activo).

### Columnas de la tabla

| Columna | Descripción |
|---------|-------------|
| **ID** | Identificador único de la reserva (primeros 8 caracteres) |
| **Fecha/Hora** | Fecha y hora de inicio de la reserva |
| **Andén** | Nombre del andén asignado |
| **Estado** | Badge de color con el estado actual |
| **Orden Compra** | Número de orden de compra (si fue ingresado) |
| **Proveedor** | Nombre del proveedor |
| **Chofer** | Nombre del conductor |
| **DUA** | Número de DUA (si fue ingresado) |
| **Placa** | Matrícula del vehículo |

Las reservas **canceladas** se muestran con fondo rojo claro y texto tachado para distinguirlas visualmente.

### Ordenar resultados

Hacé clic en la columna **"Fecha/Hora"** para ordenar de más antigua a más nueva (o viceversa). El ícono de flecha indica el sentido actual del ordenamiento.

### Paginación

La tabla muestra **20 reservas por página**. Usá los botones de navegación al final para:
- Ir a la primera página.
- Ir a la página anterior.
- Ir a la página siguiente.
- Ir a la última página.

### Exportar a Excel

Hacé clic en el botón verde **"Exportar Excel"** para descargar un archivo `.xlsx` con **todas las reservas que coincidan con los filtros activos** en ese momento.

El archivo incluye: ID, Fecha Inicio, Fecha Fin, Andén, Estado, Cancelada, Razón de Cancelación, Orden de Compra, Proveedor, Chofer, DUA, Factura, Placa, Tipo Transporte, Tipo Carga, N° Solicitud Pedido y Notas.

### Crear y editar reservas desde este módulo

Si tenés el permiso correspondiente:
- **"Nueva Reserva"** (botón teal superior derecho): Abre el formulario de creación directamente.
- **Ícono de lápiz** en cada fila: Edita esa reserva.
- **Ícono de papelera** en cada fila: Solicita confirmación para eliminar la reserva (acción irreversible).

---

## 6. Andenes — Estado de los Muelles

Este módulo muestra el listado de todos los andenes (muelles de carga/descarga) de la organización, junto con su estado, categoría y almacén al que pertenecen.

### Filtros disponibles

| Filtro | Descripción |
|--------|-------------|
| **Buscar** | Busca por nombre o referencia del andén |
| **Categoría** | Filtra por la categoría del andén (ej. Refrigerado, Seco, etc.) |
| **Estado** | Filtra por el estado operativo (ej. Disponible, En Mantenimiento, etc.) |
| **Almacén** | Filtra por el almacén al que está asignado el andén |
| **Solo activos** | Casilla de verificación: muestra únicamente andenes activos (marcado por defecto) |

### Información de cada andén

| Columna | Descripción |
|---------|-------------|
| **Nombre** | Nombre del andén (ej. "Andén 01", "Muelle B") |
| **Referencia** | Código o referencia interna (si fue configurado) |
| **Color** | Color personalizado del encabezado en el calendario |
| **Almacén** | Almacén al que pertenece |
| **Categoría** | Tipo o categoría del andén |
| **Estado** | Estado operativo actual con su color identificador |
| **Activo** | Ícono verde = activo, rojo = inactivo |

### Crear y editar andenes

Si tenés el permiso correspondiente:
- **"Nuevo Andén"** (botón teal superior derecho): Abre el formulario de creación.
- **Ícono de lápiz** en cada fila: Edita ese andén (nombre, referencia, color, categoría, estado, almacén).
- **Ícono de activar/desactivar**: Cambia el estado activo/inactivo del andén.

> **Nota:** La lista se actualiza en orden numérico natural (Andén 1, Andén 2 ... Andén 10, no Andén 1, Andén 10, Andén 2). Esto facilita la lectura cuando hay muchos andenes.

---

## 7. Manpower — Gestión de Colaboradores

El módulo Manpower permite gestionar el registro de colaboradores (operarios, choferes, personal de almacén, etc.) con su asignación a almacenes y tipos de trabajo.

### Ver colaboradores

Para que aparezca la lista, debés aplicar al menos uno de estos filtros:

1. **Activar "Ver Todo"** (toggle): Muestra todos los colaboradores de la organización sin filtro de ubicación.
2. **Seleccionar un País**: Filtra colaboradores del país elegido.
3. **Seleccionar un Almacén**: Filtra colaboradores asignados a ese almacén.

> Si no activás "Ver Todo" ni seleccionás país o almacén, la lista no mostrará registros (para evitar cargas innecesarias).

### Buscar un colaborador

Usá el campo de búsqueda para encontrar rápidamente a alguien por:
- Nombre completo
- Número de ficha
- Número de cédula

### Información de cada colaborador

| Columna | Descripción |
|---------|-------------|
| **Nombre Completo** | Nombre del colaborador |
| **Ficha** | Número de ficha interna |
| **Cédula** | Documento de identidad |
| **País** | País de asignación |
| **Almacenes** | Lista de almacenes a los que está asignado |
| **Tipo de Trabajo** | Categoría o tipo de labor que realiza |
| **Estado** | Activo / Inactivo |

### Control de Manpower

El botón **"Control"** (gris) abre un modal de control donde podés ver el estado del personal en tiempo real por almacén. Esta vista es útil para coordinar la disponibilidad de colaboradores antes de una operación.

### Crear, editar y eliminar colaboradores

Si tenés el permiso de gestión (manpower.manage):
- **"Nuevo Colaborador"** (botón teal): Abre el formulario de registro.
- **Ícono de lápiz** en cada fila: Edita los datos del colaborador.
- **Ícono de papelera** en cada fila: Elimina el colaborador (solicita confirmación).

#### Formulario de colaborador

Campos disponibles:
- Nombre Completo (obligatorio)
- Número de Ficha
- Número de Cédula
- País de asignación
- Almacenes asignados (pueden ser múltiples)
- Tipo de trabajo
- Estado (activo/inactivo)

El sistema guarda borradores automáticamente. Si cerrás el formulario sin completarlo, la próxima vez que abras el módulo verás el banner de borrador guardado.

---

## 8. Base de Conocimiento

Este módulo gestiona los documentos PDF que el asistente de IA (SRObot) utiliza como fuente de información para responder consultas.

### ¿Qué podés hacer aquí?

Dependiendo de tus permisos, podés:
- **Consultar** los documentos disponibles.
- **Subir** nuevos PDFs para que SRObot los aprenda.
- **Procesar** un documento con IA (indexarlo para búsqueda semántica).
- **Re-indexar** un documento si fue actualizado.
- **Archivar** documentos que ya no deben usarse.

### Estados de los documentos

| Estado | Color | Descripción |
|--------|-------|-------------|
| **Activo** | Verde | El documento está procesado y disponible para consultas |
| **Borrador** | Gris | Documento subido pero aún no enviado a procesar |
| **Procesando** | Amarillo | La IA está analizando e indexando el documento |
| **Error** | Rojo | El procesamiento falló. Intentá re-indexar |
| **Archivado** | Gris oscuro | Documento desactivado, no se usa en consultas |

### Estadísticas del panel

En la parte superior encontrás 4 indicadores:
- **Total:** Todos los documentos cargados.
- **Activos:** Disponibles para consultas.
- **Procesando:** En proceso de indexación.
- **Con error:** Que fallaron en el procesamiento.

### Filtros

- **Buscar:** Por título, descripción o etiquetas del documento.
- **Estado:** Botones de filtro rápido para ver solo documentos de un estado específico.

### Subir un nuevo documento

1. Hacé clic en **"Subir PDF"** (botón teal).
2. En el modal que se abre, completá:
   - **Título** del documento (obligatorio).
   - **Descripción** (opcional pero recomendado para facilitar búsquedas).
   - **Etiquetas** (palabras clave separadas por coma, ej: "logística, procedimientos, SRO").
   - **Roles con acceso** (seleccioná qué roles del sistema pueden consultar este documento con SRObot).
   - **Archivo PDF** (seleccioná el archivo desde tu dispositivo).
3. Hacé clic en **Subir** para cargar el archivo.
4. Después de subido, el documento queda en estado **Borrador**. Para que SRObot pueda leerlo, hacé clic en **Procesar con IA** desde la tarjeta del documento.

### Tarjeta de documento

Cada documento se muestra como una tarjeta con:
- **Ícono de PDF**
- **Título**
- **Estado** (badge de color)
- **Tamaño del archivo**
- **Fecha de subida**
- **Etiquetas**
- **Botones de acción:** Editar, Procesar, Re-indexar, Archivar (según el estado actual)

---

## 9. SRObot — Asistente de IA

SRObot es el asistente de inteligencia artificial del sistema. Podés hacerle preguntas sobre documentos, procedimientos y cualquier información disponible en la Base de Conocimiento.

### ¿Cómo abrirlo?

Hacé clic en el **ícono de chat flotante** ubicado en la esquina inferior derecha de cualquier pantalla del sistema. El panel del chat se despliega hacia arriba.

### Primera vez que lo usás

SRObot te saluda por tu nombre y se presenta. También te muestra sugerencias de preguntas para que sepas por dónde empezar.

### ¿Cómo hacerle una pregunta?

1. Escribí tu pregunta en el campo de texto en la parte inferior del panel.
2. Presioná **Enter** o hacé clic en el botón de envío (flecha).
3. Verás el indicador **"SRObot está pensando..."** mientras procesa la respuesta.
4. La respuesta aparece en la burbuja de chat del asistente.

### Chips de seguimiento

Después de cada respuesta, SRObot te sugiere **2 preguntas de seguimiento** relevantes (chips/botones clickeables). Podés hacer clic en uno de ellos para continuar la conversación sin necesidad de escribir.

### Contexto de conversación

SRObot recuerda los últimos mensajes de la conversación. Podés decirle "como te comenté antes..." o hacer referencia a algo dicho previamente en la misma sesión.

### Limitaciones importantes

- SRObot solo responde sobre información contenida en los documentos de la Base de Conocimiento.
- Si no encuentra información sobre un tema, lo indicará claramente.
- Si los documentos están en proceso de indexación (estado "Procesando"), SRObot aún no puede acceder a ese contenido.
- SRObot **no puede** modificar datos del sistema, crear reservas, ni ejecutar acciones. Solo responde consultas.

### Privacidad

Cada conversación con SRObot es **completamente privada**. Ningún otro usuario puede ver tu historial de chat.

---

## 10. Mi Perfil

Accedé a tu perfil desde el menú de usuario (generalmente en la esquina superior derecha o en el menú lateral).

### Información visible en tu perfil

- **Nombre completo**
- **Correo electrónico**
- **Rol asignado** en el sistema
- **Organización** a la que pertenecés
- **País** (si fue configurado)
- **Fecha de creación de la cuenta**
- **Proveedores asignados:** Lista de proveedores con los que podés trabajar
- **Almacenes asignados:** Lista de almacenes a los que tenés acceso

### Cambiar contraseña

1. En la sección **Acciones**, hacé clic en **"Cambiar Contraseña"**.
2. Ingresá tu nueva contraseña (mínimo 6 caracteres).
3. Confirmá la nueva contraseña.
4. Hacé clic en **Guardar**.

> **Nota:** No necesitás ingresar tu contraseña actual para cambiarla. El sistema ya sabe que sos vos porque estás autenticado.

### Cerrar sesión

Hacé clic en **"Cerrar Sesión"** en la sección de Acciones. Se pedirá una confirmación antes de salir.

---

## 11. Mensajes de Error Frecuentes

| Mensaje | Qué significa | Qué hacer |
|---------|--------------|-----------|
| **"Acceso Pendiente"** | Tu cuenta existe pero no tiene permisos asignados | Contactá a un administrador |
| **"Acceso Denegado"** | No tenés permiso para ver esa sección | Contactá a un administrador para solicitar acceso |
| **"Sin Organización"** | Tu usuario no está asociado a ninguna organización | Contactá al administrador del sistema |
| **"No hay andenes disponibles"** | El almacén seleccionado no tiene andenes asignados | Seleccioná otro almacén o "Ver todos" |
| **"Ocurrió un error al consultar el asistente"** | SRObot no pudo procesar la pregunta | Intentá nuevamente; si persiste, verificá que la API key de OpenAI esté configurada |
| **"No hay reservas pendientes"** | No existen reservas en estado pendiente/confirmado | Es normal si no hay reservas del día |

---

## Consejos y Buenas Prácticas

1. **Usá los filtros del Calendario:** Cuando hay muchos andenes, filtrá por almacén o categoría para enfocarte en lo que necesitás.
2. **Aprovechá la exportación a Excel:** Exportá reservas con filtros activos para generar reportes personalizados sin necesidad de copiar datos manualmente.
3. **Completá siempre el DUA en las reservas:** Es el campo más útil para identificar una reserva rápidamente.
4. **Consultá SRObot antes de buscar manuales:** Si tenés una duda sobre procedimientos, SRObot puede responderte en segundos si el documento está cargado en la Base de Conocimiento.
5. **No cerrés el navegador a la mitad de una reserva:** El sistema guarda borradores, pero es mejor completar el proceso. Si necesitás salir, guardá el borrador.

---

*Última actualización: Sistema SRO — Manual de Usuario General v1.0*
