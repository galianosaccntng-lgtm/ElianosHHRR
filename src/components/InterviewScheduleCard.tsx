import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, CheckCircle2, AlertCircle, RefreshCw, Copy, Check, X, Phone, MessageSquare, ExternalLink } from 'lucide-react';
import { InterviewAppointment, AppointmentSlot } from '../types';
import { adminI18n, AdminLang } from '../i18n-admin';

interface Props {
  sessionId: string;
  candidateName: string;
  candidatePhone?: string;
  candidateEmail?: string;
  adminToken: string;
  lang: AdminLang;
}

export function InterviewScheduleCard({
  sessionId,
  candidateName,
  candidatePhone,
  candidateEmail,
  adminToken,
  lang
}: Props) {
  const t = adminI18n[lang];

  const [appointment, setAppointment] = useState<InterviewAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'schedule' | 'reschedule'>('schedule');

  // Modal State
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Tomorrow by default in America/New_York
    const tomorrow = new Date(Date.now() + 24 * 3600000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(tomorrow);
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  });

  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedStartUtc, setSelectedStartUtc] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [lastSmsStatus, setLastSmsStatus] = useState<boolean | null>(null);

  // Fetch current appointment on load
  const fetchCurrentAppointment = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/appointment`, {
        headers: { 'x-admin-passcode': adminToken }
      });
      if (res.ok) {
        const data = await res.json();
        setAppointment(data.appointment || null);
        if (data.appointment?.smsSent !== undefined) {
          setLastSmsStatus(data.appointment.smsSent);
        }
      }
    } catch (e) {
      console.warn('Error fetching appointment:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentAppointment();
  }, [sessionId, adminToken]);

  // Fetch slots for selected date
  const fetchAvailability = async (dateStr: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    setLoadingSlots(true);
    setSelectedStartUtc(null);
    setErrorMsg(null);
    try {
      const excludeParam = modalMode === 'reschedule' && appointment?.id ? `&excludeId=${appointment.id}` : '';
      const res = await fetch(`/api/admin/appointments/availability?date=${dateStr}${excludeParam}`, {
        headers: { 'x-admin-passcode': adminToken }
      });
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots || []);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMsg(errJson.error || "Failed to load availability");
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Network error loading slots");
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (modalOpen) {
      fetchAvailability(selectedDate);
    }
  }, [modalOpen, selectedDate]);

  const handleOpenScheduleModal = (mode: 'schedule' | 'reschedule') => {
    setModalMode(mode);
    setErrorMsg(null);
    setSelectedStartUtc(null);
    // Initialize date to tomorrow or next available
    const tomorrow = new Date(Date.now() + 24 * 3600000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(tomorrow);
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    setSelectedDate(`${p.year}-${p.month}-${p.day}`);
    setModalOpen(true);
  };

  const handleConfirmSchedule = async () => {
    if (!selectedStartUtc) {
      setErrorMsg(t.scheduleErrorNoSlot);
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);

    try {
      if (modalMode === 'schedule') {
        const res = await fetch(`/api/admin/sessions/${sessionId}/schedule-interview`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-passcode': adminToken
          },
          body: JSON.stringify({
            startUtc: selectedStartUtc,
            lang
          })
        });

        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || "Failed to schedule appointment");
          return;
        }

        setAppointment(data.appointment);
        setLastSmsStatus(data.smsSent);
        setModalOpen(false);
      } else {
        // Reschedule
        if (!appointment?.id) return;
        const res = await fetch(`/api/admin/appointments/${appointment.id}/reschedule`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-passcode': adminToken
          },
          body: JSON.stringify({
            startUtc: selectedStartUtc
          })
        });

        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || "Failed to reschedule appointment");
          return;
        }

        setAppointment(data.appointment);
        setLastSmsStatus(data.smsSent);
        setModalOpen(false);
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Error scheduling appointment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelAppointment = async () => {
    if (!appointment?.id) return;
    if (!window.confirm(t.scheduleConfirmCancelPrompt)) return;

    try {
      const res = await fetch(`/api/admin/appointments/${appointment.id}/cancel`, {
        method: 'POST',
        headers: { 'x-admin-passcode': adminToken }
      });
      if (res.ok) {
        const data = await res.json();
        setAppointment(data.appointment);
      }
    } catch (e) {
      console.warn("Cancel appointment error:", e);
    }
  };

  const getCandidateLink = () => {
    if (!appointment?.token) return '';
    return `${window.location.origin}/confirm-interview?token=${appointment.token}`;
  };

  const handleCopyLink = () => {
    const link = getCandidateLink();
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }).catch(console.error);
  };

  const formatFloridaTimeDisplay = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).format(d) + ' ET';
    } catch {
      return isoStr;
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 shadow-xs flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin text-[#8B1E1E]" />
      </div>
    );
  }

  const hasActiveAppointment = appointment && appointment.status !== 'cancelled';

  return (
    <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#E8DFD8]/70">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#8B1E1E]/10 text-[#8B1E1E] flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-serif text-lg font-bold text-[#4B2C20]">
              {t.scheduleAppointmentTitle}
            </h4>
            <p className="text-xs text-neutral-500">
              {t.scheduleLocationLabel}
            </p>
          </div>
        </div>

        {hasActiveAppointment && (
          <div>
            {appointment.status === 'confirmed' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t.scheduleStatusConfirmed}
              </span>
            ) : appointment.status === 'reschedule_requested' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-300">
                <RefreshCw className="w-3.5 h-3.5" />
                {t.scheduleStatusReschedule}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <Clock className="w-3.5 h-3.5 animate-pulse" />
                {t.scheduleStatusPending}
              </span>
            )}
          </div>
        )}
      </div>

      {/* No active appointment state */}
      {!hasActiveAppointment ? (
        <div className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#FAF7F2] p-5 rounded-xl border border-[#E8DFD8]">
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#4B2C20]">
              {appointment?.status === 'cancelled' ? 'Cita previa cancelada' : t.scheduleModalTitle}
            </p>
            <p className="text-xs text-neutral-600 max-w-xl leading-relaxed">
              {t.scheduleModalSubtitle}
            </p>
            {!candidatePhone && (
              <p className="text-[11px] text-amber-800 font-medium">
                {t.scheduleNoPhoneWarning}
              </p>
            )}
          </div>

          <button
            onClick={() => handleOpenScheduleModal('schedule')}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-[#8B1E1E] hover:bg-[#721818] text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow transition"
          >
            <Calendar className="w-4 h-4" />
            {t.scheduleInterviewBtn}
          </button>
        </div>
      ) : (
        /* Active appointment card */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#FAF7F2] p-4 rounded-xl border border-[#E8DFD8]">
            {/* Date & Time */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                {t.scheduleDateTimeLabel}
              </span>
              <p className="text-base font-extrabold text-[#4B2C20]">
                {formatFloridaTimeDisplay(appointment.startUtc)}
              </p>
              <p className="text-xs text-neutral-500">
                Florida local time (America/New_York)
              </p>
            </div>

            {/* Candidate & SMS status */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                SMS Notification & Candidate Info:
              </span>
              <div className="text-xs text-[#4B2C20] font-medium flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-neutral-400" />
                <span>{appointment.candidatePhone || 'No phone registered'}</span>
              </div>
              <div className="pt-1">
                {lastSmsStatus ? (
                  <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {t.scheduleSmsSentBadge}
                  </p>
                ) : (
                  <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{t.scheduleSmsNotSentBadge}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 hover:border-stone-400 bg-white text-stone-700 text-xs font-semibold shadow-xs transition"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">{t.scheduleLinkCopied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t.scheduleCopyLinkBtn}</span>
                  </>
                )}
              </button>

              <a
                href={getCandidateLink()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                {t.scheduleOpenDirectLink}
              </a>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenScheduleModal('reschedule')}
                className="px-3.5 py-1.5 bg-[#4B2C20] hover:bg-[#3E2723] text-white text-xs font-bold rounded-lg shadow-xs transition"
              >
                {t.scheduleRescheduleBtn}
              </button>
              <button
                type="button"
                onClick={handleCancelAppointment}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold rounded-lg transition"
              >
                {t.scheduleCancelBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scheduling / Rescheduling Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-5 animate-scaleUp max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-lg font-bold text-stone-900">
                  {modalMode === 'schedule' ? t.scheduleModalTitle : t.scheduleRescheduleBtn}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  {candidateName} • Lehigh Acres, FL
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Date Selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                {t.scheduleDateLabel} (Lunes - Domingo)
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#8B1E1E]/20 focus:border-[#8B1E1E] outline-none"
              />
            </div>

            {/* Time Slot Selection (8 Slots: 9 AM to 5 PM ET) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600">
                  {t.scheduleTimeSlotLabel}
                </label>
                {loadingSlots && (
                  <span className="text-xs text-stone-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> {t.scheduleLoadingSlots}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {slots.map((slot) => {
                  const isSelected = selectedStartUtc === slot.startUtc;
                  return (
                    <button
                      key={slot.startUtc}
                      type="button"
                      disabled={slot.taken}
                      onClick={() => setSelectedStartUtc(slot.startUtc)}
                      className={`p-3 rounded-xl text-xs font-semibold text-center transition border ${
                        slot.taken
                          ? 'bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed'
                          : isSelected
                          ? 'bg-[#8B1E1E] text-white border-[#8B1E1E] shadow-sm font-bold'
                          : 'bg-[#FAF7F2] border-stone-200 text-stone-800 hover:border-[#8B1E1E]/50'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 opacity-70" />
                        <span>{slot.label}</span>
                      </div>
                      <span className={`block text-[10px] mt-0.5 ${slot.taken ? 'text-stone-400' : isSelected ? 'text-white/80' : 'text-stone-500'}`}>
                        {slot.taken ? t.scheduleSlotTaken : t.scheduleSlotAvailable}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="py-2.5 px-4 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl transition"
              >
                {adminI18n[lang].cancel}
              </button>

              <button
                type="button"
                onClick={handleConfirmSchedule}
                disabled={!selectedStartUtc || submitting}
                className="py-2.5 px-5 bg-[#8B1E1E] hover:bg-[#721818] text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {t.scheduleSchedulingBtn}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    {t.scheduleConfirmBtn}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
