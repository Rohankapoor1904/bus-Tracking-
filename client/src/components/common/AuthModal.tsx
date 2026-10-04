import React, { useState } from 'react';
import { api } from '../../services/api.js';
import { UserRole, User } from '../../types/index.js';
import {
  ShieldCheck,
  Bus,
  Compass,
  X,
  KeyRound,
  Mail,
  Lock,
  LogIn,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

const ROLE_LABEL: Record<UserRole, string> = {
  STUDENT: 'Student View',
  DRIVER: 'Driver Console',
  ADMIN: 'Admin Dashboard',
};

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [email, setEmail] = useState('global@mmumullana.org');
  const [password, setPassword] = useState('MMU@Global2026');
  const [role, setRole] = useState<UserRole>('ADMIN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e?: React.FormEvent, overrideRole?: UserRole) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    const targetRole = overrideRole || role;
    const targetEmail = email.trim() || 'global@mmumullana.org';
    const targetPass = password || 'MMU@Global2026';
    try {
      const res = await api.login(targetEmail, targetPass, targetRole);
      onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md select-none overflow-y-auto">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 relative my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center space-y-1 pt-1">
          <div className="inline-flex p-2.5 rounded-2xl bg-red-600/20 text-red-500 mb-1 border border-red-500/30">
            <KeyRound className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-black text-white tracking-tight">MMU FleetRadar Login</h3>
          <p className="text-xs text-slate-400">Sign in with the global access ID and pick your view</p>
        </div>

        {error && (
          <div className="p-3 bg-red-950/70 border border-red-800 rounded-xl text-xs text-red-300 font-semibold">
            {error}
          </div>
        )}

        <form className="space-y-3" onSubmit={handleLogin}>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Global ID / Email</span>
            <div className="mt-1 flex items-center gap-2 px-3 rounded-xl bg-slate-800/80 border border-slate-700">
              <Mail className="w-4 h-4 text-slate-500" />
              <input
                type="text"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="global@mmumullana.org"
                className="w-full bg-transparent py-2.5 text-sm text-white placeholder-slate-500 outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Password</span>
            <div className="mt-1 flex items-center gap-2 px-3 rounded-xl bg-slate-800/80 border border-slate-700">
              <Lock className="w-4 h-4 text-slate-500" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-transparent py-2.5 text-sm text-white placeholder-slate-500 outline-none"
              />
            </div>
          </label>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Open As</span>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => {
                const active = role === r;
                const Icon = r === 'ADMIN' ? ShieldCheck : r === 'DRIVER' ? Bus : Compass;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-[11px] font-bold transition-all active:scale-[0.98] ${
                      active
                        ? 'bg-red-600 border-red-500 text-white shadow-md shadow-red-900/40'
                        : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {ROLE_LABEL[r]}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-bold transition-colors shadow-lg shadow-red-600/20 active:scale-[0.99] flex items-center justify-center gap-2"
          >
            {loading ? 'Signing in…' : (<><LogIn className="w-4 h-4" /> Sign In</>)}
          </button>
        </form>

        <p className="text-[11px] text-slate-500 text-center leading-relaxed">
          One global ID works for every role. Login access is issued by the campus fleet administrator.
        </p>
      </div>
    </div>
  );
};
