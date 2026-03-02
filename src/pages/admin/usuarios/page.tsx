// src/pages/admin/usuarios/page.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { usePermissions } from '../../../hooks/usePermissions';
import { countriesService } from '../../../services/countriesService';
import { warehousesService } from '../../../services/warehousesService';
import { userAccessService } from '../../../services/userAccessService';
import { providersService } from '../../../services/providersService';
import { userProvidersService } from '../../../services/userProvidersService';
import { ConfirmModal } from '../../../components/base/ConfirmModal';
import type { Provider } from '../../../types/catalog';

interface User {
  id: string;
  email: string;
  full_name: string;
  role_name: string;
  role_id: string;
  created_at: string;
  last_sign_in_at: string;
  phone_e164?: string | null;
}

interface Role {
  id: string;
  name: string;
}

interface Country {
  id: string;
  name: string;
  code: string;
}

interface Warehouse {
  id: string;
  name: string;
  country_id: string;
}

export default function UsuariosPage() {
  const { can, loading: permissionsLoading, orgId, userId, permissionsSet } = usePermissions();

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role_id: '',
    password: '',
    phone_e164: ''
  });

  // Estados para control de acceso
  const [selectedCountryIds, setSelectedCountryIds] = useState<string[]>([]);
  const [restrictedByWarehouse, setRestrictedByWarehouse] = useState(false);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  // ✅ NUEVO: Estados para proveedores
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([]);
  const [providerSearchTerm, setProviderSearchTerm] = useState('');
  const [providersLoading, setProvidersLoading] = useState(false);

  // ✅ NUEVO: Estados para popups y confirmaciones
  const [popup, setPopup] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    showCancel: boolean;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    showCancel: false,
  });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    userId: string;
    userName: string;
  }>({
    isOpen: false,
    userId: '',
    userName: '',
  });

  // ✅ guards reales (no se resetean por render)
  const loadUsersRunningRef = useRef(false);
  const loadUsers401RetryRef = useRef(false);

  console.log('[AdminUsers] debug', {
    orgId,
    userId,
    permissionsLoading,
    permissionsSetType: typeof permissionsSet,
    permissionsSetSize: (permissionsSet as any)?.size || 0,
    usersType: typeof users,
    usersLength: users?.length || 0,
    rolesType: typeof roles,
    rolesLength: roles?.length || 0
  });

  const canCreate = can('admin.users.create') || can('users.create');
  const canEdit = can('admin.users.update') || can('users.update');
  const canDelete = can('admin.users.delete') || can('users.delete');
  const canAssign = can('admin.users.assign_roles') || can('users.assign_roles');
  const canAssignAccess = canAssign || can('admin.users.assign_access');

  const ensureSession = useCallback(async () => {
    const snap1 = await supabase.auth.getSession();
    let session = snap1.data.session;

    if (!session?.access_token) {
      const refresh = await supabase.auth.refreshSession();
      session = refresh.data.session ?? null;
    }

    if (!session?.access_token) {
      throw new Error('No hay sesión activa (access_token faltante). Iniciá sesión y recargá.');
    }

    try {
      const payloadBase64 = session.access_token.split('.')[1];
      const payloadJson = JSON.parse(atob(payloadBase64));
      const now = Math.floor(Date.now() / 1000);
      const isExpired = Number(payloadJson?.exp ?? 0) < now;

      console.log('[UsersPage] 🔍 ensureSession token', {
        hasToken: true,
        isExpired,
        exp: payloadJson?.exp,
        now,
        sub: payloadJson?.sub,
      });

      if (isExpired) {
        const refresh2 = await supabase.auth.refreshSession();
        session = refresh2.data.session ?? null;

        if (!session?.access_token) {
          throw new Error('Sesión expirada y no se pudo refrescar. Cerrá sesión e ingresá de nuevo.');
        }
      }
    } catch (e) {
      console.warn('[UsersPage] ⚠️ ensureSession JWT decode failed (non-blocking)', e);
    }

    return session;
  }, []);

  const loadUsers = useCallback(async () => {
    if (loadUsersRunningRef.current) {
      console.log('[UsersPage] loadUsers skipped: already running');
      return;
    }

    if (!orgId) {
      console.log('[UsersPage] loadUsers skipped: orgId is null');
      return;
    }

    loadUsersRunningRef.current = true;

    try {
      setLoading(true);
      setLoadError(null);

      await ensureSession();

      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'list', orgId, debug: true },
      });

      console.log('[UsersPage] 📥 Response from admin-users (list):', {
        hasData: !!data,
        hasError: !!error,
        errorDetails: error,
        orgId,
      });

      if (error) {
        const msg = (error as any)?.message ?? '';
        const is401 =
          msg.includes('401') ||
          msg.toLowerCase().includes('unauthorized') ||
          msg.toLowerCase().includes('jwt') ||
          msg.toLowerCase().includes('api key');

        if (is401 && !loadUsers401RetryRef.current) {
          loadUsers401RetryRef.current = true;

          await supabase.auth.refreshSession();
          await ensureSession();

          const retry = await supabase.functions.invoke('admin-users', {
            body: { action: 'list', orgId, debug: true },
          });

          console.log('[UsersPage] 📥 Retry response from admin-users (list):', {
            hasData: !!retry.data,
            hasError: !!retry.error,
            errorDetails: retry.error,
            orgId,
          });

          if (retry.error) throw retry.error;

          setUsers((retry.data as any)?.users || []);
          return;
        }

        throw error;
      }

      setUsers((data as any)?.users || []);
    } catch (err) {
      console.error('[UsersPage] ❌ Error loading users:', err);
      setLoadError(err instanceof Error ? err.message : 'Error al cargar usuarios');
    } finally {
      setLoading(false);
      loadUsersRunningRef.current = false;
    }
  }, [orgId, ensureSession]);

  const loadRoles = useCallback(async () => {
    try {
      console.log('[UsersPage] 🔄 Loading roles...');
      
      const { data, error } = await supabase
        .from('roles')
        .select('id, name')
        .order('name');

      if (error) {
        console.error('[UsersPage] ❌ Error loading roles:', error);
        throw error;
      }
      
      const safeRoles = data ?? [];
      console.log('[UsersPage] ✅ Roles loaded', { count: safeRoles.length, roles: safeRoles });
      setRoles(safeRoles);
    } catch (error) {
      console.error('[UsersPage] ❌ Error loading roles:', error);
      setRoles([]); // Asegurar que roles sea un array vacío en caso de error
    }
  }, []);

  const loadCountriesAndWarehouses = useCallback(async () => {
    if (!orgId) return;

    try {
      console.log('[UsersPage] 🔄 Loading countries and warehouses...');
      
      const [countriesData, warehousesData] = await Promise.all([
        countriesService.getActive(orgId),
        warehousesService.getAll(orgId)
      ]);

      console.log('[UsersPage] ✅ Countries and warehouses loaded', {
        countriesCount: countriesData.length,
        warehousesCount: warehousesData.length,
      });

      setCountries(countriesData);
      setWarehouses(warehousesData);
    } catch (error) {
      console.error('[UsersPage] ❌ Error loading countries/warehouses:', error);
    }
  }, [orgId]);

  // ✅ NUEVO: Cargar proveedores
  const loadProviders = useCallback(async () => {
    if (!orgId) return;

    try {
      console.log('[UsersPage] 🔄 Loading providers...');
      setProvidersLoading(true);
      
      const providersData = await providersService.getActive(orgId);
      
      console.log('[UsersPage] ✅ Providers loaded', { count: providersData.length });
      setProviders(providersData);
    } catch (error) {
      console.error('[UsersPage] ❌ Error loading providers:', error);
    } finally {
      setProvidersLoading(false);
    }
  }, [orgId]);

  const loadUserAccess = useCallback(async (targetUserId: string) => {
    if (!orgId || !targetUserId) {
      console.warn('[UsersPage] loadUserAccess skipped: missing orgId or targetUserId', { orgId, targetUserId });
      return;
    }

    setAccessLoading(true);
    setAccessError(null);

    try {
      console.log('[UsersPage] 🔄 Loading user access...', { orgId, targetUserId });
      
      // ✅ CAMBIO: asegurar sesión antes de invocar
      await ensureSession();

      const accessData = await userAccessService.get(orgId, targetUserId);
      
      setSelectedCountryIds(accessData.countryIds);
      setRestrictedByWarehouse(accessData.restricted);
      setSelectedWarehouseIds(accessData.warehouseIds);

      console.log('[UsersPage] ✅ User access loaded:', accessData);

      // ✅ CORREGIDO: Cargar proveedores asignados y mapear a IDs
      try {
        const userProviders = await userProvidersService.getUserProviders(orgId, targetUserId);
        
        // ✅ CORREGIDO: getUserProviders devuelve UserProvider[] con { id, name }
        // Necesitamos extraer solo los IDs para selectedProviderIds
        const providerIds = userProviders.map(up => up.id);
        
        setSelectedProviderIds(providerIds);
        
        console.log('[UsersPage] ✅ User providers loaded:', { 
          count: userProviders.length,
          selectedProviderIdsCount: providerIds.length,
          providerIds: providerIds,
          providerNames: userProviders.map(up => up.name)
        });
      } catch (providerError) {
        console.error('[UsersPage] ⚠️ Error loading user providers (non-blocking):', providerError);
        setSelectedProviderIds([]);
      }
    } catch (error) {
      console.error('[UsersPage] ❌ Error loading user access:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al cargar accesos';
      setAccessError(errorMessage);
      
      // ✅ NUEVO: Mostrar error en UI pero no romper el modal
      console.warn('[UsersPage] ⚠️ Continuing with empty access data');
      setSelectedCountryIds([]);
      setRestrictedByWarehouse(false);
      setSelectedWarehouseIds([]);
      setSelectedProviderIds([]);
    } finally {
      setAccessLoading(false);
    }
  }, [orgId, ensureSession]);

  useEffect(() => {
    const run = async () => {
      if (permissionsLoading || !orgId) {
        console.log('[UsersPage] waiting for permissions or orgId...', { permissionsLoading, orgId });
        return;
      }

      console.log('[UsersPage] loading users & roles...');
      loadUsers401RetryRef.current = false;
      loadUsers();
      loadRoles();
      loadCountriesAndWarehouses();
      loadProviders(); // ✅ NUEVO
    };

    run();
  }, [permissionsLoading, orgId, loadUsers, loadRoles, loadCountriesAndWarehouses, loadProviders]);

  useEffect(() => {
    console.log('[UsersPage] button permissions (final render)', {
      canCreate,
      canEdit,
      canDelete,
      canAssign,
      willShowCreateButton: canCreate,
      willShowEditButtons: canEdit,
      willShowDeleteButtons: canDelete,
      willShowAssignRole: canAssign
    });
  }, [canCreate, canEdit, canDelete, canAssign]);

  // ✅ NUEVO: Estado para manejar el userId recién creado
  const [newlyCreatedUserId, setNewlyCreatedUserId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await ensureSession();

      const phoneE164 = formData.phone_e164?.trim() || null;

      if (editingUser) {
        console.log('[UsersPage] 🔄 Updating user via admin-users function');

        const { data, error } = await supabase.functions.invoke('admin-users', {
          body: {
            debug: true,
            action: 'update_role',
            roleId: formData.role_id,
            userId: editingUser.id,
            email: formData.email,
            full_name: formData.full_name,
            phone_e164: phoneE164,
            roleIds: formData.role_id ? [formData.role_id] : [],
            orgId
          },
        });

        if (error) {
          console.error('[UsersPage] ❌ Error response:', error);
          throw new Error((error as any).message || 'Error al actualizar usuario');
        }

        console.log('[UsersPage] ✅ User updated successfully', { ok: !!data });

        // ✅ Sincronizar países, almacenes y proveedores al actualizar
        if (canAssignAccess && orgId) {
          // Guardar países
          if (selectedCountryIds.length > 0) {
            await userAccessService.setCountries({
              orgId,
              targetUserId: editingUser.id,
              countryIds: selectedCountryIds,
            });
          }

          // Guardar almacenes
          const restricted = !!restrictedByWarehouse;
          const warehouseIds = restricted ? selectedWarehouseIds : [];

          await userAccessService.setWarehouses({
            orgId,
            targetUserId: editingUser.id,
            restricted,
            warehouseIds,
          });

          // ✅ NUEVO: Guardar proveedores
          await userProvidersService.setUserProviders(orgId, editingUser.id, selectedProviderIds);
          console.log('[UsersPage] ✅ User providers saved');
        }

        setShowModal(false);
        setEditingUser(null);
        setFormData({ email: '', full_name: '', role_id: '', password: '', phone_e164: '' });
        setSelectedCountryIds([]);
        setRestrictedByWarehouse(false);
        setSelectedWarehouseIds([]);
        setSelectedProviderIds([]); // ✅ NUEVO
        setProviderSearchTerm(''); // ✅ NUEVO
        setNewlyCreatedUserId(null);
        loadUsers401RetryRef.current = false;
        loadUsers();

        // ✅ Mostrar popup de éxito
        setPopup({
          isOpen: true,
          type: 'success',
          title: 'Usuario actualizado',
          message: 'Los datos del usuario se han actualizado correctamente.',
          showCancel: false,
          onConfirm: () => setPopup(prev => ({ ...prev, isOpen: false }))
        });
      } else {
        console.log('[UsersPage] ➕ Creating user via admin-users function');

        const { data, error } = await supabase.functions.invoke('admin-users', {
          body: {
            action: 'create',
            roleId: formData.role_id,
            email: formData.email,
            password: formData.password,
            phone_e164: phoneE164,
            roleIds: formData.role_id ? [formData.role_id] : [],
            orgId
          },
        });

      if (error) {
        const msg = String((error as any)?.message ?? 'Error al crear usuario');
        const ctx = (error as any)?.context;

        // Intentar leer body real del edge function (cuando supabase lo trae como Response)
        let raw = '';
        try {
          if (ctx && typeof ctx.text === 'function') raw = await ctx.text();
        } catch (parseError) {
          console.warn('[UsersPage] No se pudo leer el contexto del error:', parseError);
        }

        // Intentar parsear JSON del server
        let server: any = null;
        try {
          if (raw) server = JSON.parse(raw);
        } catch (jsonError) {
          console.warn('[UsersPage] No se pudo parsear JSON del error:', jsonError);
        }

        console.error('[UsersPage] ❌ Error response (create):', { msg, raw, server });

        // Caso duplicado (tu edge function responde 409 con error=DUPLICATE_EMAIL o EMAIL_CONFLICT_IN_PROFILES)
        const serverCode = server?.error;
        if (serverCode === 'DUPLICATE_EMAIL') {
          setPopup({
            isOpen: true,
            type: 'warning',
            title: 'Email duplicado',
            message: 'Ese email ya está registrado. Usá otro email o editá el usuario existente.',
            showCancel: false,
            onConfirm: () => setPopup(prev => ({ ...prev, isOpen: false }))
          });
          return;
        }
        if (serverCode === 'EMAIL_CONFLICT_IN_PROFILES' || serverCode === 'EMAIL_ALREADY_USED') {
          setPopup({
            isOpen: true,
            type: 'warning',
            title: 'Email en uso',
            message: 'Ese email ya está en uso por otro perfil. Revisá la tabla profiles.',
            showCancel: false,
            onConfirm: () => setPopup(prev => ({ ...prev, isOpen: false }))
          });
          return;
        }

        throw new Error(server?.details || msg);
      }

        console.log('[UsersPage] ✅ User created successfully', { ok: !!data });

        // ✅ FIX: la edge function devuelve userId y user_id (compat). NO devuelve data.user.id.
        const createdUserId =
          (data as any)?.userId ??
          (data as any)?.user_id ??
          (data as any)?.user?.id ?? // fallback ultra defensivo
          null;

        if (!createdUserId) {
          // Si supabase.functions.invoke devolvió un error 409, aquí ya habríamos caído en "error".
          console.error('[UsersPage] ⚠️ Missing user id in response', { data });
          throw new Error('No se pudo obtener el ID del usuario (respuesta sin userId).');
        }

        console.log('[UsersPage] 📝 Usuario creado con ID:', createdUserId, {
          alreadyExisted: (data as any)?.alreadyExisted,
          createdNew: (data as any)?.createdNew,
        });


        console.log('[UsersPage] 📝 Usuario creado con ID:', createdUserId);

        // ✅ NUEVO: Asignar países, almacenes y proveedores si se seleccionaron
        if (canAssignAccess && orgId) {
          // Guardar países si hay seleccionados
          if (selectedCountryIds.length > 0) {
            console.log('[UsersPage] 🌍 Asignando países al nuevo usuario...');
            await userAccessService.setCountries({
              orgId,
              targetUserId: createdUserId,
              countryIds: selectedCountryIds,
            });
          }

          // Guardar almacenes si hay restricción activa
          if (restrictedByWarehouse && selectedWarehouseIds.length > 0) {
            console.log('[UsersPage] 🏢 Asignando almacenes al nuevo usuario...');
            await userAccessService.setWarehouses({
              orgId,
              targetUserId: createdUserId,
              restricted: true,
              warehouseIds: selectedWarehouseIds,
            });
          } else if (!restrictedByWarehouse) {
            // Asegurar que no hay restricción
            await userAccessService.setWarehouses({
              orgId,
              targetUserId: createdUserId,
              restricted: false,
              warehouseIds: [],
            });
          }

          // ✅ NUEVO: Guardar proveedores si hay seleccionados
          if (selectedProviderIds.length > 0) {
            console.log('[UsersPage] 🚚 Asignando proveedores al nuevo usuario...');
            await userProvidersService.setUserProviders(orgId, createdUserId, selectedProviderIds);
          }
        }

        setShowModal(false);
        setEditingUser(null);
        setFormData({ email: '', full_name: '', role_id: '', password: '', phone_e164: '' });
        setSelectedCountryIds([]);
        setRestrictedByWarehouse(false);
        setSelectedWarehouseIds([]);
        setSelectedProviderIds([]); // ✅ NUEVO
        setProviderSearchTerm(''); // ✅ NUEVO
        setNewlyCreatedUserId(null);
        loadUsers401RetryRef.current = false;
        loadUsers();

        // ✅ Mostrar popup de éxito
        setPopup({
          isOpen: true,
          type: 'success',
          title: 'Usuario creado',
          message: 'El usuario se ha creado correctamente.',
          showCancel: false,
          onConfirm: () => setPopup(prev => ({ ...prev, isOpen: false }))
        });
      }
    } catch (error: any) {
      console.error('[UsersPage] ❌ Error saving user:', error);
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error?.message || 'Error al guardar el usuario',
        showCancel: false,
        onConfirm: () => setPopup(prev => ({ ...prev, isOpen: false }))
      });
    }
  };

  const handleEdit = async (user: User) => {
    console.log('[UsersPage] 🔄 Opening edit modal for user:', { userId: user.id, email: user.email });
    
    setEditingUser(user);
    setFormData({
      email: user.email,
      full_name: user.full_name,
      role_id: user.role_id || '',
      password: '',
      phone_e164: user.phone_e164 ?? ''
    });
    
    // ✅ CORREGIDO: Primero mostrar el modal, luego cargar accesos
    setShowModal(true);

    // ✅ Cargar accesos después de mostrar el modal (sin race condition)
    if (canAssignAccess) {
      await loadUserAccess(user.id);
    }
  };

  const handleDelete = async (targetUserId: string) => {
    // ✅ Buscar el usuario para mostrar su nombre en el popup
    const userToDelete = users.find(u => u.id === targetUserId);
    setDeleteConfirm({
      isOpen: true,
      userId: targetUserId,
      userName: userToDelete?.full_name || userToDelete?.email || 'este usuario'
    });
  };

  const confirmDelete = async () => {
    const targetUserId = deleteConfirm.userId;
    setDeleteConfirm({ isOpen: false, userId: '', userName: '' });

    try {
      console.log('[UsersPage] 🗑️ Deleting user via admin-users function');

      await ensureSession();

      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'remove_from_org',
          userId: targetUserId,
          orgId
        },
      });

      if (error) {
        console.error('[UsersPage] ❌ Error response:', error);
        throw new Error((error as any).message || 'Error al eliminar usuario');
      }

      console.log('[UsersPage] ✅ User deleted successfully', { ok: !!data });
      loadUsers401RetryRef.current = false;
      loadUsers();

      // ✅ Mostrar popup de éxito
      setPopup({
        isOpen: true,
        type: 'success',
        title: 'Usuario eliminado',
        message: 'El usuario ha sido eliminado de la organización.',
        showCancel: false,
        onConfirm: () => setPopup(prev => ({ ...prev, isOpen: false }))
      });
    } catch (error: any) {
      console.error('[UsersPage] ❌ Error deleting user:', error);
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error?.message || 'Error al eliminar el usuario',
        showCancel: false,
        onConfirm: () => setPopup(prev => ({ ...prev, isOpen: false }))
      });
    }
  };

  const handleSaveCountries = async () => {
    if (!editingUser || !orgId) return;

    setAccessLoading(true);
    setAccessError(null);

    try {
      await ensureSession();

      await userAccessService.setCountries({
        orgId,
        targetUserId: editingUser.id,
        countryIds: selectedCountryIds
      });

      setRestrictedByWarehouse(false);
      setSelectedWarehouseIds([]);

      // ✅ Popup de éxito
      setPopup({
        isOpen: true,
        type: 'success',
        title: 'Países asignados',
        message: 'Los países han sido asignados correctamente.',
        showCancel: false,
        onConfirm: () => setPopup(prev => ({ ...prev, isOpen: false }))
      });
      console.log('[UsersPage] ✅ Countries saved successfully');
    } catch (error) {
      console.error('[UsersPage] ❌ Error saving countries:', error);
      setAccessError(error instanceof Error ? error.message : 'Error al guardar países');
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Error al guardar países',
        showCancel: false,
        onConfirm: () => setPopup(prev => ({ ...prev, isOpen: false }))
      });
    } finally {
      setAccessLoading(false);
    }
  };

  const handleSaveWarehouses = async () => {
    if (!editingUser || !orgId) return;

    setAccessLoading(true);
    setAccessError(null);

    try {
      await ensureSession();

      console.log('[UsersPage] sending set_warehouses', {
        orgId,
        targetUserId: editingUser.id,
        restricted: restrictedByWarehouse,
        warehouseIds: restrictedByWarehouse ? selectedWarehouseIds : [],
      });

      await userAccessService.setWarehouses({
        orgId,
        targetUserId: editingUser.id,
        restricted: restrictedByWarehouse,
        warehouseIds: restrictedByWarehouse ? selectedWarehouseIds : []
      });

      // ✅ Popup de éxito
      setPopup({
        isOpen: true,
        type: 'success',
        title: 'Almacenes actualizados',
        message: 'El acceso a almacenes ha sido actualizado correctamente.',
        showCancel: false,
        onConfirm: () => setPopup(prev => ({ ...prev, isOpen: false }))
      });
      console.log('[UsersPage] ✅ Warehouses saved successfully');
    } catch (error) {
      console.error('[UsersPage] ❌ Error saving warehouses:', error);
      setAccessError(error instanceof Error ? error.message : 'Error al guardar almacenes');
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Error al guardar almacenes',
        showCancel: false,
        onConfirm: () => setPopup(prev => ({ ...prev, isOpen: false }))
      });
    } finally {
      setAccessLoading(false);
    }
  };

  const handleToggleCountry = (countryId: string) => {
    setSelectedCountryIds(prev => {
      if (prev.includes(countryId)) {
        return prev.filter(id => id !== countryId);
      } else {
        return [...prev, countryId];
      }
    });
  };

  const handleToggleWarehouse = (warehouseId: string) => {
    setSelectedWarehouseIds(prev => {
      if (prev.includes(warehouseId)) {
        return prev.filter(id => id !== warehouseId);
      } else {
        return [...prev, warehouseId];
      }
    });
  };

  const handleToggleRestriction = async (newValue: boolean) => {
    setRestrictedByWarehouse(newValue);

    if (!newValue && editingUser && orgId) {
      setSelectedWarehouseIds([]);

      setAccessLoading(true);
      try {
        await ensureSession();

        await userAccessService.setWarehouses({
          orgId,
          targetUserId: editingUser.id,
          restricted: false,
          warehouseIds: []
        });

        console.log('[UsersPage] ✅ Warehouse restriction removed');
      } catch (error) {
        console.error('[UsersPage] ❌ Error removing restriction:', error);
        setAccessError(error instanceof Error ? error.message : 'Error al quitar restricción');
      } finally {
        setAccessLoading(false);
      }
    }
    
    // ✅ NUEVO: Si es un usuario nuevo (no editingUser), solo cambiar el estado local
    if (!editingUser && !newValue) {
      setSelectedWarehouseIds([]);
    }
  };

  // ✅ NUEVO: Handlers para proveedores
  const handleToggleProvider = (providerId: string) => {
    setSelectedProviderIds(prev => {
      if (prev.includes(providerId)) {
        return prev.filter(id => id !== providerId);
      } else {
        return [...prev, providerId];
      }
    });
  };

  const filteredWarehouses = warehouses.filter(w =>
    selectedCountryIds.includes(w.country_id)
  );

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Nunca';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (permissionsLoading || !orgId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {permissionsLoading ? 'Cargando permisos...' : 'Verificando organización...'}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  // ✅ NUEVO: Filtrar proveedores por búsqueda
  const filteredProviders = providers.filter(p =>
    p.name.toLowerCase().includes(providerSearchTerm.toLowerCase())
  );

  return (
    <div className="p-6">
      {/* ✅ Popup general para mensajes */}
      <ConfirmModal
        isOpen={popup.isOpen}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        showCancel={popup.showCancel}
        onConfirm={popup.onConfirm || (() => setPopup(prev => ({ ...prev, isOpen: false })))}
        onCancel={() => setPopup(prev => ({ ...prev, isOpen: false }))}
      />

      {/* ✅ Popup de confirmación de eliminación */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        type="warning"
        title="Eliminar usuario"
        message={`¿Estás seguro de eliminar a "${deleteConfirm.userName}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        showCancel={true}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, userId: '', userName: '' })}
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <p className="text-sm text-gray-600 mt-1">Administra los usuarios del sistema</p>
        </div>
        {canCreate && (
          <button
            onClick={() => {
              setEditingUser(null);
              setFormData({ email: '', full_name: '', role_id: '', password: '', phone_e164: '' });
              setSelectedCountryIds([]);
              setRestrictedByWarehouse(false);
              setSelectedWarehouseIds([]);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            Nuevo Usuario
          </button>
        )}
      </div>

      {loadError && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-3">
            <i className="ri-error-warning-line text-yellow-600 text-xl mt-0.5"></i>
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900 mb-1">Error al cargar usuarios</h3>
              <p className="text-sm text-yellow-800">{loadError}</p>
              <button
                onClick={() => {
                  loadUsers401RetryRef.current = false;
                  loadUsers();
                }}
                className="mt-3 text-sm text-yellow-700 hover:text-yellow-900 font-medium underline"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rol
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                        <i className="ri-user-line text-teal-600 text-lg"></i>
                      </div>
                      <div className="font-medium text-gray-900">{user.full_name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    <div>{user.email}</div>
                    {user.phone_e164 && (
                      <div className="text-xs text-gray-400">{user.phone_e164}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-3 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                      {user.role_name || 'Sin rol'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      {canEdit && (
                        <button
                          onClick={() => handleEdit(user)}
                          className="w-8 h-8 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <i className="ri-edit-line"></i>
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="w-8 h-8 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && !loadError && (
          <div className="text-center py-12">
            <i className="ri-user-line text-4xl text-gray-300 mb-3"></i>
            <p className="text-gray-500">No hay usuarios registrados</p>
          </div>
        )}

        {users.length === 0 && loadError && (
          <div className="text-center py-12">
            <i className="ri-error-warning-line text-4xl text-yellow-400 mb-3"></i>
            <p className="text-gray-500">No se pudieron cargar los usuarios</p>
            <p className="text-sm text-gray-400 mt-1">Pero puedes crear nuevos usuarios usando el botón de arriba</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-gray-900">
                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Información Básica</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                    disabled={!!editingUser}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teléfono (opcional)
                  </label>
                  <input
                    type="text"
                    value={formData.phone_e164}
                    onChange={(e) => setFormData({ ...formData, phone_e164: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    placeholder="Ej: +50688887777"
                    disabled={false}
                  />
                </div>

                {!editingUser && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Contraseña
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      required
                      minLength={6}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rol
                  </label>
                  <select
                    value={formData.role_id}
                    onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                    disabled={!canAssign}
                  >
                    <option value="">Seleccionar rol</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  {!canAssign && (
                    <p className="text-xs text-gray-500 mt-1">No tienes permiso para asignar roles</p>
                  )}
                  {/* ✅ NUEVO: Mostrar advertencia si no hay roles */}
                  {roles.length === 0 && (
                    <p className="text-xs text-yellow-600 mt-1">⚠️ No hay roles disponibles. Creá roles primero en la sección de Roles.</p>
                  )}
                </div>
              </div>

              {/* ✅ NUEVO: Sección de acceso por país y almacén SIEMPRE visible */}
              <div className="space-y-4 border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Acceso por País y Almacén</h3>
                  {accessLoading && (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600"></div>
                  )}
                </div>

                {!canAssignAccess && (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-600">
                      No tienes permiso para asignar accesos por país y almacén
                    </p>
                  </div>
                )}

                {accessError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{accessError}</p>
                    <p className="text-xs text-red-500 mt-1">Podés continuar editando el usuario. Los accesos se pueden configurar después.</p>
                  </div>
                )}

                {canAssignAccess && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Países Asignados
                      </label>
                      <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3">
                        {countries.length === 0 ? (
                          <p className="text-sm text-gray-500">No hay países disponibles</p>
                        ) : (
                          countries.map((country) => (
                            <label
                              key={country.id}
                              className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedCountryIds.includes(country.id)}
                                onChange={() => handleToggleCountry(country.id)}
                                disabled={!canAssignAccess || accessLoading}
                                className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                              />
                              <span className="text-sm text-gray-700">{country.name}</span>
                            </label>
                          ))
                        )}
                      </div>
                      {editingUser && (
                        <button
                          type="button"
                          onClick={handleSaveCountries}
                          disabled={!canAssignAccess || accessLoading || selectedCountryIds.length === 0}
                          className="mt-3 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap text-sm"
                        >
                          {accessLoading ? 'Guardando...' : 'Guardar Países'}
                        </button>
                      )}
                      {!editingUser && selectedCountryIds.length > 0 && (
                        <p className="mt-2 text-xs text-gray-500">
                          Los países se asignarán al crear el usuario
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={restrictedByWarehouse}
                          onChange={(e) => handleToggleRestriction(e.target.checked)}
                          disabled={!canAssignAccess || accessLoading || selectedCountryIds.length === 0}
                          className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          Restringir por almacén específico
                        </span>
                      </label>
                      <p className="text-xs text-gray-500 mt-1 ml-7">
                        Si no está activo, el usuario verá todos los almacenes de sus países asignados
                      </p>
                    </div>

                    {restrictedByWarehouse && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Almacenes Permitidos
                        </label>
                        {selectedCountryIds.length === 0 ? (
                          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <p className="text-sm text-gray-600">
                              Primero debes asignar al menos un país
                            </p>
                          </div>
                        ) : filteredWarehouses.length === 0 ? (
                          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <p className="text-sm text-gray-600">
                              No hay almacenes disponibles en los países seleccionados
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3">
                              {filteredWarehouses.map((warehouse) => (
                                <label
                                  key={warehouse.id}
                                  className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedWarehouseIds.includes(warehouse.id)}
                                    onChange={() => handleToggleWarehouse(warehouse.id)}
                                    disabled={!canAssignAccess || accessLoading}
                                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                                  />
                                  <span className="text-sm text-gray-700">{warehouse.name}</span>
                                </label>
                              ))}
                            </div>
                            {editingUser && (
                              <button
                                type="button"
                                onClick={handleSaveWarehouses}
                                disabled={!canAssignAccess || accessLoading || selectedWarehouseIds.length === 0}
                                className="mt-3 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap text-sm"
                              >
                                {accessLoading ? 'Guardando...' : 'Guardar Almacenes'}
                              </button>
                            )}
                            {!editingUser && selectedWarehouseIds.length > 0 && (
                              <p className="mt-2 text-xs text-gray-500">
                                Los almacenes se asignarán al crear el usuario
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ✅ NUEVO: Sección de Proveedores Asignados */}
              {canAssignAccess && (
                <div className="space-y-4 border-t border-gray-200 pt-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Proveedores Asignados</h3>
                    {providersLoading && (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600"></div>
                    )}
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <i className="ri-information-line text-blue-600 text-lg mt-0.5"></i>
                      <p className="text-sm text-blue-800">
                        Seleccioná los proveedores que este usuario podrá gestionar. Si no seleccionás ninguno, el usuario tendrá acceso a todos los proveedores.
                      </p>
                    </div>
                  </div>

                  {providers.length === 0 ? (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
                      <i className="ri-truck-line text-3xl text-gray-300 mb-2"></i>
                      <p className="text-sm text-gray-600">No hay proveedores disponibles</p>
                      <p className="text-xs text-gray-500 mt-1">Creá proveedores en Administración → Catálogos</p>
                    </div>
                  ) : (
                    <>
                      {/* Buscador */}
                      <div className="relative">
                        <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        <input
                          type="text"
                          placeholder="Buscar proveedor..."
                          value={providerSearchTerm}
                          onChange={(e) => setProviderSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                        />
                      </div>

                      {/* Contador */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">
                          Seleccionados: <span className="font-semibold text-teal-600">{selectedProviderIds.length}</span>
                        </span>
                        {selectedProviderIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedProviderIds([])}
                            className="text-red-600 hover:text-red-700 font-medium"
                          >
                            Limpiar selección
                          </button>
                        )}
                      </div>

                      {/* Lista de proveedores */}
                      <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
                        {filteredProviders.length === 0 ? (
                          <div className="p-4 text-center text-sm text-gray-500">
                            No se encontraron proveedores
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-200">
                            {filteredProviders.map((provider) => (
                              <label
                                key={provider.id}
                                className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedProviderIds.includes(provider.id)}
                                  onChange={() => handleToggleProvider(provider.id)}
                                  disabled={accessLoading}
                                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                                />
                                <div className="flex-1">
                                  <span className="text-sm font-medium text-gray-900">{provider.name}</span>
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Mensaje informativo */}
                      {!editingUser && selectedProviderIds.length > 0 && (
                        <p className="text-xs text-gray-500">
                          Los proveedores se asignarán al crear el usuario
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingUser(null);
                    setFormData({ email: '', full_name: '', role_id: '', password: '', phone_e164: '' });
                    setSelectedCountryIds([]);
                    setRestrictedByWarehouse(false);
                    setSelectedWarehouseIds([]);
                    setSelectedProviderIds([]);
                    setProviderSearchTerm('');
                    setNewlyCreatedUserId(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  {editingUser ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
