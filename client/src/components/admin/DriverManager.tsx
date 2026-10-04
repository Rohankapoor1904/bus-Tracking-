import React, { useState } from 'react';
import { DriverProfile, LiveBusState, Route } from '../../types/index.js';
import {
  Users,
  Plus,
  Trash2,
  Edit3,
  X,
  Check,
  Search,
  Phone,
  Bus,
  MapPin,
  Shield,
  Clock,
  IdCard,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

interface DriverManagerProps {
  drivers: DriverProfile[];
  buses: LiveBusState[];
  routes: Route[];
  onSaveDriver: (driver: DriverProfile) => Promise<void>;
  onDeleteDriver: (driverId: string) => Promise<void>;
}

export const DriverManager: React.FC<DriverManagerProps> = ({
  drivers,
  buses,
  routes,
  onSaveDriver,
  onDeleteDriver,
}) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [editingDriver, setEditingDriver] = useState<DriverProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<DriverProfile>>({
    fullName: '',
    phone: '+91-',
    licenseNumber: '',
    assignedBusId: buses[0]?.busId || '',
    assignedRouteId: routes[0]?.id || '',
    status: 'ACTIVE',
    experienceYears: 5,
    emergencyContact: '+91-',
  });

  const handleOpenAdd = () => {
    setEditingDriver(null);
    setFormData({
      fullName: '',
      phone: '+91-98',
      licenseNumber: `HR-04-${new Date().getFullYear()}-00${Math.floor(1000 + Math.random() * 9000)}`,
      assignedBusId: buses[0]?.busId || '',
      assignedRouteId: routes[0]?.id || '',
      status: 'ACTIVE',
      experienceYears: 6,
      emergencyContact: '+91-98',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (driver: DriverProfile) => {
    setEditingDriver(driver);
    setFormData({ ...driver });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.phone || !formData.licenseNumber) {
      alert('Please fill all required fields: Full Name, Phone, and License Number.');
      return;
    }

    setSubmitting(true);
    try {
      const selectedBus = buses.find((b) => b.busId === formData.assignedBusId);
      const selectedRoute = routes.find((r) => r.id === formData.assignedRouteId);

      const driverToSave: DriverProfile = {
        id: editingDriver?.id || `drv-${Date.now()}`,
        fullName: formData.fullName.trim(),
        phone: formData.phone.trim(),
        licenseNumber: formData.licenseNumber.trim(),
        assignedBusId: formData.assignedBusId || undefined,
        assignedBusNumber: selectedBus?.busNumber || undefined,
        assignedRouteId: formData.assignedRouteId || undefined,
        assignedRouteName: selectedRoute?.name || undefined,
        status: (formData.status as any) || 'ACTIVE',
        experienceYears: Number(formData.experienceYears) || 0,
        emergencyContact: formData.emergencyContact?.trim() || undefined,
      };

      await onSaveDriver(driverToSave);
      setIsModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (driver: DriverProfile) => {
    if (
      !confirm(
        `Are you sure you want to remove driver ${driver.fullName} (${driver.licenseNumber})?`
      )
    ) {
      return;
    }
    await onDeleteDriver(driver.id);
  };

  // Filtered drivers list
  const filteredDrivers = drivers.filter((d) => {
    const matchesSearch =
      d.fullName.toLowerCase().includes(search.toLowerCase()) ||
      d.phone.toLowerCase().includes(search.toLowerCase()) ||
      d.licenseNumber.toLowerCase().includes(search.toLowerCase()) ||
      (d.assignedBusNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.assignedRouteName || '').toLowerCase().includes(search.toLowerCase());

    const matchesStatus = filterStatus === 'ALL' || d.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const activeCount = drivers.filter((d) => d.status === 'ACTIVE' || d.status === 'ON_DUTY').length;
  const onDutyCount = drivers.filter((d) => d.status === 'ON_DUTY').length;
  const assignedCount = drivers.filter((d) => Boolean(d.assignedBusId)).length;

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* 1. Header Toolbar & Quick Stats */}
      <div className="p-3 sm:p-5 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex-shrink-0 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <IdCard className="w-5 h-5 text-amber-500" />
              <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-wider">
                Driver Profile Management
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage commercial vehicle operators, duty assignments, license credentials, and routes.
            </p>
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-black shadow-lg shadow-red-900/40 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Driver</span>
          </button>
        </div>

        {/* Quick KPI badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="p-2 sm:p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">Total Drivers</span>
              <div className="text-sm sm:text-lg font-black text-white">{drivers.length}</div>
            </div>
            <Users className="w-4 h-4 text-slate-400" />
          </div>

          <div className="p-2 sm:p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-emerald-400 uppercase">Active / Ready</span>
              <div className="text-sm sm:text-lg font-black text-emerald-400">{activeCount}</div>
            </div>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>

          <div className="p-2 sm:p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-amber-400 uppercase">Assigned Buses</span>
              <div className="text-sm sm:text-lg font-black text-amber-400">{assignedCount} / {buses.length}</div>
            </div>
            <Bus className="w-4 h-4 text-amber-400" />
          </div>

          <div className="p-2 sm:p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-sky-400 uppercase">On Transit Duty</span>
              <div className="text-sm sm:text-lg font-black text-sky-400">{onDutyCount}</div>
            </div>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search driver by name, phone, license, bus, route..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-800/90 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-red-500 font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(['ALL', 'ACTIVE', 'ON_DUTY', 'ON_LEAVE', 'INACTIVE'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${
                  filterStatus === status
                    ? 'bg-red-600 text-white shadow-md shadow-red-900/40'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Drivers Grid List */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5">
        {filteredDrivers.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-slate-900/40 rounded-2xl border border-slate-800">
            <AlertCircle className="w-10 h-10 text-slate-500 mb-2" />
            <p className="text-sm font-bold text-slate-300">No driver profiles matched your filter</p>
            <p className="text-xs text-slate-500 mt-1">Try adjusting the search query or status filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filteredDrivers.map((driver) => {
              const assignedBus = buses.find((b) => b.busId === driver.assignedBusId);
              const assignedRoute = routes.find((r) => r.id === driver.assignedRouteId);

              const statusBadge =
                driver.status === 'ACTIVE'
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : driver.status === 'ON_DUTY'
                  ? 'bg-sky-950 text-sky-400 border-sky-800 animate-pulse'
                  : driver.status === 'ON_LEAVE'
                  ? 'bg-amber-950 text-amber-400 border-amber-800'
                  : 'bg-slate-800 text-slate-400 border-slate-700';

              return (
                <div
                  key={driver.id}
                  className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between shadow-lg relative group"
                >
                  <div>
                    {/* Header: Driver Name & Actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black text-white truncate">{driver.fullName}</h3>
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase flex-shrink-0 ${statusBadge}`}
                          >
                            {driver.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          Lic: <span className="text-slate-200 font-semibold">{driver.licenseNumber}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleOpenEdit(driver)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                          title="Edit Driver Profile"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(driver)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950/80 text-slate-300 hover:text-red-400 transition-colors"
                          title="Remove Driver"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Metadata details */}
                    <div className="mt-3 space-y-1.5 text-xs text-slate-300">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span className="font-mono text-[11px] font-bold text-white">{driver.phone}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Bus className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <span className="font-semibold text-slate-300">
                          {assignedBus ? (
                            <>
                              Assigned to <span className="text-white font-bold">{assignedBus.busNumber}</span> ({assignedBus.registrationNumber})
                            </>
                          ) : driver.assignedBusNumber ? (
                            <>Assigned to <span className="text-white font-bold">{driver.assignedBusNumber}</span></>
                          ) : (
                            <span className="text-slate-500 italic">No vehicle assigned (Standby)</span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                        <span className="truncate text-slate-300">
                          {assignedRoute ? assignedRoute.name : driver.assignedRouteName || 'Unassigned Transit Line'}
                        </span>
                      </div>

                      {driver.experienceYears !== undefined && (
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <Shield className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          <span>{driver.experienceYears} Years Heavy Transit Experience</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer Emergency Contact */}
                  {driver.emergencyContact && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Emergency SOS:</span>
                      <span className="font-mono text-amber-400 font-bold">{driver.emergencyContact}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Add / Edit Driver Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-red-600/20 text-red-500 flex items-center justify-center border border-red-500/30">
                  <IdCard className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  {editingDriver ? 'Edit Driver Profile' : 'Add New Driver Profile'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rajesh Kumar Sharma"
                  value={formData.fullName || ''}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Phone Number (+91) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+91-9876543210"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Commercial License No. *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HR-04-2015-0045129"
                    value={formData.licenseNumber || ''}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Assigned Fleet Bus
                  </label>
                  <select
                    value={formData.assignedBusId || ''}
                    onChange={(e) => setFormData({ ...formData, assignedBusId: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-medium"
                  >
                    <option value="">No Vehicle (Standby / Reserve)</option>
                    {buses.map((bus) => (
                      <option key={bus.busId} value={bus.busId}>
                        {bus.busNumber} — {bus.registrationNumber} ({bus.model.slice(0, 24)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Assigned Transit Route
                  </label>
                  <select
                    value={formData.assignedRouteId || ''}
                    onChange={(e) => setFormData({ ...formData, assignedRouteId: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-medium"
                  >
                    <option value="">No Route (Unassigned)</option>
                    {routes.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.routeCode} — {route.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Duty Status
                  </label>
                  <select
                    value={formData.status || 'ACTIVE'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-medium"
                  >
                    <option value="ACTIVE">ACTIVE (On Roster)</option>
                    <option value="ON_DUTY">ON DUTY (En Route)</option>
                    <option value="ON_LEAVE">ON LEAVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Experience (Yrs)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={formData.experienceYears ?? 5}
                    onChange={(e) => setFormData({ ...formData, experienceYears: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-mono font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Emergency Contact
                  </label>
                  <input
                    type="text"
                    placeholder="+91-9876543299"
                    value={formData.emergencyContact || ''}
                    onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500 font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* Form Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-black shadow-lg shadow-red-900/50 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingDriver ? 'Save Profile Changes' : 'Create Driver Profile'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
