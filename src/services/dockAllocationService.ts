import { supabase } from '../lib/supabase';

export interface DockAllocationRule {
  clientId: string;
  clientName: string;
  dockAllocationMode: 'SEQUENTIAL' | 'ODD_FIRST' | 'NONE';
  allowAllDocks: boolean;
  /** client_docks ordered by dock_order */
  clientDocks: { dockId: string; dockOrder: number }[];
}

export interface DockIntersectionResult {
  rule: DockAllocationRule | null;
  missingProviderNames: string[]; // proveedores sin cliente vinculado
  error?: string;
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
    if (!orgId || !clientId) {
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
        return null;
      }

      const mode = rules?.dock_allocation_mode || 'NONE';
      const allowAll = rules?.allow_all_docks ?? false;

      // 2. Load client_docks with dock_order
      const { data: cdRows, error: cdErr } = await supabase
        .from('client_docks')
        .select('dock_id, dock_order')
        .eq('org_id', orgId)
        .eq('client_id', clientId)
        .order('dock_order', { ascending: true });

      if (cdErr) {
        return null;
      }

      const docks = (cdRows || []).map((r) => ({
        dockId: r.dock_id,
        dockOrder: r.dock_order ?? 999,
      }));

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

      return result;
    } catch (err) {
      return null;
    }
  },

  /**
   * NEW: Given an orgId and a providerId, resolve ALL client_ids linked to that
   * provider, optionally narrowed by warehouse_id via warehouse_clients.
   * Returns the array of valid client_ids (or empty array if none).
   *
   * Unlike resolveClientIdFromProvider (which returns only the first match),
   * this returns every client linked to the provider.
   */
  async resolveClientIdsFromProvider(
    orgId: string,
    providerId: string,
    warehouseId?: string | null
  ): Promise<string[]> {
    if (!orgId || !providerId) return [];

    try {
      const { data: cpRows, error: cpErr } = await supabase
        .from('client_providers')
        .select('client_id')
        .eq('org_id', orgId)
        .eq('provider_id', providerId);

      if (cpErr || !cpRows || cpRows.length === 0) {
        return [];
      }

      const clientIds = [...new Set(cpRows.map((r) => r.client_id))];

      if (warehouseId && clientIds.length > 0) {
        const { data: wcRows } = await supabase
          .from('warehouse_clients')
          .select('client_id')
          .eq('org_id', orgId)
          .eq('warehouse_id', warehouseId)
          .in('client_id', clientIds);

        if (wcRows && wcRows.length > 0) {
          return [...new Set(wcRows.map((r) => r.client_id))];
        }
        // If warehouse is specified but no warehouse_clients match, fall through
        // to returning all provider clients (provider is valid in the org)
      }

      return clientIds;
    } catch (err) {
      return [];
    }
  },

  /**
   * NEW: Build a combined DockAllocationRule from multiple clients.
   *
   * - Merges client_docks from all clients, deduplicating by dock_id.
   * - Preserves dock_order from the first occurrence when duplicate.
   * - If ANY client has allow_all_docks = true, the combined rule allows all docks
   *   (caller must then pass the complete warehouse dock list to getEnabledDockIds).
   * - dock_allocation_mode: if all clients agree, use that; otherwise fallback to SEQUENTIAL.
   */
  async getDockAllocationRuleForClients(
    orgId: string,
    clientIds: string[]
  ): Promise<DockAllocationRule | null> {
    if (!orgId || clientIds.length === 0) return null;

    try {
      // Load all client_rules for these clients
      const { data: rulesRows, error: rulesErr } = await supabase
        .from('client_rules')
        .select('client_id, dock_allocation_mode, allow_all_docks')
        .eq('org_id', orgId)
        .in('client_id', clientIds);

      if (rulesErr) return null;

      // Load all client_docks for these clients
      const { data: cdRows, error: cdErr } = await supabase
        .from('client_docks')
        .select('client_id, dock_id, dock_order')
        .eq('org_id', orgId)
        .in('client_id', clientIds)
        .order('dock_order', { ascending: true });

      if (cdErr) return null;

      // Load client names
      const { data: clientNameRows } = await supabase
        .from('clients')
        .select('id, name')
        .eq('org_id', orgId)
        .in('id', clientIds);

      const nameMap = new Map((clientNameRows || []).map((c: any) => [c.id, c.name]));

      // Determine combined allowAllDocks: OR of all clients
      let allowAllDocks = false;
      const modes = new Set<string>();

      for (const r of (rulesRows || []) as any[]) {
        if (r.allow_all_docks === true) allowAllDocks = true;
        modes.add((r.dock_allocation_mode || 'NONE') as string);
      }

      // Determine combined mode
      let combinedMode: DockAllocationRule['dockAllocationMode'] = 'SEQUENTIAL';
      if (modes.size === 1) {
        const soleMode = [...modes][0] as DockAllocationRule['dockAllocationMode'];
        combinedMode = soleMode;
      } else {
        combinedMode = 'SEQUENTIAL'; // safe fallback when clients disagree
      }

      // Merge clientDocks: deduplicate by dock_id, keep first dock_order seen
      const dockMap = new Map<string, number>();
      for (const cd of (cdRows || []) as any[]) {
        const did = cd.dock_id as string;
        const order = (cd.dock_order ?? 999) as number;
        if (!dockMap.has(did)) {
          dockMap.set(did, order);
        }
      }

      const mergedDocks = Array.from(dockMap.entries())
        .map(([dockId, dockOrder]) => ({ dockId, dockOrder }))
        .sort((a, b) => a.dockOrder - b.dockOrder);

      // Use first clientId as the "primary" clientId for the rule
      const primaryClientId = clientIds[0];
      const clientNames = clientIds
        .map((id) => nameMap.get(id))
        .filter(Boolean)
        .join(', ');

      const result: DockAllocationRule = {
        clientId: primaryClientId,
        clientName: clientNames || 'Cliente',
        dockAllocationMode: combinedMode,
        allowAllDocks,
        clientDocks: mergedDocks,
      };

      return result;
    } catch (err) {
      return null;
    }
  },

  /**
   * NEW: Compute the intersection of allowed docks across ALL providers in a consolidated reservation.
   *
   * For each provider:
   *   1. Resolve client_ids via client_providers (+ optional warehouse_clients filter).
   *   2. If no clients -> provider is "missing" and will be reported.
   *   3. Load client_rules and client_docks for those client(s).
   *   4. Determine the dock set for this provider (allow_all_docks? all docks : union of client_docks).
   *   5. Intersect all provider dock sets.
   *
   * The resulting rule:
   *   - clientId = primary (first client's id)
   *   - clientName = joined provider names (for display)
   *   - allowAllDocks = true ONLY if ALL providers allowAllDocks and intersection is not empty
   *   - clientDocks = ordered intersection, preserving dock_order from first occurrence
   *   - mode = if all agree, use that; otherwise SEQUENTIAL
   */
  async getDockAllocationIntersectionRule(
    orgId: string,
    providerIds: string[],
    providerNameMap: Record<string, string>,
    warehouseId?: string | null,
    allDockIds?: string[]
  ): Promise<DockIntersectionResult> {
    if (!orgId || providerIds.length === 0) {
      return { rule: null, missingProviderNames: [], error: 'No hay proveedores en el consolidado.' };
    }

    try {
      const providerDockSets: Array<{
        providerId: string;
        clientIds: string[];
        allowAll: boolean;
        docks: { dockId: string; dockOrder: number }[];
        mode: string;
      }> = [];

      for (const providerId of providerIds) {
        const clientIds = await this.resolveClientIdsFromProvider(orgId, providerId, warehouseId);

        if (clientIds.length === 0) {
          return {
            rule: null,
            missingProviderNames: [providerNameMap[providerId] || providerId],
            error: `El proveedor ${providerNameMap[providerId] || providerId} no tiene cliente vinculado.`,
          };
        }

        // Load client_rules for this provider's clients
        const { data: rulesRows } = await supabase
          .from('client_rules')
          .select('client_id, dock_allocation_mode, allow_all_docks')
          .eq('org_id', orgId)
          .in('client_id', clientIds);

        // Load client_docks
        const { data: cdRows } = await supabase
          .from('client_docks')
          .select('client_id, dock_id, dock_order')
          .eq('org_id', orgId)
          .in('client_id', clientIds)
          .order('dock_order', { ascending: true });

        const ruleMap = new Map((rulesRows || []).map((r: any) => [r.client_id, r]));
        const clientDockMap = new Map<string, { dockId: string; dockOrder: number }[]>();
        for (const cd of (cdRows || []) as any[]) {
          const arr = clientDockMap.get(cd.client_id) || [];
          arr.push({ dockId: cd.dock_id, dockOrder: cd.dock_order ?? 999 });
          clientDockMap.set(cd.client_id, arr);
        }

        // Union of docks across all clients of this provider
        const seen = new Set<string>();
        let allowAll = false;
        let mode = 'NONE';

        for (const cid of clientIds) {
          const r = ruleMap.get(cid);
          if (r?.allow_all_docks === true) allowAll = true;
          if (r?.dock_allocation_mode) mode = r.dock_allocation_mode;

          const docks = clientDockMap.get(cid) || [];
          for (const d of docks) {
            if (!seen.has(d.dockId)) seen.add(d.dockId);
          }
        }

        const docks = Array.from(seen).map((dockId) => {
          // find first dock_order across all clients for this dock
          let order = 999;
          for (const cid of clientIds) {
            const arr = clientDockMap.get(cid) || [];
            const found = arr.find((d) => d.dockId === dockId);
            if (found && found.dockOrder < order) order = found.dockOrder;
          }
          return { dockId, dockOrder: order };
        }).sort((a, b) => a.dockOrder - b.dockOrder);

        providerDockSets.push({ providerId, clientIds, allowAll, docks, mode });
      }

      // If ALL providers have allowAll, we still need to intersect — unless allDockIds is provided
      // But the intersection of "all" across multiple providers is still "all" if they all allow all.
      // However, we should intersect with the available docks in the warehouse.
      const allAllowAll = providerDockSets.every((p) => p.allowAll);

      // Compute intersection of dock sets
      const intersectDocks = (sets: Array<{ docks: { dockId: string; dockOrder: number }[] }>) => {
        if (sets.length === 0) return [] as { dockId: string; dockOrder: number }[];
        // Start with first set
        let intersection = new Map<string, number>(sets[0].docks.map((d) => [d.dockId, d.dockOrder]));
        for (let i = 1; i < sets.length; i++) {
          const nextSet = new Set(sets[i].docks.map((d) => d.dockId));
          const next = new Map(sets[i].docks.map((d) => [d.dockId, d.dockOrder]));
          for (const [dockId] of intersection) {
            if (!nextSet.has(dockId)) {
              intersection.delete(dockId);
            } else {
              // keep minimum order
              intersection.set(dockId, Math.min(intersection.get(dockId)!, next.get(dockId)!));
            }
          }
        }
        return Array.from(intersection.entries())
          .map(([dockId, dockOrder]) => ({ dockId, dockOrder }))
          .sort((a, b) => a.dockOrder - b.dockOrder);
      };

      const intersectionDocks = intersectDocks(providerDockSets);

      // Determine combined mode
      const modes = new Set(providerDockSets.map((p) => p.mode));
      let combinedMode: DockAllocationRule['dockAllocationMode'] = 'SEQUENTIAL';
      if (modes.size === 1) {
        const sole = [...modes][0] as DockAllocationRule['dockAllocationMode'];
        combinedMode = sole;
      }

      const providerNames = providerIds.map((id) => providerNameMap[id] || id).join(', ');

      const result: DockAllocationRule = {
        clientId: providerDockSets[0]?.clientIds[0] || '',
        clientName: providerNames,
        dockAllocationMode: combinedMode,
        allowAllDocks: allAllowAll && intersectionDocks.length > 0,
        clientDocks: intersectionDocks,
      };

      return { rule: result, missingProviderNames: [], error: undefined };
    } catch (err) {
      return {
        rule: null,
        missingProviderNames: [],
        error: 'Error al calcular la intersección de andenes para el consolidado.',
      };
    }
  },

  /**
   * Resolve the clientId linked to a provider within an org.
   * Uses client_providers table. Returns the first match or null.
   * Optionally filters by warehouseId via warehouse_clients.
   *
   * DEPRECATED in favor of resolveClientIdsFromProvider for multi-client scenarios.
   * Kept for backward compatibility with other flows.
   */
  async resolveClientIdFromProvider(
    orgId: string,
    providerId: string,
    warehouseId?: string | null
  ): Promise<string | null> {
    if (!orgId || !providerId) return null;

    try {
      const { data: cpRows, error: cpErr } = await supabase
        .from('client_providers')
        .select('client_id')
        .eq('org_id', orgId)
        .eq('provider_id', providerId);

      if (cpErr || !cpRows || cpRows.length === 0) {
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
          return wcRows[0].client_id;
        }
      }

      // Fallback: first client from provider
      return clientIds[0];
    } catch (err) {
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
      return { enabled: new Set<string>(), ordered: [], mode: 'MISSING' };
    }

    // If allow_all_docks, enable everything
    if (rule.allowAllDocks) {
      return {
        enabled: new Set(allDockIds),
        ordered: allDockIds,
        mode: 'ALLOW_ALL',
      };
    }

    // If the client has no assigned docks, enable none
    if (rule.clientDocks.length === 0) {
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
   *       - If there are free docks with odd dock_order -> enabled = those.
   *       - Else -> enabled = free docks with even dock_order.
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
    // Normalizar timestamps al minuto exacto para evitar off-by-one.
    const truncMin = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

    // 1. Busy docks: non-cancelled reservations overlapping [slotStart, slotEnd)
    const busyDockIds = new Set<string>();
    for (const r of reservations) {
      if (r.is_cancelled) continue;
      const rStart = truncMin(new Date(r.start_datetime));
      const rEnd = truncMin(new Date(r.end_datetime));
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
        // No free odds -> fall back to free evens
        const freeEvens = freeDocks.filter((cd) => cd.dockOrder % 2 === 0);
        enabled = new Set(freeEvens.map((d) => d.dockId));
      }
    } else {
      // SEQUENTIAL / NONE / null -> all free client docks
      enabled = new Set(freeDocks.map((d) => d.dockId));
    }

    return enabled;
  },
};