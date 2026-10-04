import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api.js';
import { socketService } from '../../services/websocket.js';
import { offlineQueue } from '../../services/offlineQueue.js';
import { ensureLocationPermission, watchDeviceFix, getDeviceFix } from '../../services/location.js';
import { audioAlert } from '../../services/audioAlert.js';
import { TripManifestResponse, Route, LiveBusState } from '../../types/index.js';
import { MapLibre3DView } from '../3d/MapLibre3DView.js';
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
  Map as MapIcon,
} from 'lucide-react';
import confetti from 'canvas-confetti';

const COMPASS_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
// Route-following simulation is a development/test aid only; production
// drivers must broadcast real device GPS.
const DEV_MODE = import.meta.env.DEV === true;
const compassLabel = (bearing: number): string =>
  COMPASS_LABELS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];

// Target arrival clock derived from route schedule offsets (real timetable)
const targetArrival = (stopSequence: number): string => {
  const departure = new Date();
  departure.setHours(7, 15, 0, 0);
  const arrival = new Date(departure.getTime() + stopSequence * 6 * 60 * 1000);
  return arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

// Mounting both the mobile and desktop map panels (one hidden only via CSS)
// would run two WebGL map instances at once — the single biggest source of
// jank in the driver console. Choose one by viewport instead.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(min-width: 768px)').matches
      : true
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return isDesktop;
}

export const DriverConsole: React.FC = () => {
  const isDesktop = useIsDesktop();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('route-amb-01');
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [manifest, setManifest] = useState<TripManifestResponse | null>(null);
  const [currentStopIndex, setCurrentStopIndex] = useState<number>(0);
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [isWakeLocked, setIsWakeLocked] = useState<boolean>(false);
  const [pendingQueueCount, setPendingQueueCount] = useState<number>(0);
  const [sosActive, setSosActive] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'COCKPIT' | 'MAP' | 'ROSTER'>('COCKPIT');
  const [gpsStatus, setGpsStatus] = useState<'ACQUIRING' | 'LOCKED' | 'DENIED'>('ACQUIRING');
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [telemetryMode, setTelemetryMode] = useState<'SIMULATED_ROUTE' | 'DEVICE_GPS'>('DEVICE_GPS');
  const [detectedDelhi, setDetectedDelhi] = useState<boolean>(false);
  const [driverBusId, setDriverBusId] = useState<string>('bus-01');

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
        // Scope the console to the authenticated driver's own bus + route so
        // trips and telemetry can never be attributed to the wrong vehicle.
        const me = await api.getMe().catch(() => null);
        const busId = me?.assignedBusId || 'bus-01';
        setDriverBusId(busId);

        const routesData = await api.getRoutes();
        setRoutes(routesData);
        const routeId = me?.assignedRouteId && routesData.some((r) => r.id === me.assignedRouteId)
          ? me.assignedRouteId
          : selectedRouteId;
        setSelectedRouteId(routeId);
        // (Re)connect the realtime channel with the fresh token + corridor so
        // TELEMETRY_PING is authenticated. Without this the server rejects
        // every packet as anonymous and the bus never appears live.
        socketService.connect(api.getToken() || undefined, routeId);
        // Do NOT auto-load a fabricated trip. Manifest appears after Start Trip.
      } catch (err) {
        console.error('Failed to load driver routes:', err);
      }
    };
    init();

    const unsubscribeConfig = socketService.on('FLEET_CONFIG_UPDATE', () => {
      init();
    });

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
      unsubscribeConfig();
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // 2. Continuous GPS acquisition + parked keep-alive.
  // lastFixRef holds the latest device fix; the heartbeat re-broadcasts it while
  // parked so the admin radar can distinguish "GPS on, bus stationary" from
  // "GPS off". This is what guarantees the driver's location stays visible.
  const lastFixRef = useRef<{ latitude: number; longitude: number; bearing: number; accuracy: number } | null>(null);
  const heartbeatRef = useRef<any>(null);
  const lastPushRef = useRef<number>(0);

  // Continuously acquire the device position from the moment the console opens
  // (not only during an active trip), so a driver's location is always tracked.
  // Uses the shared location service (native plugin on device) so the APK gets
  // real GPS even on insecure origins where browser geolocation is blocked.
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      await ensureLocationPermission().catch(() => undefined);
      if (cancelled) return;
      stop = await watchDeviceFix(
        (fix) => {
          setGpsError(null);
          lastFixRef.current = {
            latitude: fix.latitude,
            longitude: fix.longitude,
            bearing: fix.heading ?? 0,
            accuracy: fix.accuracy,
          };
          if (!isBroadcasting) {
            setGpsStatus('LOCKED');
            // Reflect the real stationary position on the console even before a
            // shift starts, so it is never a fabricated campus default.
            setTelemetry((t) => ({
              ...t,
              latitude: fix.latitude,
              longitude: fix.longitude,
              speedKmh: 0,
              bearing: fix.heading ?? t.bearing,
              accuracy: fix.accuracy,
            }));
          }
        },
        (err) => {
          // PERMISSION_DENIED (code 1) = app ko location permission nahi mili —
          // phone ki location ON hona kaafi nahi, App permissions me Allow karna hoga.
          // TIMEOUT (code 3) = GPS cold-start; watch jaari rehta hai, DENIED mat dikhao.
          if (err.code === 1) {
            setGpsStatus('DENIED');
            setGpsError(
              'Location permission denied — phone Settings → Apps → MMU FleetRadar → Permissions → Location → Allow (While using the app), phir Retry dabayein.'
            );
          } else if (!isBroadcasting && err.code !== 3) {
            setGpsStatus('DENIED');
            setGpsError(`GPS error: ${err.message}`);
          }
        }
      );
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBroadcasting, telemetryMode]);

  // 3. Field Telemetry Engine:
  // - SIMULATED_ROUTE (dev only): drives along MMU route waypoints for testing
  // - DEVICE_GPS: Live hardware navigator.geolocation.watchPosition
  useEffect(() => {
    if (!isBroadcasting || !activeTrip) {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (DEV_MODE && telemetryMode === 'SIMULATED_ROUTE') {
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

    let stopLive: (() => void) | undefined;
    let cancelledLive = false;
    (async () => {
      await ensureLocationPermission().catch(() => undefined);
      if (cancelledLive) return;
      stopLive = await watchDeviceFix(
        (fix) => {
          setGpsStatus('LOCKED');
          setGpsError(null);
          const lat = fix.latitude;
          const lon = fix.longitude;
          const spd = (fix.speedMps ?? 0) * 3.6;
          const heading = fix.heading ?? telemetry.bearing;

          if (lat < 29.5) {
            setDetectedDelhi(true);
          }

          setTelemetry({
            latitude: lat,
            longitude: lon,
            speedKmh: Math.max(0, spd),
            bearing: heading ?? 0,
            accuracy: fix.accuracy,
          });

          const packet = {
            tripId: activeTrip.id,
            busId: activeTrip.busId,
            routeId: activeTrip.routeId,
            latitude: lat,
            longitude: lon,
            speed: Math.max(0, spd),
            bearing: heading ?? 0,
            accuracy: fix.accuracy,
            timestamp: Date.now(),
          };

          if (socketService.isSocketOpen()) {
            socketService.sendDriverTelemetry(packet);
            lastPushRef.current = Date.now();
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
          if (err.code === 1) {
            setGpsStatus('DENIED');
            setGpsError(
              'Location permission denied — phone Settings → Apps → MMU FleetRadar → Permissions → Location → Allow, phir Start Trip dobara karein.'
            );
          } else if (err.code !== 3) {
            // Timeout while moving: keep last fix, stay ACQUIRING — do not flip to DENIED.
            setGpsError(`GPS signal weak: ${err.message} — khuli jagah par Retry karein.`);
          }
        }
      );
    })();

    return () => {
      cancelledLive = true;
      stopLive?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBroadcasting, activeTrip, telemetryMode, routes, selectedRouteId]);

  // Parked keep-alive: while a shift is active but no fresh fix is arriving
  // (e.g. speed 0 / stationary), re-broadcast the last known fix on an interval
  // so the location never appears to drop out. A zero-speed ping is itself a
  // valid "bus is here, stationary" update.
  useEffect(() => {
    if (!isBroadcasting || !activeTrip) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }
    heartbeatRef.current = setInterval(() => {
      // The live watchPosition already streams fixes; only top up when silent.
      if (Date.now() - lastPushRef.current < 20000) return;
      const fix = lastFixRef.current;
      if (!fix) return;
      const packet = {
        tripId: activeTrip.id,
        busId: activeTrip.busId,
        routeId: activeTrip.routeId,
        latitude: fix.latitude,
        longitude: fix.longitude,
        speed: 0,
        bearing: fix.bearing,
        accuracy: fix.accuracy,
        timestamp: Date.now(),
      };
      if (socketService.isSocketOpen()) {
        socketService.sendDriverTelemetry(packet);
        lastPushRef.current = Date.now();
      } else {
        offlineQueue.enqueue(packet);
        setPendingQueueCount(offlineQueue.getPendingCount());
      }
    }, 20000);
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBroadcasting, activeTrip]);

  // Surface server rejections (auth / wrong bus / out-of-corridor) so the
  // driver knows WHY the bus is not going live instead of a silent no-op.
  useEffect(() => {
    const off = socketService.on('ERROR', (data: any) => {
      const msg = data?.message;
      if (typeof msg === 'string' && msg.length > 0) setSocketError(msg);
    });
    return off;
  }, []);

  // Handle Start Trip / Go Live — begins real GPS broadcast
  const handleStartShift = async () => {
    try {
      setSocketError(null);
      // Re-assert the authenticated channel right before going live (the token
      // may have refreshed since the console opened).
      socketService.connect(api.getToken() || undefined, selectedRouteId);
      const newTrip = await api.startTrip(driverBusId, selectedRouteId, 'CAMPUS_BOUND');
      const m = await api.getTripManifest(newTrip.id);
      setManifest(m);
      setActiveTrip(newTrip);
      setCurrentStopIndex(0);
      setIsBroadcasting(true);
      socketService.broadcastTripEvent({ event: 'TRIP_STARTED', trip: newTrip, busId: driverBusId, routeId: selectedRouteId });
      socketService.broadcastFleetConfig({ type: 'TRIP_STARTED', trip: newTrip, busId: driverBusId, routeId: selectedRouteId });
      confetti({ particleCount: 30, spread: 50 });
    } catch (err: any) {
      alert(`Could not start shift: ${err.message}`);
    }
  };

  // Handle End Shift — halts GPS broadcast; bus stays PARKED at last fix
  const handleEndShift = async () => {
    if (!confirm('Are you sure you want to end this transit shift? Bus will return to parked status.')) return;
    try {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      const endingTripId = activeTrip?.id;
      if (endingTripId) {
        await api.endTrip(endingTripId);
      }
      socketService.broadcastTripEvent({ event: 'TRIP_ENDED', tripId: endingTripId, busId: driverBusId });
      socketService.broadcastFleetConfig({ type: 'TRIP_ENDED', tripId: endingTripId, busId: driverBusId });
      setIsBroadcasting(false);
      setActiveTrip(null);
      setManifest(null);
      setCurrentStopIndex(0);
      setMobileTab('COCKPIT');
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
    // Include a fix only when GPS is locked; the server then falls back to the
    // bus's last authentic telemetry instead of a fabricated position.
    const sosFix =
      gpsStatus === 'LOCKED'
        ? { latitude: telemetry.latitude, longitude: telemetry.longitude }
        : {};
    socketService.sendEmergencySOS({
      busId: activeTrip?.busId || driverBusId,
      ...sosFix,
      message: 'DRIVER EMERGENCY: Mechanical / Medical assistance requested on route!',
    });
  };

  const currentStop = manifest?.stopsManifest[currentStopIndex];

  // Build a LiveBusState snapshot from current telemetry for the navigation map.
  // Position is only attached once GPS is LOCKED (real or explicit sim fix) —
  // otherwise the puck is hidden rather than drawn at a placeholder coordinate.
  const hasDriverFix = gpsStatus === 'LOCKED';
  const driverLiveBus: LiveBusState | null = activeTrip
    ? {
        busId: activeTrip.busId || driverBusId,
        busNumber: 'BUS-01',
        registrationNumber: 'HR-54-A-1993',
        model: 'Tata Marcopolo Deluxe AC',
        status: isBroadcasting ? 'EN_ROUTE' : 'IDLE',
        capacity: 42,
        boardedCount: manifest?.totalBoarded || 0,
        driverName: 'Rajesh Kumar Sharma',
        driverPhone: '',
        routeId: activeTrip.routeId || selectedRouteId,
        routeName: manifest?.route.name || 'Ambala Express',
        latitude: hasDriverFix ? telemetry.latitude : null,
        longitude: hasDriverFix ? telemetry.longitude : null,
        speedKmh: telemetry.speedKmh,
        bearing: telemetry.bearing,
        altitudeM: null,
        accuracyM: telemetry.accuracy,
        lastPing: hasDriverFix ? new Date().toISOString() : null,
        hasFix: hasDriverFix,
        upcomingStopName: manifest?.stopsManifest[currentStopIndex]?.stopName || 'Next Stop',
        distanceToNextStopMeters: 0,
        etaMinutesUpcomingStop: 0,
      }
    : null;

  const activeDriverRoute = activeTrip
    ? routes.find((r) => r.id === (activeTrip.routeId || selectedRouteId)) || null
    : null;

  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col md:flex-row overflow-hidden select-none pb-14 md:pb-0">
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
          <span>Cockpit</span>
        </button>

        {activeTrip && (
          <button
            onClick={() => setMobileTab('MAP')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
              mobileTab === 'MAP'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'text-slate-400 bg-slate-800/80 hover:text-white'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Nav Map</span>
          </button>
        )}

        <button
          onClick={() => setMobileTab('ROSTER')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'ROSTER'
              ? 'bg-red-600 text-white shadow-md shadow-red-900/40'
              : 'text-slate-400 bg-slate-800/80 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Roster ({manifest?.totalBoarded || 0})</span>
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

          {/* GPS / socket diagnostics — tells the driver exactly what to fix */}
          {(gpsStatus === 'DENIED' || gpsError) && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-200 space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <WifiOff className="w-4 h-4 text-red-400" />
                <span>GPS unavailable — location detect nahi ho rahi</span>
              </div>
              {gpsError && <p className="leading-snug text-[11px]">{gpsError}</p>}
              <button
                onClick={async () => {
                  setGpsStatus('ACQUIRING');
                  setGpsError(null);
                  await ensureLocationPermission().catch(() => undefined);
                  try {
                    const fix = await getDeviceFix(15000);
                    lastFixRef.current = {
                      latitude: fix.latitude,
                      longitude: fix.longitude,
                      bearing: fix.heading ?? 0,
                      accuracy: fix.accuracy,
                    };
                    setGpsStatus('LOCKED');
                  } catch (err: any) {
                    setGpsError(`Retry failed: ${err?.message ?? err}`);
                  }
                }}
                className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded"
              >
                Retry GPS
              </button>
            </div>
          )}
          {socketError && (
            <div className="p-3 bg-amber-950/60 border border-amber-800 rounded-xl text-xs text-amber-200">
              <span className="font-bold">Server: </span>{socketError}
            </div>
          )}

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
                {DEV_MODE ? (
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
                ) : (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Telemetry Source
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-xs font-bold text-slate-300">
                      <Compass className="w-3.5 h-3.5 text-red-500" />
                      <span>Device GPS (hardware)</span>
                    </div>
                  </div>
                )}

                {DEV_MODE && detectedDelhi && telemetryMode === 'DEVICE_GPS' && (
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

      {/* Mobile Navigation Map Tab (visible only during active trip) */}
      {!isDesktop && mobileTab === 'MAP' && activeTrip && (
        <div className="md:hidden flex-1 relative">
          <MapLibre3DView
            activeRoute={activeDriverRoute}
            activeBus={driverLiveBus}
            isCockpitMode={true}
          />
          {/* Overlay: next stop info */}
          <div className="absolute bottom-16 left-3 right-3 z-20">
            <div className="bg-slate-950/90 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex items-center justify-between shadow-2xl">
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Next Stop</p>
                <p className="text-sm font-black text-white truncate">
                  {manifest?.stopsManifest[currentStopIndex]?.stopName || 'En Route…'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Speed</p>
                <p className="text-xl font-black text-amber-400">{telemetry.speedKmh.toFixed(0)} <span className="text-xs font-bold text-slate-400">km/h</span></p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop: Navigation Map Panel (right of cockpit when trip is active) */}
      {isDesktop && activeTrip && (
        <div className="hidden md:flex flex-1 relative">
          <MapLibre3DView
            activeRoute={activeDriverRoute}
            activeBus={driverLiveBus}
            isCockpitMode={true}
          />
          {/* Next stop overlay on desktop map */}
          <div className="absolute bottom-6 left-4 right-4 z-20 pointer-events-none">
            <div className="bg-slate-950/85 backdrop-blur-2xl border border-white/10 rounded-2xl p-3.5 flex items-center justify-between shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0">
                  <ArrowRight className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Approaching Stop</p>
                  <p className="text-sm font-black text-white">
                    {manifest?.stopsManifest[currentStopIndex]?.stopName || 'En Route…'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Speed</p>
                  <p className="text-lg font-black text-amber-400">{telemetry.speedKmh.toFixed(0)}<span className="text-xs font-bold text-slate-400 ml-0.5">km/h</span></p>
                </div>
                <div className="text-center border-l border-white/10 pl-4">
                  <p className="text-[9px] text-slate-400 font-bold uppercase">Bearing</p>
                  <p className="text-lg font-black text-red-400">{compassLabel(telemetry.bearing)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Right Stop-Wise Student Manifest Boarding Roster */}
      <div className={`flex-1 bg-slate-950 p-3.5 md:p-5 flex-col overflow-hidden ${mobileTab === 'ROSTER' ? 'flex' : 'hidden md:flex'} ${activeTrip ? 'md:max-w-[420px] md:flex-none' : ''}`}>
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
