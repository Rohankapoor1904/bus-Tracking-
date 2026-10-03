import React, { useState, useEffect } from 'react';
import { MapLibre3DView } from '../3d/MapLibre3DView.js';
import { api } from '../../services/api.js';
import { socketService } from '../../services/websocket.js';
import { LiveBusState, FleetOverviewMetrics, Route } from '../../types/index.js';
import {
  Bus,
  Users,
  AlertTriangle,
  Activity,
  ShieldCheck,
  RefreshCw,
  Check,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

// Mobile collapsible bottom sheet for fleet list in Radar view
interface MobileFleetSheetProps {
  liveBuses: LiveBusState[];
  selectedBus: LiveBusState | null;
  routes: Route[];
  telemetryHealth: (bus: LiveBusState) => 'LIVE' | 'STALE' | 'PARKED';
  onSelectBus: (bus: LiveBusState) => void;
}

const MobileFleetSheet: React.FC<MobileFleetSheetProps> = ({
  liveBuses,
  selectedBus,
  routes: _routes,
  telemetryHealth,
  onSelectBus,
}) => {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      className={`md:hidden absolute bottom-16 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur-2xl border-t border-white/10 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] rounded-t-3xl transition-all duration-300 ease-out ${
        expanded ? 'max-h-[60vh]' : 'max-h-[58px]'
      } flex flex-col overflow-hidden`}
    >
      {/* Drag handle + header */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none flex-shrink-0"
      >
        <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs font-black text-white uppercase tracking-wider">Active Fleet Units</span>
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-900 px-1.5 py-0.5 rounded-full">
            {liveBuses.filter((b) => telemetryHealth(b) === 'LIVE').length} LIVE
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        )}
      </div>

      {/* Fleet cards */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
        {liveBuses.map((b) => {
          const isSelected = selectedBus?.busId === b.busId;
          const health = telemetryHealth(b);
          const loadPct = b.capacity > 0 ? Math.round((b.boardedCount / b.capacity) * 100) : 0;
          return (
            <div
              key={b.busId}
              onClick={() => onSelectBus(b)}
              className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center gap-3 ${
                isSelected
                  ? 'bg-red-950/40 border-red-600'
                  : 'bg-slate-800/70 border-slate-700'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  health === 'LIVE' ? 'bg-emerald-400 animate-pulse' : health === 'STALE' ? 'bg-amber-400' : 'bg-slate-500'
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-white text-sm">{b.busNumber}</span>
                  <span className="text-[10px] font-mono font-bold text-amber-400">{b.speedKmh.toFixed(0)} km/h</span>
                </div>
                <div className="w-full h-1 bg-slate-700 rounded-full mt-1">
                  <div
                    className={`h-full rounded-full ${
                      loadPct > 90 ? 'bg-red-500' : loadPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, loadPct)}%` }}
                  />
                </div>
              </div>
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${
                health === 'LIVE' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>{health}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'RADAR' | 'MANIFEST' | 'ALARMS' | 'FLEET'>('RADAR');
  const [metrics, setMetrics] = useState<FleetOverviewMetrics | null>(null);
  const [liveBuses, setLiveBuses] = useState<LiveBusState[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [manifestBreakdown, setManifestBreakdown] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedBus, setSelectedBus] = useState<LiveBusState | null>(null);
  // Collapsible bottom sheet state for fleet list on desktop
  const [isFleetSheetExpanded, setIsFleetSheetExpanded] = useState<boolean>(true);
  // Ref to propagate map flyTo from fleet card clicks
  const mapFlyToRef = React.useRef<((bus: LiveBusState) => void) | null>(null);

  const loadData = async () => {
    // Load independently: a 403/partial failure on one scoped endpoint must not
    // blank the entire dashboard.
    const [metricsRes, busesRes, routesRes, manifestRes, alertsRes] = await Promise.allSettled([
      api.getAdminFleetOverview(),
      api.getLiveFleet(),
      api.getRoutes(),
      api.getAdminManifestBreakdown(),
      api.getAdminAlerts(),
    ]);

    if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value);
    if (busesRes.status === 'fulfilled') {
      const busesData = busesRes.value;
      setLiveBuses(busesData);
      if (busesData.length > 0) setSelectedBus((prev) => prev ?? busesData[0]);
    }
    if (routesRes.status === 'fulfilled') {
      setRoutes(routesRes.value);
      setSelectedRoute((prev) => prev ?? routesRes.value[0] ?? null);
    }
    if (manifestRes.status === 'fulfilled') setManifestBreakdown(manifestRes.value);
    if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value);

    for (const r of [metricsRes, busesRes, routesRes, manifestRes, alertsRes]) {
      if (r.status === 'rejected') console.warn('Admin dashboard partial load failure:', r.reason);
    }
  };

  // Tick clock for telemetry health badges (kept out of render for purity)
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    loadData();

    // Listen for fleet updates over WebSocket
    const token = api.getToken() || undefined;
    socketService.connect(token);
    socketService.subscribe('admin:radar');

    const unsubscribePos = socketService.on('BUS_POSITION_UPDATE', (update: any) => {
      setLiveBuses((prev) =>
        prev.map((b) =>
          b.busId === update.busId
            ? {
                ...b,
                latitude: update.latitude,
                longitude: update.longitude,
                speedKmh: update.speedKmh,
                bearing: update.bearing,
                altitudeM: update.altitudeM,
                accuracyM: update.accuracyM,
                lastPing: update.recordedAt,
                upcomingStopName: update.nextStopName,
                distanceToNextStopMeters: update.distanceToNextStopMeters,
                etaMinutesUpcomingStop: update.etaMinutesUpcomingStop,
                boardedCount: update.boardedCount || b.boardedCount,
              }
            : b
        )
      );
    });

    const unsubscribeAlert = socketService.on('EMERGENCY_ALERT', (newAlert: any) => {
      setAlerts((prev) => [newAlert, ...prev]);
    });

    return () => {
      unsubscribePos();
      unsubscribeAlert();
    };
  }, []);

  const handleResolveAlert = async (id: string) => {
    try {
      await api.resolveAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      alert(`Could not resolve alert: ${err.message}`);
    }
  };

  // Telemetry health: fresh packet (< 15s) = healthy, stale = degraded, none = offline
  const telemetryHealth = (bus: LiveBusState): 'LIVE' | 'STALE' | 'PARKED' => {
    if (bus.status === 'IDLE' || bus.status === 'MAINTENANCE') return 'PARKED';
    const ageMs = nowTick - new Date(bus.lastPing).getTime();
    if (ageMs < 15000) return 'LIVE';
    if (ageMs < 120000) return 'STALE';
    return 'PARKED';
  };

  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col overflow-hidden pb-16 md:pb-0">
      {/* 1. Top KPI Summary Cards */}
      <div className="p-2.5 sm:p-4 bg-slate-900/90 border-b border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 z-10 shadow-lg flex-shrink-0">
        {/* Metric 1: Fleet in Transit */}
        <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between">
          <div>
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Fleet</span>
            <div className="text-lg sm:text-2xl font-black text-white mt-0.5">
              {metrics?.activeTripsCount ?? 0} <span className="text-xs sm:text-sm font-semibold text-slate-400">/ {metrics?.totalFleetCount ?? liveBuses.length}</span>
            </div>
            <span className="text-[9px] sm:text-[10px] text-emerald-400 font-semibold hidden xs:inline">Live GPS Ingestion</span>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-red-600/20 text-red-500 flex items-center justify-center border border-red-500/30">
            <Bus className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Metric 2: Boarded Students */}
        <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between">
          <div>
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Boarded Today</span>
            <div className="text-lg sm:text-2xl font-black text-white mt-0.5">
              {metrics?.totalStudentsBoardedToday ?? 0} <span className="text-xs sm:text-sm font-semibold text-slate-400">/ {metrics?.totalStudentsEnrolled ?? 0}</span>
            </div>
            <span className="text-[9px] sm:text-[10px] text-amber-400 font-semibold hidden xs:inline">All Corridors</span>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Metric 3: Safety Alarms */}
        <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between">
          <div>
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Safety Alarms</span>
            <div className="text-lg sm:text-2xl font-black text-white mt-0.5">
              {alerts.length} <span className="text-xs font-semibold text-slate-400">Active</span>
            </div>
            <span className="text-[9px] sm:text-[10px] text-red-400 font-semibold hidden xs:inline">Geofences & SOS</span>
          </div>
          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border ${alerts.length > 0 ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse' : 'bg-slate-700 text-slate-400 border-slate-600'}`}>
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Metric 4: System State */}
        <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between">
          <div>
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Telemetry Ingestion</span>
            <div className="text-sm sm:text-lg font-black text-emerald-400 mt-1 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> REAL GPS ONLY
            </div>
            <span className="text-[9px] sm:text-[10px] text-slate-400 hidden xs:inline">No simulation · parked = static</span>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

      {/* 2. Nav Tabs Header */}
      <div className="px-3 sm:px-5 py-2 sm:py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between overflow-x-auto no-scrollbar flex-shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setActiveTab('RADAR')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
              activeTab === 'RADAR'
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            3D Fleet Radar
          </button>
          <button
            onClick={() => setActiveTab('MANIFEST')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
              activeTab === 'MANIFEST'
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Manifest & Analytics
          </button>
          <button
            onClick={() => setActiveTab('ALARMS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'ALARMS'
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <span>Safety Alarms</span>
            {alerts.length > 0 && (
              <span className="bg-red-950 text-red-200 border border-red-500 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {alerts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('FLEET')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
              activeTab === 'FLEET'
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Fleet Asset Directory
          </button>
        </div>

        <button
          onClick={loadData}
          className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
          title="Refresh Data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 3. Tab Contents */}
      <div className="flex-1 overflow-hidden relative">
        {/* TAB 1: 3D FLEET RADAR */}
        {activeTab === 'RADAR' && (
          <div className="w-full h-full flex flex-col md:flex-row relative">
            {/* 3D Canvas — fully interactive (no pointer-events restriction) */}
            <div className="flex-1 h-full relative min-h-0">
              <MapLibre3DView
                activeRoute={selectedRoute}
                activeBus={selectedBus}
                allBuses={liveBuses}
                onSelectBus={(b) => {
                  setSelectedBus(b);
                  // Expose flyTo callback so bus card clicks can trigger camera
                  if (mapFlyToRef.current) mapFlyToRef.current(b);
                }}
              />
            </div>

            {/* Desktop: Collapsible Right Fleet Sheet */}
            <div
              className={`hidden md:flex flex-col bg-slate-900/95 border-l border-slate-800 transition-all duration-300 ease-out overflow-hidden ${
                isFleetSheetExpanded ? 'w-80' : 'w-12'
              }`}
            >
              {/* Toggle Tab */}
              <button
                onClick={() => setIsFleetSheetExpanded(!isFleetSheetExpanded)}
                className="flex items-center justify-center h-12 bg-slate-800 hover:bg-slate-700 border-b border-slate-700 text-slate-300 hover:text-white transition-colors flex-shrink-0"
                title={isFleetSheetExpanded ? 'Collapse Fleet List' : 'Expand Fleet List'}
              >
                {isFleetSheetExpanded ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                )}
              </button>

              {isFleetSheetExpanded && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                      Active Fleet Units ({liveBuses.length})
                    </h4>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-900 px-1.5 py-0.5 rounded-full">
                      {liveBuses.filter((b) => telemetryHealth(b) === 'LIVE').length} LIVE
                    </span>
                  </div>

                  <div className="space-y-2">
                    {liveBuses.map((b) => {
                      const isSelected = selectedBus?.busId === b.busId;
                      const health = telemetryHealth(b);
                      const loadPct = b.capacity > 0 ? Math.round((b.boardedCount / b.capacity) * 100) : 0;
                      const overspeed = b.speedKmh > 75;
                      const chip =
                        health === 'LIVE'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : health === 'STALE'
                          ? 'bg-amber-950 text-amber-400 border-amber-800'
                          : 'bg-slate-800 text-slate-400 border-slate-700';
                      return (
                        <div
                          key={b.busId}
                          onClick={() => {
                            setSelectedBus(b);
                            const r = routes.find((rt) => rt.id === b.routeId);
                            if (r) setSelectedRoute(r);
                            // Fly the radar map camera to this bus
                            if (mapFlyToRef.current) mapFlyToRef.current(b);
                          }}
                          className={`p-3 rounded-2xl border cursor-pointer transition-all hover:scale-[1.01] ${
                            isSelected
                              ? 'bg-red-950/40 border-red-600 shadow-lg shadow-red-950/30'
                              : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${health === 'LIVE' ? 'bg-emerald-400 animate-pulse' : health === 'STALE' ? 'bg-amber-400' : 'bg-slate-500'}`} />
                              <span className="font-extrabold text-white text-sm">{b.busNumber}</span>
                              <span className={`text-[9px] font-black px-1.5 py-px rounded border uppercase ${chip}`}>{health}</span>
                            </div>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${overspeed ? 'bg-red-600 text-white' : 'bg-black/40 text-amber-400'}`}>
                              {b.speedKmh.toFixed(0)} km/h
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 truncate">{b.routeName || 'Unassigned corridor'}</p>

                          {/* Capacity bar */}
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                              <span>Capacity</span>
                              <span className="text-slate-200 font-bold">{b.boardedCount} / {b.capacity} · {loadPct}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${loadPct > 90 ? 'bg-red-500' : loadPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.min(100, loadPct)}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-700/50">
                            <span>Driver: <strong className="text-slate-200">{b.driverName}</strong></span>
                            <span className="flex items-center gap-1">
                              <Activity className={`w-3 h-3 ${health === 'LIVE' ? 'text-emerald-400' : 'text-slate-500'}`} />
                              {new Date(b.lastPing).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile: Collapsible Bottom Sheet Fleet List */}
            <MobileFleetSheet
              liveBuses={liveBuses}
              selectedBus={selectedBus}
              routes={routes}
              telemetryHealth={telemetryHealth}
              onSelectBus={(b) => {
                setSelectedBus(b);
                const r = routes.find((rt) => rt.id === b.routeId);
                if (r) setSelectedRoute(r);
                if (mapFlyToRef.current) mapFlyToRef.current(b);
              }}
            />
          </div>
        )}

        {/* TAB 2: MANIFEST & CAPACITY ANALYTICS */}
        {activeTab === 'MANIFEST' && (
          <div className="w-full h-full p-6 overflow-y-auto space-y-6">
            <div>
              <h3 className="text-lg font-black text-white">Regional Transit Corridor & Stoppage Manifest Breakdown</h3>
              <p className="text-xs text-slate-400">Real-time student pickup analytics aggregated across all 5 MMU transit lines</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {manifestBreakdown.map((routeData) => {
                const percent = routeData.totalEnrolled > 0
                  ? Math.round((routeData.totalBoarded / routeData.totalEnrolled) * 100)
                  : 0;

                return (
                  <div key={routeData.routeId} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-mono font-black text-red-400 bg-red-950/60 px-2 py-0.5 rounded border border-red-900/50">
                          {routeData.routeCode}
                        </span>
                        <h4 className="text-base font-extrabold text-white mt-1">{routeData.routeName}</h4>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-black text-white">{routeData.totalBoarded}</span>
                        <span className="text-xs text-slate-400 font-bold"> / {routeData.totalEnrolled} Boarded</span>
                        <div className="text-[10px] font-bold text-emerald-400">{percent}% Picked Up</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-red-600 to-amber-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    {/* Stoppage Detail Table */}
                    <div className="space-y-2 pt-2">
                      <h5 className="text-[11px] uppercase font-bold text-slate-400">Stop-Wise Boarding Manifest</h5>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {routeData.stops.map((s: any) => (
                          <div
                            key={s.stopId}
                            className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40 text-xs"
                          >
                            <span className="text-slate-300">
                              <strong className="text-amber-400 mr-1.5">#{s.sequence}</strong> {s.stopName}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] text-emerald-400 font-bold">
                                {s.boardedCount} Boarded
                              </span>
                              {s.pendingCount > 0 && (
                                <span className="text-[11px] text-amber-400 font-bold">
                                  {s.pendingCount} Pending
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: SAFETY ALARMS */}
        {activeTab === 'ALARMS' && (
          <div className="w-full h-full p-6 overflow-y-auto space-y-4">
            <div>
              <h3 className="text-lg font-black text-white">Active Safety & Route Compliance Alarms</h3>
              <p className="text-xs text-slate-400">Autonomous speed limit checks (&gt;75 km/h) and driver SOS emergency beacons</p>
            </div>

            {alerts.length > 0 ? (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-4 rounded-2xl bg-red-950/30 border border-red-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-600/30 text-red-400 border border-red-500/50 flex items-center justify-center font-bold">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase text-red-400 bg-red-950 px-2 py-0.5 rounded border border-red-800">
                            {alert.alertType}
                          </span>
                          <span className="text-xs font-bold text-white">{alert.busNumber}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(alert.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1">{alert.message}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleResolveAlert(alert.id)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-emerald-950 text-emerald-400 hover:text-emerald-200 border border-emerald-800/80 font-bold text-xs flex items-center gap-1.5 transition-all"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Resolve</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500 border border-dashed border-slate-800 rounded-3xl">
                <ShieldCheck className="w-12 h-12 text-emerald-500 mb-2 opacity-60" />
                <h4 className="text-sm font-bold text-slate-300">All Fleets Operating Within Safety Parameters</h4>
                <p className="text-xs text-slate-500">Zero over-speeding or route compliance violations recorded</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: FLEET ASSETS DIRECTORY */}
        {activeTab === 'FLEET' && (
          <div className="w-full h-full p-6 overflow-y-auto space-y-4">
            <div>
              <h3 className="text-lg font-black text-white">MMU Institutional Fleet Directory</h3>
              <p className="text-xs text-slate-400">Central vehicle asset register and driver assignment roster</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {liveBuses.map((bus) => (
                <div key={bus.busId} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-black text-white">{bus.busNumber}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      bus.status === 'EN_ROUTE'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : bus.status === 'IDLE'
                        ? 'bg-slate-800 text-slate-300 border-slate-700'
                        : 'bg-red-950 text-red-400 border-red-800'
                    }`}>
                      {bus.status}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-300">
                    <p>Registration: <strong className="text-white font-mono">{bus.registrationNumber}</strong></p>
                    <p>Model: {bus.model}</p>
                    <p>Capacity: {bus.capacity} Passenger Seats</p>
                    <p>Assigned Route: <strong className="text-amber-400">{bus.routeName || 'Unassigned'}</strong></p>
                    <p>Assigned Driver: {bus.driverName} ({bus.driverPhone || 'N/A'})</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
