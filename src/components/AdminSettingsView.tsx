import React, { useState, useEffect } from 'react';
import { Settings, MapPin, Clock, Calendar, Check, AlertCircle, Save, RefreshCw, Building } from 'lucide-react';
import { adminI18n } from '../i18n-admin';
import { AppSettings } from '../types';

interface AdminSettingsViewProps {
  adminToken: string;
  lang: 'en' | 'es';
}

const DEFAULT_SETTINGS: AppSettings = {
  interviewLocationName: '10-4 Truck Parts (Company Office)',
  interviewLocationAddress: '5570 Lee St, Ste 8, Lehigh Acres, FL 33971',
  scheduleDays: [0, 1, 2, 3, 4, 5, 6],
  scheduleStartHour: 9,
  scheduleEndHour: 17,
  slotDurationMinutes: 60
};

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
          setSettings({
            interviewLocationName: data.settings.interviewLocationName || DEFAULT_SETTINGS.interviewLocationName,
            interviewLocationAddress: data.settings.interviewLocationAddress || DEFAULT_SETTINGS.interviewLocationAddress,
            scheduleDays: Array.isArray(data.settings.scheduleDays) ? data.settings.scheduleDays : DEFAULT_SETTINGS.scheduleDays,
            scheduleStartHour: Number(data.settings.scheduleStartHour) || DEFAULT_SETTINGS.scheduleStartHour,
            scheduleEndHour: Number(data.settings.scheduleEndHour) || DEFAULT_SETTINGS.scheduleEndHour,
            slotDurationMinutes: Number(data.settings.slotDurationMinutes) || DEFAULT_SETTINGS.slotDurationMinutes
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

  const handleDayToggle = (dayIndex: number) => {
    setSettings((prev) => {
      const exists = prev.scheduleDays.includes(dayIndex);
      let updatedDays: number[];
      if (exists) {
        if (prev.scheduleDays.length === 1) {
          // Keep at least one day enabled
          return prev;
        }
        updatedDays = prev.scheduleDays.filter((d) => d !== dayIndex);
      } else {
        updatedDays = [...prev.scheduleDays, dayIndex].sort((a, b) => a - b);
      }
      return { ...prev, scheduleDays: updatedDays };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    // Validation
    if (settings.scheduleStartHour >= settings.scheduleEndHour) {
      setMessage({
        type: 'error',
        text: lang === 'es'
          ? 'La hora de inicio debe ser anterior a la hora de fin'
          : 'Start hour must be before end hour'
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
        body: JSON.stringify(settings)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setSettings(data.settings);
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
    return `${displayHour}:00 ${period} (${h}:00)`;
  };

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

          {/* Section 2: Schedule & Availability */}
          <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-[#F0EAE4]">
              <div className="w-9 h-9 rounded-xl bg-[#8B1E1E]/10 text-[#8B1E1E] flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-[#4B2C20]">
                  {t.settingsScheduleSection}
                </h3>
                <p className="text-xs text-[#4B2C20]/60">
                  {lang === 'es'
                    ? 'Define los días y la ventana de horas habilitadas en horario de Florida (America/New_York).'
                    : 'Configure interview days and operating hours in Florida time (America/New_York).'}
                </p>
              </div>
            </div>

            {/* Enabled Days Checkboxes */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#4B2C20]/80 mb-3">
                {t.settingsDaysLabel}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                {dayNames.map((d) => {
                  const isChecked = settings.scheduleDays.includes(d.idx);
                  return (
                    <button
                      key={d.idx}
                      type="button"
                      onClick={() => handleDayToggle(d.idx)}
                      className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                        isChecked
                          ? 'bg-[#8B1E1E] text-white border-[#8B1E1E] shadow-2xs'
                          : 'bg-[#FAF7F2] text-[#4B2C20]/70 border-[#E8DFD8] hover:bg-white'
                      }`}
                    >
                      <span className="text-xs font-bold">{d.short}</span>
                      <span className="text-[10px] opacity-80">{d.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Operating Hours & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4B2C20]/80 mb-2">
                  {t.settingsStartHourLabel}
                </label>
                <select
                  value={settings.scheduleStartHour}
                  onChange={(e) => setSettings({ ...settings, scheduleStartHour: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl text-sm font-medium text-[#4B2C20] focus:outline-none focus:ring-2 focus:ring-[#8B1E1E]/20 focus:border-[#8B1E1E]"
                >
                  {[7, 8, 9, 10, 11, 12].map((h) => (
                    <option key={h} value={h}>
                      {formatHourLabel(h)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4B2C20]/80 mb-2">
                  {t.settingsEndHourLabel}
                </label>
                <select
                  value={settings.scheduleEndHour}
                  onChange={(e) => setSettings({ ...settings, scheduleEndHour: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl text-sm font-medium text-[#4B2C20] focus:outline-none focus:ring-2 focus:ring-[#8B1E1E]/20 focus:border-[#8B1E1E]"
                >
                  {[13, 14, 15, 16, 17, 18, 19, 20, 21].map((h) => (
                    <option key={h} value={h}>
                      {formatHourLabel(h)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4B2C20]/80 mb-2">
                  {t.settingsSlotDurationLabel}
                </label>
                <select
                  value={settings.slotDurationMinutes}
                  onChange={(e) => setSettings({ ...settings, slotDurationMinutes: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl text-sm font-medium text-[#4B2C20] focus:outline-none focus:ring-2 focus:ring-[#8B1E1E]/20 focus:border-[#8B1E1E]"
                >
                  <option value={30}>30 {lang === 'es' ? 'minutos' : 'minutes'}</option>
                  <option value={45}>45 {lang === 'es' ? 'minutos' : 'minutes'}</option>
                  <option value={60}>60 {lang === 'es' ? 'minutos (1 hora)' : 'minutes (1 hour)'}</option>
                  <option value={90}>90 {lang === 'es' ? 'minutos (1.5 horas)' : 'minutes (1.5 hours)'}</option>
                </select>
              </div>
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
