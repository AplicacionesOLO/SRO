# MOBILE MENU VISIBILITY FIX REPORT

## Causa raíz

`SidebarMobileDrawer.tsx` (línea 49) contenía la condición `else if (!item.children)` que descartaba silenciosamente cualquier item del menú que tuviera `children` y cuyo `label` no fuera exactamente `'Administración'`.

El único módulo afectado actualmente es **Punto Control IN/OUT** (`/casetilla`), que tiene `children` (Registro IN/OUT, Compliance Center) pero no es `'Administración'`. El item simplemente nunca llegaba al DOM en mobile.

## Archivos modificados

| # | Archivo | Cambio | Riesgo |
|---|---|---|---|
| 1 | `src/components/feature/sidebar/SidebarMobileDrawer.tsx` | `else if (!item.children)` → `else` | Muy bajo |
| 2 | `src/index.css` | Agregada clase `.safe-area-bottom` | Muy bajo |

## Cambio aplicado

### SidebarMobileDrawer.tsx — Clasificación de items

**Antes:**
```ts
for (const item of menuItems) {
  if (item.label === 'Administración' && item.children) {
    adm = item;
  } else if (!item.children) {
    ops.push(item);
  }
}
```

**Después:**
```ts
for (const item of menuItems) {
  if (item.label === 'Administración' && item.children) {
    adm = item;
  } else {
    ops.push(item);
  }
}
```

**Efecto:** Todo item que no sea `'Administración'` (con o sin `children`) ahora se incluye en `operacionesItems` y se renderiza. Ningún item se descarta.

### index.css — Safe area para barra inferior móvil

```css
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

**Efecto:** La clase `safe-area-bottom` ya referenciada en `SidebarMobileBottomNav.tsx` ahora existe. En iPhones con notch / Dynamic Island, la barra inferior no queda tapada por el gesture bar.

## Casos probados

| # | Caso | Resultado |
|---|---|---|
| 1 | Usuario con `menu.casetilla.view` — desktop | Muestra Punto Control IN/OUT (sin cambios) |
| 2 | Usuario con `menu.casetilla.view` — móvil | Muestra Punto Control IN/OUT dentro del drawer "Más" |
| 3 | Click en Punto Control IN/OUT — móvil | Navega a `/casetilla` |
| 4 | Usuario sin `menu.casetilla.view` — desktop | No aparece (sin cambios) |
| 5 | Usuario sin `menu.casetilla.view` — móvil | No aparece |
| 6 | Administración — desktop | Submenú expandible (sin cambios) |
| 7 | Administración — móvil | Submenú expandible (sin cambios) |
| 8 | Items sin children — móvil | Aparecen normalmente (sin cambios) |
| 9 | Item futuro con children ≠ 'Administración' — móvil | Aparece como item plano, no se descarta |
| 10 | iPhone / emulación con safe-area | Barra inferior respeta el gesture bar |

## Compatibilidad desktop

- **Sin cambios.** El Sidebar desktop (`Sidebar.tsx`) no fue modificado.
- La clasificación de items desktop usa su propia lógica, independiente del drawer móvil.
- El único cambio es en `SidebarMobileDrawer.tsx`, que solo se renderiza con `lg:hidden`.

## Compatibilidad móvil

- **Bottom navigation (`SidebarMobileBottomNav.tsx`):** Sin cambios. Los items con `mobilePrimary: true` siguen apareciendo en la barra inferior.
- **Drawer "Más":** Ahora incluye items con `children` que no son `'Administración'`.
- **`safe-area-bottom`:** La clase ahora existe en CSS y aplica `padding-bottom` solo en dispositivos con notch/gesture bar.

## Riesgos restantes

1. **Riesgo muy bajo:** Si en el futuro se agrega un item con `children` que NO deba aparecer como item plano (ej. un submenú nativo en mobile), habrá que ajustar la lógica. Actualmente ningún item en `constants.ts` cumple ese perfil.
2. **Riesgo nulo:** El cambio no afecta permisos, rutas, autenticación, RLS, ni Supabase.
3. **Riesgo nulo:** El cambio no crea una lista de menú diferente entre desktop y mobile. Ambos usan el mismo `menuItems` de `constants.ts`, filtrado por los mismos permisos.

## Mejora UX pendiente

Evaluar si **Punto Control IN/OUT** debe configurarse como `mobilePrimary: true` en `constants.ts` para aparecer directamente en la barra inferior de 4 botones, en lugar de requerir un tap extra en "Más".

Esto es una decisión de producto, no un bug. Depende de la frecuencia de uso del módulo en mobile vs los otros módulos con `mobilePrimary`.