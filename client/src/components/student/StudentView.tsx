import React, { useState, useEffect } from 'react';
import { MapLibre3DView } from '../3d/MapLibre3DView.js';
import { StudentAllocationResponse, LiveBusState } from '../../types/index.js';
import { api } from '../../services/api.js';
import { socketService } from '../../services/websocket.js';
import { audioAlert } from '../../services/audioAlert.js';
import {
  Bus,
  Clock,
  Navigation,
  Phone,
  Bell,
  MapPin,
  Sparkles,
  ChevronUp,
  ChevronDown,
  X,
  Ticket,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface StudentViewProps {
  onOpenAuth: () => void;
}

export const StudentView: React.FC<StudentViewProps> = () => {
  const [data, setData] = useState<StudentAllocationResponse | null>(null);
  const [liveBus, setLiveBus] = useState<LiveBusState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [geofenceAlert, setGeofenceAlert] = useState<string | null>(null);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState<boolean>(false);

  // Fetch initial allocation — bus reflects ONLY real driver telemetry.
  // No trip active => parked STATIC at terminal, status IDLE.
  const loadAllocation = async () => {
    try {
      const res = await api.getStudentAllocation();
      setData(res);

      if (res.bus) {
        const tripActive = res.liveTracking.isTripActive === true;
        const rawLat = res.liveTracking.currentCoordinates[1];
        const rawLng = res.liveTracking.currentCoordinates[0];
        // Enforce MMU Mullana/Ambala transit corridor bounds (prevent Delhi IP/remote jump)
        const isValidCorridor = rawLat >= 29.8 && rawLat <= 30.9 && rawLng >= 76.2 && rawLng <= 77.7;
        const validLat = isValidCorridor ? rawLat : 30.24853;
        const validLng = isValidCorridor ? rawLng : 77.04402;

        const parked: LiveBusState = {
          busId: res.bus.id,
          busNumber: res.bus.busNumber,
          registrationNumber: res.bus.registrationNumber,
          model: 'Tata Marcopolo Deluxe AC 42-Seater',
          status: tripActive ? 'EN_ROUTE' : 'IDLE',
          capacity: res.bus.capacity || 42,
          boardedCount: 0,
          driverName: res.bus.assignedDriverName,
          driverPhone: res.bus.assignedDriverPhone,
          routeId: res.route.id,
          routeName: res.route.name,
          latitude: validLat,
          longitude: validLng,
          // Parked buses report zero motion — never fabricate speed.
          speedKmh: tripActive ? res.liveTracking.speedKmh : 0,
          bearing: res.liveTracking.bearing || 0,
          altitudeM: 268,
          accuracyM: 3.5,
          lastPing: new Date().toISOString(),
          upcomingStopName: tripActive ? res.stop.name : 'Bus Parked at Terminal',
          distanceToNextStopMeters: tripActive ? res.liveTracking.distanceToStopMeters : 0,
          etaMinutesUpcomingStop: tripActive ? res.liveTracking.etaMinutes : 0,
        };
        setLiveBus(parked);
      }
    } catch (err) {
      console.error('Failed to load student allocation:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllocation();

    const token = api.getToken() || undefined;
    socketService.connect(token, 'route-amb-01');

    const unsubscribePos = socketService.on('BUS_POSITION_UPDATE', (update: any) => {
      setLiveBus((prev) => {
        if (!prev) return null;
        // Ignore packets for other buses on shared route channel
        if (update.busId && update.busId !== prev.busId) return prev;
        // Filter out any out-of-bounds telemetry (e.g. from Delhi)
        if (update.latitude < 29.8 || update.latitude > 30.9) return prev;
        const live = (update.speedKmh || 0) > 0.5;
        return {
          ...prev,
          latitude: update.latitude,
          longitude: update.longitude,
          speedKmh: update.speedKmh ?? prev.speedKmh,
          bearing: update.bearing ?? prev.bearing,
          altitudeM: update.altitudeM ?? prev.altitudeM,
          accuracyM: update.accuracyM ?? prev.accuracyM,
          lastPing: update.recordedAt || new Date().toISOString(),
          status: live ? 'EN_ROUTE' : prev.status === 'IDLE' && live ? 'EN_ROUTE' : prev.status,
          upcomingStopName: update.nextStopName || prev.upcomingStopName,
          distanceToNextStopMeters: update.distanceToNextStopMeters ?? update.distanceMetersAssignedStop ?? prev.distanceToNextStopMeters,
          etaMinutesUpcomingStop: update.etaMinutesUpcomingStop ?? prev.etaMinutesUpcomingStop,
          boardedCount: update.boardedCount ?? prev.boardedCount,
        };
      });
    });

    const unsubscribeGeofence = socketService.on('GEOFENCE_APPROACHING_ALERT', (alert: any) => {
      setGeofenceAlert(alert.message);
      audioAlert.playGeofenceApproachingAlert();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.2 },
      });
    });

    return () => {
      unsubscribePos();
      unsubscribeGeofence();
    };
  }, []);

  const triggerTestGeofence = () => {
    audioAlert.playGeofenceApproachingAlert();
    setGeofenceAlert('TEST ALERT: Bus BUS-01 is within 850m of your stop! ETA ~2.1 mins.');
    confetti({
      particleCount: 40,
      spread: 70,
      origin: { y: 0.3 },
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-[calc(100vh-56px)] md:h-[calc(100vh-64px)] bg-slate-950 text-white">
        <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-bold text-slate-400">Loading MMU 3D Navigation...</p>
      </div>
    );
  }

  const isLive = !!liveBus && liveBus.status !== 'IDLE' && (liveBus.speedKmh || 0) > 0.5;
  const distanceKm = liveBus ? (liveBus.distanceToNextStopMeters / 1000).toFixed(1) : '0.0';
  const etaMins = liveBus ? Math.max(1, Math.round(liveBus.etaMinutesUpcomingStop || 0)) : 0;

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 select-none">
      {/* 1. Full-Screen 3D Geospatial Viewport (100% immersive width & height) */}
      <div className="absolute inset-0 w-full h-full">
        <MapLibre3DView
          activeRoute={data?.route}
          activeBus={liveBus}
          selectedStop={data?.stop}
        />

        {/* Geofence 1km Floating Banner Alert */}
        {geofenceAlert && (
          <div className="absolute top-16 md:top-20 left-3 right-3 md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg z-30 animate-bounce">
            <div className="bg-gradient-to-r from-red-600 via-amber-600 to-red-600 text-white p-3 md:px-4 md:py-3 rounded-2xl shadow-2xl border-2 border-amber-300 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Bell className="w-5 h-5 text-amber-200 animate-ping flex-shrink-0" />
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-200">1 km Geofence Alert</h4>
                  <p className="text-xs font-bold leading-tight">{geofenceAlert}</p>
                </div>
              </div>
              <button
                onClick={() => setGeofenceAlert(null)}
                className="text-white/90 hover:text-white text-xs bg-black/30 hover:bg-black/50 p-1.5 rounded-lg flex-shrink-0 ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Backdrop Scrim when Drawer is fully expanded */}
      {isDrawerExpanded && (
        <div
          onClick={() => setIsDrawerExpanded(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-25 md:hidden transition-opacity"
        />
      )}

      {/* 2. Desktop: Floating Frosted-Glass Transit Card */}
      <div className="hidden md:flex absolute top-4 left-4 w-[380px] max-h-[calc(100vh-100px)] z-30 flex-col bg-slate-950/85 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-[0_16px_50px_rgba(0,0,0,0.6)] overflow-hidden transition-all duration-300 pointer-events-auto">
        {/* Top Header */}
        <div className="p-4 border-b border-white/10 bg-gradient-to-br from-slate-900/90 to-slate-950/90">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {isLive ? (
                <>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-black tracking-wider text-emerald-400 uppercase">Live Telemetry Active</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="text-xs font-black tracking-wider text-amber-300 uppercase">Bus Parked • Awaiting Driver Shift</span>
                </>
              )}
            </div>
            <span className="text-[10px] font-mono bg-white/10 text-slate-300 px-2 py-0.5 rounded-full border border-white/10">
              {data?.route.routeCode || 'ROUTE-AMB-01'}
            </span>
          </div>

          {/* ETA & Distance Hero Card */}
          <div className="grid grid-cols-2 gap-2.5 bg-white/5 p-3 rounded-2xl border border-white/10 shadow-inner">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" /> Arrival Time
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                {isLive ? (
                  <>
                    <span className="text-2xl font-black text-white tracking-tight">~{etaMins}</span>
                    <span className="text-xs font-bold text-amber-400">mins</span>
                  </>
                ) : (
                  <span className="text-lg font-black text-amber-400 tracking-tight">At Depot</span>
                )}
              </div>
            </div>
            <div className="flex flex-col border-l border-white/10 pl-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Navigation className="w-3 h-3 text-red-400" /> Distance Away
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                {isLive ? (
                  <>
                    <span className="text-2xl font-black text-white tracking-tight">{distanceKm}</span>
                    <span className="text-xs font-bold text-red-400">km</span>
                  </>
                ) : (
                  <span className="text-lg font-black text-slate-300 tracking-tight">Stationary</span>
                )}
              </div>
            </div>
          </div>

          {/* Micro HUD */}
          <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-xs text-slate-300">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-semibold">Speed:</span>
              <span className="font-mono font-bold text-emerald-400">{liveBus?.speedKmh ? liveBus.speedKmh.toFixed(0) : 0} km/h</span>
            </div>
            <div className="flex items-center gap-1.5 truncate max-w-[190px]">
              <span className="text-slate-400 font-semibold">Next Stop:</span>
              <span className="font-bold text-white truncate">{liveBus?.upcomingStopName || data?.stop.name || 'MMU Campus'}</span>
            </div>
          </div>
        </div>

        {/* Scrollable details */}
        <div className="p-4 space-y-3.5 overflow-y-auto max-h-[calc(100vh-280px)]">
          {/* Digital Pass Card */}
          <div className="bg-gradient-to-r from-red-950/60 to-slate-900/80 p-3.5 rounded-2xl border border-red-500/30 relative overflow-hidden shadow-lg">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4 text-red-500" />
                <span className="text-xs font-black text-white">MMU Digital Transit Pass</span>
              </div>
              <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                {data?.allocation.feeStatus || 'VERIFIED PAID'}
              </span>
            </div>
            <div className="text-xs text-slate-300">
              Pass No: <strong className="text-white font-mono">{data?.allocation.passNumber}</strong> • Seat: <strong className="text-amber-400">{data?.allocation.seatNumber || 'Free Seating'}</strong>
            </div>
          </div>

          {/* Assigned Bus & Driver Quick Action Card */}
          <div className="bg-white/5 p-3.5 rounded-2xl border border-white/10 space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 flex-shrink-0">
                  <Bus className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                    {data?.bus.busNumber}
                    <span className="text-[10px] bg-white/10 text-slate-300 font-mono px-1.5 py-0.5 rounded border border-white/10">
                      {data?.bus.registrationNumber}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400">Cap: {data?.bus.capacity} Seats • Tata Deluxe AC</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div>
                <p className="text-[9px] text-slate-400 uppercase font-semibold">Assigned Driver</p>
                <p className="text-xs font-bold text-white">{data?.bus.assignedDriverName}</p>
              </div>
              <a
                href={`tel:${data?.bus.assignedDriverPhone}`}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-lg shadow-emerald-900/40 active:scale-95"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Call Driver</span>
              </a>
            </div>
          </div>

          {/* Stoppage Waypoint Sequence */}
          <div className="bg-white/5 p-3 rounded-2xl border border-white/10 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <h5 className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-400" /> Route Stoppages
              </h5>
              <span className="text-[10px] text-slate-400">{data?.route.stops.length} Stops</span>
            </div>

            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {data?.route.stops.map((stop) => {
                const isMyStop = stop.id === data.stop.id;
                return (
                  <div
                    key={stop.id}
                    className={`flex items-center justify-between p-2 rounded-xl text-xs transition-all ${
                      isMyStop
                        ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${isMyStop ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                        {stop.stopSequence}
                      </span>
                      <span className="truncate">{stop.name}</span>
                    </div>
                    {isMyStop && (
                      <span className="text-[9px] bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded font-black tracking-wide flex-shrink-0 ml-1">
                        MY STOP
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audio & Geofence Simulator Test Button */}
          <button
            onClick={triggerTestGeofence}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 border border-white/15 text-xs font-bold text-slate-200 transition-all shadow-md active:scale-98"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Test 1km Geofence Alert Sound</span>
          </button>
        </div>
      </div>

      {/* 3. Mobile: Floating Frosted-Glass Bottom Sheet */}
      <div
        className={`md:hidden fixed inset-x-2 transition-all duration-300 ease-out z-30 pointer-events-auto bg-slate-950/90 backdrop-blur-3xl border border-white/15 shadow-[0_16px_50px_rgba(0,0,0,0.75)] rounded-3xl overflow-hidden flex flex-col ${
          isDrawerExpanded
            ? 'bottom-2 top-16 rounded-3xl'
            : 'bottom-2 h-[142px]'
        }`}
        style={{ paddingBottom: 'max(0.4rem, env(safe-area-inset-bottom))' }}
      >
        {/* Mobile Drag Handle Bar */}
        <div
          onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
          className="flex flex-col items-center pt-2 pb-1 cursor-pointer bg-slate-950/80 active:bg-slate-900 select-none"
        >
          <div className="w-12 h-1.5 bg-slate-600 rounded-full mb-1"></div>
        </div>

        {/* Live Transit Peek Header */}
        <div className="px-3.5 py-1.5 bg-gradient-to-br from-slate-900/90 to-slate-950/90 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {isLive ? (
                <>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase">Live Telemetry</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="text-[10px] font-bold tracking-wider text-amber-300 uppercase">Bus Parked</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono bg-white/10 text-slate-300 px-2 py-0.5 rounded-full border border-white/10">
                {data?.route.routeCode || 'AMB-01'}
              </span>
              <button
                onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
                className="p-1 rounded-lg bg-white/10 text-slate-200 flex items-center gap-1 text-[10px] px-2 font-bold"
              >
                <span>{isDrawerExpanded ? 'Close' : 'Details'}</span>
                {isDrawerExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* ETA & Distance Hero Card */}
          <div className="grid grid-cols-2 gap-2 bg-white/5 p-2 rounded-2xl border border-white/10 shadow-inner">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" /> Arrival Time
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                {isLive ? (
                  <>
                    <span className="text-xl font-black text-white tracking-tight">~{etaMins}</span>
                    <span className="text-xs font-bold text-amber-400">mins</span>
                  </>
                ) : (
                  <span className="text-base font-black text-amber-400 tracking-tight">At Depot</span>
                )}
              </div>
            </div>
            <div className="flex flex-col border-l border-white/10 pl-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Navigation className="w-3 h-3 text-red-400" /> Distance Away
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                {isLive ? (
                  <>
                    <span className="text-xl font-black text-white tracking-tight">{distanceKm}</span>
                    <span className="text-xs font-bold text-red-400">km</span>
                  </>
                ) : (
                  <span className="text-base font-black text-slate-300 tracking-tight">Stationary</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Expanded Drawer Content (Visible when pulled up) */}
        {isDrawerExpanded && (
          <div className="p-3.5 space-y-3 flex-1 overflow-y-auto">
            {/* Digital Pass Card */}
            <div className="bg-gradient-to-r from-red-950/60 to-slate-900/80 p-3 rounded-2xl border border-red-500/30">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs font-black text-white">MMU Digital Transit Pass</span>
                </div>
                <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  {data?.allocation.feeStatus || 'VERIFIED PAID'}
                </span>
              </div>
              <div className="text-[11px] text-slate-300">
                Pass: <strong className="text-white font-mono">{data?.allocation.passNumber}</strong> • Seat: <strong className="text-amber-400">{data?.allocation.seatNumber || 'Free'}</strong>
              </div>
            </div>

            {/* Assigned Bus & Driver Card */}
            <div className="bg-white/5 p-3 rounded-2xl border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 flex-shrink-0">
                    <Bus className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      {data?.bus.busNumber}
                      <span className="text-[9px] bg-white/10 text-slate-300 font-mono px-1 py-0.5 rounded">
                        {data?.bus.registrationNumber}
                      </span>
                    </h4>
                    <p className="text-[10px] text-slate-400">Cap: {data?.bus.capacity} Seats • AC</p>
                  </div>
                </div>
                <a
                  href={`tel:${data?.bus.assignedDriverPhone}`}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md"
                >
                  <Phone className="w-3 h-3" />
                  <span>Call</span>
                </a>
              </div>
            </div>

            {/* Stoppages */}
            <div className="bg-white/5 p-3 rounded-2xl border border-white/10 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <h5 className="text-[10px] font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-amber-400" /> Route Stoppages
                </h5>
                <span className="text-[10px] text-slate-400">{data?.route.stops.length} Stops</span>
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {data?.route.stops.map((stop) => {
                  const isMyStop = stop.id === data.stop.id;
                  return (
                    <div
                      key={stop.id}
                      className={`flex items-center justify-between p-1.5 rounded-lg text-xs ${
                        isMyStop ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-300'
                      }`}
                    >
                      <span className="truncate">{stop.stopSequence}. {stop.name}</span>
                      {isMyStop && <span className="text-[9px] bg-amber-500 text-slate-950 px-1 py-0.2 rounded font-black">MY STOP</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Geofence Test */}
            <button
              onClick={triggerTestGeofence}
              className="w-full py-2 rounded-xl bg-white/10 border border-white/10 text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Test 1km Geofence Alert Sound</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
