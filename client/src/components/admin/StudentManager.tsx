import React, { useState } from 'react';
import { StudentRosterItem, Route } from '../../types/index.js';
import { Users, Plus, Trash2, Edit3, X, Check, Search, Phone, Mail, MapPin, Award, CheckCircle, XCircle } from 'lucide-react';

interface StudentManagerProps {
  students: StudentRosterItem[];
  routes: Route[];
  onSaveStudent: (student: StudentRosterItem) => Promise<void>;
  onDeleteStudent: (studentId: string) => Promise<void>;
}

export const StudentManager: React.FC<StudentManagerProps> = ({
  students,
  routes,
  onSaveStudent,
  onDeleteStudent,
}) => {
  const [search, setSearch] = useState('');
  const [filterRoute, setFilterRoute] = useState<string>('ALL');
  const [editingStudent, setEditingStudent] = useState<StudentRosterItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<StudentRosterItem>>({
    fullName: '',
    rollNumber: '',
    department: 'B.Tech CSE - 3rd Year',
    phone: '+91-',
    email: '',
    routeId: routes[0]?.id || '',
    stopId: routes[0]?.stops[0]?.id || '',
    passNumber: '',
    status: 'ACTIVE',
  });

  const handleOpenAdd = () => {
    setEditingStudent(null);
    const initialRoute = routes[0];
    const initialStop = initialRoute?.stops[0];
    const nextRoll = 11221000 + students.length + 1;
    setFormData({
      fullName: '',
      rollNumber: `${nextRoll}`,
      department: 'B.Tech Computer Science',
      phone: '+91-98',
      email: `@mmumullana.org`,
      routeId: initialRoute?.id || '',
      stopId: initialStop?.id || '',
      passNumber: `MMU-PASS-2026-${String(students.length + 1).padStart(3, '0')}`,
      status: 'ACTIVE',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: StudentRosterItem) => {
    setEditingStudent(student);
    setFormData({ ...student });
    setIsModalOpen(true);
  };

  const handleRouteChange = (routeId: string) => {
    const route = routes.find((r) => r.id === routeId);
    setFormData((prev) => ({
      ...prev,
      routeId,
      stopId: route?.stops[0]?.id || '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.rollNumber || !formData.routeId) {
      alert('Please fill all required fields (Full Name, Roll Number, Assigned Route).');
      return;
    }

    setSubmitting(true);
    try {
      const selectedRoute = routes.find((r) => r.id === formData.routeId);
      const selectedStop = selectedRoute?.stops.find((s) => s.id === formData.stopId);

      const studentToSave: StudentRosterItem = {
        id: editingStudent?.id || `std-${Date.now()}`,
        fullName: formData.fullName.trim(),
        rollNumber: formData.rollNumber.trim(),
        department: formData.department?.trim() || 'General Enrollment',
        phone: formData.phone?.trim() || '',
        email: formData.email?.trim() || `${formData.rollNumber}@mmumullana.org`,
        routeId: formData.routeId,
        routeName: selectedRoute?.name || 'Unassigned',
        stopId: formData.stopId || '',
        stopName: selectedStop?.name || 'Main Stoppage',
        passNumber: formData.passNumber?.trim() || `MMU-P-${Date.now().toString().slice(-4)}`,
        status: (formData.status as any) || 'ACTIVE',
      };

      await onSaveStudent(studentToSave);
      setIsModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (studentId: string, studentName: string) => {
    if (window.confirm(`Are you sure you want to remove ${studentName} from the student transit manifest?`)) {
      await onDeleteStudent(studentId);
    }
  };

  // Filter students
  const filteredStudents = students.filter((s) => {
    const matchSearch =
      s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      s.rollNumber.toLowerCase().includes(search.toLowerCase()) ||
      s.department.toLowerCase().includes(search.toLowerCase()) ||
      (s.passNumber && s.passNumber.toLowerCase().includes(search.toLowerCase())) ||
      (s.stopName && s.stopName.toLowerCase().includes(search.toLowerCase()));

    const matchRoute = filterRoute === 'ALL' || s.routeId === filterRoute;
    return matchSearch && matchRoute;
  });

  const selectedRouteStops = routes.find((r) => r.id === formData.routeId)?.stops || [];

  return (
    <div className="w-full h-full p-4 sm:p-6 overflow-y-auto space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-400" />
            Student Transit Roster & Pass Management
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage student registrations, corridor allocations, and bus pass validations ({students.length} enrolled)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Corridor filter */}
          <select
            value={filterRoute}
            onChange={(e) => setFilterRoute(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
          >
            <option value="ALL">All Routes ({students.length})</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.routeCode}
              </option>
            ))}
          </select>

          {/* Search box */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search student or roll no..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl transition-all shadow-lg shadow-amber-500/20 flex-shrink-0 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Register Student</span>
          </button>
        </div>
      </div>

      {/* Students Table / Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 text-[10px] font-black uppercase text-slate-400 tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Student & Roll No</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Assigned Route & Stoppage</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Bus Pass #</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredStudents.map((std) => (
                <tr key={std.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-white text-sm">{std.fullName}</div>
                    <div className="text-[11px] font-mono text-amber-400 font-bold">{std.rollNumber}</div>
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="text-slate-200">{std.department}</span>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-200">{std.routeName || 'Corridor Unassigned'}</div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-red-400 flex-shrink-0" />
                      <span className="truncate">{std.stopName || 'Default Campus Stop'}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 space-y-0.5 text-[11px]">
                    {std.phone && (
                      <div className="flex items-center gap-1 text-slate-300">
                        <Phone className="w-3 h-3 text-slate-500" />
                        <span>{std.phone}</span>
                      </div>
                    )}
                    {std.email && (
                      <div className="flex items-center gap-1 text-slate-400">
                        <Mail className="w-3 h-3 text-slate-500" />
                        <span className="truncate max-w-[160px]">{std.email}</span>
                      </div>
                    )}
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                      {std.passNumber}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        std.status === 'ACTIVE'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {std.status === 'ACTIVE' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {std.status}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleOpenEdit(std)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="Edit Student"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(std.id, std.fullName)}
                        className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-400 hover:text-red-200 transition-colors"
                        title="Remove Student"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-bold text-slate-400">No students found matching your criteria</p>
                    <p className="text-xs text-slate-600 mt-1">Tap &quot;Register Student&quot; to add a new student transit pass</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Student Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-hud-rise">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h4 className="text-base font-black text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400" />
                {editingStudent ? `Edit Student: ${editingStudent.fullName}` : 'Register New Student Passenger'}
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
                    Student Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Aarav Gupta"
                    value={formData.fullName || ''}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Roll Number / UID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 11221001"
                    value={formData.rollNumber || ''}
                    onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Department / Course
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. B.Tech CSE / MBBS"
                    value={formData.department || ''}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Transit Pass Number
                  </label>
                  <input
                    type="text"
                    placeholder="MMU-PASS-2026-001"
                    value={formData.passNumber || ''}
                    onChange={(e) => setFormData({ ...formData, passNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+91-9812300001"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Institutional Email
                  </label>
                  <input
                    type="email"
                    placeholder="student@mmumullana.org"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Assigned Transit Corridor *
                </label>
                <select
                  required
                  value={formData.routeId || ''}
                  onChange={(e) => handleRouteChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                >
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.routeCode} — {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Assigned Bus Stop *
                </label>
                <select
                  required
                  value={formData.stopId || ''}
                  onChange={(e) => setFormData({ ...formData, stopId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                >
                  {selectedRouteStops.map((s) => (
                    <option key={s.id} value={s.id}>
                      #{s.stopSequence}. {s.name} ({s.landmark})
                    </option>
                  ))}
                  {selectedRouteStops.length === 0 && (
                    <option value="">No stops found for this route</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Pass Status
                </label>
                <select
                  value={formData.status || 'ACTIVE'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="ACTIVE">ACTIVE (Authorized for daily commute)</option>
                  <option value="INACTIVE">INACTIVE (Fee pending / suspended)</option>
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
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-black text-slate-950 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingStudent ? 'Save Changes' : 'Register Student'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
