import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Shield,
  Ban,
  Unlock,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Phone,
  Mail,
  PlusCircle,
  X,
  FileText
} from 'lucide-react';
import { adminI18n } from '../i18n-admin';
import { InterviewAppointment, AppointmentSlot, AppointmentStatus, AppointmentType } from '../types';

interface AdminScheduleViewProps {
  adminToken: string;
  lang: 'en' | 'es';
  onSelectCandidateSession: (sessionId: string) => void;
}

export const AdminScheduleView: React.FC<AdminScheduleViewProps> = ({
  adminToken,
  lang,
  onSelectCandidateSession
}) => {
  const t = adminI18n[lang];

  const [appointments, setAppointments] = useState<InterviewAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  // Calendar Date Navigation
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');

  // Action Modals State
  const [selectedAppt, setSelectedAppt] = useState<InterviewAppointment | null>(null);

  // Block Modal
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockDate, setBlockDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [blockSlots, setBlockSlots] = useState<AppointmentSlot[]>([]);
  const [selectedBlockSlotUtc, setSelectedBlockSlotUtc] = useState<string | null>(null);
  const [blockNotes, setBlockNotes] = useState<string>('');
  const [loadingBlockSlots, setLoadingBlockSlots] = useState(false);
  const [submittingBlock, setSubmittingBlock] = useState(false);

  // Reschedule Modal
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [rescheduleSlots, setRescheduleSlots] = useState<AppointmentSlot[]>([]);
  const [selectedRescheduleSlotUtc, setSelectedRescheduleSlotUtc] = useState<string | null>(null);
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);
  const [submittingReschedule, setSubmittingReschedule] = useState(false);

  // General Action Loading
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchAppointments();
  }, [adminToken, filterStatus, filterType]);

  const fetchAppointments = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterType !== 'all') params.set('type', filterType);

      const res = await fetch(`/api/admin/appointments?${params.toString()}`, {
        headers: { 'x-admin-passcode': adminToken }
      });

      if (res.ok) {
        const data = await res.json();
        setAppointments(data.appointments || []);
      } else {
        setActionMessage({ type: 'error', text: 'Error fetching appointments list' });
      }
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message || 'Connection error' });
    } finally {
      setLoading(false);
    }
  };

  // Helper for Florida Date extraction from UTC ISO
  const getFloridaDateParts = (iso: string) => {
    const d = new Date(iso);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    return formatter.format(d);
  };

  const getFloridaDateKey = (iso: string) => {
    const d = new Date(iso);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    return `${y}-${m}-${day}`;
  };

  // Build the 7 days of the current week (Sunday to Saturday)
  const getWeekDays = (baseDate: Date) => {
    const days: Date[] = [];
    const curr = new Date(baseDate);
    // Find previous Sunday
    const dayOfWeek = curr.getDay(); // 0 is Sun
    curr.setDate(curr.getDate() - dayOfWeek);
    curr.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const nextD = new Date(curr);
      nextD.setDate(curr.getDate() + i);
      days.push(nextD);
    }
    return days;
  };

  const weekDays = getWeekDays(currentDate);

  const prevWeek = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const nextWeek = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Format header dates
  const formatDateLabel = (d: Date) => {
    return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    }).format(d);
  };

  const formatWeekRange = () => {
    const start = weekDays[0];
    const end = weekDays[6];
    const sStr = new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' }).format(start);
    const eStr = new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(end);
    return `${sStr} - ${eStr}`;
  };

  // Fetch slots for block modal
  const fetchBlockAvailability = async (dateStr: string) => {
    setLoadingBlockSlots(true);
    setSelectedBlockSlotUtc(null);
    try {
      const res = await fetch(`/api/admin/appointments/availability?date=${dateStr}`, {
        headers: { 'x-admin-passcode': adminToken }
      });
      if (res.ok) {
        const data = await res.json();
        setBlockSlots(data.slots || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBlockSlots(false);
    }
  };

  const handleOpenBlockModal = () => {
    const dStr = new Date().toISOString().slice(0, 10);
    setBlockDate(dStr);
    setBlockNotes('');
    setShowBlockModal(true);
    fetchBlockAvailability(dStr);
  };

  const handleConfirmBlock = async () => {
    if (!selectedBlockSlotUtc) return;
    setSubmittingBlock(true);
    try {
      const res = await fetch('/api/admin/appointments/block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminToken
        },
        body: JSON.stringify({
          startUtc: selectedBlockSlotUtc,
          notes: blockNotes
        })
      });

      if (res.ok) {
        setShowBlockModal(false);
        setActionMessage({
          type: 'success',
          text: lang === 'es' ? '¡Horario bloqueado exitosamente!' : 'Time slot successfully blocked!'
        });
        await fetchAppointments();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Error blocking slot');
      }
    } catch (e: any) {
      alert(e.message || 'Error');
    } finally {
      setSubmittingBlock(false);
    }
  };

  // Unblock slot
  const handleUnblock = async (apptId: string) => {
    if (!window.confirm(t.agendaConfirmUnblockPrompt)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/appointments/${apptId}/unblock`, {
        method: 'POST',
        headers: { 'x-admin-passcode': adminToken }
      });
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: lang === 'es' ? 'Horario desbloqueado' : 'Time slot unblocked'
        });
        setSelectedAppt(null);
        await fetchAppointments();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Error unblocking');
      }
    } catch (e: any) {
      alert(e.message || 'Error');
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel Interview
  const handleCancelInterview = async (apptId: string) => {
    if (!window.confirm(t.agendaConfirmCancelPrompt)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/appointments/${apptId}/cancel`, {
        method: 'POST',
        headers: { 'x-admin-passcode': adminToken }
      });
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: lang === 'es' ? 'Cita cancelada' : 'Appointment cancelled'
        });
        setSelectedAppt(null);
        await fetchAppointments();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Error cancelling appointment');
      }
    } catch (e: any) {
      alert(e.message || 'Error');
    } finally {
      setActionLoading(false);
    }
  };

  // Fetch slots for reschedule modal
  const fetchRescheduleAvailability = async (dateStr: string, excludeId?: string) => {
    setLoadingRescheduleSlots(true);
    setSelectedRescheduleSlotUtc(null);
    try {
      const res = await fetch(`/api/admin/appointments/availability?date=${dateStr}${excludeId ? `&excludeId=${excludeId}` : ''}`, {
        headers: { 'x-admin-passcode': adminToken }
      });
      if (res.ok) {
        const data = await res.json();
        setRescheduleSlots(data.slots || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRescheduleSlots(false);
    }
  };

  const handleOpenRescheduleModal = (appt: InterviewAppointment) => {
    setSelectedAppt(appt);
    const dStr = new Date().toISOString().slice(0, 10);
    setRescheduleDate(dStr);
    setShowRescheduleModal(true);
    fetchRescheduleAvailability(dStr, appt.id);
  };

  const handleConfirmReschedule = async () => {
    if (!selectedAppt || !selectedRescheduleSlotUtc) return;
    setSubmittingReschedule(true);
    try {
      const res = await fetch(`/api/admin/appointments/${selectedAppt.id}/reschedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminToken
        },
        body: JSON.stringify({ startUtc: selectedRescheduleSlotUtc })
      });

      if (res.ok) {
        const data = await res.json();
        setShowRescheduleModal(false);
        setSelectedAppt(null);
        setActionMessage({
          type: 'success',
          text: data.smsSent
            ? (lang === 'es' ? '¡Cita reprogramada y SMS enviado al candidato!' : 'Appointment rescheduled and SMS sent!')
            : (lang === 'es' ? 'Cita reprogramada (SMS no enviado por configuración)' : 'Appointment rescheduled (SMS skipped)')
        });
        await fetchAppointments();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Error rescheduling appointment');
      }
    } catch (e: any) {
      alert(e.message || 'Error');
    } finally {
      setSubmittingReschedule(false);
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status: AppointmentStatus, type?: AppointmentType) => {
    if (type === 'blocked') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-200 text-stone-800 border border-stone-300">
          <Ban className="w-3 h-3" />
          {t.agendaBlockedBadge}
        </span>
      );
    }

    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3" />
            {t.scheduleStatusConfirmed}
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
            <Clock className="w-3 h-3" />
            {t.scheduleStatusPending}
          </span>
        );
      case 'reschedule_requested':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <RefreshCw className="w-3 h-3" />
            {t.scheduleStatusReschedule}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
            <X className="w-3 h-3" />
            {t.scheduleStatusCancelled}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* Top Banner / Header Card */}
      <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 md:p-8 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide bg-amber-50 text-amber-900 border border-amber-200 mb-2">
            <CalendarIcon className="w-3.5 h-3.5" />
            {t.agendaTitle}
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#4B2C20]">
            {t.agendaTitle}
          </h2>
          <p className="text-sm text-[#4B2C20]/70 mt-1">
            {t.agendaSubtitle} • <span className="font-semibold">{t.agendaTotalAppointments(appointments.length)}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleOpenBlockModal}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-[#4B2C20] text-[#FAF7F2] hover:bg-[#3D2319] transition shadow-xs"
          >
            <Ban className="w-3.5 h-3.5 text-[#D4A373]" />
            <span>{t.agendaBlockSlotBtn}</span>
          </button>

          <button
            onClick={fetchAppointments}
            disabled={loading}
            className="p-2 text-[#4B2C20]/70 hover:text-[#4B2C20] hover:bg-[#FAF7F2] rounded-xl border border-[#E8DFD8] transition"
            title="Refresh appointments"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#D4A373]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Message Feedback Banner */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <span className="text-sm font-medium">{actionMessage.text}</span>
        </div>
      )}

      {/* Filter and Navigation Toolbar */}
      <div className="bg-white border border-[#E8DFD8] rounded-2xl p-4 md:p-5 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevWeek}
            className="p-2 text-[#4B2C20]/70 hover:text-[#4B2C20] hover:bg-[#FAF7F2] rounded-xl border border-[#E8DFD8] transition"
            title={t.agendaPrevWeek}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-xl border border-[#E8DFD8] text-[#4B2C20] hover:bg-[#FAF7F2] transition"
          >
            {t.agendaToday}
          </button>
          <button
            onClick={nextWeek}
            className="p-2 text-[#4B2C20]/70 hover:text-[#4B2C20] hover:bg-[#FAF7F2] rounded-xl border border-[#E8DFD8] transition"
            title={t.agendaNextWeek}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm font-serif font-bold text-[#4B2C20] ml-2">
            {formatWeekRange()}
          </span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#4B2C20]/60">
              {t.agendaFilterStatus}
            </span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs font-medium px-3 py-2 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl text-[#4B2C20] focus:outline-none"
            >
              <option value="all">{t.agendaFilterAll}</option>
              <option value="pending">{t.scheduleStatusPending}</option>
              <option value="confirmed">{t.scheduleStatusConfirmed}</option>
              <option value="reschedule_requested">{t.scheduleStatusReschedule}</option>
              <option value="cancelled">{t.scheduleStatusCancelled}</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#4B2C20]/60">
              {t.agendaTypeBadge}
            </span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-xs font-medium px-3 py-2 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl text-[#4B2C20] focus:outline-none"
            >
              <option value="all">{lang === 'es' ? 'Todos los tipos' : 'All types'}</option>
              <option value="interview">{t.agendaFilterInterviews}</option>
              <option value="blocked">{t.agendaFilterBlocked}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Calendar Grid (7 Columns for 7 Days) */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {weekDays.map((dayDate, idx) => {
          const dayKey = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`;
          const isToday =
            new Date().toDateString() === dayDate.toDateString();

          const dayAppointments = appointments.filter((a) => {
            const aKey = getFloridaDateKey(a.startUtc);
            return aKey === dayKey;
          });

          return (
            <div
              key={idx}
              className={`bg-white border rounded-2xl flex flex-col shadow-2xs overflow-hidden min-h-[300px] ${
                isToday ? 'border-[#8B1E1E] ring-1 ring-[#8B1E1E]/20' : 'border-[#E8DFD8]'
              }`}
            >
              {/* Day Header */}
              <div
                className={`p-3 border-b text-center ${
                  isToday
                    ? 'bg-[#8B1E1E] text-white'
                    : 'bg-[#FAF7F2] text-[#4B2C20] border-[#E8DFD8]'
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-wider">
                  {formatDateLabel(dayDate)}
                </p>
                <p className="text-[11px] opacity-80 mt-0.5">
                  {dayAppointments.length}{' '}
                  {dayAppointments.length === 1 ? 'evento' : 'eventos'}
                </p>
              </div>

              {/* Day Appointments List */}
              <div className="p-2.5 flex-1 space-y-2 overflow-y-auto">
                {dayAppointments.length === 0 ? (
                  <div className="h-full flex items-center justify-center p-4 text-center">
                    <p className="text-[11px] text-[#4B2C20]/40 font-light">
                      {lang === 'es' ? 'Sin citas' : 'No slots'}
                    </p>
                  </div>
                ) : (
                  dayAppointments.map((appt) => {
                    const isBlocked = appt.type === 'blocked';
                    const isCancelled = appt.status === 'cancelled';
                    const isConfirmed = appt.status === 'confirmed';

                    return (
                      <div
                        key={appt.id}
                        onClick={() => setSelectedAppt(appt)}
                        className={`p-2.5 rounded-xl border text-left cursor-pointer transition shadow-2xs hover:shadow-xs ${
                          isBlocked
                            ? 'bg-stone-50 border-stone-300 hover:bg-stone-100'
                            : isCancelled
                            ? 'bg-rose-50/50 border-rose-200 opacity-60'
                            : isConfirmed
                            ? 'bg-emerald-50/70 border-emerald-200 hover:bg-emerald-50'
                            : 'bg-amber-50/70 border-amber-200 hover:bg-amber-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[11px] font-bold text-[#4B2C20]">
                            {getFloridaDateParts(appt.startUtc).split(', ')[1] || 'ET'}
                          </span>
                          {isBlocked && (
                            <span className="text-[10px] font-semibold text-stone-600 uppercase">
                              🔒 Bloqueo
                            </span>
                          )}
                        </div>

                        <p className="text-xs font-bold text-[#4B2C20] truncate">
                          {isBlocked ? (appt.notes || 'Bloqueado') : appt.candidateName}
                        </p>

                        {!isBlocked && appt.candidatePhone && (
                          <p className="text-[10px] text-[#4B2C20]/70 truncate flex items-center gap-1 mt-0.5">
                            <Phone className="w-2.5 h-2.5" />
                            {appt.candidatePhone}
                          </p>
                        )}

                        <div className="mt-1.5">
                          {getStatusBadge(appt.status, appt.type)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Appointment Details / Action Modal */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-[#E8DFD8] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 bg-[#FAF7F2] border-b border-[#E8DFD8] flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#D4A373]">
                  {selectedAppt.type === 'blocked' ? t.agendaBlockedBadge : t.scheduleAppointmentTitle}
                </span>
                <h3 className="text-xl font-serif font-bold text-[#4B2C20] mt-0.5">
                  {selectedAppt.type === 'blocked'
                    ? (selectedAppt.notes || 'Horario Bloqueado')
                    : selectedAppt.candidateName}
                </h3>
              </div>
              <button
                onClick={() => setSelectedAppt(null)}
                className="p-1.5 rounded-lg text-[#4B2C20]/60 hover:text-[#4B2C20] hover:bg-[#E8DFD8]/50 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedAppt.status, selectedAppt.type)}
                {selectedAppt.smsSent && (
                  <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    {t.scheduleSmsSentBadge}
                  </span>
                )}
              </div>

              <div className="bg-[#FAF7F2] rounded-xl p-4 border border-[#E8DFD8] space-y-2 text-sm">
                <div className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-[#8B1E1E] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-[#4B2C20]/60 font-bold uppercase tracking-wider">
                      {t.scheduleDateTimeLabel}
                    </p>
                    <p className="font-bold text-[#4B2C20]">
                      {getFloridaDateParts(selectedAppt.startUtc)} (Florida ET)
                    </p>
                  </div>
                </div>

                {selectedAppt.type !== 'blocked' && (
                  <>
                    {selectedAppt.candidatePhone && (
                      <div className="flex items-center gap-2.5 pt-1">
                        <Phone className="w-4 h-4 text-[#8B1E1E] shrink-0" />
                        <span className="font-medium text-[#4B2C20]">{selectedAppt.candidatePhone}</span>
                      </div>
                    )}
                    {selectedAppt.candidateEmail && (
                      <div className="flex items-center gap-2.5">
                        <Mail className="w-4 h-4 text-[#8B1E1E] shrink-0" />
                        <span className="font-medium text-[#4B2C20]">{selectedAppt.candidateEmail}</span>
                      </div>
                    )}
                  </>
                )}

                {selectedAppt.notes && (
                  <div className="flex items-start gap-2.5 pt-1">
                    <FileText className="w-4 h-4 text-[#8B1E1E] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-[#4B2C20]/60 font-bold uppercase tracking-wider">
                        Nota:
                      </p>
                      <p className="text-[#4B2C20] text-xs">{selectedAppt.notes}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Candidate dossier link if it is an interview */}
              {selectedAppt.type !== 'blocked' && selectedAppt.sessionId && selectedAppt.sessionId !== 'blocked' && (
                <button
                  type="button"
                  onClick={() => {
                    const sid = selectedAppt.sessionId;
                    setSelectedAppt(null);
                    onSelectCandidateSession(sid);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl border border-[#D4A373] text-[#4B2C20] hover:bg-[#FAF7F2] font-semibold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2"
                >
                  <User className="w-3.5 h-3.5 text-[#D4A373]" />
                  <span>{t.agendaCandidateLink}</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                </button>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-6 bg-[#FAF7F2] border-t border-[#E8DFD8] flex items-center justify-end gap-3">
              {selectedAppt.type === 'blocked' ? (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleUnblock(selectedAppt.id)}
                  className="px-4 py-2.5 bg-[#4B2C20] hover:bg-[#3D2319] text-[#FAF7F2] font-bold rounded-xl text-xs uppercase tracking-wider transition flex items-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5 text-[#D4A373]" />
                  <span>{t.agendaUnblockSlotBtn}</span>
                </button>
              ) : selectedAppt.status !== 'cancelled' ? (
                <>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleCancelInterview(selectedAppt.id)}
                    className="px-4 py-2.5 border border-rose-300 text-rose-700 hover:bg-rose-50 font-bold rounded-xl text-xs uppercase tracking-wider transition"
                  >
                    {t.scheduleCancelBtn}
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleOpenRescheduleModal(selectedAppt)}
                    className="px-4 py-2.5 bg-[#8B1E1E] hover:bg-[#721818] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t.scheduleRescheduleBtn}</span>
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Manual Block Slot Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-[#E8DFD8] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 bg-[#FAF7F2] border-b border-[#E8DFD8] flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#D4A373]">
                  {t.agendaBlockSlotBtn}
                </span>
                <h3 className="text-xl font-serif font-bold text-[#4B2C20]">
                  {t.agendaBlockModalTitle}
                </h3>
                <p className="text-xs text-[#4B2C20]/70 mt-0.5">
                  {t.agendaBlockModalSubtitle}
                </p>
              </div>
              <button
                onClick={() => setShowBlockModal(false)}
                className="p-1.5 rounded-lg text-[#4B2C20]/60 hover:text-[#4B2C20] hover:bg-[#E8DFD8]/50 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4B2C20]/80 mb-2">
                  {t.scheduleDateLabel}
                </label>
                <input
                  type="date"
                  value={blockDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setBlockDate(newDate);
                    fetchBlockAvailability(newDate);
                  }}
                  className="w-full px-4 py-2.5 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl text-sm font-medium text-[#4B2C20]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4B2C20]/80 mb-2">
                  {t.scheduleTimeSlotLabel}
                </label>
                {loadingBlockSlots ? (
                  <div className="p-4 text-center text-xs text-[#4B2C20]/60">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-[#D4A373]" />
                    {t.scheduleLoadingSlots}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                    {blockSlots.map((slot) => (
                      <button
                        key={slot.startUtc}
                        type="button"
                        disabled={slot.taken}
                        onClick={() => setSelectedBlockSlotUtc(slot.startUtc)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition ${
                          slot.taken
                            ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed'
                            : selectedBlockSlotUtc === slot.startUtc
                            ? 'bg-[#8B1E1E] text-white border-[#8B1E1E] shadow-2xs'
                            : 'bg-[#FAF7F2] text-[#4B2C20] border-[#E8DFD8] hover:bg-white'
                        }`}
                      >
                        {slot.label} {slot.taken ? `(${t.scheduleSlotTaken})` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4B2C20]/80 mb-2">
                  {t.agendaBlockReasonLabel}
                </label>
                <input
                  type="text"
                  value={blockNotes}
                  onChange={(e) => setBlockNotes(e.target.value)}
                  placeholder={lang === 'es' ? 'Ej: Feriado, Reunión general, Mantenimiento...' : 'e.g. Holiday, Team meeting, Internal review...'}
                  className="w-full px-4 py-2.5 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl text-sm text-[#4B2C20]"
                />
              </div>
            </div>

            <div className="p-6 bg-[#FAF7F2] border-t border-[#E8DFD8] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowBlockModal(false)}
                className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#4B2C20]/70 hover:text-[#4B2C20]"
              >
                {lang === 'es' ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!selectedBlockSlotUtc || submittingBlock}
                onClick={handleConfirmBlock}
                className="px-5 py-2.5 bg-[#4B2C20] hover:bg-[#3D2319] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition disabled:opacity-50"
              >
                {submittingBlock ? '...' : t.agendaConfirmBlockBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && selectedAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-[#E8DFD8] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 bg-[#FAF7F2] border-b border-[#E8DFD8] flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#D4A373]">
                  {selectedAppt.candidateName}
                </span>
                <h3 className="text-xl font-serif font-bold text-[#4B2C20]">
                  {t.agendaRescheduleModalTitle}
                </h3>
                <p className="text-xs text-[#4B2C20]/70 mt-0.5">
                  {t.agendaRescheduleModalSubtitle}
                </p>
              </div>
              <button
                onClick={() => setShowRescheduleModal(false)}
                className="p-1.5 rounded-lg text-[#4B2C20]/60 hover:text-[#4B2C20] hover:bg-[#E8DFD8]/50 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4B2C20]/80 mb-2">
                  {t.scheduleDateLabel}
                </label>
                <input
                  type="date"
                  value={rescheduleDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setRescheduleDate(newDate);
                    fetchRescheduleAvailability(newDate, selectedAppt.id);
                  }}
                  className="w-full px-4 py-2.5 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl text-sm font-medium text-[#4B2C20]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4B2C20]/80 mb-2">
                  {t.scheduleTimeSlotLabel}
                </label>
                {loadingRescheduleSlots ? (
                  <div className="p-4 text-center text-xs text-[#4B2C20]/60">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-[#D4A373]" />
                    {t.scheduleLoadingSlots}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                    {rescheduleSlots.map((slot) => (
                      <button
                        key={slot.startUtc}
                        type="button"
                        disabled={slot.taken}
                        onClick={() => setSelectedRescheduleSlotUtc(slot.startUtc)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition ${
                          slot.taken
                            ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed'
                            : selectedRescheduleSlotUtc === slot.startUtc
                            ? 'bg-[#8B1E1E] text-white border-[#8B1E1E] shadow-2xs'
                            : 'bg-[#FAF7F2] text-[#4B2C20] border-[#E8DFD8] hover:bg-white'
                        }`}
                      >
                        {slot.label} {slot.taken ? `(${t.scheduleSlotTaken})` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-[#FAF7F2] border-t border-[#E8DFD8] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowRescheduleModal(false)}
                className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#4B2C20]/70 hover:text-[#4B2C20]"
              >
                {lang === 'es' ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!selectedRescheduleSlotUtc || submittingReschedule}
                onClick={handleConfirmReschedule}
                className="px-5 py-2.5 bg-[#8B1E1E] hover:bg-[#721818] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition disabled:opacity-50 flex items-center gap-2"
              >
                {submittingReschedule ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t.scheduleRescheduling}</span>
                  </>
                ) : (
                  <span>{t.scheduleRescheduleBtn}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
