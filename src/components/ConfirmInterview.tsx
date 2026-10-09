import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, CheckCircle2, AlertCircle, RefreshCw, Coffee, ChevronRight, Globe } from 'lucide-react';

interface AvailableSlot {
  date: string;
  startUtc: string;
  endUtc: string;
  label: string;
}

interface AppointmentData {
  candidateName: string;
  candidatePhone?: string;
  candidateEmail?: string;
  startUtc: string;
  endUtc: string;
  label: string;
  status: 'pending' | 'confirmed' | 'reschedule_requested' | 'cancelled';
  language?: 'en' | 'es';
  notes?: string;
  interviewLocationName?: string;
  interviewLocationAddress?: string;
  availableSlots: AvailableSlot[];
}

const t = {
  en: {
    pageTitle: "Your In-Person 2nd Interview",
    brandSubtitle: "Ellianos Coffee • Italian Quality at America's Pace®",
    greeting: (name: string) => `Hello ${name}!`,
    introPending: "You have been invited for an in-person second interview at our office. Please review the details below and confirm your attendance.",
    introConfirmed: "Your interview attendance is confirmed! Below are your details and instructions for arrival.",
    locationTitle: "Interview Location",
    locationDesc: "10-4 Truck Parts (Company Office)",
    locationCity: "5570 Lee St, Ste 8, Lehigh Acres, FL 33971",
    dateTimeTitle: "Scheduled Date & Time",
    easternNotice: "All times shown in Florida local time (Eastern Time - ET)",
    statusPending: "Confirmation Needed",
    statusConfirmed: "Attendance Confirmed ✓",
    statusRescheduled: "Updated Schedule",
    confirmBtn: "Confirm Attendance",
    confirmingBtn: "Confirming...",
    confirmedSuccessHeader: "Attendance Confirmed!",
    confirmedSuccessBody: "Thank you for confirming. We are excited to meet you in person!",
    arrivalTipsTitle: "Important Arrival Instructions",
    tip1: "Please arrive 5 to 10 minutes prior to your scheduled time.",
    tip2: "Dress in neat, comfortable casual attire.",
    tip3: "When you arrive, enter the office and let the front desk or team know: 'I am here for my interview with the manager.'",
    tip4: "No need to bring printed paperwork—our team has your virtual application on file.",
    needReschedule: "Need a different day or time?",
    rescheduleBtnText: "Reschedule Interview",
    cancelReschedule: "Keep Current Time",
    rescheduleTitle: "Select a New Date & Time",
    rescheduleSubtitle: "Choose from open 1-hour interview slots over the next 14 days (9:00 AM - 5:00 PM ET).",
    selectDateLabel: "1. Select Date:",
    selectSlotLabel: "2. Select Time Slot:",
    confirmNewSlotBtn: "Confirm New Time",
    savingRescheduleBtn: "Updating...",
    noSlotsForDate: "No open slots available on this date. Please select another day.",
    invalidLinkTitle: "Invitation Not Found",
    invalidLinkDesc: "This interview invitation link is invalid, expired, or has already been cancelled. If you believe this is a mistake, please reach out to Ellianos Coffee HR.",
    backHomeBtn: "Go to Main Page",
    networkError: "Connection error. Please check your internet connection and try again.",
    loadingDetails: "Loading interview details...",
  },
  es: {
    pageTitle: "Tu 2ª Entrevista Presencial",
    brandSubtitle: "Ellianos Coffee • Calidad Italiana al Ritmo Americano®",
    greeting: (name: string) => `¡Hola ${name}!`,
    introPending: "Has sido invitado/a a tu segunda entrevista presencial en nuestra oficina. Revisa los detalles a continuación y confirma tu asistencia.",
    introConfirmed: "¡Tu asistencia a la entrevista está confirmada! A continuación encontrarás los detalles e instrucciones de llegada.",
    locationTitle: "Ubicación de la Entrevista",
    locationDesc: "10-4 Truck Parts (Oficina de la Empresa)",
    locationCity: "5570 Lee St, Ste 8, Lehigh Acres, FL 33971",
    dateTimeTitle: "Fecha y Hora Programada",
    easternNotice: "Horarios en hora local de Florida (Hora del Este - ET)",
    statusPending: "Confirmación Pendiente",
    statusConfirmed: "Asistencia Confirmada ✓",
    statusRescheduled: "Horario Actualizado",
    confirmBtn: "Confirmar Asistencia",
    confirmingBtn: "Confirmando...",
    confirmedSuccessHeader: "¡Asistencia Confirmada!",
    confirmedSuccessBody: "Gracias por confirmar. ¡Nos dará mucho gusto conocerte en persona!",
    arrivalTipsTitle: "Instrucciones Importantes de Llegada",
    tip1: "Por favor llega entre 5 y 10 minutos antes de tu hora programada.",
    tip2: "Viste ropa casual pulcra y calzado cómodo.",
    tip3: "Al llegar, entra a la oficina y avisa al equipo de recepción: 'Vengo a mi entrevista con el/la gerente.'",
    tip4: "No necesitas llevar papeles impresos—nuestro equipo tiene tu aplicación virtual en sistema.",
    needReschedule: "¿Necesitas otra fecha u hora?",
    rescheduleBtnText: "Reagendar Entrevista",
    cancelReschedule: "Mantener Horario Actual",
    rescheduleTitle: "Selecciona Nueva Fecha y Hora",
    rescheduleSubtitle: "Elige entre los horarios disponibles de 1 hora de los próximos 14 días (9:00 AM - 5:00 PM ET).",
    selectDateLabel: "1. Selecciona Fecha:",
    selectSlotLabel: "2. Selecciona Horario:",
    confirmNewSlotBtn: "Confirmar Nuevo Horario",
    savingRescheduleBtn: "Actualizando...",
    noSlotsForDate: "No hay horarios disponibles en esta fecha. Por favor selecciona otro día.",
    invalidLinkTitle: "Invitación No Encontrada",
    invalidLinkDesc: "Este enlace de entrevista no es válido, ha caducado o fue cancelado. Si crees que se trata de un error, contacta al equipo de Recursos Humanos de Ellianos Coffee.",
    backHomeBtn: "Ir a la Página Principal",
    networkError: "Error de conexión. Por favor verifica tu internet e intenta nuevamente.",
    loadingDetails: "Cargando detalles de la entrevista...",
  }
};

export function ConfirmInterview() {
  const [token, setToken] = useState<string | null>(null);
  const [lang, setLang] = useState<'en' | 'es'>('en');
  const [data, setData] = useState<AppointmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [confirmSuccess, setConfirmSuccess] = useState(false);

  const [isRescheduling, setIsRescheduling] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlotUtc, setSelectedSlotUtc] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const text = t[lang];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    if (!tokenParam) {
      setError("No token provided");
      setLoading(false);
      return;
    }
    setToken(tokenParam);
    fetchAppointment(tokenParam);
  }, []);

  const fetchAppointment = async (apptToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/appointment?token=${encodeURIComponent(apptToken)}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error || "Appointment not found");
        setLoading(false);
        return;
      }
      const json: AppointmentData = await res.json();
      setData(json);
      if (json.language === 'es' || json.language === 'en') {
        setLang(json.language);
      }
      if (json.status === 'confirmed') {
        setConfirmSuccess(true);
      }
      // Initialize selected date for reschedule if available
      if (json.availableSlots && json.availableSlots.length > 0) {
        const uniqueDates = Array.from(new Set(json.availableSlots.map(s => s.date)));
        if (uniqueDates.length > 0) {
          setSelectedDate(uniqueDates[0]);
        }
      }
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!token) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/appointment/confirm?token=${encodeURIComponent(token)}`, {
        method: 'POST'
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.error || "Failed to confirm appointment");
        return;
      }
      const resJson = await res.json();
      setConfirmSuccess(true);
      if (data) {
        setData({
          ...data,
          status: 'confirmed',
          label: resJson.appointment?.label || data.label
        });
      }
    } catch (e) {
      alert(text.networkError);
    } finally {
      setConfirming(false);
    }
  };

  const handleReschedule = async () => {
    if (!token || !selectedSlotUtc) return;
    setRescheduling(true);
    setRescheduleError(null);
    try {
      const res = await fetch(`/api/appointment/reschedule?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUtc: selectedSlotUtc })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setRescheduleError(errJson.error || "Failed to reschedule");
        return;
      }
      const resJson = await res.json();
      setIsRescheduling(false);
      setConfirmSuccess(true);
      // Re-fetch to update available slots and active record
      await fetchAppointment(token);
    } catch (e: any) {
      setRescheduleError(e?.message || text.networkError);
    } finally {
      setRescheduling(false);
    }
  };

  // Group available slots by date
  const slotsByDate: Record<string, AvailableSlot[]> = {};
  if (data?.availableSlots) {
    for (const slot of data.availableSlots) {
      if (!slotsByDate[slot.date]) {
        slotsByDate[slot.date] = [];
      }
      slotsByDate[slot.date].push(slot);
    }
  }
  const uniqueDates = Object.keys(slotsByDate).sort();

  const formatDateTabLabel = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      }).format(dateObj);
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin text-[#8B1E1E] mx-auto" />
          <p className="text-stone-600 font-medium">{text.loadingDetails}</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-stone-200 p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-stone-900">{text.invalidLinkTitle}</h2>
            <p className="text-sm text-stone-600 mt-2 leading-relaxed">{text.invalidLinkDesc}</p>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full py-3 px-4 bg-[#8B1E1E] hover:bg-[#721818] text-white font-medium rounded-xl transition shadow-sm"
          >
            {text.backHomeBtn}
          </button>
        </div>
      </div>
    );
  }

  const isConfirmed = data.status === 'confirmed' || confirmSuccess;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-stone-800 flex flex-col justify-between">
      {/* Top Header */}
      <header className="bg-[#8B1E1E] text-white shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-amber-200">
              <Coffee className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Ellianos Coffee</h1>
              <p className="text-xs text-white/80 font-medium">Italian Quality at America's Pace®</p>
            </div>
          </div>
          {/* Language Toggle */}
          <button
            onClick={() => setLang(l => l === 'en' ? 'es' : 'en')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-semibold tracking-wide transition border border-white/20"
            title="Switch Language / Cambiar Idioma"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? 'ESPAÑOL' : 'ENGLISH'}</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        {/* Intro Card */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-stone-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-stone-100">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide bg-amber-50 text-amber-900 border border-amber-200 mb-2">
                ☕ {text.pageTitle}
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
                {text.greeting(data.candidateName)}
              </h2>
            </div>
            <div>
              {isConfirmed ? (
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  {text.statusConfirmed}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                  <Clock className="w-4 h-4 animate-pulse" />
                  {text.statusPending}
                </span>
              )}
            </div>
          </div>

          <p className="mt-5 text-stone-600 text-base leading-relaxed">
            {isConfirmed ? text.introConfirmed : text.introPending}
          </p>

          {/* Details Grid */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Time Box */}
            <div className="bg-[#FAF7F2] rounded-xl p-5 border border-stone-200 flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#8B1E1E]/10 text-[#8B1E1E] flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase font-bold tracking-wider text-stone-500">{text.dateTimeTitle}</p>
                <p className="text-lg font-bold text-stone-900">{data.label}</p>
                <p className="text-xs text-stone-500 font-medium">{text.easternNotice}</p>
              </div>
            </div>

            {/* Location Box */}
            <div className="bg-[#FAF7F2] rounded-xl p-5 border border-stone-200 flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#8B1E1E]/10 text-[#8B1E1E] flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase font-bold tracking-wider text-stone-500">{text.locationTitle}</p>
                <p className="text-base font-bold text-stone-900">{data.interviewLocationName || text.locationDesc}</p>
                <p className="text-sm text-stone-600">{data.interviewLocationAddress || text.locationCity}</p>
              </div>
            </div>
          </div>

          {/* Action Button Section (If not confirmed yet) */}
          {!isConfirmed && !isRescheduling && (
            <div className="mt-8 pt-6 border-t border-stone-100 space-y-4">
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="w-full py-4 px-6 bg-[#8B1E1E] hover:bg-[#721818] active:scale-[0.99] text-white font-bold rounded-xl text-lg shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {confirming ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    {text.confirmingBtn}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-6 h-6" />
                    {text.confirmBtn}
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsRescheduling(true)}
                  className="text-sm font-semibold text-stone-600 hover:text-[#8B1E1E] underline transition"
                >
                  {text.needReschedule} {text.rescheduleBtnText}
                </button>
              </div>
            </div>
          )}

          {/* Already Confirmed Banner & Reschedule Link */}
          {isConfirmed && !isRescheduling && (
            <div className="mt-8 pt-6 border-t border-stone-100 space-y-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-emerald-950 text-sm">{text.confirmedSuccessHeader}</h4>
                  <p className="text-xs text-emerald-800 mt-0.5">{text.confirmedSuccessBody}</p>
                </div>
              </div>

              {/* Arrival Tips */}
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-5 space-y-3">
                <h4 className="font-bold text-amber-950 text-sm flex items-center gap-2">
                  <span>📋</span> {text.arrivalTipsTitle}
                </h4>
                <ul className="space-y-2 text-xs sm:text-sm text-stone-700">
                  <li className="flex items-start gap-2">
                    <span className="text-[#8B1E1E] font-bold">•</span>
                    <span>{text.tip1}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#8B1E1E] font-bold">•</span>
                    <span>{text.tip2}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#8B1E1E] font-bold">•</span>
                    <span>{text.tip3}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#8B1E1E] font-bold">•</span>
                    <span>{text.tip4}</span>
                  </li>
                </ul>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setIsRescheduling(true)}
                  className="text-xs font-semibold text-stone-500 hover:text-[#8B1E1E] underline transition"
                >
                  {text.needReschedule} {text.rescheduleBtnText}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Reschedule Interactive Section */}
        {isRescheduling && (
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-md border-2 border-[#8B1E1E]/30 space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100">
              <div>
                <h3 className="text-xl font-bold text-stone-900">{text.rescheduleTitle}</h3>
                <p className="text-xs text-stone-500 mt-1">{text.rescheduleSubtitle}</p>
              </div>
              <button
                onClick={() => {
                  setIsRescheduling(false);
                  setRescheduleError(null);
                }}
                className="text-xs font-semibold text-stone-500 hover:text-stone-800 py-1 px-3 border border-stone-200 rounded-lg hover:bg-stone-50"
              >
                {text.cancelReschedule}
              </button>
            </div>

            {rescheduleError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{rescheduleError}</span>
              </div>
            )}

            {/* Step 1: Date tabs */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">
                {text.selectDateLabel}
              </label>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {uniqueDates.map((dStr) => {
                  const isSel = selectedDate === dStr;
                  const count = slotsByDate[dStr]?.length || 0;
                  return (
                    <button
                      key={dStr}
                      onClick={() => {
                        setSelectedDate(dStr);
                        setSelectedSlotUtc(null);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold shrink-0 transition flex flex-col items-center gap-0.5 border ${
                        isSel
                          ? 'bg-[#8B1E1E] text-white border-[#8B1E1E] shadow-sm'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      <span className="capitalize">{formatDateTabLabel(dStr)}</span>
                      <span className={`text-[10px] ${isSel ? 'text-white/80' : 'text-stone-400'}`}>
                        {count} {lang === 'es' ? 'libres' : 'open'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Time slot grid */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">
                {text.selectSlotLabel}
              </label>
              {selectedDate && slotsByDate[selectedDate]?.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {slotsByDate[selectedDate].map((s) => {
                    const isPicked = selectedSlotUtc === s.startUtc;
                    return (
                      <button
                        key={s.startUtc}
                        onClick={() => setSelectedSlotUtc(s.startUtc)}
                        className={`p-3 rounded-xl text-xs font-semibold text-center transition border ${
                          isPicked
                            ? 'bg-amber-100 border-[#8B1E1E] text-[#8B1E1E] font-bold ring-2 ring-[#8B1E1E]/20 shadow-sm'
                            : 'bg-[#FAF7F2] border-stone-200 text-stone-800 hover:border-stone-400'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5 mx-auto mb-1 opacity-70" />
                        <span>{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-stone-500 italic p-4 bg-stone-50 rounded-xl text-center">
                  {text.noSlotsForDate}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-stone-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsRescheduling(false)}
                className="py-2.5 px-4 rounded-xl text-sm font-semibold text-stone-600 hover:bg-stone-100 transition"
              >
                {text.cancelReschedule}
              </button>
              <button
                type="button"
                onClick={handleReschedule}
                disabled={!selectedSlotUtc || rescheduling}
                className="py-2.5 px-6 rounded-xl text-sm font-bold bg-[#8B1E1E] hover:bg-[#721818] text-white shadow transition flex items-center gap-2 disabled:opacity-40"
              >
                {rescheduling ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {text.savingRescheduleBtn}
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-4 h-4" />
                    {text.confirmNewSlotBtn}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white py-6 text-center text-xs text-stone-400">
        <div className="max-w-3xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Ellianos Coffee. All rights reserved.</span>
          <span>Lehigh Acres, FL • Recruiting & HR Operations</span>
        </div>
      </footer>
    </div>
  );
}
