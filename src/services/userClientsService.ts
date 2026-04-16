import { supabase } from '../lib/supabase';

export interface UserClient {
  id: string;
  name: string;
}

export const userClientsService = {
  /**
   * Obtiene los clientes explícitamente asignados a un usuario.
   * Si la lista está vacía, el usuario no tiene restricción de cliente
   * (hereda todos los clientes de sus almacenes).
   */
  async getUserClients(orgId: string, userId: string): Promise<UserClient[]> {
    const { data, error } = await supabase
      .from('user_clients')
      .select(`
        client_id,
        clients!user_clients_client_id_fkey (
          id,
          name,
          is_active
        )
      `)
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (error) throw error;

    return (data ?? [])
      .filter((r: any) => r.clients?.is_active === true)
      .map((r: any) => ({
        id: r.clients.id,
        name: r.clients.name,
      }));
  },

  /**
   * Asigna clientes a un usuario (diff inteligente: insert nuevos, delete removidos).
   * Pasar clientIds=[] limpia todas las asignaciones (sin restricción de cliente).
   */
  async setUserClients(orgId: string, userId: string, clientIds: string[]): Promise<void> {
    // 1. Obtener asignaciones actuales
    const { data: currentRows, error: fetchErr } = await supabase
      .from('user_clients')
      .select('client_id')
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (fetchErr) throw fetchErr;

    const currentIds = (currentRows ?? []).map((r: any) => r.client_id as string);

    const toInsert = clientIds.filter((id) => !currentIds.includes(id));
    const toDelete = currentIds.filter((id) => !clientIds.includes(id));

    // 2. Eliminar los removidos
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from('user_clients')
        .delete()
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .in('client_id', toDelete);

      if (delErr) throw delErr;
    }

    // 3. Insertar los nuevos
    if (toInsert.length > 0) {
      const rows = toInsert.map((clientId) => ({
        org_id: orgId,
        user_id: userId,
        client_id: clientId,
      }));

      const { error: insErr } = await supabase
        .from('user_clients')
        .insert(rows);

      if (insErr) throw insErr;
    }
  },
};
