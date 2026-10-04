import React, { useState, useEffect } from 'react';
import { getServerHost, setServerHost } from '../../services/api.js';
import { socketService } from '../../services/websocket.js';
import {
  Wifi,
  WifiOff,
  Server,
  Activity,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  X,
  Radio,
  ArrowRight,
} from 'lucide-react';

interface ServerConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSocketConnected: boolean;
  onReconnected?: () => void;
}

export const ServerConfigModal: React.FC<ServerConfigModalProps> = ({
  isOpen,
  onClose,
  isSocketConnected,
  onReconnected,
}) => {
  const [hostInput, setHostInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [pingResult, setPingResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setHostInput(getServerHost());
      setPingResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestPing = async () => {
    setTesting(true);
    setPingResult(null);
    const start = performance.now();
    const cleanHost = hostInput.trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
      const response = await fetch(`${protocol}//${cleanHost}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const elapsed = Math.round(performance.now() - start);
      if (response.ok) {
        const json = await response.json();
        setPingResult({
          success: true,
          message: `Server online! ${json.system || 'MMU FleetRadar'} is ready (${json.status || 'HEALTHY'}).`,
          latencyMs: elapsed,
        });
      } else {
        setPingResult({
          success: false,
          message: `Server responded with HTTP ${response.status}`,
          latencyMs: elapsed,
        });
      }
    } catch (err: any) {
      setPingResult({
        success: false,
        message:
          err.name === 'AbortError'
            ? 'Connection timed out (4s). Ensure phone & PC are on the same Wi-Fi and port 4000 is open.'
            : `Cannot connect to ${cleanHost}. Check Wi-Fi and Windows Firewall.`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAndConnect = () => {
    const cleanHost = hostInput.trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
    if (!cleanHost) return;

    setServerHost(cleanHost);
    socketService.disconnect();
    socketService.connect();
    onReconnected?.();
    onClose();
  };

  const presetHosts = [
    { label: 'Wi-Fi PC (Current)', host: '192.168.1.15:4000' },
    { label: 'Localhost', host: 'localhost:4000' },
    { label: 'Android Emulator', host: '10.0.2.2:4000' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
                isSocketConnected
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse'
              }`}
            >
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Telemetry Gateway Settings
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                Live Server & Real-time Connectivity
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Live Status Card */}
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between ${
              isSocketConnected
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                : 'bg-red-950/40 border-red-800/80 text-red-300'
            }`}
          >
            <div className="flex items-center gap-3">
              {isSocketConnected ? (
                <Wifi className="w-5 h-5 text-emerald-400" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-400 animate-pulse" />
              )}
              <div>
                <div className="text-xs font-black uppercase tracking-wider">
                  {isSocketConnected ? 'Connected (LIVE GPS)' : 'Offline / Disconnected'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {isSocketConnected
                    ? 'Connected to MMU Telemetry server over WebSocket'
                    : 'The red wireless icon means the app cannot reach the server'}
                </div>
              </div>
            </div>
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isSocketConnected ? 'bg-emerald-400 animate-ping' : 'bg-red-500'
              }`}
            />
          </div>

          {/* Server Host Input */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Server Host & Port (IP Address)
            </label>
            <div className="relative">
              <Server className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={hostInput}
                onChange={(e) => setHostInput(e.target.value)}
                placeholder="192.168.1.15:4000"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-red-500 font-bold"
              />
            </div>
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Quick Connect Presets:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {presetHosts.map((preset) => (
                <button
                  key={preset.host}
                  onClick={() => setHostInput(preset.host)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                    hostInput.trim() === preset.host
                      ? 'bg-red-600/30 text-red-400 border-red-500/60'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {preset.label} ({preset.host})
                </button>
              ))}
            </div>
          </div>

          {/* Test Ping Button & Result */}
          <div className="pt-1">
            <button
              onClick={handleTestPing}
              disabled={testing}
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-bold text-slate-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Pinging Server...' : 'Test Connection (Ping)'}</span>
            </button>

            {pingResult && (
              <div
                className={`mt-2.5 p-3 rounded-xl border text-xs font-medium flex items-start gap-2 ${
                  pingResult.success
                    ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                    : 'bg-red-950/60 border-red-800 text-red-300'
                }`}
              >
                {pingResult.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="font-bold flex items-center gap-2">
                    {pingResult.success ? 'Connection Successful' : 'Connection Failed'}
                    {pingResult.latencyMs !== undefined && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/40 text-amber-400">
                        {pingResult.latencyMs} ms
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                    {pingResult.message}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Informational Guidance */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <div className="font-bold text-slate-300 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span>How Mobile Connection Works:</span>
            </div>
            <p>
              1. Ensure both your <strong>Android Phone</strong> and <strong>PC/Laptop</strong> are on the same Wi-Fi network.
            </p>
            <p>
              2. Your PC Wi-Fi IP is <strong className="text-white font-mono">192.168.1.15</strong> (Port: 4000).
            </p>
            <p>
              3. Click <strong>Save & Reconnect</strong> to link your phone immediately!
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAndConnect}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-black shadow-lg shadow-red-900/50 flex items-center gap-1.5 transition-all"
          >
            <span>Save & Reconnect</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
