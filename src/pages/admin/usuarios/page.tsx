// src/pages/admin/usuarios/page.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { usePermissions } from '../../../hooks/usePermissions';
import { useActiveWarehouse } from '../../../contexts/ActiveWarehouseContext';
import { countriesService } from '../../../services/countriesService';
import { warehousesService } from '../../../services/warehousesService';
import { userAccessService } from '../../../services/userAccessService';
import { providersService } from '../../../services/providersService';
import { userProvidersService } from '../../../services/userProvidersService';
import { userClientsService } from '../../../services/userClientsService';
import { ConfirmModal } from '../../../components/base/ConfirmModal';
import WarehousePageHeader from '../../../components/feature/WarehousePageHeader';
import { useFormDraft, saveGenericDraft } from '../../../hooks/useReservationDraft';
import type { Provider } from '../../../types/catalog';

// ─── Draft types ─────────────────────────────────────────────────────────────
interface NewUserDraftData {
  email: string;
  full_name: string;
  role_id: string;
  phone_e164: string;
  /** Estado de apertura del modal — persistido para restaurarlo al volver */
  modalOpen: boolean;
  /** No persistimos password por seguridad */
}

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
  const {
    activeWarehouseId,
    activeWarehouse,
    allowedWarehouses,
    hasMultipleWarehouses,
    setActiveWarehouseId,
    loading: warehouseLoading,
  } = useActiveWarehouse();

  const [users, setUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [warehouseUserIds, setWarehouseUserIds] = useState<Set<string> | null>(null);
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

  // ── Draft de "Nuevo Usuario" ──────────────────────────────────────────────
  // Solo persiste cuando editingUser === null (modo creación)
  const { saveDraft: saveUserDraft, clearDraft: clearUserDraft, readDraft: readUserDraft } =
    useFormDraft<NewUserDraftData>({
      storageKey: `draft_new_user_${orgId ?? 'local'}`,
      isNewRecord: !editingUser && showModal,
    });

  // ── Flag para saber si el usuario tocó Nombre Completo manualmente ────────
  const fullNameEditedRef = useRef(false);

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

  // Estados para clientes asignados
  const [availableClients, setAvailableClients] = useState<{ id: string; name: string }[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [clientsLoading, setClientsLoading] = useState(false);

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

      if (isExpired) {
        const refresh2 = await supabase.auth.refreshSession();
        session = refresh2.data.session ?? null;

        if (!session?.access_token) {
          throw new Error('Sesión expirada y no se pudo refrescar. Cerrá sesión e ingresá de nuevo.');
        }
      }
    } catch (e) {
      // non-blocking JWT decode
    }

    return session;
  }, []);

  const loadUsers = useCallback(async () => {
    if (loadUsersRunningRef.current) return;
    if (!orgId) return;
    loadUsersRunningRef.current = true;
    try {
      setLoading(true);
      setLoadError(null);
      await ensureSession();
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'list', orgId, debug: true },
      });
      if (error) {
        const msg = (error as any)?.message ?? '';
        const is401 = msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('jwt') || msg.toLowerCase().includes('api key');
        if (is401 && !loadUsers401RetryRef.current) {
          loadUsers401RetryRef.current = true;
          await supabase.auth.refreshSession();
          await ensureSession();
          const retry = await supabase.functions.invoke('admin-users', { body: { action: 'list', orgId, debug: true } });
          if (retry.error) throw retry.error;
          const fetched = (retry.data as any)?.users || [];
          setAllUsers(fetched);
          return;
        }
        throw error;
      }
      const fetched = (data as any)?.users || [];
      setAllUsers(fetched);
    } catch (err: any) {
      setLoadError('Error al cargar usuarios');
    } finally {
      setLoading(false);
      loadUsersRunningRef.current = false;
    }
  }, [orgId, ensureSession]);

  // Cargar IDs de usuarios del almacén activo
  const loadWarehouseUsers = useCallback(async () => {
    if (!orgId || !activeWarehouseId) {
      setWarehouseUserIds(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('user_warehouse_access')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('warehouse_id', activeWarehouseId);

      if (error) {
        setWarehouseUserIds(null);
        return;
      }

      const ids = (data || []).map((r: any) => r.user_id as string);
      setWarehouseUserIds(new Set(ids));
    } catch {
      setWarehouseUserIds(null);
    }
  }, [orgId, activeWarehouseId]);

  // Filtrar usuarios según almacén activo — HARDENING ESTRICTO:
  // Nunca mostrar todos por fallback cuando hay almacén activo
  useEffect(() => {
    if (!activeWarehouseId) {
      if (hasMultipleWarehouses) {
        setUsers([]);
      } else {
        setUsers(allUsers);
      }
    } else if (warehouseUserIds === null) {
      setUsers([]);
    } else {
      // user_warehouse_access.user_id == profiles.id == auth.users.id (mismo UUID)
      const filtered = allUsers.filter(u => warehouseUserIds.has(u.id));
      setUsers(filtered);
    }
  }, [allUsers, activeWarehouseId, warehouseUserIds, hasMultipleWarehouses]);

  useEffect(() => {
    loadWarehouseUsers();
  }, [loadWarehouseUsers]);

  const loadRoles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('id, name')
        .order('name');

      if (error) throw error;
      
      const safeRoles = data ?? [];
      setRoles(safeRoles);
    } catch (error: any) {
      setLoadError('Error al cargar roles');
    }
  }, []);

  const loadCountriesAndWarehouses = useCallback(async () => {
    if (!orgId) return;

    try {
      const [countriesData, warehousesData] = await Promise.all([
        countriesService.getActive(orgId),
        warehousesService.getAll(orgId)
      ]);

      setCountries(countriesData);
      setWarehouses(warehousesData);
    } catch (error: any) {
      setLoadError('Error al cargar países y almacenes');
    }
  }, [orgId]);

  // ✅ NUEVO: Cargar proveedores
  const loadProviders = useCallback(async () => {
    if (!orgId) return;

    try {
      setProvidersLoading(true);
      
      const providersData = await providersService.getActive(orgId);
      setProviders(providersData);
    } catch (error: any) {
      setLoadError('Error al cargar proveedores');
    } finally {
      setProvidersLoading(false);
    }
  }, [orgId]);

  // Cargar clientes disponibles filtrados por almacenes seleccionados
  const loadAvailableClients = useCallback(async (warehouseIds: string[]) => {
    if (!orgId || warehouseIds.length === 0) {
      setAvailableClients([]);
      return;
    }

    try {
      setClientsLoading(true);

      // Obtener clientes de los almacenes permitidos (vía warehouse_clients)
      const { data: wcRows, error } = await supabase
        .from('warehouse_clients')
        .select('client_id, clients!warehouse_clients_client_id_fkey(id, name, is_active)')
        .eq('org_id', orgId)
        .in('warehouse_id', warehouseIds);

      if (error) throw error;

      const seen = new Set<string>();
      const list: { id: string; name: string }[] = [];

      for (const row of (wcRows ?? []) as any[]) {
        const c = row.clients;
        if (c && c.is_active && !seen.has(c.id)) {
          seen.add(c.id);
          list.push({ id: c.id, name: c.name });
        }
      }

      list.sort((a, b) => a.name.localeCompare(b.name));
      setAvailableClients(list);
    } catch {
      setAvailableClients([]);
    } finally {
      setClientsLoading(false);
    }
  }, [orgId]);

  const loadUserAccess = useCallback(async (targetUserId: string) => {
    if (!orgId || !targetUserId) {
      return;
    }

    setAccessLoading(true);
    setAccessError(null);

    try {
      await ensureSession();

      const accessData = await userAccessService.get(orgId, targetUserId);
      
      setSelectedCountryIds(accessData.countryIds);
      setRestrictedByWarehouse(accessData.restricted);
      setSelectedWarehouseIds(accessData.warehouseIds);

      try {
        const userProviders = await userProvidersService.getUserProviders(orgId, targetUserId);
        const providerIds = userProviders.map(up => up.id);
        setSelectedProviderIds(providerIds);
      } catch {
        // non-blocking
      }

      try {
        const userClients = await userClientsService.getUserClients(orgId, targetUserId);
        setSelectedClientIds(userClients.map(c => c.id));
      } catch {
        // non-blocking
      }
    } catch (error: any) {
      setAccessError('Error al cargar accesos del usuario');
    } finally {
      setAccessLoading(false);
    }
  }, [orgId, ensureSession]);

  useEffect(() => {
    const run = async () => {
      if (permissionsLoading || !orgId) {
        // console.log('[UsersPage] waiting for permissions or orgId...', { permissionsLoading, orgId });
        return;
      }

      // console.log('[UsersPage] loading users & roles...');
      loadUsers401RetryRef.current = false;
      loadUsers();
      loadRoles();
      loadCountriesAndWarehouses();
      loadProviders();
    };

    run();
  }, [permissionsLoading, orgId, loadUsers, loadRoles, loadCountriesAndWarehouses, loadProviders, loadAvailableClients]);

  useEffect(() => {
    // console.log('[UsersPage] button permissions (final render)', {
    //   canCreate,
    //   canEdit,
    //   canDelete,
    //   canAssign,
    //   willShowCreateButton: canCreate,
    //   willShowEditButtons: canEdit,
    //   willShowDeleteButtons: canDelete,
    //   willShowAssignRole: canAssign
    // });
  }, [canCreate, canEdit, canDelete, canAssign]);

  // ─── Al montar la página: revisar si había un modal abierto con draft ────
  // Este efecto corre una sola vez al montar. Si el usuario estaba creando un
  // usuario y navegó a otra ruta, al volver encontrará el modal abierto con
  // sus datos intactos.
  useEffect(() => {
    const draft = readUserDraft();
    if (draft?.formData?.modalOpen === true) {
      const { email, full_name, role_id, phone_e164 } = draft.formData;
      setFormData(prev => ({
        ...prev,
        email: email ?? '',
        full_name: full_name ?? '',
        role_id: role_id ?? '',
        phone_e164: phone_e164 ?? '',
      }));
      if (full_name && full_name.trim()) {
        fullNameEditedRef.current = true;
      }
      setShowModal(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← solo al montar

  // ─── Al abrir el modal manualmente (botón "Nuevo Usuario"), restaurar draft si existe ──
  useEffect(() => {
    if (showModal && !editingUser) {
      const draft = readUserDraft();
      if (draft?.formData) {
        const { email, full_name, role_id, phone_e164 } = draft.formData;
        // Solo restaurar si el formulario está vacío (evitar pisar datos recién escritos)
        setFormData(prev => ({
          ...prev,
          email: prev.email || email || '',
          full_name: prev.full_name || full_name || '',
          role_id: prev.role_id || role_id || '',
          phone_e164: prev.phone_e164 || phone_e164 || '',
        }));
        if (full_name && full_name.trim()) {
          fullNameEditedRef.current = true;
        }
      }
    }
    if (!showModal) {
      fullNameEditedRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, editingUser]);

  // ─── Auto-guardar draft (campos + estado abierto) mientras el usuario escribe ──
  useEffect(() => {
    if (!showModal || !!editingUser) return;
    saveUserDraft({
      email: formData.email,
      full_name: formData.full_name,
      role_id: formData.role_id,
      phone_e164: formData.phone_e164,
      modalOpen: true,
    });
  }, [formData.email, formData.full_name, formData.role_id, formData.phone_e164, showModal, editingUser, saveUserDraft]);

  // ─── Búsqueda en la lista de usuarios ────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // ✅ NUEVO: Estado para manejar el userId recién creado
  const [newlyCreatedUserId, setNewlyCreatedUserId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await ensureSession();

      const phoneE164 = formData.phone_e164?.trim() || null;

      if (editingUser) {
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
          throw new Error((error as any).message || 'Error al actualizar usuario');
        }

        // console.log('[UsersPage] ✅ User updated successfully', { ok: !!data });

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

          // Guardar clientes asignados
          await userClientsService.setUserClients(orgId, editingUser.id, selectedClientIds);
        }

        setShowModal(false);
        setEditingUser(null);
        setFormData({ email: '', full_name: '', role_id: '', password: '', phone_e164: '' });
        setSelectedCountryIds([]);
        setRestrictedByWarehouse(false);
        setSelectedWarehouseIds([]);
        setSelectedProviderIds([]);
        setProviderSearchTerm('');
        setSelectedClientIds([]);
        setClientSearchTerm('');
        setAvailableClients([]);
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
        const { data, error } = await supabase.functions.invoke('admin-users', {
          body: {
            action: 'create',
            roleId: formData.role_id,
            email: formData.email,
            full_name: formData.full_name.trim() || formData.email.split('@')[0],
            password: formData.password,
            phone_e164: phoneE164,
            roleIds: formData.role_id ? [formData.role_id] : [],
            orgId
          },
        });

      if (error) {
        const msg = String((error as any)?.message ?? 'Error al crear usuario');
        const ctx = (error as any)?.context;

        let raw = '';
        try {
          if (ctx && typeof ctx.text === 'function') raw = await ctx.text();
        } catch (parseError) {
          // ignore
        }

        let server: any = null;
        try {
          if (raw) server = JSON.parse(raw);
        } catch (jsonError) {
          // ignore
        }



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

        // console.log('[UsersPage] ✅ User created successfully', { ok: !!data });

        // ✅ FIX: la edge function devuelve userId y user_id (compat). NO devuelve data.user.id.
        const createdUserId =
          (data as any)?.userId ??
          (data as any)?.user_id ??
          (data as any)?.user?.id ?? // fallback ultra defensivo
          null;

        if (!createdUserId) {
          // Si supabase.functions.invoke devolvió un error 409, aquí ya habríamos caído en "error".

          throw new Error('No se pudo obtener el ID del usuario (respuesta sin userId).');
        }

        // console.log('[UsersPage] 📝 Usuario creado con ID:', createdUserId);

        // ✅ NUEVO: Asignar países, almacenes y proveedores si se seleccionaron
        if (canAssignAccess && orgId) {
          // Guardar países si hay seleccionados
          if (selectedCountryIds.length > 0) {
            // console.log('[UsersPage] 🌍 Asignando países al nuevo usuario...');
            await userAccessService.setCountries({
              orgId,
              targetUserId: createdUserId,
              countryIds: selectedCountryIds,
            });
          }

          // Guardar almacenes:
          // - Si hay restricción activa y almacenes seleccionados → guardar esos almacenes
          // - Si hay almacén activo pero no hay restricción explícita → asignar el almacén activo de todas formas
          // - Si no hay restricción ni almacén activo → guardar sin restricción
          if (restrictedByWarehouse && selectedWarehouseIds.length > 0) {
            await userAccessService.setWarehouses({
              orgId,
              targetUserId: createdUserId,
              restricted: true,
              warehouseIds: selectedWarehouseIds,
            });
          } else if (!restrictedByWarehouse && activeWarehouseId) {
            // Sin restricción explícita pero hay almacén activo → asignar igualmente
            await userAccessService.setWarehouses({
              orgId,
              targetUserId: createdUserId,
              restricted: true,
              warehouseIds: [activeWarehouseId],
            });
          } else {
            await userAccessService.setWarehouses({
              orgId,
              targetUserId: createdUserId,
              restricted: false,
              warehouseIds: [],
            });
          }

          // ✅ NUEVO: Guardar proveedores si hay seleccionados
          if (selectedProviderIds.length > 0) {
            await userProvidersService.setUserProviders(orgId, createdUserId, selectedProviderIds);
          }

          // Guardar clientes asignados si hay seleccionados
          if (selectedClientIds.length > 0) {
            await userClientsService.setUserClients(orgId, createdUserId, selectedClientIds);
          }
        }

        // Limpiar draft y flag tras creación exitosa
        clearUserDraft();
        fullNameEditedRef.current = false;

        setShowModal(false);
        setEditingUser(null);
        setFormData({ email: '', full_name: '', role_id: '', password: '', phone_e164: '' });
        setSelectedCountryIds([]);
        setRestrictedByWarehouse(false);
        setSelectedWarehouseIds([]);
        setSelectedProviderIds([]);
        setProviderSearchTerm('');
        setSelectedClientIds([]);
        setClientSearchTerm('');
        setAvailableClients([]);
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
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error?.message || 'Error al guardar usuario',
        showCancel: false,
        onConfirm: () => setPopup(prev => ({ ...prev, isOpen: false }))
      });
    }
  };

  const handleEdit = async (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      full_name: user.full_name,
      role_id: user.role_id || '',
      password: '',
      phone_e164: user.phone_e164 ?? ''
    });
    // Limpiar estado de clientes antes de abrir
    setSelectedClientIds([]);
    setClientSearchTerm('');
    setAvailableClients([]);

    // Primero mostrar el modal, luego cargar accesos
    setShowModal(true);

    // Cargar accesos después de mostrar el modal (sin race condition)
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
      // console.log('[UsersPage] 🗑️ Deleting user via admin-users function');

      await ensureSession();

      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'remove_from_org',
          userId: targetUserId,
          orgId
        },
      });

      if (error) {
        throw new Error((error as any).message || 'Error al eliminar usuario');
      }

      // console.log('[UsersPage] ✅ User deleted successfully', { ok: !!data });
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
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error?.message || 'Error al eliminar usuario',
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
      // console.log('[UsersPage] ✅ Countries saved successfully');
    } catch (error: any) {
      setAccessError(error?.message || 'Error al guardar países');
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

      // INTERSECCIÓN: solo guardar warehouses que pertenezcan a los países seleccionados
      // Esto evita guardar OLO (Costa Rica) si el usuario solo tiene Venezuela asignado
      const validWarehouseIds = restrictedByWarehouse
        ? selectedWarehouseIds.filter(wid => {
            const wh = warehouses.find(w => w.id === wid);
            return wh && selectedCountryIds.includes(wh.country_id);
          })
        : [];

      await userAccessService.setWarehouses({
        orgId,
        targetUserId: editingUser.id,
        restricted: restrictedByWarehouse,
        warehouseIds: validWarehouseIds,
      });

      // Refrescar la lista de IDs del almacén activo para que la tabla se actualice
      await loadWarehouseUsers();

      setPopup({
        isOpen: true,
        type: 'success',
        title: 'Almacenes actualizados',
        message: 'El acceso a almacenes ha sido actualizado correctamente.',
        showCancel: false,
        onConfirm: () => setPopup(prev => ({ ...prev, isOpen: false }))
      });
    } catch (error: any) {
      setAccessError(error?.message || 'Error al guardar almacenes');
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

        // console.log('[UsersPage] ✅ Warehouse restriction removed');
      } catch (error) {
  
        setAccessError(error instanceof Error ? error.message : 'Error al quitar restricción');
      } finally {
        setAccessLoading(false);
      }
    }
    
    // Si es un usuario nuevo (no editingUser), solo cambiar el estado local
    if (!editingUser && !newValue) {
      setSelectedWarehouseIds([]);
      setSelectedClientIds([]);
      setAvailableClients([]);
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

  // Handler para clientes
  const handleToggleClient = (clientId: string) => {
    setSelectedClientIds(prev =>
      prev.includes(clientId) ? prev.filter(id => id !== clientId) : [...prev, clientId]
    );
  };

  // Recargar clientes disponibles cuando cambian los almacenes seleccionados
  // Solo cuando el modal está abierto para evitar queries innecesarias
  useEffect(() => {
    if (!showModal) return;
    if (restrictedByWarehouse && selectedWarehouseIds.length > 0) {
      loadAvailableClients(selectedWarehouseIds);
    } else if (!restrictedByWarehouse) {
      // Sin restricción de almacén → cargar de todos los almacenes del usuario
      const allWhs = warehouses.map(w => w.id);
      if (allWhs.length > 0) {
        loadAvailableClients(allWhs);
      } else {
        setAvailableClients([]);
      }
    } else {
      setAvailableClients([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, restrictedByWarehouse, selectedWarehouseIds.join(','), warehouses.length]);

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

  // ─── Filtrado de la lista de usuarios por búsqueda ────────────────────────
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const displayedUsers = normalizedSearch
    ? users.filter(u =>
        u.full_name?.toLowerCase().includes(normalizedSearch) ||
        u.email?.toLowerCase().includes(normalizedSearch) ||
        u.role_name?.toLowerCase().includes(normalizedSearch) ||
        u.phone_e164?.toLowerCase().includes(normalizedSearch)
      )
    : users;

  return (
    <div className="p-6">
      {/* Popups */}
      <ConfirmModal
        isOpen={popup.isOpen}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        showCancel={popup.showCancel}
        onConfirm={popup.onConfirm || (() => setPopup(prev => ({ ...prev, isOpen: false })))}
        onCancel={() => setPopup(prev => ({ ...prev, isOpen: false }))}
      />
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

      {/* Header con almacén activo */}
      <WarehousePageHeader
        title="Gestión de Usuarios"
        subtitle="Administra los usuarios del sistema"
        activeWarehouse={activeWarehouse}
        allowedWarehouses={allowedWarehouses}
        hasMultipleWarehouses={hasMultipleWarehouses}
        onWarehouseChange={setActiveWarehouseId}
        loading={warehouseLoading}
      />

      {/* Botón nuevo usuario */}
      <div className="flex items-center justify-between mb-6">
        <div>
          {activeWarehouseId && activeWarehouse ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 border border-teal-200 rounded-full text-xs font-medium text-teal-700">
                <i className="ri-store-2-line text-xs w-3 h-3 flex items-center justify-center"></i>
                {users.length} usuario(s) en {activeWarehouse.name}
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-500">{allUsers.length} usuario(s) en total</span>
          )}
        </div>
        {canCreate && (
          <button
            onClick={() => {
              setEditingUser(null);
              setFormData({ email: '', full_name: '', role_id: '', password: '', phone_e164: '' });
              setSelectedProviderIds([]);
              setProviderSearchTerm('');
              setSelectedClientIds([]);
              setClientSearchTerm('');
              setAvailableClients([]);
              setNewlyCreatedUserId(null);
              setAccessError(null);

              // Pre-cargar almacén activo si existe
              if (activeWarehouseId) {
                // Activar restricción por almacén y pre-seleccionar el almacén activo
                setRestrictedByWarehouse(true);
                setSelectedWarehouseIds([activeWarehouseId]);
                // Pre-seleccionar el país del almacén activo
                const activeWh = warehouses.find(w => w.id === activeWarehouseId);
                if (activeWh?.country_id) {
                  setSelectedCountryIds([activeWh.country_id]);
                } else {
                  setSelectedCountryIds([]);
                }
              } else {
                setSelectedCountryIds([]);
                setRestrictedByWarehouse(false);
                setSelectedWarehouseIds([]);
              }

              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            Nuevo Usuario
          </button>
        )}
      </div>

      {/* ─── Barra de búsqueda ─────────────────────────────────────────────── */}
      <div className="mb-4 relative">
        <div
          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-200 ${
            searchFocused
              ? 'border-teal-400 bg-white/90 backdrop-blur-sm shadow-sm'
              : 'border-gray-200 bg-white/70 backdrop-blur-sm'
          }`}
        >
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            <i className={`ri-search-line text-sm transition-colors duration-200 ${searchFocused ? 'text-teal-500' : 'text-gray-400'}`}></i>
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Buscar por nombre, email o rol..."
            className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <i className="ri-close-line text-sm"></i>
            </button>
          )}
        </div>
        {/* Contador de resultados cuando hay búsqueda activa */}
        {normalizedSearch && (
          <p className="mt-1.5 text-xs text-gray-500 pl-1">
            {displayedUsers.length === 0
              ? 'Sin resultados'
              : `${displayedUsers.length} resultado${displayedUsers.length !== 1 ? 's' : ''}`}
          </p>
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
              {displayedUsers.map((user) => (
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

        {/* Empty state: búsqueda sin resultados */}
        {normalizedSearch && displayedUsers.length === 0 && users.length > 0 && (
          <div className="text-center py-12">
            <div className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-50 mx-auto mb-3">
              <i className="ri-search-line text-2xl text-gray-300"></i>
            </div>
            <p className="text-gray-600 font-medium">Sin resultados para &ldquo;{searchTerm}&rdquo;</p>
            <p className="text-sm text-gray-400 mt-1">Intentá con otro nombre, email o rol.</p>
            <button
              onClick={() => setSearchTerm('')}
              className="mt-3 text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              Limpiar búsqueda
            </button>
          </div>
        )}

        {/* Empty state: múltiples almacenes sin selección */}
        {users.length === 0 && !loadError && !activeWarehouseId && hasMultipleWarehouses && (
          <div className="text-center py-16">
            <div className="w-14 h-14 flex items-center justify-center rounded-full bg-amber-50 mx-auto mb-4">
              <i className="ri-store-2-line text-3xl text-amber-500"></i>
            </div>
            <p className="text-gray-700 font-medium mb-1">Seleccioná un almacén</p>
            <p className="text-sm text-gray-500">Para ver los usuarios, seleccioná un almacén activo en el selector de arriba.</p>
          </div>
        )}

        {/* Empty state: almacén activo pero sin usuarios asignados */}
        {users.length === 0 && !loadError && activeWarehouseId && warehouseUserIds !== null && (
          <div className="text-center py-12">
            <div className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-50 mx-auto mb-3">
              <i className="ri-user-line text-2xl text-gray-300"></i>
            </div>
            <p className="text-gray-600 font-medium">No hay usuarios en {activeWarehouse?.name}</p>
            <p className="text-sm text-gray-400 mt-1">
              Creá un usuario nuevo o asignale acceso a este almacén desde el modal de edición.
            </p>
          </div>
        )}

        {/* Empty state: error al cargar IDs del almacén */}
        {users.length === 0 && !loadError && activeWarehouseId && warehouseUserIds === null && (
          <div className="text-center py-12">
            <div className="w-12 h-12 flex items-center justify-center rounded-full bg-amber-50 mx-auto mb-3">
              <i className="ri-error-warning-line text-2xl text-amber-400"></i>
            </div>
            <p className="text-gray-600 font-medium">No se pudo verificar el acceso al almacén</p>
            <p className="text-sm text-gray-400 mt-1">Intentá recargar la página.</p>
          </div>
        )}

        {/* Empty state: sin almacén activo, 1 solo almacén, sin usuarios */}
        {users.length === 0 && !loadError && !activeWarehouseId && !hasMultipleWarehouses && (
          <div className="text-center py-12">
            <i className="ri-user-line text-4xl text-gray-300 mb-3"></i>
            <p className="text-gray-500">No hay usuarios registrados</p>
          </div>
        )}

        {/* Error de carga general */}
        {users.length === 0 && loadError && (
          <div className="text-center py-12">
            <i className="ri-error-warning-line text-4xl text-yellow-400 mb-3"></i>
            <p className="text-gray-500">No se pudieron cargar los usuarios</p>
            <p className="text-sm text-gray-400 mt-1">Podés crear nuevos usuarios usando el botón de arriba</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
                </h2>
                {!editingUser && activeWarehouseId && activeWarehouse && (
                  <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 bg-teal-50 border border-teal-200 rounded-full text-xs font-medium text-teal-700">
                    <i className="ri-store-2-line text-xs w-3 h-3 flex items-center justify-center"></i>
                    Se asignará a {activeWarehouse.name}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  // X = cierre temporal intencional: borramos modalOpen del draft
                  // para que al volver a la página NO se reabra automáticamente,
                  // pero los campos siguen guardados para cuando el usuario pulse
                  // "Nuevo Usuario" de nuevo.
                  const draft = readUserDraft();
                  if (draft?.formData) {
                    saveGenericDraft(`draft_new_user_${orgId ?? 'local'}`, {
                      ...draft.formData,
                      modalOpen: false,
                    });
                  }
                  setShowModal(false);
                }}
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
                    onChange={(e) => {
                      fullNameEditedRef.current = true;
                      setFormData({ ...formData, full_name: e.target.value });
                    }}
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
                    onChange={(e) => {
                      const newEmail = e.target.value;
                      // Solo sugerir nombre desde email si el usuario NO lo ha editado manualmente
                      if (!fullNameEditedRef.current && !formData.full_name.trim()) {
                        const suggested = newEmail.split('@')[0].replace(/[._-]/g, ' ').trim();
                        setFormData(prev => ({ ...prev, email: newEmail, full_name: suggested }));
                      } else {
                        setFormData(prev => ({ ...prev, email: newEmail }));
                      }
                    }}
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

              {/* Sección de Clientes Asignados */}
              {canAssignAccess && (
                <div className="space-y-4 border-t border-gray-200 pt-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Clientes Asignados</h3>
                    {clientsLoading && (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600"></div>
                    )}
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <i className="ri-information-line text-amber-600 text-lg mt-0.5"></i>
                      <p className="text-sm text-amber-800">
                        Seleccioná los clientes que este usuario podrá gestionar. Los andenes visibles se calcularán como la intersección entre sus almacenes y los andenes permitidos para estos clientes. Si no seleccionás ninguno, el usuario verá todos los clientes de sus almacenes.
                      </p>
                    </div>
                  </div>

                  {availableClients.length === 0 && !clientsLoading ? (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
                      <i className="ri-user-2-line text-3xl text-gray-300 mb-2"></i>
                      <p className="text-sm text-gray-600">
                        {selectedWarehouseIds.length === 0 && restrictedByWarehouse
                          ? 'Seleccioná al menos un almacén para ver los clientes disponibles'
                          : 'No hay clientes disponibles en los almacenes seleccionados'}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Buscador */}
                      <div className="relative">
                        <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        <input
                          type="text"
                          placeholder="Buscar cliente..."
                          value={clientSearchTerm}
                          onChange={(e) => setClientSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                        />
                      </div>

                      {/* Contador */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">
                          {selectedClientIds.length === 0
                            ? 'Sin restricción de cliente (verá todos)'
                            : <>Seleccionados: <span className="font-semibold text-teal-600">{selectedClientIds.length}</span></>}
                        </span>
                        <div className="flex items-center gap-3">
                          {selectedClientIds.length < availableClients.filter(c => c.name.toLowerCase().includes(clientSearchTerm.toLowerCase())).length && (
                            <button
                              type="button"
                              onClick={() => setSelectedClientIds(availableClients.filter(c => c.name.toLowerCase().includes(clientSearchTerm.toLowerCase())).map(c => c.id))}
                              className="text-teal-600 hover:text-teal-700 font-medium"
                            >
                              Seleccionar todo
                            </button>
                          )}
                          {selectedClientIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedClientIds([])}
                              className="text-red-600 hover:text-red-700 font-medium"
                            >
                              Limpiar selección
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Lista */}
                      <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto">
                        {availableClients
                          .filter(c => c.name.toLowerCase().includes(clientSearchTerm.toLowerCase()))
                          .length === 0 ? (
                          <div className="p-4 text-center text-sm text-gray-500">
                            No se encontraron clientes
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {availableClients
                              .filter(c => c.name.toLowerCase().includes(clientSearchTerm.toLowerCase()))
                              .map(client => (
                                <label
                                  key={client.id}
                                  className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedClientIds.includes(client.id)}
                                    onChange={() => handleToggleClient(client.id)}
                                    disabled={accessLoading}
                                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                                  />
                                  <div className="flex-1">
                                    <span className="text-sm font-medium text-gray-900">{client.name}</span>
                                  </div>
                                </label>
                              ))}
                          </div>
                        )}
                      </div>

                      {!editingUser && selectedClientIds.length > 0 && (
                        <p className="text-xs text-gray-500">
                          Los clientes se asignarán al crear el usuario
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

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
                        <div className="flex items-center gap-3">
                          {selectedProviderIds.length < filteredProviders.length && (
                            <button
                              type="button"
                              onClick={() => setSelectedProviderIds(filteredProviders.map(p => p.id))}
                              className="text-teal-600 hover:text-teal-700 font-medium"
                            >
                              Seleccionar todo
                            </button>
                          )}
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
                    // Descarte explícito → limpiar draft y flag
                    if (!editingUser) {
                      clearUserDraft();
                      fullNameEditedRef.current = false;
                    }
                    setShowModal(false);
                    setEditingUser(null);
                    setFormData({ email: '', full_name: '', role_id: '', password: '', phone_e164: '' });
                    setSelectedCountryIds([]);
                    setRestrictedByWarehouse(false);
                    setSelectedWarehouseIds([]);
                    setSelectedProviderIds([]);
                    setProviderSearchTerm('');
                    setSelectedClientIds([]);
                    setClientSearchTerm('');
                    setAvailableClients([]);
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
