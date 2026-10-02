import React from 'react';
import { User, UserRole } from '../../types/index.js';
import { Bus, ShieldCheck, UserCheck, Radio, Compass } from 'lucide-react';

interface HeaderProps {
  currentUser: User | null;
  activeRoleView: UserRole;
  onChangeRoleView: (role: UserRole) => void;
  onOpenLogin: () => void;
  onLogout: () => void;
  isSocketConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeRoleView,
  onChangeRoleView,
  onOpenLogin,
  isSocketConnected,
}) => {
  return (
    <header className="h-14 md:h-16 w-full bg-slate-900/95 backdrop-blur-xl border-b border-slate-800 px-3 md:px-6 flex items-center justify-between z-30 select-none flex-shrink-0">
      {/* 1. Left Institutional Logo & Identity */}
      <div className="flex items-center gap-2 md:gap-3">
        <img
          src="/branding/mmu_logo.svg"
          alt="Maharishi Markandeshwar University"
          className="h-8 md:h-9 w-auto max-w-[140px] sm:max-w-[180px] md:max-w-[220px] object-contain drop-shadow"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/branding/mmu_logo.png';
          }}
        />

        <div className="hidden lg:flex flex-col border-l border-slate-700 pl-3">
          <span className="text-[11px] font-black tracking-widest text-red-500 uppercase">
            FleetRadar 3D
          </span>
          <span className="text-[9px] text-slate-400 font-medium">
            Real-Time Campus Transit & Telemetry
          </span>
        </div>
      </div>

      {/* 2. Center Role Navigation Switcher (Desktop Only - hidden on mobile in favor of thumb bottom nav) */}
      <div className="hidden md:flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800">
        <button
          onClick={() => onChangeRoleView('STUDENT')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeRoleView === 'STUDENT'
              ? 'bg-red-600 text-white shadow-md shadow-red-900/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Student 3D View</span>
        </button>

        <button
          onClick={() => onChangeRoleView('DRIVER')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeRoleView === 'DRIVER'
              ? 'bg-red-600 text-white shadow-md shadow-red-900/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Bus className="w-3.5 h-3.5" />
          <span>Driver Console</span>
        </button>

        <button
          onClick={() => onChangeRoleView('ADMIN')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeRoleView === 'ADMIN'
              ? 'bg-red-600 text-white shadow-md shadow-red-900/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Fleet Command</span>
        </button>
      </div>

      {/* 3. Right Status & Profile Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Live WebSocket Heartbeat Pill */}
        <div
          className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border ${
            isSocketConnected
              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
              : 'bg-red-950/60 text-red-400 border-red-800'
          }`}
          title={isSocketConnected ? 'Connected to MMU Telemetry WebSocket' : 'Connecting...'}
        >
          <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isSocketConnected ? 'bg-emerald-400 animate-ping' : 'bg-red-400'}`} />
          <Radio className="w-3 h-3" />
          <span className="hidden xs:inline">{isSocketConnected ? 'LIVE' : 'DISCONNECTED'}</span>
        </div>

        {currentUser ? (
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-white">{currentUser.fullName}</div>
              <div className="text-[10px] text-amber-400 font-mono">{currentUser.role}</div>
            </div>
            <button
              onClick={onOpenLogin}
              className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors"
              title="Switch Persona"
            >
              <UserCheck className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Switch</span>
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenLogin}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md shadow-red-900/40"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Login</span>
          </button>
        )}
      </div>
    </header>
  );
};
