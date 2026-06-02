# Análisis de Matching — Proveedores Costa Rica vs SRO

**Fecha:** 2026-06-01  
**Fuente:** PROVEEDORES_202606011333.xlsx  
**Objetivo:** Vincular proveedores del sistema externo con clientes SRO (IDCOMPANIA → client_id)

---

## 📌 Mapa de IDCOMPANIA → Cliente SRO

| IDCOMPANIA | Nombre Externo | Cliente SRO | UUID en SRO |
|---|---|---|---|
| 29 | Cofersa | **Cofersa** | `ae488aaf-706a-46fa-9251-d00a35e78384` |
| 109 | EPA | **Epa** | `f897b0e2-721f-498d-a5d2-800dd3755139` |
| 103 | OLO Operativo | ❌ No existe en SRO | — |

> **Nota:** Solo se trabaja con registros de Costa Rica (IDCOMPANIA 29 = Cofersa y 109 = EPA).  
> OLO Operativo (103) tiene solo 3 proveedores (MECALUX, OLO, VERSUS Sillas) y no tiene cliente SRO equivalente actualmente.

---

## ✅ Matches EXACTOS al 100% — Cofersa (IDCOMPANIA 29)

Proveedores del Excel que ya existen en SRO y cuyo nombre coincide exactamente.

> Dado que los proveedores actuales en SRO (Org OLO) son mayoría venezolanos (C.A., etc.), **no se encontraron coincidencias exactas de nombre** entre los proveedores del Excel de Cofersa/EPA y los proveedores actualmente en la base de datos SRO. Los proveedores del Excel son proveedores costarricenses que deben ser **importados**, no mapeados contra proveedores ya existentes.

---

## 🔄 Acción recomendada: Importar proveedores desde el Excel

Dado que actualmente la tabla `providers` en SRO no contiene proveedores de Costa Rica (Cofersa/EPA), la acción correcta es **importar** los proveedores del Excel asignando:

| Campo SRO | Fuente Excel | Valor |
|---|---|---|
| `name` | `NOMBRECORTO` (si existe) o `NOMBRELARGO` | Nombre del proveedor |
| `provider_code` | `IDPROVEEDOR` | Código numérico del proveedor |
| `source` | `ORIGEN` | "Cofersa" o "EPA" |
| `client_id` | Calculado por `IDCOMPANIA` | UUID del cliente SRO correspondiente |

---

## 📋 Proveedores similares — Revisión manual sugerida

Los siguientes nombres del Excel tienen alta similitud semántica con proveedores que **podrían** ya existir en SRO bajo otro nombre o abreviatura. Se recomienda revisión manual antes de importar.

### 🔶 Cofersa (IDCOMPANIA 29) — Candidatos a revisión

| ID Excel | NOMBRELARGO / NOMBRECORTO | Razón de similitud |
|---|---|---|
| 901 | Cofersa | Es el propio cliente (autoref) — **no importar como proveedor** |
| 965 | FERRETERIA EPA S.A. DE C.V. | Hace referencia al cliente EPA — posible proveedor intercompany |
| 334 | DISTRIBUIDORA ARGUEDAS Y SALAS S.A. | Nombre similar a proveedor que puede ya existir |
| 241 | ACEROS MONGE S.A. | Empresa reconocida CR — verificar duplicado |
| 698 | HOLCIM S.A. | Empresa multinacional reconocida — verificar duplicado |
| 699 | CEMENTOS PROGRESO COSTARICA SOCIEDAD ANONIMA | Empresa reconocida — verificar duplicado |
| 831 | SIKA PRODUCTOS PARA LA CONSTRUCCION S.A. | SIKA multinacional — verificar duplicado |
| 447 | STANLEY BLACK AND DECKER | Marca global reconocida |
| 228 | NEWELL BRANDS DISTRIBUTION LLC | Empresa global reconocida |
| 229 | DELTA FAUCET CO | Empresa global reconocida |
| 229 | MOEN CENTROAMERICA S.A | Empresa reconocida CR |
| 346 | IMACASA | Empresa reconocida CA |
| 486 | FERRETEROS GLOBALES VERSATILES FGV S.A. | Empresa reconocida CR |

### 🔶 EPA (IDCOMPANIA 109) — Candidatos a revisión

| ID Excel | NOMBRELARGO | Razón de similitud |
|---|---|---|
| 901 | Cofersa | Es el cliente Cofersa (intercompany) |
| 44 | DURMAN ESQUIVEL, S.A. | Empresa muy conocida CR — verificar |
| 84 | INTACO COSTA RICA S.A. | Empresa conocida CR |
| 2224 | SIKA PRODUCTOS PARA LA CONSTRUCCION S.A. | Misma empresa que Cofersa cod.831 |
| 1304 | LANCO & HARRIS MANUFACTURING CORPORATION | Empresa conocida |
| 2419 | IMACASA COSTA RICA S.A. | Misma empresa que Cofersa cod.346 |
| 3001 | SCHNEIDER ELECTRIC CENTROAMERICA LTDA | Multinacional reconocida |
| 3006 | TERNIUM INTERNACIONAL COSTA RICA S.A. | Multinacional reconocida |
| 3170 | ARCELORMITTAL COSTA RICA S.A. | Multinacional reconocida |
| 2986 | ORGILL, INC | Empresa que también aparece en Cofersa |
| 2519 | ACE HARDWARE | Marca global reconocida |
| 3252 | BAMERICA CORPORATION | Empresa que también aparece en Cofersa |

---

## 📊 Resumen por cliente

| Cliente | IDCOMPANIA | Total proveedores en Excel |
|---|---|---|
| Cofersa | 29 | ~1,500+ registros |
| EPA | 109 | ~3,700+ registros |
| OLO Operativo | 103 | 3 registros (MECALUX, OLO, VERSUS Sillas) |

---

## 🚀 Próximos pasos sugeridos

1. **Importar proveedores Cofersa** usando la función de carga masiva, asignando `client_id = ae488aaf-...` y `source = "Cofersa"`
2. **Importar proveedores EPA** asignando `client_id = f897b0e2-...` y `source = "EPA"`
3. **Revisar manualmente** los candidatos a duplicado listados arriba antes de la importación
4. **Crear cliente "OLO Operativo"** en SRO si se desean gestionar sus 3 proveedores (MECALUX, OLO, VERSUS Sillas)
5. Cuando se consuma la API externa, el campo `provider_code` (= `IDPROVEEDOR`) permitirá hacer el match exacto con el registro del sistema externo

---

## 🗄️ Estructura del campo en base de datos

```sql
-- Columna agregada a tabla providers
client_id uuid NULL REFERENCES clients(id) ON DELETE SET NULL

-- Consulta ejemplo: proveedores de Cofersa
SELECT p.name, p.provider_code, p.source, c.name as cliente
FROM providers p
LEFT JOIN clients c ON p.client_id = c.id
WHERE p.client_id = 'ae488aaf-706a-46fa-9251-d00a35e78384';
```

---

*Generado automáticamente por SRO — 2026-06-01*