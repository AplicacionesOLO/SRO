/**
 * ============================================
 * MANPOWER CONTROL SERVICE
 * ============================================
 * 
 * Servicio para obtener contadores y estadísticas del módulo Manpower.
 * 
 * IMPORTANTE - BUENAS PRÁCTICAS RLS:
 * 
 * 1. Evitar políticas RLS recursivas:
 *    - No usar funciones que consulten tablas que dependan de permisos circulares
 *    - Mantener políticas simples: org_id = current_org_id()
 * 
 * 2. Patrón recomendado para RLS:
 *    - current_org_id() retorna org actual del usuario
 *    - Políticas por tabla: org_id IN (SELECT org_id FROM user_org_roles WHERE user_id = auth.uid())
 * 
 * 3. Funciones de permisos:
 *    - Si has_org_permission() consulta tablas con RLS, puede causar bucles
 *    - Marcar SECURITY DEFINER solo si se entiende el impacto
 *    - Limitar con search_path para evitar inyección
 * 
 * 4. Testing:
 *    - Probar queries mínimas antes de integrar
 *    - Verificar que no haya recursión infinita
 *    - Usar vistas materializadas para lógica compleja
 * 
 * Este servicio hace queries simples y agrupa en JS para evitar problemas RLS.
 */

import { supabase } from '../lib/supabase';

export interface CountryStats {
  id: string;
  name: string;
  totalCollaborators: number;
}

export interface WarehouseStats {
  id: string;
  name: string;
  totalCollaborators: number;
  totalRecords: number;
}

export interface WorkTypeStats {
  id: string;
  name: string;
  totalCollaborators: number;
}

export interface ControlData {
  countries: CountryStats[];
  warehouses: WarehouseStats[];
  workTypes: WorkTypeStats[];
}

class ManpowerControlService {
  /**
   * Obtiene todos los datos necesarios para el modal de Control
   * Hace queries simples y agrupa en JS para evitar problemas RLS
   */
  async getControlData(orgId: string): Promise<ControlData> {
    try {
      // 1. Obtener colaboradores (solo campos necesarios)
      const { data: collaborators, error: collabError } = await supabase
        .from('collaborators')
        .select('id, country_id, work_type_id')
        .eq('org_id', orgId);

      if (collabError) throw collabError;

      // 2. Obtener relaciones colaborador-almacén
      const { data: collabWarehouses, error: cwError } = await supabase
        .from('collaborator_warehouses')
        .select('collaborator_id, warehouse_id')
        .eq('org_id', orgId);

      if (cwError) throw cwError;

      // 3. Obtener almacenes (SIN is_active porque no existe)
      const { data: warehouses, error: whError } = await supabase
        .from('warehouses')
        .select('id, name, country_id')
        .eq('org_id', orgId);

      if (whError) throw whError;

      // 4. Obtener países (CON is_active)
      const { data: countries, error: countriesError } = await supabase
        .from('countries')
        .select('id, name')
        .eq('org_id', orgId)
        .eq('is_active', true);

      if (countriesError) throw countriesError;

      // 5. Obtener tipos de trabajo (CON is_active)
      const { data: workTypes, error: wtError } = await supabase
        .from('work_types')
        .select('id, name')
        .eq('org_id', orgId)
        .eq('is_active', true);

      if (wtError) throw wtError;

      // Agrupar en JS para evitar problemas RLS
      const collabArray = collaborators || [];
      const cwArray = collabWarehouses || [];
      const whArray = warehouses || [];
      const countriesArray = countries || [];
      const wtArray = workTypes || [];

      // Calcular estadísticas por país
      const countryStats: CountryStats[] = countriesArray.map(country => {
        const total = collabArray.filter(c => c.country_id === country.id).length;
        return {
          id: country.id,
          name: country.name,
          totalCollaborators: total
        };
      }).filter(c => c.totalCollaborators > 0);

      // Calcular estadísticas por almacén
      const warehouseStats: WarehouseStats[] = whArray.map(warehouse => {
        // Obtener IDs de colaboradores asociados a este almacén
        const collabIds = cwArray
          .filter(cw => cw.warehouse_id === warehouse.id)
          .map(cw => cw.collaborator_id);

        // Contar colaboradores únicos
        const uniqueCollabIds = [...new Set(collabIds)];
        const totalCollaborators = uniqueCollabIds.length;

        // Total de registros = filas en collaborator_warehouses
        const totalRecords = collabIds.length;

        return {
          id: warehouse.id,
          name: warehouse.name,
          totalCollaborators,
          totalRecords
        };
      }).filter(w => w.totalCollaborators > 0);

      // Calcular estadísticas por tipo de trabajo
      const workTypeStats: WorkTypeStats[] = wtArray.map(workType => {
        const total = collabArray.filter(c => c.work_type_id === workType.id).length;
        return {
          id: workType.id,
          name: workType.name,
          totalCollaborators: total
        };
      }).filter(wt => wt.totalCollaborators > 0);

      return {
        countries: countryStats.sort((a, b) => b.totalCollaborators - a.totalCollaborators),
        warehouses: warehouseStats.sort((a, b) => b.totalCollaborators - a.totalCollaborators),
        workTypes: workTypeStats.sort((a, b) => b.totalCollaborators - a.totalCollaborators)
      };
    } catch (error) {
      console.error('[ManpowerControlService] Error getting control data:', error);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de almacenes filtradas por país
   */
  getWarehousesByCountry(data: ControlData, countryId: string): WarehouseStats[] {
    // Filtrar almacenes del país seleccionado
    // Nota: necesitamos el country_id en warehouses, lo obtendremos en la query principal
    return data.warehouses.filter(w => {
      // Por ahora retornamos todos, pero en la implementación real
      // necesitamos agregar country_id a WarehouseStats
      return true;
    });
  }

  /**
   * Obtiene estadísticas de tipos de trabajo filtradas por país y almacén
   */
  async getWorkTypesByWarehouse(
    orgId: string,
    countryId: string,
    warehouseId: string
  ): Promise<WorkTypeStats[]> {
    try {
      // 1. Obtener colaboradores del país
      const { data: collaborators, error: collabError } = await supabase
        .from('collaborators')
        .select('id, work_type_id')
        .eq('org_id', orgId)
        .eq('country_id', countryId)
        .eq('is_active', true);

      if (collabError) throw collabError;

      // 2. Obtener colaboradores del almacén
      const { data: collabWarehouses, error: cwError } = await supabase
        .from('collaborator_warehouses')
        .select('collaborator_id')
        .eq('org_id', orgId)
        .eq('warehouse_id', warehouseId);

      if (cwError) throw cwError;

      // 3. Obtener tipos de trabajo
      const { data: workTypes, error: wtError } = await supabase
        .from('work_types')
        .select('id, name')
        .eq('org_id', orgId)
        .eq('is_active', true);

      if (wtError) throw wtError;

      // Filtrar colaboradores que estén en el almacén
      const warehouseCollabIds = new Set(
        (collabWarehouses || []).map(cw => cw.collaborator_id)
      );

      const filteredCollabs = (collaborators || []).filter(c =>
        warehouseCollabIds.has(c.id)
      );

      // Agrupar por tipo de trabajo
      const workTypeStats: WorkTypeStats[] = (workTypes || []).map(wt => {
        const total = filteredCollabs.filter(c => c.work_type_id === wt.id).length;
        return {
          id: wt.id,
          name: wt.name,
          totalCollaborators: total
        };
      }).filter(wt => wt.totalCollaborators > 0);

      return workTypeStats.sort((a, b) => b.totalCollaborators - a.totalCollaborators);
    } catch (error) {
      console.error('[ManpowerControlService] Error getting work types by warehouse:', error);
      throw error;
    }
  }
}

export const manpowerControlService = new ManpowerControlService();
