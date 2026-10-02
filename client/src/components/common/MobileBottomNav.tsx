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
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900/95 backdrop-blur-2xl border-t border-slate-800 flex items-center justify-around px-2 z-40 select-none pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_25px_rgba(0,0,0,0.7)]">
      <button
        onClick={() => onChangeRoleView('STUDENT')}
        className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
          activeRoleView === 'STUDENT'
            ? 'text-red-500 font-extrabold'
            : 'text-slate-400 hover:text-slate-200 font-semibold'
        }`}
      >
        <div className={`p-1 rounded-xl transition-all ${activeRoleView === 'STUDENT' ? 'bg-red-600/20' : ''}`}>
          <Compass className="w-5 h-5" />
        </div>
        <span className="text-[10px] mt-0.5 tracking-tight">Student 3D</span>
      </button>

      <button
        onClick={() => onChangeRoleView('DRIVER')}
        className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
          activeRoleView === 'DRIVER'
            ? 'text-red-500 font-extrabold'
            : 'text-slate-400 hover:text-slate-200 font-semibold'
        }`}
      >
        <div className={`p-1 rounded-xl transition-all ${activeRoleView === 'DRIVER' ? 'bg-red-600/20' : ''}`}>
          <Bus className="w-5 h-5" />
        </div>
        <span className="text-[10px] mt-0.5 tracking-tight">Driver Console</span>
      </button>

      <button
        onClick={() => onChangeRoleView('ADMIN')}
        className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
          activeRoleView === 'ADMIN'
            ? 'text-red-500 font-extrabold'
            : 'text-slate-400 hover:text-slate-200 font-semibold'
        }`}
      >
        <div className={`p-1 rounded-xl transition-all ${activeRoleView === 'ADMIN' ? 'bg-red-600/20' : ''}`}>
          <ShieldCheck className="w-5 h-5" />
        </div>
        <span className="text-[10px] mt-0.5 tracking-tight">Fleet Radar</span>
      </button>
    </nav>
  );
};
