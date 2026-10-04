import React, { useState, useEffect } from 'react';
import { Header } from './components/common/Header.js';
import { MobileBottomNav } from './components/common/MobileBottomNav.js';
import { AuthModal } from './components/common/AuthModal.js';
import { ServerConfigModal } from './components/common/ServerConfigModal.js';
import { StudentView } from './components/student/StudentView.js';
import { DriverConsole } from './components/driver/DriverConsole.js';
import { AdminDashboard } from './components/admin/AdminDashboard.js';
import { User, UserRole } from './types/index.js';
import { api, getServerHost } from './services/api.js';
import { socketService } from './services/websocket.js';
import { KeyRound, Bus, Radio, Wifi } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeRoleView, setActiveRoleView] = useState<UserRole>('STUDENT');
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isServerConfigOpen, setIsServerConfigOpen] = useState<boolean>(false);
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);

  // Restore a persisted session only. There is no automatic/default login:
  // without a valid token the app stays on the login gate.
  useEffect(() => {
    const initSession = async () => {
      const token = api.getToken();
      if (!token) {
        setIsAuthOpen(true);
        return;
      }
      try {
        const user = await api.getMe();
        setCurrentUser(user);
        setActiveRoleView(user.role as UserRole);
        socketService.connect(token);
      } catch {
        setIsAuthOpen(true);
      }
    };

    initSession();

    const unsubscribeStatus = socketService.on('connection_status', (status: any) => {
      setIsSocketConnected(status.connected);
    });

    return () => {
      unsubscribeStatus();
    };
  }, []);

  const applySession = (user: User) => {
    setCurrentUser(user);
    setActiveRoleView(user.role as UserRole);
    socketService.connect(api.getToken() ?? undefined);
  };

  const handleRoleChange = async (role: UserRole) => {
    if (!currentUser) {
      setIsAuthOpen(true);
      return;
    }
    // Already authenticated as this role — just switch the viewport.
    if (currentUser.role === role) {
      setActiveRoleView(role);
      return;
    }

    // The shared global access session or admin may open another role without
    // re-entering credentials.
    if (!currentUser.isGlobalAccess && currentUser.role !== 'ADMIN') {
      setIsAuthOpen(true);
      return;
    }

    try {
      const res = await api.reauthenticate(role);
      applySession(res.user);
    } catch (e) {
      console.warn('Role switch failed:', e);
      setIsAuthOpen(true);
    }
  };

  const handleLogout = () => {
    api.setToken(null);
    setCurrentUser(null);
    setIsAuthOpen(true);
  };

  // Unauthenticated gate — no role view or privileged data is shown.
  if (!currentUser) {
    return (
      <div className="w-full h-full min-h-[100dvh] flex flex-col bg-slate-950 text-slate-100 font-sans select-none">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(226,30,38,0.18),transparent_65%)]" />
          <div className="relative flex flex-col items-center animate-hud-rise">
            <img
              src="/branding/mmu_logo.svg"
              alt="Maharishi Markandeshwar University"
              className="h-14 w-auto mb-5 drop-shadow-lg"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/branding/mmu_logo.png';
              }}
            />
            <h1 className="text-2xl font-black tracking-tight text-white">MMU FleetRadar 3D</h1>
            <p className="text-xs text-slate-400 mt-1.5 mb-6 max-w-xs">
              Campus transit tracking for students, drivers and fleet command.
            </p>
            <button
              onClick={() => setIsAuthOpen(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-sm font-bold transition-all shadow-lg shadow-red-900/40 active:scale-95"
            >
              <KeyRound className="w-4 h-4" />
              <span>Login with Global ID</span>
            </button>
            <div className="flex items-center gap-1.5 mt-6 text-[11px] text-slate-500">
              <Bus className="w-3.5 h-3.5" />
              <span>Live GPS telemetry · Authenticated access only</span>
            </div>

            <button
              onClick={() => setIsServerConfigOpen(true)}
              className="mt-4 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <Radio className={`w-3 h-3 ${isSocketConnected ? 'text-emerald-400' : 'text-red-400'}`} />
              <span>Server: {getServerHost()}</span>
              <span className="text-[9px] text-slate-500 font-sans">(Tap to configure)</span>
            </button>
          </div>
        </div>

        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
          onSuccess={applySession}
        />

        <ServerConfigModal
          isOpen={isServerConfigOpen}
          onClose={() => setIsServerConfigOpen(false)}
          isSocketConnected={isSocketConnected}
        />
      </div>
    );
  }

  const canSwitchRoles = currentUser.isGlobalAccess === true || currentUser.role === 'ADMIN';
  const showBottomNav = false;

  return (
    <div className="w-full h-full min-h-[100dvh] flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* Institutional Top Navigation Bar */}
      <Header
        currentUser={currentUser}
        activeRoleView={activeRoleView}
        onChangeRoleView={handleRoleChange}
        onOpenLogin={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
        isSocketConnected={isSocketConnected}
        onOpenServerConfig={() => setIsServerConfigOpen(true)}
      />

      {/* Active Role Viewport */}
      <main className="flex-1 w-full relative overflow-hidden pb-0">
        {activeRoleView === 'STUDENT' && <StudentView onOpenAuth={() => setIsAuthOpen(true)} />}
        {activeRoleView === 'DRIVER' && <DriverConsole />}
        {activeRoleView === 'ADMIN' && <AdminDashboard />}
      </main>

      {/* Mobile Native Bottom Navigation Bar */}
      <MobileBottomNav
        activeRoleView={activeRoleView}
        onChangeRoleView={handleRoleChange}
        canSwitchRoles={canSwitchRoles}
      />

      {/* Authentication & Persona Switcher Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={applySession}
      />

      {/* Server & Telemetry Connectivity Configuration Modal */}
      <ServerConfigModal
        isOpen={isServerConfigOpen}
        onClose={() => setIsServerConfigOpen(false)}
        isSocketConnected={isSocketConnected}
      />
    </div>
  );
};

export default App;
