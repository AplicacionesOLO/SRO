
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ConfirmModal } from '../../components/base/ConfirmModal';

interface ProfileData {
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  roleName: string;
  orgName: string;
  countryName: string | null;
  providers: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
}

export default function PerfilPage() {
  const { user, logout, loading: authLoading } = useAuth();
  const { orgId } = usePermissions();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Redirige al login si no hay usuario autenticado
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [authLoading, user, navigate]);

  // Carga el perfil cuando el usuario y la organización están disponibles
  useEffect(() => {
    if (user && orgId) {
      loadProfile();
    }
  }, [user, orgId]);

  const loadProfile = async () => {
    if (!user || !orgId) return;
    setLoading(true);
    try {
      // ---------- Perfil básico ----------
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name, email, created_at, updated_at, country_id')
        .eq('id', user.id)
        .maybeSingle();

      // ---------- Rol y organización ----------
      const { data: uorData } = await supabase
        .from('user_org_roles')
        .select(`
          org_id,
          roles!user_org_roles_role_id_fkey ( name ),
          organizations!user_org_roles_org_id_fkey ( name )
        `)
        .eq('user_id', user.id)
        .maybeSingle();

      // ---------- País ----------
      let countryName: string | null = null;
      if (profileData?.country_id) {
        const { data: countryData } = await supabase
          .from('countries')
          .select('name')
          .eq('id', profileData.country_id)
          .maybeSingle();
        countryName = countryData?.name || null;
      }

      // ---------- Proveedores ----------
      const { data: userProviders } = await supabase
        .from('user_providers')
        .select('provider_id, providers!user_providers_provider_id_fkey ( id, name )')
        .eq('org_id', orgId)
        .eq('user_id', user.id);

      const providers = (userProviders || [])
        .map((up: any) => ({
          id: up.providers?.id || up.provider_id,
          name: up.providers?.name || 'Sin nombre',
        }))
        .filter(p => p.name !== 'Sin nombre');

      // ---------- Almacenes ----------
      const { data: userWarehouses } = await supabase
        .from('user_warehouses')
        .select('warehouse_id, warehouses!user_warehouses_warehouse_id_fkey ( id, name )')
        .eq('org_id', orgId)
        .eq('user_id', user.id);

      const warehouses = (userWarehouses || [])
        .map((uw: any) => ({
          id: uw.warehouses?.id || uw.warehouse_id,
          name: uw.warehouses?.name || 'Sin nombre',
        }))
        .filter(w => w.name !== 'Sin nombre');

      // ---------- Seteo del estado ----------
      setProfile({
        name: profileData?.name || user.name,
        email: profileData?.email || user.email,
        createdAt: profileData?.created_at || '',
        updatedAt: profileData?.updated_at || '',
        roleName: (uorData?.roles as any)?.name || user.role,
        orgName: (uorData?.organizations as any)?.name || 'Sin organización',
        countryName,
        providers,
        warehouses,
      });
    } catch (err) {
      console.error('[PerfilPage] Error loading profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess(false);

    if (!passwordForm.newPass || !passwordForm.confirm) {
      setPasswordError('Completá todos los campos.');
      return;
    }
    if (passwordForm.newPass.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (passwordForm.newPass !== passwordForm.confirm) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPass,
      });

      if (error) {
        setPasswordError(error.message);
      } else {
        setPasswordSuccess(true);
        setPasswordForm({ current: '', newPass: '', confirm: '' });
        setTimeout(() => {
          setShowPasswordModal(false);
          setPasswordSuccess(false);
        }, 2000);
      }
    } catch (err: any) {
      setPasswordError(err.message || 'Error al cambiar contraseña');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr), "d 'de' MMMM yyyy, HH:mm", { locale: es });
    } catch {
      return '—';
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">Cargando perfil...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">No se pudo cargar el perfil.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-6 py-6">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4 cursor-pointer"
            >
              <i className="ri-arrow-left-line text-lg w-5 h-5 flex items-center justify-center"></i>
              Volver
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Mi Perfil</h1>
            <p className="text-sm text-gray-500 mt-1">Información de tu cuenta y accesos</p>
          </div>

          {/* Avatar + Nombre */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-4">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl font-bold text-teal-600">
                  {profile.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold text-gray-900 truncate">{profile.name}</h2>
                <p className="text-sm text-gray-500 truncate">{profile.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700">
                    <i className="ri-shield-user-line text-xs w-3 h-3 flex items-center justify-center"></i>
                    {profile.roleName}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    <i className="ri-building-line text-xs w-3 h-3 flex items-center justify-center"></i>
                    {profile.orgName}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Información General */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <i className="ri-user-line text-teal-600 w-4 h-4 flex items-center justify-center"></i>
              Información General
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nombre</label>
                <p className="text-sm font-medium text-gray-900">{profile.name}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Correo electrónico</label>
                <p className="text-sm font-medium text-gray-900">{profile.email}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Rol</label>
                <p className="text-sm font-medium text-gray-900">{profile.roleName}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Organización</label>
                <p className="text-sm font-medium text-gray-900">{profile.orgName}</p>
              </div>
              {profile.countryName && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">País</label>
                  <p className="text-sm font-medium text-gray-900">{profile.countryName}</p>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Cuenta creada</label>
                <p className="text-sm font-medium text-gray-900">{formatDate(profile.createdAt)}</p>
              </div>
            </div>
          </div>

          {/* Proveedores Asignados */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <i className="ri-truck-line text-teal-600 w-4 h-4 flex items-center justify-center"></i>
              Proveedores Asignados
              <span className="ml-auto text-xs font-normal text-gray-400">{profile.providers.length}</span>
            </h3>
            {profile.providers.length === 0 ? (
              <div className="flex items-center gap-3 py-3 px-4 bg-gray-50 rounded-lg">
                <i className="ri-information-line text-gray-400 w-4 h-4 flex items-center justify-center"></i>
                <p className="text-sm text-gray-500">
                  No tenés proveedores asignados. Contactá a un administrador.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {profile.providers.map(p => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-teal-50 text-teal-700 border border-teal-100"
                  >
                    <i className="ri-truck-line text-xs w-3 h-3 flex items-center justify-center"></i>
                    {p.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Almacenes Asignados */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <i className="ri-building-2-line text-teal-600 w-4 h-4 flex items-center justify-center"></i>
              Almacenes Asignados
              <span className="ml-auto text-xs font-normal text-gray-400">{profile.warehouses.length}</span>
            </h3>
            {profile.warehouses.length === 0 ? (
              <div className="flex items-center gap-3 py-3 px-4 bg-gray-50 rounded-lg">
                <i className="ri-information-line text-gray-400 w-4 h-4 flex items-center justify-center"></i>
                <p className="text-sm text-gray-500">
                  No tenés almacenes asignados. Contactá a un administrador.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {profile.warehouses.map(w => (
                  <span
                    key={w.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
                  >
                    <i className="ri-building-2-line text-xs w-3 h-3 flex items-center justify-center"></i>
                    {w.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <i className="ri-settings-3-line text-teal-600 w-4 h-4 flex items-center justify-center"></i>
              Acciones
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setPasswordForm({ current: '', newPass: '', confirm: '' });
                  setPasswordError('');
                  setPasswordSuccess(false);
                  setShowPasswordModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-lock-line text-base w-4 h-4 flex items-center justify-center"></i>
                Cambiar Contraseña
              </button>
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-logout-box-line text-base w-4 h-4 flex items-center justify-center"></i>
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Cambiar Contraseña */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Cambiar Contraseña</h3>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-lg text-gray-500"></i>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {passwordSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <i className="ri-checkbox-circle-line text-green-600 w-4 h-4 flex items-center justify-center"></i>
                  <p className="text-sm text-green-700">Contraseña actualizada correctamente.</p>
                </div>
              )}
              {passwordError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <i className="ri-error-warning-line text-red-600 w-4 h-4 flex items-center justify-center"></i>
                  <p className="text-sm text-red-700">{passwordError}</p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1.5">Nueva contraseña</label>
                <input
                  type="password"
                  value={passwordForm.newPass}
                  onChange={e => setPasswordForm(prev => ({ ...prev, newPass: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1.5">Confirmar contraseña</label>
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={e => setPasswordForm(prev => ({ ...prev, confirm: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Repetí la contraseña"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                Cancelar
              </button>
              <button
                onClick={handleChangePassword}
                disabled={changingPassword}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {changingPassword ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Logout */}
      <ConfirmModal
        isOpen={showLogoutConfirm}
        type="warning"
        title="¿Cerrar sesión?"
        message="¿Estás seguro de que querés salir? Tendrás que volver a iniciar sesión."
        confirmText="Sí, cerrar sesión"
        cancelText="Cancelar"
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
        showCancel={true}
      />
    </div>
  );
}
