import React, { useState } from 'react';
import { Route, RouteStop } from '../../types/index.js';
import {
  MapPin,
  Plus,
  Trash2,
  Edit3,
  X,
  Check,
  Search,
  Navigation,
  Milestone,
  Compass,
  ArrowRight,
} from 'lucide-react';

interface RouteStopManagerProps {
  routes: Route[];
  onSaveRoute: (route: Route) => Promise<void>;
  onDeleteRoute: (routeId: string) => Promise<void>;
  onSaveStop: (routeId: string, stop: RouteStop) => Promise<void>;
  onDeleteStop: (routeId: string, stopId: string) => Promise<void>;
}

export const RouteStopManager: React.FC<RouteStopManagerProps> = ({
  routes,
  onSaveRoute,
  onDeleteRoute,
  onSaveStop,
  onDeleteStop,
}) => {
  const [selectedRouteId, setSelectedRouteId] = useState<string>(routes[0]?.id || '');
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);

  const [isStopModalOpen, setIsStopModalOpen] = useState(false);
  const [editingStop, setEditingStop] = useState<RouteStop | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];

  // Route Form State
  const [routeForm, setRouteForm] = useState<Partial<Route>>({
    routeCode: '',
    name: '',
    description: '',
    originName: '',
    destinationName: 'MMU Mullana Campus Terminal',
    totalDistanceKm: 25,
    estimatedDurationMinutes: 45,
    campus: 'MULLANA_MAIN',
    colorHex: '#E21E26',
  });

  // Stop Form State
  const [stopForm, setStopForm] = useState<Partial<RouteStop>>({
    name: '',
    landmark: '',
    stopSequence: 1,
    latitude: 30.25045,
    longitude: 77.04505,
    geofenceRadiusMeters: 800,
    scheduledArrivalOffsetMins: 0,
    isMajorHub: false,
  });

  // Route Handlers
  const handleOpenAddRoute = () => {
    setEditingRoute(null);
    setRouteForm({
      routeCode: `ROUTE-NEW-${routes.length + 1}`,
      name: '',
      description: '',
      originName: '',
      destinationName: 'MMU Mullana Campus Terminal',
      totalDistanceKm: 30,
      estimatedDurationMinutes: 50,
      campus: 'MULLANA_MAIN',
      colorHex: '#10B981',
    });
    setIsRouteModalOpen(true);
  };

  const handleOpenEditRoute = (route: Route) => {
    setEditingRoute(route);
    setRouteForm({ ...route });
    setIsRouteModalOpen(true);
  };

  const handleRouteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeForm.routeCode || !routeForm.name || !routeForm.originName) {
      alert('Please fill Route Code, Route Name, and Origin Name.');
      return;
    }

    setSubmitting(true);
    try {
      const newRouteId = editingRoute?.id || `route-${Date.now()}`;
      const routeToSave: Route = {
        id: newRouteId,
        routeCode: routeForm.routeCode.trim().toUpperCase(),
        name: routeForm.name.trim(),
        description: routeForm.description?.trim() || 'Regional transit corridor to MMU campus.',
        originName: routeForm.originName.trim(),
        destinationName: routeForm.destinationName?.trim() || 'MMU Mullana Campus Terminal',
        totalDistanceKm: Number(routeForm.totalDistanceKm) || 25,
        estimatedDurationMinutes: Number(routeForm.estimatedDurationMinutes) || 45,
        campus: routeForm.campus || 'MULLANA_MAIN',
        colorHex: routeForm.colorHex || '#E21E26',
        stops: editingRoute?.stops || [
          {
            id: `stop-${Date.now()}-1`,
            routeId: newRouteId,
            name: `${routeForm.originName} Bus Bay`,
            landmark: 'Departure Hub',
            stopSequence: 1,
            latitude: 30.33268,
            longitude: 76.83756,
            geofenceRadiusMeters: 1000,
            scheduledArrivalOffsetMins: 0,
            isMajorHub: true,
          },
          {
            id: `stop-${Date.now()}-2`,
            routeId: newRouteId,
            name: 'MMU Mullana Campus Terminal',
            landmark: 'Campus Main Entrance',
            stopSequence: 2,
            latitude: 30.25045,
            longitude: 77.04505,
            geofenceRadiusMeters: 800,
            scheduledArrivalOffsetMins: Number(routeForm.estimatedDurationMinutes) || 45,
            isMajorHub: true,
          },
        ],
        waypoints: editingRoute?.waypoints || [
          [76.83756, 30.33268],
          [77.04505, 30.25045],
        ],
      };

      await onSaveRoute(routeToSave);
      setSelectedRouteId(newRouteId);
      setIsRouteModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRoute = async (routeId: string, routeName: string) => {
    if (routes.length <= 1) {
      alert('You cannot delete the only remaining transit corridor.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete corridor "${routeName}" and all its stops?`)) {
      await onDeleteRoute(routeId);
      const remaining = routes.filter((r) => r.id !== routeId);
      if (remaining.length > 0) setSelectedRouteId(remaining[0].id);
    }
  };

  // Stop Handlers
  const handleOpenAddStop = () => {
    if (!currentRoute) return;
    setEditingStop(null);
    const nextSeq = currentRoute.stops.length + 1;
    setStopForm({
      name: '',
      landmark: '',
      stopSequence: nextSeq,
      latitude: 30.2641,
      longitude: 76.9942,
      geofenceRadiusMeters: 800,
      scheduledArrivalOffsetMins: (nextSeq - 1) * 8,
      isMajorHub: false,
    });
    setIsStopModalOpen(true);
  };

  const handleOpenEditStop = (stop: RouteStop) => {
    setEditingStop(stop);
    setStopForm({ ...stop });
    setIsStopModalOpen(true);
  };

  const handleStopSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRoute || !stopForm.name || !stopForm.landmark) {
      alert('Please fill Stop Name and Landmark.');
      return;
    }

    setSubmitting(true);
    try {
      const stopToSave: RouteStop = {
        id: editingStop?.id || `stop-${Date.now()}`,
        routeId: currentRoute.id,
        name: stopForm.name.trim(),
        landmark: stopForm.landmark.trim(),
        stopSequence: Number(stopForm.stopSequence) || 1,
        latitude: Number(stopForm.latitude) || 30.25045,
        longitude: Number(stopForm.longitude) || 77.04505,
        geofenceRadiusMeters: Number(stopForm.geofenceRadiusMeters) || 800,
        scheduledArrivalOffsetMins: Number(stopForm.scheduledArrivalOffsetMins) || 0,
        isMajorHub: !!stopForm.isMajorHub,
      };

      await onSaveStop(currentRoute.id, stopToSave);
      setIsStopModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStop = async (stopId: string, stopName: string) => {
    if (!currentRoute) return;
    if (currentRoute.stops.length <= 1) {
      alert('A transit corridor must have at least one bus stop.');
      return;
    }
    if (window.confirm(`Are you sure you want to remove stoppage "${stopName}"?`)) {
      await onDeleteStop(currentRoute.id, stopId);
    }
  };

  return (
    <div className="w-full h-full p-4 sm:p-6 overflow-y-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-white flex items-center gap-2">
            <Milestone className="w-6 h-6 text-red-500" />
            Transit Corridors & Stoppage Master Editor
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure highway routes, GPS coordinates, geofences, and bus stoppage sequences ({routes.length} corridors)
          </p>
        </div>

        <button
          onClick={handleOpenAddRoute}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-red-900/30 flex-shrink-0 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Route</span>
        </button>
      </div>

      {/* Corridor Selector Strip */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {routes.map((route) => {
          const isSelected = route.id === selectedRouteId;
          return (
            <button
              key={route.id}
              onClick={() => setSelectedRouteId(route.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all whitespace-nowrap border flex-shrink-0 ${
                isSelected
                  ? 'bg-red-950/60 border-red-500 text-white shadow-lg shadow-red-950/40'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: route.colorHex || '#ef4444' }}
              />
              <span>{route.routeCode}</span>
              <span className="text-[10px] opacity-75 font-normal">({route.stops.length} stops)</span>
            </button>
          );
        })}
      </div>

      {/* Active Corridor Card */}
      {currentRoute && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: currentRoute.colorHex || '#ef4444' }}
                />
                <span className="text-xs font-mono font-black text-red-400 bg-red-950/60 px-2 py-0.5 rounded border border-red-900/50">
                  {currentRoute.routeCode}
                </span>
                <h4 className="text-lg font-black text-white">{currentRoute.name}</h4>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">{currentRoute.description}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-300">
                <span className="flex items-center gap-1 text-slate-400">
                  <Navigation className="w-3.5 h-3.5 text-slate-500" />
                  <span>{currentRoute.originName}</span>
                  <ArrowRight className="w-3 h-3 text-red-500" />
                  <span className="text-white font-bold">{currentRoute.destinationName}</span>
                </span>
                <span>·</span>
                <span className="font-bold text-amber-400">{currentRoute.totalDistanceKm} km</span>
                <span>·</span>
                <span className="font-bold text-emerald-400">~{currentRoute.estimatedDurationMinutes} mins</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenEditRoute(currentRoute)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Corridor</span>
              </button>
              <button
                onClick={() => handleDeleteRoute(currentRoute.id, currentRoute.name)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-xs font-bold text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {/* Stoppages Sub-Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-sm font-black text-white uppercase tracking-wider">
                  Configured Bus Stoppages ({currentRoute.stops.length})
                </h5>
                <p className="text-[11px] text-slate-400">
                  Sequential pickup halts with geofence triggers and GPS coordinates
                </p>
              </div>

              <button
                onClick={handleOpenAddStop}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 rounded-xl transition-all shadow-md active:scale-95"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Add Stoppage</span>
              </button>
            </div>

            {/* Stops Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {currentRoute.stops.map((stop) => (
                <div
                  key={stop.id}
                  className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-2 hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-red-600/20 text-red-400 border border-red-500/40 text-xs font-black flex items-center justify-center flex-shrink-0">
                          {stop.stopSequence}
                        </span>
                        <span className="font-extrabold text-white text-xs leading-snug">{stop.name}</span>
                      </div>
                      {stop.isMajorHub && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">
                          Hub
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 mt-1.5 ml-8">{stop.landmark}</p>
                    <div className="mt-2 ml-8 text-[10px] font-mono text-slate-500 space-y-0.5">
                      <div>GPS: {stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}</div>
                      <div>Geofence: {stop.geofenceRadiusMeters}m · ETA offset: +{stop.scheduledArrivalOffsetMins}m</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-800/60 mt-2">
                    <button
                      onClick={() => handleOpenEditStop(stop)}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                      title="Edit Stoppage"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteStop(stop.id, stop.name)}
                      className="p-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-400"
                      title="Remove Stoppage"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Route Form Modal */}
      {isRouteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-hud-rise">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h4 className="text-base font-black text-white flex items-center gap-2">
                <Milestone className="w-5 h-5 text-red-500" />
                {editingRoute ? `Edit Corridor: ${editingRoute.routeCode}` : 'Create New Transit Corridor'}
              </h4>
              <button
                onClick={() => setIsRouteModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRouteSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Route Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ROUTE-KRL-05"
                    value={routeForm.routeCode || ''}
                    onChange={(e) => setRouteForm({ ...routeForm, routeCode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Corridor Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={routeForm.colorHex || '#E21E26'}
                      onChange={(e) => setRouteForm({ ...routeForm, colorHex: e.target.value })}
                      className="w-9 h-9 rounded-xl bg-transparent cursor-pointer border border-slate-700"
                    />
                    <input
                      type="text"
                      value={routeForm.colorHex || '#E21E26'}
                      onChange={(e) => setRouteForm({ ...routeForm, colorHex: e.target.value })}
                      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-mono text-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Corridor Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Karnal & Nilokheri - MMU Superfast Line"
                  value={routeForm.name || ''}
                  onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Origin Station *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Karnal Old Bus Stand"
                    value={routeForm.originName || ''}
                    onChange={(e) => setRouteForm({ ...routeForm, originName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Destination Terminal
                  </label>
                  <input
                    type="text"
                    placeholder="MMU Mullana Campus Terminal"
                    value={routeForm.destinationName || ''}
                    onChange={(e) => setRouteForm({ ...routeForm, destinationName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Total Distance (km)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={routeForm.totalDistanceKm || 25}
                    onChange={(e) => setRouteForm({ ...routeForm, totalDistanceKm: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Est. Duration (mins)
                  </label>
                  <input
                    type="number"
                    value={routeForm.estimatedDurationMinutes || 45}
                    onChange={(e) => setRouteForm({ ...routeForm, estimatedDurationMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Corridor Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Details about route, highways taken, and regional coverage..."
                  value={routeForm.description || ''}
                  onChange={(e) => setRouteForm({ ...routeForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRouteModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition-all shadow-lg shadow-red-900/30 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingRoute ? 'Save Corridor' : 'Create Corridor'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stop Form Modal */}
      {isStopModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-hud-rise">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h4 className="text-base font-black text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-400" />
                {editingStop ? `Edit Stop: ${editingStop.name}` : `Add Stop to ${currentRoute?.routeCode}`}
              </h4>
              <button
                onClick={() => setIsStopModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleStopSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Stop Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Saha Industrial Junction"
                    value={stopForm.name || ''}
                    onChange={(e) => setStopForm({ ...stopForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Sequence #
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={stopForm.stopSequence || 1}
                    onChange={(e) => setStopForm({ ...stopForm, stopSequence: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Landmark / Identification *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Near Jagadhri Road Flyover Base"
                  value={stopForm.landmark || ''}
                  onChange={(e) => setStopForm({ ...stopForm, landmark: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Latitude (GPS) *
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    placeholder="30.25045"
                    value={stopForm.latitude ?? 30.25045}
                    onChange={(e) => setStopForm({ ...stopForm, latitude: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Longitude (GPS) *
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    placeholder="77.04505"
                    value={stopForm.longitude ?? 77.04505}
                    onChange={(e) => setStopForm({ ...stopForm, longitude: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Geofence Radius (meters)
                  </label>
                  <input
                    type="number"
                    min="100"
                    max="5000"
                    value={stopForm.geofenceRadiusMeters || 800}
                    onChange={(e) => setStopForm({ ...stopForm, geofenceRadiusMeters: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Arrival Offset (minutes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={stopForm.scheduledArrivalOffsetMins || 0}
                    onChange={(e) => setStopForm({ ...stopForm, scheduledArrivalOffsetMins: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isMajorHub"
                  checked={!!stopForm.isMajorHub}
                  onChange={(e) => setStopForm({ ...stopForm, isMajorHub: e.target.checked })}
                  className="rounded bg-slate-800 border-slate-700 text-red-600 focus:ring-red-500"
                />
                <label htmlFor="isMajorHub" className="text-xs text-slate-300 font-bold select-none cursor-pointer">
                  Mark as Major Regional Transit Hub (Multi-line junction)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsStopModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-all shadow-lg shadow-emerald-900/30 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingStop ? 'Save Stoppage' : 'Add Stoppage'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
