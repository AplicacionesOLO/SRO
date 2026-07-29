# MOBILE MENU VISIBILITY DIAGNOSIS

**Fecha**: 2026-07-29
**Clasificación**: CAUSA RAÍZ CONFIRMADA
**Versión del código**: v1277

---

## 1. Resumen del Problema

Un usuario autenticado con los mismos permisos ve todos los módulos en desktop pero NO ve algunos módulos en mobile. Específicamente, el módulo **"Punto Control IN/OUT"** (Casetilla) desaparece por completo en dispositivos móviles: no aparece en la barra de navegación inferior ni en el drawer "Más".

---

## 2. Componentes Revisados

| Componente | Archivo | Rol |
|---|---|---|
| Sidebar (orquestador) | `src/components/feature/Sidebar.tsx` | Coordina desktop sidebar + mobile bottom nav + mobile drawer |
| SidebarMobileBottomNav | `src/components/feature/sidebar/SidebarMobileBottomNav.tsx` | Barra de navegación inferior móvil (4-5 ítems + botón "Más") |
| SidebarMobileDrawer | `src/components/feature/sidebar/SidebarMobileDrawer.tsx` | Drawer lateral que se abre al pulsar "Más" |
| SidebarItem | `src/components/feature/sidebar/SidebarItem.tsx` | Ítem de menú individual |
| SidebarSubmenu | `src/components/feature/sidebar/SidebarSubmenu.tsx` | Submenú expandible (solo usado para "Administración") |
| menuItems (constants) | `src/components/feature/sidebar/constants.ts` | Definición estática del menú |
| usePermissions | `src/hooks/usePermissions.ts` | Hook de permisos |
| AuthContext | `src/contexts/AuthContext.tsx` | Contexto de autenticación y carga de permisos |
| Navbar | `src/components/feature/Navbar.tsx` | Barra superior (solo título + perfil, no contiene menú) |

---

## 3. Flujo del Menú Desktop

```
1. rawMenuItems (constants.ts, 7 ítems base)
   ↓
2. filterMenuItems(rawMenuItems)
   → hasPermission() evalúa cada item.children contra permissionsSet
   → Si permsLoading=true, hasPermission() retorna true (muestra todo)
   → Si permsLoading=false, filtra por permisos reales
   ↓
3. visibleMenuItems = resultado del filtro
   ↓
4. Render en desktop sidebar:
   - Sección "Operaciones": todos los items sin children + items con children que no son "Administración"
   - Sección "Administración": SidebarSubmenu con sus children
   ↓
5. TODO visibleMenuItems se renderiza. Ningún item se pierde.
```

**Desktop renderiza correctamente TODOS los items visibles**, incluyendo "Punto Control IN/OUT" (que tiene children pero no es "Administración") como un SidebarItem plano.

---

## 4. Flujo del Menú Móvil

```
1. rawMenuItems (constants.ts, 7 ítems base)
   ↓
2. rawMobileMainItems = rawMenuItems.filter(item => item.mobilePrimary)
   → Solo 4 ítems: Dashboard, Calendario, Reservas, Andenes
   ↓
3. visibleMobileMainItems = filterMenuItems(rawMobileMainItems)
   → Renderizados en SidebarMobileBottomNav (barra inferior)
   ↓
4. moreMenuItems = visibleMenuItems - visibleMobileMainItems
   → Pasados a SidebarMobileDrawer (drawer "Más")
   ↓
5. SidebarMobileDrawer.useMemo() clasifica moreMenuItems:
   
   for (const item of menuItems) {
     if (item.label === 'Administración' && item.children) {
       adm = item;                          // → SidebarSubmenu
     } else if (!item.children) {
       ops.push(item);                      // → SidebarItem plano
     }
     // ⚠️ Items con children pero NO 'Administración' → SILENCIOSAMENTE ELIMINADOS
   }
   ↓
6. Render en drawer:
   - operacionesItems → SidebarItem (uno por uno)
   - adminItem → SidebarSubmenu (Administración expandible)
   - Items con children NO 'Administración' → NO SE RENDERIZAN
```

---

## 5. Fuente de Permisos

`AuthContext.tsx` → `loadPermissions()` → `supabase.from('role_permissions').select(...)` → `permissionsSet` (Set<string>)

`usePermissions.ts` → `can(permission)` → `canLocal(permission)` → `permissionsSet.has(permission)`

**No hay diferencia entre desktop y mobile en la fuente de permisos.** Ambos usan exactamente el mismo `permissionsSet` del mismo `AuthContext`. Descartado como causa.

---

## 6. Fuente de Aplicaciones (Menú)

`constants.ts` → `menuItems` array estático de 7 entradas.

**No hay diferencia entre desktop y mobile en la fuente del menú.** Ambos usan el mismo array. Descartado como causa.

---

## 7. Contexto Multi-Tenant

| Dato | Origen | Persistencia |
|---|---|---|
| `orgId` | `user_org_roles` via `AuthContext` | Estado React |
| `activeWarehouseId` | `ActiveWarehouseContext` | `localStorage` key `sro_active_warehouse_{orgId}` |
| `sidebar_collapsed` | `Sidebar` state | `localStorage` key `sro_sidebar_collapsed_{userId}` |
| `sidebar_submenus` | `Sidebar` state | `localStorage` key `sro_sidebar_submenus` |

**El menú NO filtra por warehouse, country, o client.** Solo filtra por permisos (`permissionsSet`). El contexto multi-tenant no afecta la visibilidad del menú. Descartado como causa.

---

## 8. Persistencia Local

- `sro_active_warehouse_{orgId}` → Selección de warehouse activo
- `sro_sidebar_collapsed_{userId}` → Estado colapsado/expandido del sidebar desktop
- `sro_sidebar_submenus` → Submenús expandidos en desktop

**Ninguna de estas claves afecta qué ítems del menú se muestran.** Descartado como causa.

---

## 9. Caché / PWA

**No existe Service Worker, PWA, ni manifest en el proyecto.** Búsqueda de archivos `*.sw.js`, `service-worker*`, `manifest*`, `workbox*`, `pwa*` retornó 0 resultados. Descartado como causa.

---

## 10. Problemas CSS

### 10.1 `safe-area-bottom` no definida

**Ubicación**: `SidebarMobileBottomNav.tsx` línea 21
```html
<div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#060d18] border-t border-white/[0.06] z-50 safe-area-bottom">
```

La clase `safe-area-bottom` **no existe** en `index.css` ni en la configuración de Tailwind. En dispositivos con notch (iPhone X+), la barra inferior podría quedar parcialmente oculta bajo el área segura. **Esto no causa la desaparición de ítems, pero podría hacer que la barra inferior sea parcialmente invisible o inaccesible en algunos dispositivos.**

### 10.2 Drawer scrolling

El drawer móvil tiene:
```html
<nav className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 relative">
```

Esto es correcto: permite scroll vertical si el contenido excede la altura. No hay riesgo de que ítems queden fuera de pantalla por overflow.

---

## 11. Causa Raíz Confirmada

### **El `SidebarMobileDrawer` elimina silenciosamente cualquier ítem del menú que tenga `children` pero cuyo `label` NO sea `'Administración'`.**

**Archivo**: `src/components/feature/sidebar/SidebarMobileDrawer.tsx`
**Líneas**: 46-55

```tsx
const { operacionesItems, adminItem } = useMemo(() => {
    const ops: MenuItem[] = [];
    let adm: MenuItem | null = null;

    for (const item of menuItems) {
      if (item.label === 'Administración' && item.children) {
        adm = item;
      } else if (!item.children) {
        ops.push(item);
      }
      // ⚠️ Items with children but NOT 'Administración' → SILENTLY DROPPED
    }

    return { operacionesItems: ops, adminItem: adm };
  }, [menuItems]);
```

**Ítem afectado actualmente**: "Punto Control IN/OUT" (`/casetilla`)

```tsx
// constants.ts, líneas 49-58
{
    label: 'Punto Control IN/OUT',
    path: '/casetilla',
    icon: 'ri-door-open-line',
    permission: 'menu.casetilla.view',
    section: 'Operaciones',
    children: [                                              // ← TIENE children
      { label: 'Registro IN/OUT', path: '/casetilla', ... },
      { label: 'Compliance Center', path: '/casetilla/compliance', ... },
    ],
    // mobilePrimary NO está definido → no va a la barra inferior
}
```

**Por qué desktop funciona**: El código desktop en `Sidebar.tsx` líneas 220-237 renderiza TODOS los items de `visibleMenuItems` que no son 'Administración' como `SidebarItem` planos, sin importar si tienen children o no:

```tsx
{visibleMenuItems.map((item) => {
    if (item.label === 'Administración') return null;
    return (
        <SidebarItem
            key={item.path}
            path={item.path}
            label={item.label}
            icon={item.icon}
            ...
        />
    );
})}
```

**Por qué mobile falla**: El código del drawer clasifica en solo dos buckets (`adminItem` para "Administración" y `operacionesItems` para items sin children). Cualquier item con children que no sea "Administración" no encaja en ningún bucket y es descartado.

---

## 12. Causas Secundarias

| # | Hallazgo | Severidad | Archivo | Línea |
|---|---|---|---|---|
| 1 | `safe-area-bottom` clase CSS no definida | Bajo | `SidebarMobileBottomNav.tsx` | 21 |
| 2 | "Manpower" sin `mobilePrimary` — solo visible en drawer, no en barra inferior (esto es por diseño, no un bug) | Informativo | `constants.ts` | 36-41 |

---

## 13. Evidencia del Código

### Evidencia A: El ítem afectado tiene children

`src/components/feature/sidebar/constants.ts`, líneas 49-58:
```tsx
{
    label: 'Punto Control IN/OUT',
    path: '/casetilla',
    icon: 'ri-door-open-line',
    permission: 'menu.casetilla.view',
    section: 'Operaciones',
    children: [
      { label: 'Registro IN/OUT', path: '/casetilla', icon: 'ri-door-open-line', permission: 'menu.casetilla.view' },
      { label: 'Compliance Center', path: '/casetilla/compliance', icon: 'ri-shield-check-line', permission: 'menu.casetilla.view' },
    ],
},
```

### Evidencia B: El drawer lo descarta

`src/components/feature/sidebar/SidebarMobileDrawer.tsx`, líneas 46-55:
```tsx
for (const item of menuItems) {
    if (item.label === 'Administración' && item.children) {
        adm = item;           // "Punto Control IN/OUT" NO coincide (label ≠ 'Administración')
    } else if (!item.children) {
        ops.push(item);       // "Punto Control IN/OUT" NO coincide (TIENE children)
    }
    // → El ítem se pierde aquí
}
```

### Evidencia C: Desktop sí lo renderiza

`src/components/feature/Sidebar.tsx`, líneas 220-237:
```tsx
{visibleMenuItems.map((item) => {
    if (item.label === 'Administración') return null;
    // "Punto Control IN/OUT" NO es 'Administración' → se renderiza como SidebarItem
    return (<SidebarItem ... />);
})}
```

---

## 14. Archivos que Requieren Cambios

| Archivo | Tipo de cambio | Riesgo |
|---|---|---|
| `src/components/feature/sidebar/SidebarMobileDrawer.tsx` | **Corrección de bug**: modificar la lógica `useMemo` para no descartar items con children que no son 'Administración' | **Muy bajo** — solo afecta al drawer móvil |
| `src/index.css` | **Corrección menor**: definir clase `safe-area-bottom` | **Nulo** — solo CSS |
| `src/components/feature/sidebar/constants.ts` | **Opcional**: agregar `mobilePrimary: true` a "Punto Control IN/OUT" si se desea en la barra inferior | **Bajo** — cambio de diseño |

---

## 15. Riesgo de Cada Cambio

| Cambio | Riesgo | Justificación |
|---|---|---|
| Fix drawer filtering | **Muy bajo** | Solo agrega items que ya existen y son visibles; no modifica desktop |
| Definir `safe-area-bottom` | **Nulo** | CSS puro, sin lógica |
| Agregar `mobilePrimary` | **Bajo** | Solo cambia qué items aparecen en la barra inferior; requiere decisión de UX |

---

## 16. Plan de Corrección

### Paso 1 (CRÍTICO): Corregir `SidebarMobileDrawer.tsx`

Modificar la lógica de clasificación para que los items con children que no son 'Administración' se rendericen como `SidebarItem` planos (mismo comportamiento que desktop):

```tsx
const { operacionesItems, adminItem } = useMemo(() => {
    const ops: MenuItem[] = [];
    let adm: MenuItem | null = null;

    for (const item of menuItems) {
      if (item.label === 'Administración' && item.children) {
        adm = item;
      } else if (!item.children) {
        ops.push(item);
      } else {
        // Items con children que no son Administración:
        // renderizar como ítem plano (igual que desktop)
        ops.push(item);
      }
    }

    return { operacionesItems: ops, adminItem: adm };
  }, [menuItems]);
```

### Paso 2 (BAJO): Definir `safe-area-bottom` en `index.css`

```css
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

### Paso 3 (OPCIONAL - UX): Evaluar si "Punto Control IN/OUT" debería tener `mobilePrimary: true`

Si el usuario usa frecuentemente Casetilla en móvil, agregar `mobilePrimary: true` al ítem en `constants.ts` para que aparezca directamente en la barra inferior.

---

## Veredicto Final

# CAUSA RAÍZ CONFIRMADA

El bug está en `SidebarMobileDrawer.tsx` líneas 46-55. La lógica de clasificación `useMemo` solo contempla dos categorías ("Administración" con children, y items sin children). Cualquier ítem con children que no sea "Administración" es silenciosamente descartado y nunca se renderiza en el drawer móvil.

El único ítem actualmente afectado es **"Punto Control IN/OUT"** (módulo Casetilla), lo que explica por qué el usuario no puede acceder a Casetilla desde un dispositivo móvil aunque sí puede desde desktop con los mismos permisos.

**No es un problema de permisos, sesión, caché, PWA, carga asíncrona, ni CSS de visibilidad.** Es un bug de lógica pura en el componente del drawer móvil.