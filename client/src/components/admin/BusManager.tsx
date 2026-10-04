import React, { useState } from 'react';
import { LiveBusState, Route } from '../../types/index.js';
import { Bus, Plus, Trash2, Edit3, X, Check, Search, Phone, User as UserIcon, MapPin, Gauge } from 'lucide-react';

interface BusManagerProps {
  buses: LiveBusState[];
  routes: Route[];
  onSaveBus: (bus: LiveBusState) => Promise<void>;
  onDeleteBus: (busId: string) => Promise<void>;
}

export const BusManager: React.FC<BusManagerProps> = ({
  buses,
  routes,
  onSaveBus,
  onDeleteBus,
}) => {
  const [search, setSearch] = useState('');
  const [editingBus, setEditingBus] = useState<LiveBusState | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<LiveBusState>>({
    busNumber: '',
    registrationNumber: '',
    model: '',
    capacity: 42,
    driverName: '',
    driverPhone: '',
    routeId: routes[0]?.id || '',
    status: 'IDLE',
  });

  const handleOpenAdd = () => {
    setEditingBus(null);
    setFormData({
      busNumber: `BUS-0${buses.length + 1}`,
      registrationNumber: 'HR-54-A-',
      model: 'Tata Marcopolo Deluxe AC 42-Seater',
      capacity: 42,
      driverName: '',
      driverPhone: '+91-',
      routeId: routes[0]?.id || '',
      status: 'IDLE',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (bus: LiveBusState) => {
    setEditingBus(bus);
    setFormData({ ...bus });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.busNumber || !formData.registrationNumber || !formData.driverName) {
      alert('Please fill all required fields (Bus Number, Registration, Driver Name).');
      return;
    }

    setSubmitting(true);
    try {
      const selectedRoute = routes.find((r) => r.id === formData.routeId);
      const busToSave: LiveBusState = {
        busId: editingBus?.busId || `bus-${Date.now()}`,
        busNumber: formData.busNumber.trim().toUpperCase(),
        registrationNumber: formData.registrationNumber.trim().toUpperCase(),
        model: formData.model?.trim() || 'Institutional Carrier',
        capacity: Number(formData.capacity) || 40,
        boardedCount: editingBus?.boardedCount || 0,
        driverName: formData.driverName.trim(),
        driverPhone: formData.driverPhone?.trim() || '',
        routeId: formData.routeId || undefined,
        routeName: selectedRoute?.name || 'Unassigned',
        status: (formData.status as any) || 'IDLE',
        latitude: editingBus?.latitude ?? null,
        longitude: editingBus?.longitude ?? null,
        speedKmh: editingBus?.speedKmh ?? 0,
        bearing: editingBus?.bearing ?? 0,
        altitudeM: editingBus?.altitudeM ?? null,
        accuracyM: editingBus?.accuracyM ?? null,
        lastPing: editingBus?.lastPing ?? null,
        hasFix: editingBus?.hasFix ?? false,
        upcomingStopName: editingBus?.upcomingStopName ?? 'Parked at Campus Terminal',
        distanceToNextStopMeters: editingBus?.distanceToNextStopMeters ?? 0,
        etaMinutesUpcomingStop: editingBus?.etaMinutesUpcomingStop ?? 0,
      };

      await onSaveBus(busToSave);
      setIsModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (busId: string, busNumber: string) => {
    if (window.confirm(`Are you sure you want to remove ${busNumber} from the institutional fleet?`)) {
      await onDeleteBus(busId);
    }
  };

  const filteredBuses = buses.filter(
    (b) =>
      b.busNumber.toLowerCase().includes(search.toLowerCase()) ||
      b.registrationNumber.toLowerCase().includes(search.toLowerCase()) ||
      b.driverName.toLowerCase().includes(search.toLowerCase()) ||
      (b.routeName && b.routeName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="w-full h-full p-4 sm:p-6 overflow-y-auto space-y-6">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-white flex items-center gap-2">
            <Bus className="w-6 h-6 text-red-500" />
            Institutional Fleet Vehicle Register
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure MMU bus fleet units, assigned drivers, and active corridor allocations ({buses.length} registered)
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Search box */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search bus, plate or driver..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-red-900/30 flex-shrink-0 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add Bus</span>
          </button>
        </div>
      </div>

      {/* Fleet Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBuses.map((bus) => {
          const isEnRoute = bus.status === 'EN_ROUTE';
          return (
            <div
              key={bus.busId}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-700 transition-all shadow-md"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-lg font-black text-white">{bus.busNumber}</span>
                    <span className="block text-xs font-mono font-bold text-amber-400 mt-0.5">
                      {bus.registrationNumber}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                      isEnRoute
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : bus.status === 'MAINTENANCE'
                        ? 'bg-red-950 text-red-400 border-red-800'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {bus.status}
                  </span>
                </div>

                <div className="mt-3 space-y-2 text-xs text-slate-300">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Gauge className="w-3.5 h-3.5 text-slate-500" />
                    <span>{bus.model} · <strong className="text-white">{bus.capacity} Seats</strong></span>
                  </div>

                  <div className="flex items-center gap-2">
                    <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                    <span>Driver: <strong className="text-white">{bus.driverName}</strong></span>
                  </div>

                  {bus.driverPhone && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>{bus.driverPhone}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-slate-400">
                    <MapPin className="w-3.5 h-3.5 text-red-500" />
                    <span className="truncate">Route: <strong className="text-amber-400">{bus.routeName || 'Unassigned'}</strong></span>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-500">
                  {bus.hasFix ? `Fix: ${bus.speedKmh.toFixed(0)} km/h` : 'Parked / No GPS run'}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEdit(bus)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="Edit Bus"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(bus.busId, bus.busNumber)}
                    className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-400 hover:text-red-200 transition-colors"
                    title="Remove Bus"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredBuses.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
            <Bus className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-bold text-slate-400">No fleet vehicles match your query</p>
            <p className="text-xs text-slate-600 mt-1">Tap &quot;Add Bus&quot; to register a new MMU transit vehicle</p>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-hud-rise">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h4 className="text-base font-black text-white flex items-center gap-2">
                <Bus className="w-5 h-5 text-red-500" />
                {editingBus ? `Edit ${editingBus.busNumber}` : 'Register New Fleet Bus'}
              </h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Bus Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BUS-05"
                    value={formData.busNumber || ''}
                    onChange={(e) => setFormData({ ...formData, busNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Registration Plate *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HR-54-A-1105"
                    value={formData.registrationNumber || ''}
                    onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Vehicle Model
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tata Marcopolo 42-Seater"
                    value={formData.model || ''}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Seating Capacity
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="80"
                    required
                    value={formData.capacity || 42}
                    onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Assigned Driver *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Driver Full Name"
                    value={formData.driverName || ''}
                    onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Driver Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="+91-9876543210"
                    value={formData.driverPhone || ''}
                    onChange={(e) => setFormData({ ...formData, driverPhone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Assigned Route Corridor
                </label>
                <select
                  value={formData.routeId || ''}
                  onChange={(e) => setFormData({ ...formData, routeId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                >
                  <option value="">-- No Route Assigned --</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.routeCode} — {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Fleet Status
                </label>
                <select
                  value={formData.status || 'IDLE'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                >
                  <option value="IDLE">IDLE (Parked at campus/depot)</option>
                  <option value="EN_ROUTE">EN_ROUTE (Active campus run)</option>
                  <option value="MAINTENANCE">MAINTENANCE (Workshop overhaul)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
                  <span>{editingBus ? 'Save Changes' : 'Register Bus'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
