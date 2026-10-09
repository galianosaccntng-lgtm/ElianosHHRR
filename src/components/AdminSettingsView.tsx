import React, { useState, useEffect } from 'react';
import { Settings, Clock, Check, AlertCircle, Save, RefreshCw, Building, Copy, ToggleLeft, ToggleRight } from 'lucide-react';
import { adminI18n } from '../i18n-admin';
import { AppSettings, DaySchedule, SlotDurationMinutes } from '../types';

interface AdminSettingsViewProps {
  adminToken: string;
  lang: 'en' | 'es';
}

const DEFAULT_SCHEDULE_BY_DAY: DaySchedule[] = [
  { dayOfWeek: 0, enabled: true, startHour: 9, endHour: 17 }, // Sun
  { dayOfWeek: 1, enabled: true, startHour: 9, endHour: 17 }, // Mon
  { dayOfWeek: 2, enabled: true, startHour: 9, endHour: 17 }, // Tue
  { dayOfWeek: 3, enabled: true, startHour: 9, endHour: 17 }, // Wed
  { dayOfWeek: 4, enabled: true, startHour: 9, endHour: 17 }, // Thu
  { dayOfWeek: 5, enabled: true, startHour: 9, endHour: 17 }, // Fri
  { dayOfWeek: 6, enabled: true, startHour: 9, endHour: 17 }, // Sat
];

const DEFAULT_SETTINGS: AppSettings = {
  interviewLocationName: '10-4 Truck Parts (Company Office)',
  interviewLocationAddress: '5570 Lee St, Ste 8, Lehigh Acres, FL 33971',
  scheduleByDay: DEFAULT_SCHEDULE_BY_DAY,
  slotDurationMinutes: 60
};

const DURATION_OPTIONS: { value: SlotDurationMinutes; label: string }[] = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 h' },
  { value: 90, label: '1 h 30 min' },
  { value: 120, label: '2 h' }
];

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({ adminToken, lang }) => {
  const t = adminI18n[lang];

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, [adminToken]);

  const fetchSettings = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings', {
        headers: {
          'x-admin-passcode': adminToken
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          // Normalize scheduleByDay
          let scheduleByDay: DaySchedule[] = [];
          if (Array.isArray(data.settings.scheduleByDay) && data.settings.scheduleByDay.length > 0) {
            for (let day = 0; day <= 6; day++) {
              const found = data.settings.scheduleByDay.find((d: any) => Number(d?.dayOfWeek) === day);
              if (found) {
                scheduleByDay.push({
                  dayOfWeek: day,
                  enabled: Boolean(found.enabled),
                  startHour: Number(found.startHour) || 9,
                  endHour: Number(found.endHour) || 17
                });
              } else {
                scheduleByDay.push({ dayOfWeek: day, enabled: false, startHour: 9, endHour: 17 });
              }
            }
          } else {
            // Migration from legacy settings
            const legacyDays = Array.isArray(data.settings.scheduleDays) ? data.settings.scheduleDays : [0, 1, 2, 3, 4, 5, 6];
            const legacyStart = Number(data.settings.scheduleStartHour) || 9;
            const legacyEnd = Number(data.settings.scheduleEndHour) || 17;
            for (let day = 0; day <= 6; day++) {
              scheduleByDay.push({
                dayOfWeek: day,
                enabled: legacyDays.includes(day),
                startHour: legacyStart,
                endHour: legacyEnd
              });
            }
          }

          const rawDuration = Number(data.settings.slotDurationMinutes);
          const validDuration = (DURATION_OPTIONS.some(opt => opt.value === rawDuration) ? rawDuration : 60) as SlotDurationMinutes;

          setSettings({
            interviewLocationName: data.settings.interviewLocationName || DEFAULT_SETTINGS.interviewLocationName,
            interviewLocationAddress: data.settings.interviewLocationAddress || DEFAULT_SETTINGS.interviewLocationAddress,
            scheduleByDay,
            slotDurationMinutes: validDuration
          });
        }
      } else {
        setMessage({ type: 'error', text: 'Error loading settings from server' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Connection error' });
    } finally {
      setLoading(false);
    }
  };

  const dayNames = lang === 'es'
    ? [
        { idx: 0, label: 'Domingo', short: 'Dom' },
        { idx: 1, label: 'Lunes', short: 'Lun' },
        { idx: 2, label: 'Martes', short: 'Mar' },
        { idx: 3, label: 'Miércoles', short: 'Mié' },
        { idx: 4, label: 'Jueves', short: 'Jue' },
        { idx: 5, label: 'Viernes', short: 'Vie' },
        { idx: 6, label: 'Sábado', short: 'Sáb' }
      ]
    : [
        { idx: 0, label: 'Sunday', short: 'Sun' },
        { idx: 1, label: 'Monday', short: 'Mon' },
        { idx: 2, label: 'Tuesday', short: 'Tue' },
        { idx: 3, label: 'Wednesday', short: 'Wed' },
        { idx: 4, label: 'Thursday', short: 'Thu' },
        { idx: 5, label: 'Friday', short: 'Fri' },
        { idx: 6, label: 'Saturday', short: 'Sat' }
      ];

  const formatHourLabel = (h: number) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour}:00 ${period} (${String(h).padStart(2, '0')}:00)`;
  };

  const handleDayEnabledChange = (dayIndex: number, enabled: boolean) => {
    setSettings(prev => {
      const updated = prev.scheduleByDay.map(d => {
        if (d.dayOfWeek === dayIndex) {
          return { ...d, enabled };
        }
        return d;
      });
      return { ...prev, scheduleByDay: updated };
    });
  };

  const handleDayHourChange = (dayIndex: number, field: 'startHour' | 'endHour', value: number) => {
    setSettings(prev => {
      const updated = prev.scheduleByDay.map(d => {
        if (d.dayOfWeek === dayIndex) {
          return { ...d, [field]: value };
        }
        return d;
      });
      return { ...prev, scheduleByDay: updated };
    });
  };

  const handleApplyToAllDays = (sourceDayIndex: number) => {
    const source = settings.scheduleByDay.find(d => d.dayOfWeek === sourceDayIndex);
    if (!source) return;

    if (!window.confirm(
      lang === 'es'
        ? `¿Copiar el horario (${formatHourLabel(source.startHour)} a ${formatHourLabel(source.endHour)}) a todos los días?`
        : `Copy schedule (${formatHourLabel(source.startHour)} to ${formatHourLabel(source.endHour)}) to all days?`
    )) {
      return;
    }

    setSettings(prev => {
      const updated = prev.scheduleByDay.map(d => ({
        ...d,
        startHour: source.startHour,
        endHour: source.endHour
      }));
      return { ...prev, scheduleByDay: updated };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    // Validation 1: At least one day enabled
    const enabledDays = settings.scheduleByDay.filter(d => d.enabled);
    if (enabledDays.length === 0) {
      setMessage({
        type: 'error',
        text: lang === 'es'
          ? 'Debes habilitar al menos un día para entrevistas.'
          : 'At least one day must be enabled for interviews.'
      });
      setSaving(false);
      return;
    }

    // Validation 2: Each enabled day has startHour < endHour
    for (const d of enabledDays) {
      if (d.startHour >= d.endHour) {
        const dName = dayNames.find(dn => dn.idx === d.dayOfWeek)?.label || `Día ${d.dayOfWeek}`;
        setMessage({
          type: 'error',
          text: lang === 'es'
            ? `Error en ${dName}: La hora de inicio (${formatHourLabel(d.startHour)}) debe ser anterior a la hora de fin (${formatHourLabel(d.endHour)}).`
            : `Error on ${dName}: Start hour (${formatHourLabel(d.startHour)}) must be before end hour (${formatHourLabel(d.endHour)}).`
        });
        setSaving(false);
        return;
      }
    }

    // Validation 3: Duration is valid
    if (!DURATION_OPTIONS.some(opt => opt.value === settings.slotDurationMinutes)) {
      setMessage({
        type: 'error',
        text: lang === 'es' ? 'Duración de slot inválida.' : 'Invalid slot duration.'
      });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminToken
        },
        body: JSON.stringify({
          interviewLocationName: settings.interviewLocationName,
          interviewLocationAddress: settings.interviewLocationAddress,
          scheduleByDay: settings.scheduleByDay,
          slotDurationMinutes: settings.slotDurationMinutes
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setSettings(prev => ({
            ...prev,
            ...data.settings
          }));
        }
        setMessage({ type: 'success', text: t.settingsSavedSuccess });
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.error || t.settingsSaveError });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || t.settingsSaveError });
    } finally {
      setSaving(false);
    }
  };

  // Hour options from 6 AM to 10 PM
  const hourOptions = Array.from({ length: 18 }, (_, i) => i + 6); // 6..23

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Title Card */}
      <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 md:p-8 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide bg-amber-50 text-amber-900 border border-amber-200 mb-2">
            <Settings className="w-3.5 h-3.5" />
            {t.settingsTitle}
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#4B2C20]">
            {t.settingsTitle}
          </h2>
          <p className="text-sm text-[#4B2C20]/70 mt-1">
            {t.settingsSubtitle}
          </p>
        </div>

        <button
          onClick={fetchSettings}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold uppercase tracking-wider rounded-xl border border-[#E8DFD8] text-[#4B2C20]/80 hover:bg-[#FAF7F2] transition shadow-2xs"
          title="Recargar configuración"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#D4A373]' : ''}`} />
          <span>{loading ? '...' : (lang === 'es' ? 'Recargar' : 'Refresh')}</span>
        </button>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {message.type === 'success' ? (
            <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-[#E8DFD8] rounded-2xl p-12 text-center text-[#4B2C20]/60">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-[#D4A373]" />
          <p className="text-sm font-medium">{lang === 'es' ? 'Cargando configuración...' : 'Loading settings...'}</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Location */}
          <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-[#F0EAE4]">
              <div className="w-9 h-9 rounded-xl bg-[#8B1E1E]/10 text-[#8B1E1E] flex items-center justify-center">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-[#4B2C20]">
                  {t.settingsLocationSection}
                </h3>
                <p className="text-xs text-[#4B2C20]/60">
                  {lang === 'es'
                    ? 'Esta dirección se incluirá en los mensajes SMS y en la página pública del candidato.'
                    : 'This address is included in SMS invitations and the candidate confirmation portal.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4B2C20]/80 mb-2">
                  {t.settingsLocationNameLabel}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={settings.interviewLocationName}
                    onChange={(e) => setSettings({ ...settings, interviewLocationName: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl text-sm font-medium text-[#4B2C20] focus:outline-none focus:ring-2 focus:ring-[#8B1E1E]/20 focus:border-[#8B1E1E]"
                    placeholder="10-4 Truck Parts (Company Office)"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4B2C20]/80 mb-2">
                  {t.settingsLocationAddressLabel}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={settings.interviewLocationAddress}
                    onChange={(e) => setSettings({ ...settings, interviewLocationAddress: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl text-sm font-medium text-[#4B2C20] focus:outline-none focus:ring-2 focus:ring-[#8B1E1E]/20 focus:border-[#8B1E1E]"
                    placeholder="5570 Lee St, Ste 8, Lehigh Acres, FL 33971"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Slot Duration (Fixed Options) */}
          <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 md:p-8 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[#F0EAE4]">
              <div className="w-9 h-9 rounded-xl bg-[#8B1E1E]/10 text-[#8B1E1E] flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-[#4B2C20]">
                  {t.settingsSlotDurationLabel}
                </h3>
                <p className="text-xs text-[#4B2C20]/60">
                  {lang === 'es'
                    ? 'Selecciona la duración fija de cada entrevista entre las 6 opciones permitidas.'
                    : 'Choose fixed interview duration from the 6 allowed options.'}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#4B2C20]/80 mb-3">
                {lang === 'es' ? 'Opciones de Duración:' : 'Duration Options:'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                {DURATION_OPTIONS.map((opt) => {
                  const isSelected = settings.slotDurationMinutes === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSettings({ ...settings, slotDurationMinutes: opt.value })}
                      className={`py-3 px-4 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                        isSelected
                          ? 'bg-[#8B1E1E] text-white border-[#8B1E1E] shadow-sm font-bold ring-2 ring-[#8B1E1E]/20'
                          : 'bg-[#FAF7F2] text-[#4B2C20] border-[#E8DFD8] hover:bg-white hover:border-[#D4A373]'
                      }`}
                    >
                      <span className="text-base font-bold">{opt.label}</span>
                      <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-[#4B2C20]/60'}`}>
                        {opt.value} min
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 3: Schedule by Day */}
          <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-[#F0EAE4]">
              <div className="w-9 h-9 rounded-xl bg-[#8B1E1E]/10 text-[#8B1E1E] flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-[#4B2C20]">
                  {t.settingsScheduleByDayTitle}
                </h3>
                <p className="text-xs text-[#4B2C20]/60">
                  {t.settingsScheduleByDaySubtitle}
                </p>
              </div>
            </div>

            {/* Day by Day List */}
            <div className="space-y-3">
              {dayNames.map((d) => {
                const daySchedule = settings.scheduleByDay.find(ds => ds.dayOfWeek === d.idx) || {
                  dayOfWeek: d.idx,
                  enabled: true,
                  startHour: 9,
                  endHour: 17
                };

                return (
                  <div
                    key={d.idx}
                    className={`p-4 rounded-xl border transition-all ${
                      daySchedule.enabled
                        ? 'bg-[#FAF7F2] border-[#E8DFD8]'
                        : 'bg-stone-50 border-stone-200 opacity-60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      {/* Day Name and Toggle */}
                      <div className="flex items-center gap-3 min-w-[150px]">
                        <button
                          type="button"
                          onClick={() => handleDayEnabledChange(d.idx, !daySchedule.enabled)}
                          className="flex items-center gap-2 text-left focus:outline-none"
                          title={daySchedule.enabled ? t.settingsDayEnabled : t.settingsDayDisabled}
                        >
                          {daySchedule.enabled ? (
                            <ToggleRight className="w-7 h-7 text-[#8B1E1E] shrink-0" />
                          ) : (
                            <ToggleLeft className="w-7 h-7 text-stone-400 shrink-0" />
                          )}
                          <div>
                            <span className="font-serif font-bold text-sm text-[#4B2C20] block">
                              {d.label}
                            </span>
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                              daySchedule.enabled ? 'text-emerald-700' : 'text-stone-500'
                            }`}>
                              {daySchedule.enabled ? t.settingsDayEnabled : t.settingsDayDisabled}
                            </span>
                          </div>
                        </button>
                      </div>

                      {/* Hours selectors or Closed note */}
                      {daySchedule.enabled ? (
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap w-full sm:w-auto">
                          {/* Start Hour */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-[#4B2C20]/70">
                              {t.settingsStartHour}:
                            </span>
                            <select
                              value={daySchedule.startHour}
                              onChange={(e) => handleDayHourChange(d.idx, 'startHour', Number(e.target.value))}
                              className="px-2.5 py-1.5 bg-white border border-[#E8DFD8] rounded-lg text-xs font-medium text-[#4B2C20] focus:outline-none focus:ring-1 focus:ring-[#8B1E1E]"
                            >
                              {hourOptions.filter(h => h < 23).map((h) => (
                                <option key={h} value={h}>
                                  {formatHourLabel(h)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <span className="text-stone-400 text-xs">—</span>

                          {/* End Hour */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-[#4B2C20]/70">
                              {t.settingsEndHour}:
                            </span>
                            <select
                              value={daySchedule.endHour}
                              onChange={(e) => handleDayHourChange(d.idx, 'endHour', Number(e.target.value))}
                              className="px-2.5 py-1.5 bg-white border border-[#E8DFD8] rounded-lg text-xs font-medium text-[#4B2C20] focus:outline-none focus:ring-1 focus:ring-[#8B1E1E]"
                            >
                              {hourOptions.filter(h => h > 6).map((h) => (
                                <option key={h} value={h}>
                                  {formatHourLabel(h)}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Quick copy to all days button */}
                          <button
                            type="button"
                            onClick={() => handleApplyToAllDays(d.idx)}
                            className="p-1.5 text-[#4B2C20]/50 hover:text-[#4B2C20] hover:bg-white rounded-lg border border-transparent hover:border-[#E8DFD8] transition"
                            title={t.settingsCopyAllDays}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-stone-500 italic py-1">
                          {lang === 'es' ? 'No se agendarán entrevistas este día' : 'No interviews scheduled on this day'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3.5 bg-[#8B1E1E] hover:bg-[#721818] active:scale-[0.99] text-white font-bold rounded-xl text-sm shadow-sm transition flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{t.settingsSavingBtn}</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{t.settingsSaveBtn}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
