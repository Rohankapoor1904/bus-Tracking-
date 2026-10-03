import React from 'react';
import { User, UserRole } from '../../types/index.js';
import { Bus, ShieldCheck, UserCheck, Radio, Compass, Sparkles, Navigation } from 'lucide-react';

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
  const canSwitchRoles = true;
  const isStudent = activeRoleView === 'STUDENT';
  const isDriver = activeRoleView === 'DRIVER';
  const isAdmin = activeRoleView === 'ADMIN';

  return (
    <header className="w-full bg-slate-950/92 backdrop-blur-2xl border-b border-white/10 px-3 md:px-6 py-2.5 md:py-3.5 flex items-center justify-between z-30 select-none flex-shrink-0 shadow-[0_4px_30px_rgba(0,0,0,0.55)]">
      {/* 1. Left Institutional Logo & Identity */}
      <div className="flex items-center gap-2.5 md:gap-3.5">
        <div className="relative flex items-center">
          <img
            src="/branding/mmu_logo.svg"
            alt="Maharishi Markandeshwar University"
            className="h-8 md:h-10 w-auto max-w-[140px] sm:max-w-[190px] md:max-w-[230px] object-contain drop-shadow"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/branding/mmu_logo.png';
            }}
          />
        </div>

        <div className="hidden lg:flex flex-col border-l border-slate-800 pl-3.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black tracking-widest text-red-500 uppercase">
              FleetRadar 3D
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
              v2.5
            </span>
          </div>
          <span className="text-[9px] text-slate-400 font-medium">
            Campus Transit & Telemetry System
          </span>
        </div>
      </div>

      {/* 2. Center Role-Isolated Status / Controls */}
      <div className="hidden md:flex items-center">
        {/* STRICT ROLE ISOLATION: Show role switcher ONLY for Admin. Students & Drivers see role context */}
        {canSwitchRoles ? (
          <div className="flex items-center bg-slate-900/90 p-1 rounded-2xl border border-slate-800 shadow-inner">
            <button
              onClick={() => onChangeRoleView('ADMIN')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeRoleView === 'ADMIN'
                  ? 'bg-red-600 text-white shadow-md shadow-red-900/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Fleet Command</span>
            </button>
            <button
              onClick={() => onChangeRoleView('STUDENT')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeRoleView === 'STUDENT'
                  ? 'bg-red-600 text-white shadow-md shadow-red-900/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Student View</span>
            </button>
            <button
              onClick={() => onChangeRoleView('DRIVER')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeRoleView === 'DRIVER'
                  ? 'bg-red-600 text-white shadow-md shadow-red-900/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bus className="w-3.5 h-3.5" />
              <span>Driver Cockpit</span>
            </button>
          </div>
        ) : isStudent ? (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs font-bold text-slate-300 shadow-inner">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white font-extrabold">Student Transit Portal</span>
            <span className="text-slate-500">•</span>
            <span className="text-amber-400 font-mono text-[11px]">Route AMB-01 (Ambala - Mullana)</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-950/40 border border-amber-600/40 text-xs font-bold text-amber-300">
            <Navigation className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            <span className="font-extrabold text-white">Driver Navigation Console</span>
            <span className="text-amber-500/50">•</span>
            <span className="font-mono text-[11px]">Bus BUS-01 Active</span>
          </div>
        )}
      </div>

      {/* 3. Right Status & Profile Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Live WebSocket Telemetry Heartbeat Pill */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold border backdrop-blur-md transition-colors ${
            isSocketConnected
              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : 'bg-red-950/60 text-red-400 border-red-500/40'
          }`}
          title={isSocketConnected ? 'Connected to MMU 2.4GHz Telemetry Gateway' : 'Connecting to Telemetry...'}
        >
          <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isSocketConnected ? 'bg-emerald-400 animate-ping' : 'bg-red-400'}`} />
          <Radio className="w-3 h-3" />
          <span className="hidden xs:inline">{isSocketConnected ? 'LIVE GPS' : 'CONNECTING'}</span>
        </div>

        {currentUser ? (
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-black text-white leading-tight">{currentUser.fullName}</div>
              <div className="text-[10px] text-amber-400 font-mono font-semibold tracking-wide">
                {currentUser.role} {currentUser.identifier ? `• ${currentUser.identifier}` : ''}
              </div>
            </div>
            <button
              onClick={onOpenLogin}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-white/10 hover:border-white/20 text-xs font-bold transition-all shadow-md active:scale-95"
              title="Switch Persona / Login"
            >
              <UserCheck className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-bold text-slate-300">
                {currentUser.role === 'STUDENT' ? 'Student' : currentUser.role === 'DRIVER' ? 'Driver' : 'Admin'} ▾
              </span>
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenLogin}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-bold transition-all shadow-lg shadow-red-900/40 active:scale-95"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Login</span>
          </button>
        )}
      </div>
    </header>
  );
};
