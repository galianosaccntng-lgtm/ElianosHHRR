import React, { useState, useEffect, useRef } from 'react';
import { mapLiveStateToScores } from '../patch';
import { InterviewSession, LiveInterviewState, SecondInterviewBlock } from '../types';
import { Mic, Square, Pause, AlertCircle, Play, CheckCircle2, Circle, Loader2 } from 'lucide-react';

export function LiveInterviewPanel({ 
  session, 
  adminToken,
  onStateUpdate,
  onDumpScores
}: { 
  session: InterviewSession; 
  adminToken: string;
  onStateUpdate: () => void;
  onDumpScores: (scores: Record<string, number>) => void;
}) {
  const guide = session.secondInterviewGuide;
  const liveState = session.liveInterview;
  const [hasConsent, setHasConsent] = useState(!!liveState?.consentConfirmedAt);
  const [showConsentModal, setShowConsentModal] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
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
          consentConfirmedAt: new Date().toISOString()
        })
      });
      onStateUpdate();
      startRecording();
    } catch (e) {
      console.error(e);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm' };
      const recorder = new MediaRecorder(stream, options);
      
      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
          const chunk = e.data;
          // Analyze chunk immediately
          analyzeChunk(chunk);
        }
      };

      // Request data every 25 seconds
      recorder.start(25000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setIsPaused(false);
      
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setTimeElapsed(prev => prev + 1);
        }, 1000);
      }
    } catch (err) {
      alert("No se pudo acceder al micrófono. Por favor permite el acceso y reintenta.");
      console.error(err);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    setIsRecording(false);
    setIsPaused(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Final save
    try {
      await fetch(`/api/admin/sessions/${session.id}/live-interview/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminToken
        },
        body: JSON.stringify({
          isFinal: true
        })
      });
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
        await fetch(`/api/admin/sessions/${session.id}/live-interview/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-passcode': adminToken
          },
          body: JSON.stringify({
            audioData: base64data,
            mimeType: blob.type,
            accumulatedTranscript: session.liveInterview?.transcript,
            accumulatedBlockStatus: session.liveInterview?.blockStatus
          })
        });
        onStateUpdate();
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

  if (!guide) return null;

  return (
    <div className="bg-white border-2 border-purple-200 rounded-3xl p-6 mb-8 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-purple-100 to-transparent opacity-50 pointer-events-none rounded-bl-full"></div>
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 relative z-10">
        <div>
          <h3 className="text-xl font-serif font-bold text-purple-900 flex items-center gap-2">
            <Mic className="w-5 h-5" /> Entrevista en Vivo Asistida por IA
          </h3>
          <p className="text-sm text-purple-700/80 font-medium">Transcripción y sugerencias en tiempo real basadas en la guía</p>
        </div>
        
        <div className="flex items-center gap-3">
          {(!liveState?.endedAt) ? (
            !isRecording ? (
              <button 
                onClick={() => hasConsent ? startRecording() : setShowConsentModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-xs transition-colors"
              >
                <Play className="w-4 h-4 fill-current" /> Iniciar
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
                  title={isPaused ? "Reanudar" : "Pausar"}
                >
                  {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
                </button>
                <button 
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-900 rounded-xl font-bold transition-colors"
                >
                  <Square className="w-4 h-4 fill-current" /> Detener y Guardar
                </button>
              </>
            )
          ) : (
            <div className="flex gap-2 items-center">
              <span className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded-lg border text-sm">
                Entrevista Finalizada
              </span>
              <button
                onClick={() => {
                  const scores = mapLiveStateToScores(liveState, guide.blocks);
                  onDumpScores(scores);
                }}
                className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold rounded-lg transition-colors text-sm"
              >
                Volcar a puntuaciones
              </button>
            </div>
          )}
        </div>
      </div>

      {(liveState || isRecording) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
          
          {/* Zona 1: Transcripción */}
          <div className="lg:col-span-1 bg-purple-50/50 rounded-2xl border border-purple-100 p-4 flex flex-col h-[400px]">
            <h4 className="font-bold text-purple-900 text-xs tracking-widest uppercase mb-3">Transcripción en Vivo</h4>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {liveState?.transcript ? (
                liveState.transcript.split('\n\n').map((para, i) => (
                  <p key={i} className="text-sm text-gray-800 leading-relaxed bg-white p-3 rounded-xl shadow-sm border border-purple-50">{para}</p>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-purple-300 text-sm font-medium">
                  Esperando audio...
                </div>
              )}
            </div>
          </div>

          {/* Zona 2: Estado de Bloques */}
          <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 p-4 h-[400px] overflow-y-auto">
            <h4 className="font-bold text-gray-900 text-xs tracking-widest uppercase mb-3">Estado de la Guía</h4>
            <div className="space-y-4">
              {guide.blocks.map(b => {
                const status = liveState?.blockStatus?.[b.id];
                const colorClass = status?.status === 'covered' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
                                   status?.status === 'partial' ? 'text-amber-600 bg-amber-50 border-amber-200' :
                                   'text-gray-400 border-gray-100';
                
                return (
                  <div key={b.id} className={`p-3 rounded-xl border ${colorClass} transition-colors`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-sm leading-tight pr-2">{b.title}</span>
                      {status?.status === 'covered' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Circle className="w-4 h-4 shrink-0" />}
                    </div>
                    {b.mustPass && <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-white/60 rounded">Must-Pass</span>}
                    {status && (
                      <div className="mt-2 text-xs opacity-90 leading-tight">
                        <span className="font-bold">Confianza: {status.confidence}%</span>
                        <p className="mt-1">{status.evidence}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Zona 3: Sugerencias */}
          <div className="lg:col-span-1 bg-blue-50/50 rounded-2xl border border-blue-100 p-4 h-[400px] overflow-y-auto">
             <h4 className="font-bold text-blue-900 text-xs tracking-widest uppercase mb-3">Sugerencias (IA)</h4>
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
                   Escuchando para sugerir...
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
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-4">Consentimiento de Grabación</h2>
            <p className="text-gray-600 mb-6 leading-relaxed">
              La ley de Florida requiere el consentimiento de <strong>todas las partes</strong> para grabar audio. 
              La app escuchará y transcribirá la conversación para asistir en la evaluación. El audio no se almacena permanentemente.
            </p>
            <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer mb-8 hover:bg-purple-50 transition-colors">
              <input type="checkbox" id="consentCheckbox" className="mt-1 w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
              <span className="text-sm font-medium text-gray-800 leading-snug">
                Confirmo que he informado al candidato y he obtenido su consentimiento verbal para escuchar y transcribir esta entrevista.
              </span>
            </label>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowConsentModal(false)}
                className="px-5 py-2.5 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  const cb = document.getElementById('consentCheckbox') as HTMLInputElement;
                  if (cb && cb.checked) {
                    handleConsent();
                  } else {
                    alert("Debes confirmar la casilla para continuar.");
                  }
                }}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors"
              >
                Confirmar e Iniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
