import React from 'react';
import { UserRole } from '../../types/index.js';
import { Compass, Bus, ShieldCheck } from 'lucide-react';

interface MobileBottomNavProps {
  activeRoleView: UserRole;
  onChangeRoleView: (role: UserRole) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeRoleView,
  onChangeRoleView,
}) => {
  // STRICT ROLE ISOLATION:
  // For Student view, the entire screen bottom belongs to the Student Floating Transit Card.
  // Do NOT render mobile nav bar with Driver/Admin controls!
  if (activeRoleView === 'STUDENT') {
    return null;
  }

  // Render bottom switcher only for Admin management or role transitions
  if (activeRoleView === 'ADMIN') {
    return (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-950/95 backdrop-blur-2xl border-t border-white/10 flex items-center justify-around px-2 z-40 select-none pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_25px_rgba(0,0,0,0.8)]">
        <button
          onClick={() => onChangeRoleView('ADMIN')}
          className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-all active:scale-95 ${
            activeRoleView === 'ADMIN'
              ? 'text-red-500 font-extrabold'
              : 'text-slate-400 hover:text-slate-200 font-semibold'
          }`}
        >
          <div className={`p-1 rounded-xl transition-all ${activeRoleView === 'ADMIN' ? 'bg-red-600/20 ring-1 ring-red-500/40' : ''}`}>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">Fleet Radar</span>
        </button>

        <button
          onClick={() => onChangeRoleView('STUDENT')}
          className="flex-1 flex flex-col items-center justify-center py-1 rounded-xl text-slate-400 hover:text-slate-200 font-semibold transition-all active:scale-95"
        >
          <div className="p-1 rounded-xl">
            <Compass className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">Student View</span>
        </button>

        <button
          onClick={() => onChangeRoleView('DRIVER')}
          className="flex-1 flex flex-col items-center justify-center py-1 rounded-xl text-slate-400 hover:text-slate-200 font-semibold transition-all active:scale-95"
        >
          <div className="p-1 rounded-xl">
            <Bus className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">Driver Console</span>
        </button>
      </nav>
    );
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
