import React, { useState } from 'react';
import { Lock, X, AlertCircle, Loader2, KeyRound, Globe } from 'lucide-react';
import { adminI18n, AdminLang, getInitialAdminLang, setSavedAdminLang } from '../i18n-admin';

interface AdminLoginModalProps {
  onSuccess: (token: string) => void;
  onClose: () => void;
  currentLang?: AdminLang;
  onLangChange?: (lang: AdminLang) => void;
}

export function AdminLoginModal({ onSuccess, onClose, currentLang, onLangChange }: AdminLoginModalProps) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [internalLang, setInternalLang] = useState<AdminLang>(() => currentLang || getInitialAdminLang());

  const activeLang = currentLang || internalLang;
  const t = adminI18n[activeLang];

  const handleToggleLang = (lang: AdminLang) => {
    setInternalLang(lang);
    setSavedAdminLang(lang);
    if (onLangChange) {
      onLangChange(lang);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t.defaultLoginError);
      }

      onSuccess(passcode.trim());
    } catch (err: any) {
      setError(err.message || t.incorrectPasscode);
      setPasscode('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#FAF7F2] border border-[#E8DFD8] rounded-3xl w-full max-w-md p-6 md:p-8 shadow-2xl relative text-[#4B2C20]">
        {/* Top Controls: Language Switcher and Close Button */}
        <div className="absolute top-5 left-5 flex items-center bg-white border border-[#E8DFD8] rounded-lg p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => handleToggleLang('es')}
            className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${
              activeLang === 'es'
                ? 'bg-[#4B2C20] text-[#FAF7F2] shadow-xs'
                : 'text-[#4B2C20]/60 hover:text-[#4B2C20]'
            }`}
            aria-label="Español"
          >
            ES
          </button>
          <span className="text-xs text-[#E8DFD8] px-0.5">|</span>
          <button
            type="button"
            onClick={() => handleToggleLang('en')}
            className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${
              activeLang === 'en'
                ? 'bg-[#4B2C20] text-[#FAF7F2] shadow-xs'
                : 'text-[#4B2C20]/60 hover:text-[#4B2C20]'
            }`}
            aria-label="English"
          >
            EN
          </button>
        </div>

        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-neutral-400 hover:text-[#4B2C20] hover:bg-[#F5EFE6] transition-colors"
          aria-label={t.cancel}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center mb-6 pt-3">
          <div className="w-14 h-14 bg-[#4B2C20] text-[#FAF7F2] rounded-2xl flex items-center justify-center mb-4 shadow-md">
            <Lock className="w-7 h-7 text-[#D4A373]" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4A373] mb-1">
            {t.restrictedAccess}
          </span>
          <h2 className="text-2xl font-serif font-bold text-[#4B2C20]">
            {t.loginTitle}
          </h2>
          <p className="text-xs text-[#4B2C20]/70 font-light mt-1 max-w-xs">
            {t.loginSubtitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#4B2C20]/80 mb-2">
              {t.passcodeLabel}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder={t.passcodePlaceholder}
                autoFocus
                className="w-full pl-10 pr-4 py-3 bg-white border border-[#E8DFD8] rounded-xl text-[#4B2C20] text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A373] shadow-xs"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-[#E8DFD8] rounded-xl text-xs font-bold uppercase tracking-wider text-[#4B2C20]/70 hover:bg-[#F5EFE6] transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={isLoading || !passcode.trim()}
              className="flex-1 py-3 bg-[#4B2C20] text-[#FAF7F2] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#3E2723] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#D4A373]" />
                  <span>{t.verifying}</span>
                </>
              ) : (
                <span>{t.signIn}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
