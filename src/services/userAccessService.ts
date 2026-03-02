// src/services/userAccessService.ts
import { supabase } from '../lib/supabase';

interface UserAccessResponse {
  countryIds: string[];
  warehouseIds: string[];
  restricted: boolean;
}

interface SetCountriesParams {
  orgId: string;
  targetUserId: string;
  countryIds: string[];
}

interface SetWarehousesParams {
  orgId: string;
  targetUserId: string;
  restricted: boolean;
  warehouseIds: string[];
}

const assert = (cond: any, msg: string) => {
  if (!cond) throw new Error(msg);
};

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

const uniq = (arr: string[]) => Array.from(new Set(arr));

// ✅ Generar reqId para tracking
const reqId = () => crypto.randomUUID();

// ✅ NUEVO: asegura sesión antes de invocar edge functions
const ensureSession = async () => {
  const snap1 = await supabase.auth.getSession();
  let session = snap1.data.session;

  if (!session?.access_token) {
    const refresh = await supabase.auth.refreshSession();
    session = refresh.data.session ?? null;
  }

  if (!session?.access_token) {
    throw new Error('No hay sesión activa (access_token faltante). Iniciá sesión y recargá.');
  }

  // best-effort: si está vencido, refrescar
  try {
    const payloadBase64 = session.access_token.split('.')[1];
    const payloadJson = JSON.parse(atob(payloadBase64));
    const now = Math.floor(Date.now() / 1000);
    const isExpired = Number(payloadJson?.exp ?? 0) < now;

    if (isExpired) {
      const refresh2 = await supabase.auth.refreshSession();
      session = refresh2.data.session ?? null;

      if (!session?.access_token) {
        throw new Error('Sesión expirada y no se pudo refrescar. Cerrá sesión e ingresá de nuevo.');
      }
    }
  } catch {
    // no bloquea
  }

  return session;
};

// ✅ NUEVO: leer body solo si realmente es Response-like
const safeReadResponseText = async (ctx: any) => {
  try {
    if (!ctx) return '';
    const maybeText = (ctx as any)?.text;
    if (typeof maybeText === 'function') {
      return await maybeText.call(ctx);
    }
    return '';
  } catch {
    return '';
  }
};

export const userAccessService = {
  async get(orgId: string, targetUserId: string): Promise<UserAccessResponse> {
    const id = reqId();
    
    assert(orgId && isUuid(orgId), 'orgId inválido');
    assert(targetUserId && isUuid(targetUserId), 'targetUserId inválido');

    // ✅ asegura sesión
    await ensureSession();

    // ✅ CORREGIDO: Payload en camelCase con action="get"
    const payload = {
      action: 'get',
      orgId,
      targetUserId,
    };

    console.log('[userAccessService.get] 📤 Request payload', { reqId: id, payload });

    const { data, error } = await supabase.functions.invoke('admin-user-access', {
      body: payload,
    });

    console.log('[userAccessService.get] 📥 Response', {
      reqId: id,
      hasData: !!data,
      hasError: !!error,
      data,
      error,
    });

    if (error) {
      const ctx = (error as any)?.context;
      console.error('[userAccessService.get] ❌ Invoke error', {
        reqId: id,
        message: error.message,
        hasContext: !!ctx,
        status: (ctx as any)?.status,
        statusText: (ctx as any)?.statusText,
        details: (error as any)?.details,
      });

      const raw = await safeReadResponseText(ctx);
      if (raw) {
        console.error('[userAccessService.get] 📄 Raw response body', { reqId: id, raw });
      }

      throw new Error(`Error al obtener accesos: ${error.message}`);
    }

    if (data && typeof data === 'object' && 'error' in (data as any)) {
      console.error('[userAccessService.get] ❌ Server error', { reqId: id, serverError: (data as any).error });
      throw new Error(`Error del servidor: ${(data as any).error}`);
    }

    const result = {
      countryIds: Array.isArray((data as any)?.countryIds) ? (data as any).countryIds : [],
      warehouseIds: Array.isArray((data as any)?.warehouseIds) ? (data as any).warehouseIds : [],
      restricted: !!(data as any)?.restricted,
    };

    console.log('[userAccessService.get] ✅ Success', { reqId: id, result });

    return result;
  },

  async setCountries(params: SetCountriesParams): Promise<void> {
    const id = reqId();
    
    assert(params?.orgId && isUuid(params.orgId), 'orgId inválido');
    assert(params?.targetUserId && isUuid(params.targetUserId), 'targetUserId inválido');
    assert(Array.isArray(params?.countryIds), 'countryIds debe ser array');

    const countryIds = uniq(params.countryIds.filter(Boolean));
    countryIds.forEach((cid) => assert(isUuid(cid), 'countryIds contiene uuid inválido'));

    // ✅ asegura sesión
    await ensureSession();

    // ✅ CORREGIDO: Payload en camelCase con action="set_countries"
    const payload = {
      action: 'set_countries',
      orgId: params.orgId,
      targetUserId: params.targetUserId,
      countryIds,
    };

    console.log('[userAccessService.setCountries] 📤 Request payload', { reqId: id, payload });

    const { data, error } = await supabase.functions.invoke('admin-user-access', {
      body: payload,
    });

    console.log('[userAccessService.setCountries] 📥 Response', {
      reqId: id,
      hasData: !!data,
      hasError: !!error,
      data,
      error,
    });

    if (error) {
      const ctx = (error as any)?.context;

      console.error('[userAccessService.setCountries] ❌ Invoke error', {
        reqId: id,
        message: error.message,
        hasContext: !!ctx,
        status: (ctx as any)?.status,
        statusText: (ctx as any)?.statusText,
        details: (error as any)?.details,
      });

      const raw = await safeReadResponseText(ctx);
      if (raw) {
        console.error('[userAccessService.setCountries] 📄 Raw response body', { reqId: id, raw });
        try {
          const parsed = JSON.parse(raw);
          console.error('[userAccessService.setCountries] 📋 Parsed server body', { reqId: id, parsed });

          if (parsed?.error) {
            const extra = [
              parsed?.message ? `message=${parsed.message}` : null,
              parsed?.code ? `code=${parsed.code}` : null,
              parsed?.hint ? `hint=${parsed.hint}` : null,
              parsed?.details ? `details=${parsed.details}` : null,
            ]
              .filter(Boolean)
              .join(' | ');

            throw new Error(`Error al asignar países: ${parsed.error}${extra ? ` (${extra})` : ''}`);
          }
        } catch {
          // raw no era JSON
        }
      }

      throw new Error(`Error al asignar países: ${error.message}`);
    }

    if (data && typeof data === 'object' && 'error' in (data as any)) {
      console.error('[userAccessService.setCountries] ❌ Server error', { reqId: id, serverError: (data as any).error });
      throw new Error(`Error del servidor: ${(data as any).error}`);
    }

    console.log('[userAccessService.setCountries] ✅ Success', { reqId: id });
  },

  async setWarehouses(params: SetWarehousesParams): Promise<void> {
    const id = reqId();
    
    assert(params?.orgId && isUuid(params.orgId), 'orgId inválido');
    assert(params?.targetUserId && isUuid(params.targetUserId), 'targetUserId inválido');
    assert(typeof params?.restricted === 'boolean', 'restricted debe ser boolean');
    assert(Array.isArray(params?.warehouseIds), 'warehouseIds debe ser array');

    const warehouseIds = uniq(params.warehouseIds.filter(Boolean));
    warehouseIds.forEach((wid) => assert(isUuid(wid), 'warehouseIds contiene uuid inválido'));

    // ✅ asegura sesión
    await ensureSession();

    // ✅ CORREGIDO: Payload en camelCase con action="set_warehouses"
    const payload = {
      action: 'set_warehouses',
      orgId: params.orgId,
      targetUserId: params.targetUserId,
      restricted: params.restricted,
      warehouseIds: params.restricted ? warehouseIds : [],
    };

    console.log('[userAccessService.setWarehouses] 📤 Request payload', { reqId: id, payload });

    const { data, error } = await supabase.functions.invoke('admin-user-access', {
      body: payload,
    });

    console.log('[userAccessService.setWarehouses] 📥 Response', {
      reqId: id,
      hasData: !!data,
      hasError: !!error,
      data,
      error,
    });

    if (error) {
      const ctx = (error as any)?.context;

      console.error('[userAccessService.setWarehouses] ❌ Invoke error', {
        reqId: id,
        message: error.message,
        hasContext: !!ctx,
        status: (ctx as any)?.status,
        statusText: (ctx as any)?.statusText,
        details: (error as any)?.details,
      });

      const raw = await safeReadResponseText(ctx);
      if (raw) {
        console.error('[userAccessService.setWarehouses] 📄 Raw response body', { reqId: id, raw });

        try {
          const parsed = JSON.parse(raw);
          console.error('[userAccessService.setWarehouses] 📋 Parsed server body', { reqId: id, parsed });

          if (parsed?.error) {
            const extra = [
              parsed?.message ? `message=${parsed.message}` : null,
              parsed?.code ? `code=${parsed.code}` : null,
              parsed?.hint ? `hint=${parsed.hint}` : null,
              parsed?.details ? `details=${parsed.details}` : null,
            ]
              .filter(Boolean)
              .join(' | ');

            throw new Error(
              `Error al configurar almacenes: ${parsed.error}${extra ? ` (${extra})` : ''}`
            );
          }
        } catch {
          // raw no era JSON
        }
      }

      throw new Error(`Error al configurar almacenes: ${error.message}`);
    }

    if (data && typeof data === 'object' && 'error' in (data as any)) {
      console.error('[userAccessService.setWarehouses] ❌ Server error', { reqId: id, serverError: (data as any).error });
      throw new Error(`Error del servidor: ${(data as any).error}`);
    }

    console.log('[userAccessService.setWarehouses] ✅ Success', { reqId: id });
  },
};
