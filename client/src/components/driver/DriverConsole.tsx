import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api.js';
import { socketService } from '../../services/websocket.js';
import { offlineQueue } from '../../services/offlineQueue.js';
import { audioAlert } from '../../services/audioAlert.js';
import { TripManifestResponse, Route } from '../../types/index.js';
import {
  Play,
  Square,
  AlertOctagon,
  Users,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Compass,
  Zap,
  Phone,
  ArrowRight,
  Clock,
} from 'lucide-react';
import confetti from 'canvas-confetti';

const COMPASS_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compassLabel = (bearing: number): string =>
  COMPASS_LABELS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];

// Target arrival clock derived from route schedule offsets (real timetable)
const targetArrival = (stopSequence: number): string => {
  const departure = new Date();
  departure.setHours(7, 15, 0, 0);
  const arrival = new Date(departure.getTime() + stopSequence * 6 * 60 * 1000);
  return arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const DriverConsole: React.FC = () => {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('route-amb-01');
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [manifest, setManifest] = useState<TripManifestResponse | null>(null);
  const [currentStopIndex, setCurrentStopIndex] = useState<number>(0);
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [isWakeLocked, setIsWakeLocked] = useState<boolean>(false);
  const [pendingQueueCount, setPendingQueueCount] = useState<number>(0);
  const [sosActive, setSosActive] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'COCKPIT' | 'ROSTER'>('COCKPIT');
  const [gpsStatus, setGpsStatus] = useState<'ACQUIRING' | 'LOCKED' | 'DENIED'>('ACQUIRING');
  const [telemetryMode, setTelemetryMode] = useState<'SIMULATED_ROUTE' | 'DEVICE_GPS'>('SIMULATED_ROUTE');
  const [detectedDelhi, setDetectedDelhi] = useState<boolean>(false);

  // Live GPS telemetry — starts PARKED (0 motion) until real GPS fix arrives.
  const [telemetry, setTelemetry] = useState({
    speedKmh: 0,
    bearing: 0,
    latitude: 30.24853,
    longitude: 77.04402,
    accuracy: 8.0,
  });

  const wakeLockRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const simIntervalRef = useRef<any>(null);
  const simIndexRef = useRef<number>(0);

  // 1. Load routes. No trip is assumed — driver taps Start Trip to go live.
  useEffect(() => {
    const init = async () => {
      try {
        const routesData = await api.getRoutes();
        setRoutes(routesData);
        // Do NOT auto-load a fabricated trip. Manifest appears after Start Trip.
      } catch (err) {
        console.error('Failed to load driver routes:', err);
      }
    };
    init();

    // Enable Screen Wake Lock
    if ('wakeLock' in navigator) {
      (navigator as any).wakeLock
        .request('screen')
        .then((lock: any) => {
          wakeLockRef.current = lock;
          setIsWakeLocked(true);
        })
        .catch(() => {
          setIsWakeLocked(false);
        });
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // 2. Dual Telemetry Engine:
  // - SIMULATED_ROUTE: Drives along the MMU route waypoints (smooth 45-55 km/h) for testing from PC/Delhi
  // - DEVICE_GPS: Live hardware navigator.geolocation.watchPosition
  useEffect(() => {
    if (!isBroadcasting || !activeTrip) return;

    if (telemetryMode === 'SIMULATED_ROUTE') {
      const activeRoute = routes.find((r) => r.id === (activeTrip?.routeId || selectedRouteId)) || routes[0];
      const points: [number, number][] =
        activeRoute?.waypoints && activeRoute.waypoints.length > 1
          ? activeRoute.waypoints
          : activeRoute?.stops.map((s) => [s.longitude, s.latitude] as [number, number]) || [];

      if (points.length < 2) return;

      setGpsStatus('LOCKED');
      simIndexRef.current = 0;

      simIntervalRef.current = setInterval(() => {
        simIndexRef.current = (simIndexRef.current + 1) % points.length;
        const curr = points[simIndexRef.current];
        const next = points[(simIndexRef.current + 1) % points.length];

        const dLon = ((next[0] - curr[0]) * Math.PI) / 180;
        const y = Math.sin(dLon) * Math.cos((next[1] * Math.PI) / 180);
        const x =
          Math.cos((curr[1] * Math.PI) / 180) * Math.sin((next[1] * Math.PI) / 180) -
          Math.sin((curr[1] * Math.PI) / 180) * Math.cos((next[1] * Math.PI) / 180) * Math.cos(dLon);
        const heading = (Math.atan2(y, x) * 180) / Math.PI;
        const compassBearing = (heading + 360) % 360;
        const spd = 46 + Math.sin(simIndexRef.current) * 6;

        setTelemetry({
          latitude: curr[1],
          longitude: curr[0],
          speedKmh: Math.round(spd),
          bearing: Math.round(compassBearing),
          accuracy: 3.5,
        });

        const packet = {
          tripId: activeTrip.id,
          busId: activeTrip.busId,
          routeId: activeTrip.routeId,
          latitude: curr[1],
          longitude: curr[0],
          speed: Math.round(spd),
          bearing: Math.round(compassBearing),
          accuracy: 3.5,
          timestamp: Date.now(),
        };

        if (socketService.isSocketOpen()) {
          socketService.sendDriverTelemetry(packet);
        }
      }, 1400);

      return () => {
        if (simIntervalRef.current) {
          clearInterval(simIntervalRef.current);
          simIntervalRef.current = null;
        }
      };
    }

    if (!('geolocation' in navigator)) {
      setGpsStatus('DENIED');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsStatus('LOCKED');
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const spd = (pos.coords.speed ?? 0) * 3.6;
        const heading = pos.coords.heading ?? telemetry.bearing;

        if (lat < 29.5) {
          setDetectedDelhi(true);
        }

        setTelemetry({
          latitude: lat,
          longitude: lon,
          speedKmh: Math.max(0, spd),
          bearing: heading ?? 0,
          accuracy: pos.coords.accuracy,
        });

        const packet = {
          tripId: activeTrip.id,
          busId: activeTrip.busId,
          routeId: activeTrip.routeId,
          latitude: lat,
          longitude: lon,
          speed: Math.max(0, spd),
          bearing: heading ?? 0,
          accuracy: pos.coords.accuracy,
          timestamp: Date.now(),
        };

        if (socketService.isSocketOpen()) {
          socketService.sendDriverTelemetry(packet);
          offlineQueue.flush((p) => socketService.sendDriverTelemetry(p)).then((count) => {
            if (count > 0) setPendingQueueCount(0);
          });
        } else {
          offlineQueue.enqueue(packet);
          setPendingQueueCount(offlineQueue.getPendingCount());
        }
      },
      (err) => {
        console.warn('Geolocation unavailable — holding parked position:', err.message);
        setGpsStatus('DENIED');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBroadcasting, activeTrip, telemetryMode, routes, selectedRouteId]);

  // Handle Start Trip / Go Live — begins real GPS broadcast
  const handleStartShift = async () => {
    try {
      const newTrip = await api.startTrip('bus-01', selectedRouteId, 'CAMPUS_BOUND');
      const m = await api.getTripManifest(newTrip.id);
      setManifest(m);
      setActiveTrip(newTrip);
      setCurrentStopIndex(0);
      setIsBroadcasting(true);
      confetti({ particleCount: 30, spread: 50 });
    } catch (err: any) {
      alert(`Could not start shift: ${err.message}`);
    }
  };

  // Handle End Shift — halts GPS broadcast; bus stays PARKED at last fix
  const handleEndShift = async () => {
    if (!confirm('Are you sure you want to end this transit shift? Bus will return to parked status.')) return;
    try {
      if (activeTrip) {
        await api.endTrip(activeTrip.id);
      }
      setIsBroadcasting(false);
      setActiveTrip(null);
      setManifest(null);
      setCurrentStopIndex(0);
      setGpsStatus('ACQUIRING');
      // Hold the real last-known coordinates, zero motion (parked contract)
      setTelemetry((t) => ({ ...t, speedKmh: 0 }));
    } catch (err: any) {
      alert(`Error ending trip: ${err.message}`);
    }
  };

  // Student Check-In Direct Status (BOARDED or ABSENT)
  const handleSetStudentStatus = async (studentId: string, stopId: string, status: 'BOARDED' | 'ABSENT') => {
    if (!activeTrip?.id) return;
    try {
      await api.checkInStudent({
        tripId: activeTrip.id,
        studentId,
        stopId,
        status,
        verificationMethod: 'MANUAL_CONSOLE',
      });

      if (status === 'BOARDED') {
        audioAlert.playBoardingSuccessChime();
        confetti({ particleCount: 20, spread: 40 });
      }

      // Refresh manifest
      const updated = await api.getTripManifest(activeTrip.id);
      setManifest(updated);
    } catch (err: any) {
      alert(`Check-in failed: ${err.message}`);
    }
  };

  // Auto-switch roster to the geofence-triggered current stop
  useEffect(() => {
    if (!manifest) return;
    const unsub = socketService.on('BUS_POSITION_UPDATE', (update: any) => {
      if (!update || !update.nextStopName) return;
      const idx = manifest.stopsManifest.findIndex((s) => s.stopName === update.nextStopName);
      if (idx >= 0) setCurrentStopIndex(idx);
    });
    const unsubFence = socketService.on('GEOFENCE_APPROACHING_ALERT', (alertData: any) => {
      if (!manifest) return;
      const idx = manifest.stopsManifest.findIndex((s) => s.stopId === alertData?.stopId);
      if (idx >= 0) setCurrentStopIndex(idx);
    });
    return () => {
      unsub();
      unsubFence();
    };
  }, [manifest]);

  // Trigger Emergency SOS
  const handleTriggerSOS = () => {
    if (!confirm('CONFIRM EMERGENCY SOS: This will alert the MMU Central Logistics Control Room immediately!')) {
      return;
    }

    audioAlert.playEmergencyBeep();
    setSosActive(true);
    socketService.sendEmergencySOS({
      busId: activeTrip?.busId || 'bus-01',
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      message: 'DRIVER EMERGENCY: Mechanical / Medical assistance requested on route!',
    });
  };

  const currentStop = manifest?.stopsManifest[currentStopIndex];

  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col md:flex-row overflow-hidden select-none">
      {/* Mobile Driver Segmented Tab Navigation (< md) */}
      <div className="md:hidden flex items-center bg-slate-900/95 border-b border-slate-800 p-2 gap-2 flex-shrink-0">
        <button
          onClick={() => setMobileTab('COCKPIT')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'COCKPIT'
              ? 'bg-red-600 text-white shadow-md shadow-red-900/40'
              : 'text-slate-400 bg-slate-800/80 hover:text-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Cockpit & Speed</span>
        </button>

        <button
          onClick={() => setMobileTab('ROSTER')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'ROSTER'
              ? 'bg-red-600 text-white shadow-md shadow-red-900/40'
              : 'text-slate-400 bg-slate-800/80 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Stop Roster ({manifest?.totalBoarded || 0} Boarded)</span>
        </button>
      </div>

      {/* 1. Left Telemetry & Shift Controls Cockpit */}
      <div className={`w-full md:w-[380px] lg:w-[420px] bg-slate-900/90 border-r border-slate-800 p-4 md:p-5 flex-col justify-between overflow-y-auto ${mobileTab === 'COCKPIT' ? 'flex flex-1 md:flex-initial' : 'hidden md:flex'}`}>
        <div className="space-y-4">
          {/* Institutional Driver Badge */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-red-950/60 to-slate-800 border border-red-900/50">
            <div>
              <span className="text-[10px] uppercase font-black tracking-widest text-red-400">Driver Console Unit</span>
              <h3 className="text-base font-bold text-white">Rajesh Kumar Sharma</h3>
              <p className="text-xs text-slate-400">ID: DRV-104 • Bus: <strong className="text-amber-400">BUS-01</strong> (HR-54-A-1993)</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span
                className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                  gpsStatus === 'LOCKED' && isBroadcasting
                    ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800'
                    : 'text-amber-400 bg-amber-950/80 border-amber-800'
                }`}
              >
                <Wifi className="w-3 h-3" />
                {gpsStatus === 'LOCKED' && isBroadcasting
                  ? 'GPS Lock · Live'
                  : gpsStatus === 'DENIED'
                  ? 'GPS Denied'
                  : 'Parked · Awaiting Shift'}
              </span>
              <span className="text-[10px] font-bold text-amber-300">
                {isWakeLocked ? 'WakeLock Active' : 'WakeLock Off'}
              </span>
            </div>
          </div>

          {/* Speed & Bearing HUD */}
          <div className="grid grid-cols-2 gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <div className="flex flex-col items-center justify-center p-2 border-r border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400" /> Ground Speed
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-4xl font-black text-white">{telemetry.speedKmh.toFixed(0)}</span>
                <span className="text-xs font-bold text-amber-400">km/h</span>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center p-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Compass className="w-3 h-3 text-red-400" /> Heading
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-4xl font-black text-white">{telemetry.bearing.toFixed(0)}°</span>
                <span className="text-xs font-bold text-red-400">{compassLabel(telemetry.bearing)}</span>
              </div>
            </div>
          </div>

          {/* Next Scheduled Stop & Target Arrival HUD */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5 text-amber-400" /> Next Stop
              </span>
              <span className="text-white font-bold text-right max-w-[65%] truncate">
                {activeTrip ? manifest?.stopsManifest[currentStopIndex]?.stopName || 'En route…' : 'None — shift not started'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" /> Target Arrival
              </span>
              <span className="text-emerald-400 font-mono font-black">
                {activeTrip && manifest?.stopsManifest[currentStopIndex]
                  ? targetArrival(manifest.stopsManifest[currentStopIndex].stopSequence)
                  : '--:--'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
              <span className="text-slate-400 font-semibold">GPS Accuracy</span>
              <span className="text-slate-200 font-mono">±{telemetry.accuracy.toFixed(1)} m</span>
            </div>
          </div>

          {/* Offline Queue Indicator */}
          {pendingQueueCount > 0 && (
            <div className="p-3 bg-amber-950/60 border border-amber-800 rounded-xl flex items-center justify-between text-xs text-amber-300">
              <div className="flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-amber-400" />
                <span>Offline buffer: <strong>{pendingQueueCount}</strong> points spooled</span>
              </div>
              <button
                onClick={() => offlineQueue.flush((p) => socketService.sendDriverTelemetry(p)).then(() => setPendingQueueCount(0))}
                className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded"
              >
                Sync Now
              </button>
            </div>
          )}

          {/* Shift Status & Controls */}
          <div className="space-y-3 bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold">Active Transit Route</span>
              <span className="text-amber-400 font-bold">{manifest?.route.name || 'Ambala Express'}</span>
            </div>

            {activeTrip ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-900/60 text-xs text-emerald-300">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="font-bold">
                      {telemetryMode === 'SIMULATED_ROUTE' ? 'MMU ROUTE SIMULATION LIVE' : 'BROADCASTING DEVICE GPS'}
                    </span>
                  </div>
                  <span className="font-mono text-[10px]">{manifest?.totalBoarded || 0} Boarded</span>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={handleEndShift}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 hover:bg-red-950 text-red-400 hover:text-red-200 border border-red-900/60 font-black text-sm transition-all"
                  >
                    <Square className="w-4 h-4" /> End Shift
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Telemetry Mode Toggle */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Telemetry Source
                  </label>
                  <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-700/80">
                    <button
                      type="button"
                      onClick={() => setTelemetryMode('SIMULATED_ROUTE')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        telemetryMode === 'SIMULATED_ROUTE'
                          ? 'bg-blue-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🚌 MMU Route Auto-Drive
                    </button>
                    <button
                      type="button"
                      onClick={() => setTelemetryMode('DEVICE_GPS')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        telemetryMode === 'DEVICE_GPS'
                          ? 'bg-red-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      📡 Device GPS
                    </button>
                  </div>
                </div>

                {detectedDelhi && telemetryMode === 'DEVICE_GPS' && (
                  <div className="p-3 bg-amber-950/80 border border-amber-600/80 rounded-xl text-xs text-amber-200">
                    <div className="font-bold flex items-center gap-1.5 text-white">
                      <span>⚠️</span> Device Location: Delhi NCR (~190 km away)
                    </div>
                    <p className="mt-1 text-[11px] leading-snug">
                      Your PC / broadband IP is in Delhi. To drive smoothly along the MMU Ambala-Mullana corridor on the map, use <strong>MMU Route Auto-Drive</strong>!
                    </p>
                    <button
                      type="button"
                      onClick={() => setTelemetryMode('SIMULATED_ROUTE')}
                      className="mt-2 w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                    >
                      Switch to MMU Route Auto-Drive
                    </button>
                  </div>
                )}

                <select
                  value={selectedRouteId}
                  onChange={(e) => setSelectedRouteId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold"
                >
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.routeCode})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleStartShift}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black text-sm shadow-xl shadow-red-900/40 transition-all"
                >
                  <Play className="w-4 h-4" /> Start Trip / Go Live
                </button>
                <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                  {telemetryMode === 'SIMULATED_ROUTE'
                    ? 'Simulates realistic driving along the selected MMU route with live speed & stop updates.'
                    : 'Broadcasts real device GPS coordinates. Parked until fix arrives.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Emergency SOS Button */}
        <div className="pt-4 border-t border-slate-800">
          <button
            onClick={handleTriggerSOS}
            className={`w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all border-2 shadow-2xl ${
              sosActive
                ? 'bg-red-700 text-white border-white animate-pulse'
                : 'bg-red-950/80 hover:bg-red-900 text-red-400 hover:text-white border-red-700/80'
            }`}
          >
            <AlertOctagon className="w-6 h-6 text-red-400" />
            <span>{sosActive ? 'EMERGENCY SOS BROADCASTED' : 'EMERGENCY SOS BEACON'}</span>
          </button>
        </div>
      </div>

      {/* 2. Right Stop-Wise Student Manifest Boarding Roster */}
      <div className={`flex-1 bg-slate-950 p-3.5 md:p-5 flex-col overflow-hidden ${mobileTab === 'ROSTER' ? 'flex' : 'hidden md:flex'}`}>
        {/* Stoppage Carousel Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-red-500" /> Passenger Boarding Console
            </h2>
            <p className="text-xs text-slate-400">Mark student pickup attendance at each designated campus stop</p>
          </div>

          {/* Stoppage Stepper Switcher */}
          <div className="flex items-center gap-2">
            <button
              disabled={currentStopIndex <= 0}
              onClick={() => setCurrentStopIndex((prev) => Math.max(0, prev - 1))}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-xs font-bold border border-slate-700"
            >
              Previous Stop
            </button>
            <span className="text-xs font-mono font-bold text-amber-400 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              {manifest ? `Stop ${currentStopIndex + 1} of ${manifest.stopsManifest.length}` : 'No Active Trip'}
            </span>
            <button
              disabled={!manifest || currentStopIndex >= manifest.stopsManifest.length - 1}
              onClick={() => setCurrentStopIndex((prev) => Math.min((manifest?.stopsManifest.length || 1) - 1, prev + 1))}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-xs font-bold border border-slate-700"
            >
              Next Stop
            </button>
          </div>
        </div>

        {/* Active Stop Highlight Card */}
        {currentStop && (
          <div className="my-4 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-850 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center">
                  #{currentStop.stopSequence}
                </span>
                <h3 className="text-base font-extrabold text-white">{currentStop.stopName}</h3>
              </div>
              <p className="text-xs text-slate-400 ml-9">{currentStop.landmark}</p>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-slate-400">Boarded / Enrolled</div>
              <div className="text-lg font-black text-amber-400">
                {currentStop.boardedCount} / {currentStop.totalEnrolled} Students
              </div>
            </div>
          </div>
        )}

        {/* Student Manifest List for Current Stop */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-2">
          {currentStop && currentStop.students.length > 0 ? (
            currentStop.students.map((student) => {
              const isBoarded = student.status === 'BOARDED';
              return (
                <div
                  key={student.studentId}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                    isBoarded
                      ? 'bg-emerald-950/30 border-emerald-800/80 shadow-emerald-950/20'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${
                        isBoarded ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {student.rollNumber.substring(student.rollNumber.length - 2)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        {student.studentName}
                        <span className="text-[10px] font-mono text-slate-400">({student.rollNumber})</span>
                      </h4>
                      <p className="text-xs text-slate-400">{student.department} • Pass: {student.passNumber}</p>
                    </div>
                  </div>

                  {/* Quick Check-in Actions: Boarded & Absent */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <a
                      href={`tel:${student.phone}`}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      title="Call Student"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>

                    <button
                      onClick={() => handleSetStudentStatus(student.studentId, currentStop.stopId, 'BOARDED')}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 transition-all ${
                        isBoarded
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40 ring-1 ring-emerald-400'
                          : 'bg-slate-800 hover:bg-emerald-900/50 text-slate-300 border border-slate-700'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Boarded</span>
                    </button>

                    <button
                      onClick={() => handleSetStudentStatus(student.studentId, currentStop.stopId, 'ABSENT')}
                      className={`px-2.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 transition-all ${
                        student.status === 'ABSENT'
                          ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40 ring-1 ring-rose-400'
                          : 'bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 border border-slate-700'
                      }`}
                    >
                      <XCircle className="w-3.5 h-3.5 text-rose-300" />
                      <span>Absent</span>
                    </button>
                  </div>
                </div>
              );
            })
          ) : !manifest ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 border border-dashed border-slate-800 rounded-2xl">
              <Play className="w-8 h-8 mb-2 text-red-500 opacity-60" />
              <p className="text-xs font-semibold">Start your trip to load the boarding manifest</p>
              <p className="text-[10px] text-slate-600 mt-1">Manifest unlocks after “Start Trip / Go Live”</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 border border-dashed border-slate-800 rounded-2xl">
              <Users className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-xs font-semibold">No students assigned for pickup at this stoppage</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
