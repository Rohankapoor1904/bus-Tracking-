import React, { useState } from 'react';
import { api } from '../../services/api.js';
import { UserRole, User } from '../../types/index.js';
import { ShieldCheck, Bus, Compass, X, KeyRound, Sparkles } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password] = useState('MMU@Secure2026');
  const [role, setRole] = useState<UserRole>('STUDENT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (targetEmail = email, targetRole = role) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(targetEmail, password, targetRole);
      onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const quickSwitch = (targetEmail: string, targetRole: UserRole) => {
    setEmail(targetEmail);
    setRole(targetRole);
    handleLogin(targetEmail, targetRole);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-1">
          <div className="inline-flex p-3 rounded-2xl bg-red-600/20 text-red-500 mb-2 border border-red-500/30">
            <KeyRound className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-black text-white">MMU Institutional Auth</h3>
          <p className="text-xs text-slate-400">Select an institutional identity or test persona</p>
        </div>

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300 font-semibold">
            {error}
          </div>
        )}

        {/* Quick 1-Click Role Switcher Personas */}
        <div className={`space-y-2 ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" /> 1-Click Instant Persona Switch
          </span>

          <div
            onClick={() => quickSwitch('student.aarav@mmumullana.org', 'STUDENT')}
            className="p-3 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 cursor-pointer flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white group-hover:text-amber-400">Student: Aarav Gupta</h4>
                <p className="text-[10px] text-slate-400">B.Tech CSE • Assigned BUS-01</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
              STUDENT
            </span>
          </div>

          <div
            onClick={() => quickSwitch('driver.rajesh@mmumullana.org', 'DRIVER')}
            className="p-3 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 cursor-pointer flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-red-600/20 text-red-500 flex items-center justify-center">
                <Bus className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white group-hover:text-red-400">Driver: Rajesh Kumar</h4>
                <p className="text-[10px] text-slate-400">DRV-104 • Driver of BUS-01</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-red-400 bg-red-950/60 px-2 py-0.5 rounded border border-red-800">
              DRIVER
            </span>
          </div>

          <div
            onClick={() => quickSwitch('admin@mmumullana.org', 'ADMIN')}
            className="p-3 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 cursor-pointer flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white group-hover:text-emerald-400">Admin: Dr. Sandeep Sharma</h4>
                <p className="text-[10px] text-slate-400">Dean Fleet Logistics & Operations</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
              ADMIN
            </span>
          </div>
        </div>

        <div className="text-center text-[11px] text-slate-500">
          Default Master Demo Password: <strong className="text-slate-300 font-mono">MMU@Secure2026</strong>
        </div>
      </div>
    </div>
  );
};
