import { supabase } from '../lib/supabase';

export interface DockAllocationRule {
  clientId: string;
  clientName: string;
  dockAllocationMode: 'SEQUENTIAL' | 'ODD_FIRST' | 'NONE';
  allowAllDocks: boolean;
  /** client_docks ordered by dock_order */
  clientDocks: { dockId: string; dockOrder: number }[];
}

export const dockAllocationService = {
  /**
   * Given an orgId and clientId, fetch:
   *  1. The client rules (client_rules.dock_allocation_mode)
   *  2. The docks assigned to the client (client_docks with dock_order)
   *  3. The client name
   *
   * Input: { orgId, clientId }
   * NO provider resolution — the caller must supply clientId directly.
   */
  async getDockAllocationRule(
    orgId: string,
    clientId: string
  ): Promise<DockAllocationRule | null> {
    console.log('[DockAllocation] context', { orgId, clientId });

    if (!orgId || !clientId) {
      console.warn('[DockAllocation] missing clientId', { orgId, clientId });
      return null;
    }

    try {
      // 1. Load client_rules
      const { data: rules, error: rulesErr } = await supabase
        .from('client_rules')
        .select('dock_allocation_mode, allow_all_docks')
        .eq('org_id', orgId)
        .eq('client_id', clientId)
        .maybeSingle();

      if (rulesErr) {
        console.error('[DockAllocation] client_rules error', rulesErr);
        return null;
      }

      const mode = rules?.dock_allocation_mode || 'NONE';
      const allowAll = rules?.allow_all_docks ?? false;

      console.log('[DockAllocation] rule loaded', {
        dock_allocation_mode: mode,
        allow_all_docks: allowAll,
      });

      // 2. Load client_docks with dock_order
      const { data: cdRows, error: cdErr } = await supabase
        .from('client_docks')
        .select('dock_id, dock_order')
        .eq('org_id', orgId)
        .eq('client_id', clientId)
        .order('dock_order', { ascending: true });

      if (cdErr) {
        console.error('[DockAllocation] client_docks error', cdErr);
        return null;
      }

      const docks = (cdRows || []).map((r) => ({
        dockId: r.dock_id,
        dockOrder: r.dock_order ?? 999,
      }));

      console.log('[DockAllocation] docks ordered', {
        dockOrders: docks.map((d) => ({ id: d.dockId, order: d.dockOrder })),
      });

      // 3. Load client name
      const { data: clientRow } = await supabase
        .from('clients')
        .select('name')
        .eq('id', clientId)
        .maybeSingle();

      const result: DockAllocationRule = {
        clientId,
        clientName: clientRow?.name || '',
        dockAllocationMode: mode as DockAllocationRule['dockAllocationMode'],
        allowAllDocks: allowAll,
        clientDocks: docks,
      };

      console.log('[DockAllocation] rule loaded', {
        orgId,
        clientId,
        clientName: result.clientName,
        dock_allocation_mode: result.dockAllocationMode,
        allowAllDocks: result.allowAllDocks,
        clientDocksCount: docks.length,
      });

      return result;
    } catch (err) {
      console.error('[DockAllocation] unexpected error', err);
      return null;
    }
  },

  /**
   * Resolve the clientId linked to a provider within an org.
   * Uses client_providers table. Returns the first match or null.
   * Optionally filters by warehouseId via warehouse_clients.
   */
  async resolveClientIdFromProvider(
    orgId: string,
    providerId: string,
    warehouseId?: string | null
  ): Promise<string | null> {
    console.log('[DockAllocation] resolveClientIdFromProvider', {
      orgId,
      providerId,
      warehouseId,
    });

    if (!orgId || !providerId) return null;

    try {
      const { data: cpRows, error: cpErr } = await supabase
        .from('client_providers')
        .select('client_id')
        .eq('org_id', orgId)
        .eq('provider_id', providerId);

      if (cpErr || !cpRows || cpRows.length === 0) {
        console.warn('[DockAllocation] no client linked to provider', {
          providerId,
        });
        return null;
      }

      const clientIds = cpRows.map((r) => r.client_id);

      // If warehouse is specified, narrow down
      if (warehouseId) {
        const { data: wcRows } = await supabase
          .from('warehouse_clients')
          .select('client_id')
          .eq('org_id', orgId)
          .eq('warehouse_id', warehouseId)
          .in('client_id', clientIds);

        if (wcRows && wcRows.length > 0) {
          console.log('[DockAllocation] resolved clientId via warehouse', {
            clientId: wcRows[0].client_id,
          });
          return wcRows[0].client_id;
        }
      }

      // Fallback: first client from provider
      console.log('[DockAllocation] resolved clientId (first match)', {
        clientId: clientIds[0],
      });
      return clientIds[0];
    } catch (err) {
      console.error('[DockAllocation] resolveClientIdFromProvider error', err);
      return null;
    }
  },

  /**
   * Given a DockAllocationRule and the complete list of dock IDs,
   * returns the IDs of enabled docks according to the rule mode.
   *
   * - SEQUENTIAL: enable in order 1,2,3...
   * - ODD_FIRST: enable odd positions first (1,3,5...) then evens (2,4,6...)
   * - NONE / allow_all_docks: enable all
   */
  getEnabledDockIds(
    rule: DockAllocationRule | null,
    allDockIds: string[]
  ): { enabled: Set<string>; ordered: string[]; mode: string } {
    // If there is no rule, do not assume anything
    if (!rule) {
      console.warn('[DockAllocation] missing - no rule loaded');
      return { enabled: new Set<string>(), ordered: [], mode: 'MISSING' };
    }

    // If allow_all_docks, enable everything
    if (rule.allowAllDocks) {
      console.log('[DockAllocation] enabled docks', {
        mode: 'ALLOW_ALL',
        enabledDockIds: allDockIds,
      });
      return {
        enabled: new Set(allDockIds),
        ordered: allDockIds,
        mode: 'ALLOW_ALL',
      };
    }

    // If the client has no assigned docks, enable none
    if (rule.clientDocks.length === 0) {
      console.warn('[DockAllocation] no client_docks assigned');
      return { enabled: new Set<string>(), ordered: [], mode: rule.dockAllocationMode };
    }

    // Keep only docks that exist in the current view
    const validDocks = rule.clientDocks.filter((cd) => allDockIds.includes(cd.dockId));

    let ordered: string[];

    if (rule.dockAllocationMode === 'ODD_FIRST') {
      // Odds first (dockOrder 1,3,5...) then evens (2,4,6...)
      const odds = validDocks
        .filter((cd) => cd.dockOrder % 2 !== 0)
        .sort((a, b) => a.dockOrder - b.dockOrder);
      const evens = validDocks
        .filter((cd) => cd.dockOrder % 2 === 0)
        .sort((a, b) => a.dockOrder - b.dockOrder);
      ordered = [...odds.map((d) => d.dockId), ...evens.map((d) => d.dockId)];
    } else {
      // SEQUENTIAL or NONE -> natural order by dockOrder
      ordered = validDocks
        .sort((a, b) => a.dockOrder - b.dockOrder)
        .map((d) => d.dockId);
    }

    console.log('[DockAllocation] enabled docks', {
      mode: rule.dockAllocationMode,
      totalClientDocks: rule.clientDocks.length,
      validInView: validDocks.length,
      enabledDockIds: ordered,
      enabledCount: ordered.length,
    });

    return {
      enabled: new Set(ordered),
      ordered,
      mode: rule.dockAllocationMode,
    };
  },

  /**
   * Pure helper — per-slot dock enablement.
   *
   * Given the client docks, allocation mode, current reservations and a
   * specific time-slot window, returns the Set of dock IDs that should be
   * clickable for that slot.
   *
   * Logic:
   *  1. Compute busyDockIds = docks with a non-cancelled reservation overlapping the slot.
   *  2. freeDocks = clientDocks minus busy.
   *  3. If mode === 'ODD_FIRST':
   *       - If there are free docks with odd dock_order → enabled = those.
   *       - Else → enabled = free docks with even dock_order.
   *  4. If mode === 'SEQUENTIAL' (or anything else): enabled = all free.
   *
   * @returns Set<dock_id>
   */
  getEnabledDockIdsForSlot(
    clientDocks: { dockId: string; dockOrder: number }[],
    mode: 'SEQUENTIAL' | 'ODD_FIRST' | 'NONE' | null | undefined,
    reservations: { dock_id: string; start_datetime: string; end_datetime: string; is_cancelled: boolean }[],
    slotStart: Date,
    slotEnd: Date
  ): Set<string> {
    // 1. Busy docks: non-cancelled reservations overlapping [slotStart, slotEnd)
    const busyDockIds = new Set<string>();
    for (const r of reservations) {
      if (r.is_cancelled) continue;
      const rStart = new Date(r.start_datetime);
      const rEnd = new Date(r.end_datetime);
      if (rStart < slotEnd && rEnd > slotStart) {
        busyDockIds.add(r.dock_id);
      }
    }

    // 2. Free = clientDocks not busy
    const freeDocks = clientDocks.filter((cd) => !busyDockIds.has(cd.dockId));

    let enabled: Set<string>;

    if (mode === 'ODD_FIRST') {
      const freeOdds = freeDocks.filter((cd) => cd.dockOrder % 2 !== 0);
      if (freeOdds.length > 0) {
        enabled = new Set(freeOdds.map((d) => d.dockId));
      } else {
        // No free odds → fall back to free evens
        const freeEvens = freeDocks.filter((cd) => cd.dockOrder % 2 === 0);
        enabled = new Set(freeEvens.map((d) => d.dockId));
      }
    } else {
      // SEQUENTIAL / NONE / null → all free client docks
      enabled = new Set(freeDocks.map((d) => d.dockId));
    }

    console.log('[DockAllocation][Slot]', {
      slotStart: slotStart.toISOString(),
      slotEnd: slotEnd.toISOString(),
      busyDockIds: [...busyDockIds],
      enabledDockIds: [...enabled],
      mode: mode || 'SEQUENTIAL',
    });

    return enabled;
  },
};
