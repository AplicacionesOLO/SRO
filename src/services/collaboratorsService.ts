import { supabase } from '../lib/supabase';
import type { Collaborator, CollaboratorFormData, WorkType } from '../types/collaborator';

export const collaboratorsService = {
  // Enriquecer colaboradores con sus almacenes
async enrichWithWarehouses(orgId: string, collaborators: any[]): Promise<Collaborator[]> {
  if (!collaborators.length) return [];

  const collaboratorIds = collaborators.map(c => c.id);

  // 1) Traer solo links (sin join embebido)
  const { data: links, error: linkErr } = await supabase
    .from('collaborator_warehouses')
    .select('collaborator_id, warehouse_id')
    .eq('org_id', orgId)
    .in('collaborator_id', collaboratorIds);

  if (linkErr) {
    console.error('Error fetching warehouse links:', linkErr);
    return collaborators;
  }

  const warehouseIds = Array.from(new Set((links ?? []).map(l => l.warehouse_id))).filter(Boolean);

  // 2) Traer warehouses por ids (segunda query)
  let warehousesById = new Map<string, any>();
  if (warehouseIds.length) {
    const { data: whs, error: whErr } = await supabase
      .from('warehouses')
      .select('id, name')
      .eq('org_id', orgId)
      .in('id', warehouseIds);

    if (whErr) {
      console.error('Error fetching warehouses:', whErr);
      return collaborators;
    }

    (whs ?? []).forEach(w => warehousesById.set(w.id, w));
  }

  // 3) Agrupar por collaborator_id
  const byCollaborator = new Map<string, any[]>();
  (links ?? []).forEach(l => {
    const w = warehousesById.get(l.warehouse_id);
    if (!w) return;
    if (!byCollaborator.has(l.collaborator_id)) byCollaborator.set(l.collaborator_id, []);
    byCollaborator.get(l.collaborator_id)!.push(w);
  });

  return collaborators.map(c => ({
    ...c,
    warehouses: byCollaborator.get(c.id) || []
  }));
},

  // =========================
  // Get Collaborators (para pintar tabla)
  // =========================
  async getCollaborators(
    orgId: string,
    filters?: {
      viewAll?: boolean;
      countryId?: string;
      warehouseId?: string;
      search?: string;
      active?: 'ALL' | 'ACTIVE' | 'INACTIVE';
    }
  ): Promise<Collaborator[]> {
    try {
      const viewAll = !!filters?.viewAll;
      const countryId = filters?.countryId || '';
      const warehouseId = filters?.warehouseId || '';
      const search = (filters?.search || '').trim();
      const active = filters?.active || 'ALL';

      // Si no es "ver todo" y no hay filtros mínimos, no devolvemos nada (para evitar traer todo)
      if (!viewAll && !countryId && !warehouseId) return [];

      // Base query
      let q = supabase
        .from('collaborators')
        .select(`*`)
        .eq('org_id', orgId)
        .order('full_name', { ascending: true });

      // Filtro país
      if (countryId) q = q.eq('country_id', countryId);

      // Filtro activo
      if (active === 'ACTIVE') q = q.eq('is_active', true);
      if (active === 'INACTIVE') q = q.eq('is_active', false);

      // Filtro búsqueda (nombre / ficha / cédula)
      if (search) {
        const s = search.replace(/,/g, '');
        q = q.or(
          `full_name.ilike.%${s}%,ficha.ilike.%${s}%,cedula.ilike.%${s}%`
        );
      }

      // Filtro por almacén (tabla pivote)
      if (warehouseId) {
        const { data: links, error: linkErr } = await supabase
          .from('collaborator_warehouses')
          .select('collaborator_id')
          .eq('org_id', orgId)
          .eq('warehouse_id', warehouseId);

        if (linkErr) {
          console.error('[CollaboratorsService] warehouse filter error', linkErr);
          throw new Error(`Error filtrando por almacén: ${linkErr.message}`);
        }

        const ids = (links ?? []).map((r: any) => r.collaborator_id);
        if (!ids.length) return [];

        q = q.in('id', ids);
      }

      const { data, error } = await q;

      if (error) {
        console.error('[CollaboratorsService] getCollaborators error', error);
        throw new Error(`Error al cargar colaboradores: ${error.message}`);
      }

      // Enriquecer con almacenes asignados
      return await this.enrichWithWarehouses(orgId, data ?? []);
    } catch (err) {
      console.error('[CollaboratorsService] getCollaborators exception', err);
      throw err;
    }
  },

  // =========================
  // Create Collaborator (✅ ÚNICA)
  // =========================
  async createCollaborator(
    orgId: string,
    userId: string,
    data: CollaboratorFormData
  ): Promise<Collaborator> {
    try {
      console.log('[CollaboratorsService] createCollaborator', {
        orgId,
        userId,
        data
      });

      const payload: any = {
        org_id: orgId,
        full_name: data.full_name,
        ficha: data.ficha || null,
        cedula: data.cedula || null,
        country_id: data.country_id,
        work_type_id: data.work_type_id,
        is_active: data.is_active,
        // ✅ NO created_by
      };

      const { data: inserted, error } = await supabase
        .from('collaborators')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        console.error('[CollaboratorsService] create error', error);
        throw new Error(`Error al crear colaborador: ${error.message}`);
      }

      // ✅ Insertar relaciones con almacenes (SIN created_by)
      if (data.warehouse_ids?.length) {
        const rows = data.warehouse_ids.map((warehouseId: string) => ({
          org_id: orgId,
          collaborator_id: inserted.id,
          warehouse_id: warehouseId
        }));

        const { error: whError } = await supabase
          .from('collaborator_warehouses')
          .insert(rows);

        if (whError) {
          console.error('[CollaboratorsService] warehouses assign error', whError);

          // rollback simple
          await supabase.from('collaborators').delete().eq('id', inserted.id).eq('org_id', orgId);

          throw new Error(`Error asignando almacenes: ${whError.message}`);
        }
      }

      return inserted as Collaborator;
    } catch (err) {
      console.error('[CollaboratorsService] createCollaborator exception', err);
      throw err;
    }
  },

  // Actualizar colaborador
  async updateCollaborator(
    orgId: string,
    userId: string,
    collaboratorId: string,
    data: CollaboratorFormData
  ): Promise<Collaborator> {
    const { warehouse_ids, ...collaboratorData } = data;

    const { data: updatedCollaborator, error: collaboratorError } = await supabase
      .from('collaborators')
      .update({
        ...collaboratorData,
        updated_at: new Date().toISOString(),
        // ✅ si tu tabla NO tiene updated_by, quitá esta línea también
        updated_by: userId
      })
      .eq('id', collaboratorId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (collaboratorError) {
      console.error('Error updating collaborator:', collaboratorError);
      throw new Error(`Error al actualizar colaborador: ${collaboratorError.message}`);
    }

    const { error: deleteError } = await supabase
      .from('collaborator_warehouses')
      .delete()
      .eq('collaborator_id', collaboratorId)
      .eq('org_id', orgId);

    if (deleteError) {
      console.error('Error deleting warehouse links:', deleteError);
      throw new Error(`Error al actualizar almacenes: ${deleteError.message}`);
    }

    if (warehouse_ids.length > 0) {
      const warehouseLinks = warehouse_ids.map(warehouseId => ({
        org_id: orgId,
        collaborator_id: collaboratorId,
        warehouse_id: warehouseId
        // ✅ NO created_by
      }));

      const { error: linkError } = await supabase
        .from('collaborator_warehouses')
        .insert(warehouseLinks);

      if (linkError) {
        console.error('Error linking warehouses:', linkError);
        throw new Error(`Error al asignar almacenes: ${linkError.message}`);
      }
    }

    return updatedCollaborator;
  },

  // Eliminar colaborador
  async deleteCollaborator(orgId: string, collaboratorId: string): Promise<void> {
    const { error } = await supabase
      .from('collaborators')
      .delete()
      .eq('id', collaboratorId)
      .eq('org_id', orgId);

    if (error) {
      console.error('Error deleting collaborator:', error);
      throw new Error(`Error al eliminar colaborador: ${error.message}`);
    }
  },

  // =========================
  // Work Types
  // =========================
  async getWorkTypes(orgId: string) {
    try {
      console.log('[CollaboratorsService] getWorkTypes', { orgId });

      const { data, error } = await supabase
        .from('work_types')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching work types:', error);
        throw new Error(`Error al obtener tipos de trabajo: ${error.message}`);
      }

      return data ?? [];
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('work_types.active') || msg.includes('column work_types.active does not exist')) {
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('work_types')
          .select('*')
          .eq('org_id', orgId)
          .eq('active', true)
          .order('name', { ascending: true });

        if (fallbackErr) {
          console.error('Error fetching work types (fallback active):', fallbackErr);
          throw new Error(`Error al obtener tipos de trabajo: ${fallbackErr.message}`);
        }

        return fallbackData ?? [];
      }

      throw err;
    }
  }
};
