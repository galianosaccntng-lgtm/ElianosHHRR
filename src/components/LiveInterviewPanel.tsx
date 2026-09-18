import React, { useState, useEffect, useRef } from 'react';
import { mapLiveStateToScores } from '../patch';
import { InterviewSession, LiveInterviewState, SecondInterviewBlock } from '../types';
import { Mic, Square, Pause, AlertCircle, Play, CheckCircle2, Circle, Loader2, RotateCcw } from 'lucide-react';
import { adminI18n, AdminLang } from '../i18n-admin';

export function LiveInterviewPanel({ 
  session, 
  adminToken,
  lang = 'es',
  onStateUpdate,
  onDumpScores
}: { 
  session: InterviewSession; 
  adminToken: string;
  lang?: AdminLang;
  onStateUpdate: () => void;
  onDumpScores: (scores: Record<string, number>) => void;
}) {
  const t = adminI18n[lang];
  const guide = session.secondInterviewGuide;
  const [liveState, setLiveState] = useState(session.liveInterview);
  const liveStateRef = useRef(liveState);
  
  useEffect(() => {
    setLiveState(session.liveInterview);
    liveStateRef.current = session.liveInterview;
    setHasConsent(!!session.liveInterview?.consentConfirmedAt);
  }, [session.id, session.liveInterview]);

  useEffect(() => {
    if (transcriptScrollRef.current) {
      const el = transcriptScrollRef.current;
      // Auto-scroll if already near bottom or always to ensure it stays in view.
      // A simple auto-scroll to bottom is acceptable per requirements.
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [liveState?.transcript]);

  const updateLocalState = (newState: LiveInterviewState) => {
    setLiveState(newState);
    liveStateRef.current = newState;
  };

  const [hasConsent, setHasConsent] = useState(!!liveState?.consentConfirmedAt);
  const [showConsentModal, setShowConsentModal] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [probingBlockId, setProbingBlockId] = useState<string | null>(null);
  const [probingLoading, setProbingLoading] = useState(false);
  const [probingQuestions, setProbingQuestions] = useState<any[] | null>(null);
  
  const fetchProbeQuestions = async (blockId: string) => {
    if (probingBlockId === blockId) {
      setProbingBlockId(null);
      setProbingQuestions(null);
      return;
    }
    setProbingBlockId(blockId);
    setProbingLoading(true);
    setProbingQuestions(null);
    try {
      const res = await fetch(`/api/admin/sessions/${session.id}/live-interview/probe-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminToken
        },
        body: JSON.stringify({ blockId, uiLanguage: lang })
      });
      const data = await res.json();
      if (data.success && data.questions) {
        setProbingQuestions(data.questions);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProbingLoading(false);
    }
  };

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const cycleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const handleConsent = async () => {
    setShowConsentModal(false);
    setHasConsent(true);
    // Push consent to server
    try {
      await fetch(`/api/admin/sessions/${session.id}/live-interview/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminToken
        },
        body: JSON.stringify({
          consentConfirmedAt: new Date().toISOString(),
          uiLanguage: lang
        })
      });
      onStateUpdate();
      startRecording();
    } catch (e) {
      console.error(e);
    }
  };

  const getSupportedMimeType = () => {
    const types = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus'];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  };

  const startRecorderCycle = () => {
    if (!streamRef.current) return;
    
    const mimeType = getSupportedMimeType();
    if (!mimeType) {
       alert(t.liveAudioNotSupported);
       return;
    }

    const options = { mimeType };
    const recorder = new MediaRecorder(streamRef.current, options);
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        analyzeChunk(e.data);
      }
    };

    recorder.start();
    mediaRecorderRef.current = recorder;

    cycleTimerRef.current = setTimeout(() => {
       if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
           mediaRecorderRef.current.stop(); // Emits ondataavailable with full chunk
           startRecorderCycle();
       }
    }, 12000);
  };

  const startRecording = async () => {
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      
      startRecorderCycle();

      setIsRecording(true);
      setIsPaused(false);
      
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setTimeElapsed(prev => prev + 1);
        }, 1000);
      }
    } catch (err) {
      alert(t.liveMicError);
      console.error(err);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
      setIsPaused(true);
    } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      // Resume the cycle. We don't know exactly how much time is left, but we can just restart a 25s timer or shorter.
      cycleTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          startRecorderCycle();
        }
      }, 12000);
      setIsPaused(false);
    }
  };

  const stopRecording = async () => {
    if (cycleTimerRef.current) {
      clearTimeout(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Final save
    try {
      const res = await fetch(`/api/admin/sessions/${session.id}/live-interview/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminToken
        },
        body: JSON.stringify({
          isFinal: true,
          uiLanguage: lang
        })
      });
      const data = await res.json();
      if (data.success && data.liveInterview) {
        updateLocalState(data.liveInterview);
      }
      onStateUpdate();
    } catch (e) {
      console.error(e);
    }
  };

  const analyzeChunk = async (blob: Blob) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64data = reader.result as string;
      try {
        const res = await fetch(`/api/admin/sessions/${session.id}/live-interview/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-passcode': adminToken
          },
          body: JSON.stringify({
            audioData: base64data,
            mimeType: blob.type,
            uiLanguage: lang
          })
        });
        const data = await res.json();
        if (data.success && data.liveInterview) {
          updateLocalState(data.liveInterview);
        }
      } catch (e) {
        console.error("Failed to analyze chunk", e);
      }
    };
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const [isResetting, setIsResetting] = useState(false);

  const handleResetInterview = async () => {
    if (!window.confirm(t.liveInterviewResetConfirm)) {
      return;
    }

    setIsResetting(true);
    try {
      // 1. Stop recording and release mic if active
      if (cycleTimerRef.current) {
        clearTimeout(cycleTimerRef.current);
        cycleTimerRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          console.warn("Could not stop media recorder:", e);
        }
        mediaRecorderRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // 2. Clear all local state
      setIsRecording(false);
      setIsPaused(false);
      setTimeElapsed(0);
      setHasConsent(false);
      setShowConsentModal(false);
      setProbingBlockId(null);
      setProbingQuestions(null);
      setProbingLoading(false);
      setLiveState(undefined);
      liveStateRef.current = undefined;

      // 3. Clear persisted live interview on server
      await fetch(`/api/admin/sessions/${session.id}/live-interview`, {
        method: 'DELETE',
        headers: {
          'x-admin-passcode': adminToken
        }
      });

      // 4. Update parent
      onStateUpdate();
    } catch (err) {
      console.error("Error resetting live interview:", err);
    } finally {
      setIsResetting(false);
    }
  };

  const hasLiveContent = isRecording || 
    !!liveState?.transcript || 
    !!liveState?.startedAt || 
    !!liveState?.endedAt || 
    !!liveState?.consentConfirmedAt || 
    (liveState?.blockStatus && Object.keys(liveState.blockStatus).length > 0) ||
    !!session.liveInterview;

  if (!guide) return null;

  return (
    <div className="bg-white border-2 border-purple-200 rounded-3xl p-6 mb-8 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-purple-100 to-transparent opacity-50 pointer-events-none rounded-bl-full"></div>
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 relative z-10">
        <div>
          <h3 className="text-xl font-serif font-bold text-purple-900 flex items-center gap-2">
            <Mic className="w-5 h-5" /> {t.liveInterviewTitle}
          </h3>
          <p className="text-sm text-purple-700/80 font-medium">{t.liveInterviewSubtitle}</p>
        </div>
        
        <div className="flex items-center gap-3">
          {(!liveState?.endedAt) ? (
            !isRecording ? (
              <button 
                onClick={() => hasConsent ? startRecording() : setShowConsentModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-xs transition-colors"
              >
                <Play className="w-4 h-4 fill-current" /> {t.liveInterviewStart}
              </button>
            ) : (
              <>
                <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 rounded-lg border border-purple-100">
                  <div className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-red-500 animate-pulse'}`}></div>
                  <span className="font-mono text-sm font-bold text-purple-900">{formatTime(timeElapsed)}</span>
                </div>
                <button 
                  onClick={pauseRecording}
                  className="p-2.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl transition-colors"
                  title={isPaused ? t.liveInterviewResume : t.liveInterviewPause}
                >
                  {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
                </button>
                <button 
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-900 rounded-xl font-bold transition-colors"
                >
                  <Square className="w-4 h-4 fill-current" /> {t.liveInterviewStopSave}
                </button>
              </>
            )
          ) : (
            <div className="flex gap-2 items-center">
              <span className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded-lg border text-sm">
                {t.liveInterviewEnded}
              </span>
              <button
                onClick={() => {
                  const scores = mapLiveStateToScores(liveState, guide.blocks);
                  onDumpScores(scores);
                }}
                className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold rounded-lg transition-colors text-sm"
              >
                {t.liveInterviewDumpScores}
              </button>
            </div>
          )}

          {hasLiveContent && (
            <button
              onClick={handleResetInterview}
              disabled={isResetting}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200/80 rounded-xl text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
              title={t.liveInterviewResetBtn}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              {t.liveInterviewResetBtn}
            </button>
          )}
        </div>
      </div>

      {(liveState || isRecording) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
          
          {/* Zona 1: Transcripción */}
          <div className="lg:col-span-1 bg-purple-50/50 rounded-2xl border border-purple-100 p-4 flex flex-col h-[400px]">
            <h4 className="font-bold text-purple-900 text-xs tracking-widest uppercase mb-3">{t.liveTranscriptTitle}</h4>
            <div ref={transcriptScrollRef} className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {liveState?.transcript ? (
                liveState.transcript.split('\n\n').map((para, i) => (
                  <p key={i} className="text-sm text-gray-800 leading-relaxed bg-white p-3 rounded-xl shadow-sm border border-purple-50">{para}</p>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-purple-300 text-sm font-medium">
                  {t.liveWaitingAudio}
                </div>
              )}
            </div>
          </div>

          {/* Zona 2: Estado de Bloques */}
          <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 p-4 h-[400px] overflow-y-auto">
            <h4 className="font-bold text-gray-900 text-xs tracking-widest uppercase mb-3">{t.liveGuideStatusTitle}</h4>
            <div className="space-y-4">
              {guide.blocks.map(b => {
                const status = liveState?.blockStatus?.[b.id];
                const colorClass = status?.status === 'covered' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
                                   status?.status === 'partial' ? 'text-amber-600 bg-amber-50 border-amber-200' :
                                   'text-gray-400 border-gray-100';
                
                const rating = status?.liveRating;
                const isNotApproved = (b.mustPass && (rating == null || rating < 4)) || (status?.status !== 'covered');
                return (
                  <div key={b.id} className={`p-3 rounded-xl border ${colorClass} transition-colors`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-sm leading-tight pr-2">{b.title}</span>
                      {status?.status === 'covered' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Circle className="w-4 h-4 shrink-0" />}
                    </div>
                    {b.mustPass && <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-white/60 rounded">Must-Pass</span>}
                    {status && (
                      <div className="mt-2 space-y-2">
                        <div className="text-xs opacity-90 leading-tight">
                          <span className="font-bold block mb-1">{t.liveConfidenceLabel} {status.confidence}%</span>
                          <p className="mt-1">{status.evidence}</p>
                          {status.reasoning && (
                            <p className="mt-1.5"><span className="font-bold">{t.liveReasoningLabel}</span> {status.reasoning}</p>
                          )}
                          {status.gaps && (
                            <div className={`mt-1.5 p-2 rounded-lg ${isNotApproved && b.mustPass ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-gray-50 border border-gray-200'}`}>
                              <span className="font-bold">{t.liveGapsLabel}</span> {Array.isArray(status.gaps) ? status.gaps.join(" ") : status.gaps}
                            </div>
                          )}
                        </div>
                        <div className="pt-2 border-t border-current/10">
                          <span className="text-[10px] uppercase tracking-wider font-bold opacity-80 block mb-1">Live Rating</span>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(ratingItem => (
                              <div
                                key={ratingItem}
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  status.liveRating === ratingItem
                                    ? 'bg-current text-white scale-110'
                                    : 'bg-white/50 border border-current/20 opacity-50'
                                }`}
                              >
                                {ratingItem}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {isNotApproved && (
                      <div 
                        className="mt-3 pt-2 border-t border-current/10 cursor-pointer flex items-center justify-center text-xs font-bold opacity-70 hover:opacity-100 transition-opacity"
                        onClick={() => fetchProbeQuestions(b.id)}
                      >
                        <span>{t.liveProbeQuestionsBtn}</span>
                      </div>
                    )}
                    {probingBlockId === b.id && (
                      <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-left">
                        <div className="flex justify-between items-center mb-2">
                          <h5 className="font-bold text-indigo-900 text-xs uppercase tracking-wider">{t.liveProbeQuestionsTitle}</h5>
                          <button onClick={() => setProbingBlockId(null)} className="text-indigo-500 hover:text-indigo-900"><Square className="w-4 h-4" /></button>
                        </div>
                        {probingLoading ? (
                          <div className="flex items-center justify-center p-4">
                            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                          </div>
                        ) : probingQuestions ? (
                          <div className="space-y-3">
                            {probingQuestions.map((q, idx) => {
                              const primary = lang === 'en' ? (q.en || q.es) : (q.es || q.en);
                              const secondary = lang === 'en' ? (q.en ? q.es : '') : (q.es ? q.en : '');
                              return (
                                <div key={idx} className="text-xs">
                                  <p className="font-bold text-indigo-900">{primary}</p>
                                  {secondary && <p className="italic text-indigo-700 mt-0.5">{secondary}</p>}
                                  {q.rationale && <p className="mt-1 text-indigo-800/80 leading-tight border-l-2 border-indigo-200 pl-2">{q.rationale}</p>}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-indigo-500">{t.liveProbeQuestionsError}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Zona 3: Sugerencias */}
          <div className="lg:col-span-1 bg-blue-50/50 rounded-2xl border border-blue-100 p-4 h-[400px] overflow-y-auto">
             <h4 className="font-bold text-blue-900 text-xs tracking-widest uppercase mb-3">{t.liveSuggestionsTitle}</h4>
             {liveState?.languageNote && (
               <div className="mb-4 p-3 bg-amber-100/50 border border-amber-200 rounded-xl text-amber-900 text-sm flex items-start gap-2">
                 <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                 <p>{liveState.languageNote}</p>
               </div>
             )}
             <div className="space-y-3">
               {liveState?.suggestions && liveState.suggestions.length > 0 ? (
                 liveState.suggestions.map((s, i) => (
                   <div key={i} className={`p-3 rounded-xl shadow-sm border ${s.isFlag ? 'bg-red-50 border-red-100 text-red-900' : 'bg-white border-blue-100 text-blue-900'}`}>
                     <p className="text-sm font-medium leading-relaxed">{s.text}</p>
                   </div>
                 ))
               ) : (
                 <div className="h-full flex items-center justify-center text-blue-300 text-sm font-medium">
                   {t.liveListeningForSuggestions}
                 </div>
               )}
             </div>
          </div>

        </div>
      )}

      {/* Consent Modal */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border-4 border-purple-500/20">
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-4">{t.liveConsentTitle}</h2>
            <p className="text-gray-600 mb-6 leading-relaxed">
              {t.liveConsentNotice}
            </p>
            <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer mb-8 hover:bg-purple-50 transition-colors">
              <input type="checkbox" id="consentCheckbox" className="mt-1 w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
              <span className="text-sm font-medium text-gray-800 leading-snug">
                {t.liveConsentCheckLabel}
              </span>
            </label>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowConsentModal(false)}
                className="px-5 py-2.5 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition-colors"
              >
                {t.liveConsentCancel}
              </button>
              <button 
                onClick={() => {
                  const cb = document.getElementById('consentCheckbox') as HTMLInputElement;
                  if (cb && cb.checked) {
                    handleConsent();
                  } else {
                    alert(t.liveConsentAlert);
                  }
                }}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors"
              >
                {t.liveConsentConfirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
