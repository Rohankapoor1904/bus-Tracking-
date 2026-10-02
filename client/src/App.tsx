import React, { useState, useEffect } from 'react';
import { Header } from './components/common/Header.js';
import { MobileBottomNav } from './components/common/MobileBottomNav.js';
import { AuthModal } from './components/common/AuthModal.js';
import { StudentView } from './components/student/StudentView.js';
import { DriverConsole } from './components/driver/DriverConsole.js';
import { AdminDashboard } from './components/admin/AdminDashboard.js';
import { User, UserRole } from './types/index.js';
import { api } from './services/api.js';
import { socketService } from './services/websocket.js';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeRoleView, setActiveRoleView] = useState<UserRole>('STUDENT');
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);

  // Initialize session
  useEffect(() => {
    const initSession = async () => {
      try {
        const token = api.getToken();
        if (token) {
          const user = await api.getMe();
          setCurrentUser(user);
          setActiveRoleView(user.role as UserRole);
        } else {
          // Auto-login with default Student persona for instant interactive evaluation
          const loginRes = await api.login('student.aarav@mmumullana.org', 'MMU@Secure2026', 'STUDENT');
          setCurrentUser(loginRes.user);
          setActiveRoleView('STUDENT');
        }
      } catch (e) {
        console.warn('Auto-session initialization warning:', e);
      }
    };

    initSession();

    // Connect WebSocket
    socketService.connect(api.getToken() || undefined);
    const unsubscribeStatus = socketService.on('connection_status', (status: any) => {
      setIsSocketConnected(status.connected);
    });

    return () => {
      unsubscribeStatus();
    };
  }, []);

  const handleRoleChange = (role: UserRole) => {
    setActiveRoleView(role);
  };

  const handleLogout = () => {
    api.setToken(null);
    setCurrentUser(null);
    setIsAuthOpen(true);
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* Institutional Top Navigation Bar */}
      <Header
        currentUser={currentUser}
        activeRoleView={activeRoleView}
        onChangeRoleView={handleRoleChange}
        onOpenLogin={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
        isSocketConnected={isSocketConnected}
      />

      {/* Active Role Viewport */}
      <main className={`flex-1 w-full relative overflow-hidden ${activeRoleView === 'STUDENT' ? 'pb-0' : 'pb-16 md:pb-0'}`}>
        {activeRoleView === 'STUDENT' && <StudentView onOpenAuth={() => setIsAuthOpen(true)} />}
        {activeRoleView === 'DRIVER' && <DriverConsole />}
        {activeRoleView === 'ADMIN' && <AdminDashboard />}
      </main>

      {/* Mobile Native Bottom Navigation Bar */}
      <MobileBottomNav
        activeRoleView={activeRoleView}
        onChangeRoleView={handleRoleChange}
      />

      {/* Authentication & Persona Switcher Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(user) => {
          setCurrentUser(user);
          setActiveRoleView(user.role as UserRole);
        }}
      />
    </div>
  );
};

export default App;
