import React from 'react';
import { UserRole } from '../../types/index.js';
import { Compass, Bus, ShieldCheck } from 'lucide-react';

interface MobileBottomNavProps {
  activeRoleView: UserRole;
  onChangeRoleView: (role: UserRole) => void;
  canSwitchRoles?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeRoleView,
  onChangeRoleView,
  canSwitchRoles = false,
}) => {
  // Role switching is only offered to the shared global access session.
  if (!canSwitchRoles) {
    return null;
  }

  // STRICT ROLE ISOLATION:
  // Admin panel must NOT show Student View and Driver Console at bottom.
  // Role switching is cleanly handled via institutional Header menu.
  if (activeRoleView === 'ADMIN' || activeRoleView === 'STUDENT') {
    return null;
  }

  if (activeRoleView === 'DRIVER') {
    return (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-slate-950/95 backdrop-blur-2xl border-t border-white/10 flex items-center justify-around px-3 z-40 select-none pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_25px_rgba(0,0,0,0.8)]">
        <button
          onClick={() => onChangeRoleView('STUDENT')}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-900/90 border border-slate-700/80 text-xs font-black text-cyan-300 hover:text-white active:scale-95 transition-all"
        >
          <Compass className="w-4 h-4 text-cyan-400" />
          <span>Switch to Student Passenger View</span>
        </button>
      </nav>
    );
  }

  return null;
};
