import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { AuthProvider } from "./contexts/AuthContext";
import { ClientPickupRulesProvider } from "./contexts/ClientPickupRulesContext";
import { useLocation } from "react-router-dom";
import Sidebar from "./components/feature/Sidebar";
import Navbar from "./components/feature/Navbar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { GmailConnectionGuard } from "./components/guards/GmailConnectionGuard";
import { useAuth } from "./contexts/AuthContext";
import SROAssistantWidget from "./components/feature/chat-widget/SROAssistantWidget";

function AppContent() {
  const location = useLocation();
  const { user, loading, permissionsLoading } = useAuth();
  
  const isLoginPage = location.pathname === '/login';
  const isAccessPendingPage = location.pathname === '/access-pending';
  const isAuthenticatedLayout = !isLoginPage && !isAccessPendingPage;

  // ✅ Determinar si el guard está listo para ejecutarse
  const guardReady = !loading && !permissionsLoading && !!user;
  const orgId = user?.orgId ?? null;

  return (
    <>
      {/* ✅ SUPER MODAL global - aparece en cualquier módulo si no hay Gmail conectado */}
      <GmailConnectionGuard orgId={orgId} ready={guardReady} />
      
      <div className="flex min-h-screen bg-gray-50">
        {isAuthenticatedLayout && <Sidebar />}
        <main className="flex-1 overflow-auto pb-16 lg:pb-0">
          {isAuthenticatedLayout && <Navbar />}
          <AppRoutes />
        </main>
      </div>

      {/* ✅ Widget flotante de chat — montado una sola vez, visible en toda la app autenticada */}
      {isAuthenticatedLayout && <SROAssistantWidget />}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <I18nextProvider i18n={i18n}>
          <BrowserRouter basename={__BASE_PATH__}>
            <ClientPickupRulesProvider>
              <AppContent />
            </ClientPickupRulesProvider>
          </BrowserRouter>
        </I18nextProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
