import React, { useState, useEffect, useRef } from 'react';
import { mapLiveStateToScores } from '../patch';
import { InterviewSession, LiveInterviewState, SecondInterviewBlock, LiveInterviewFinalEvaluation } from '../types';
import { Mic, Square, Pause, AlertCircle, Play, CheckCircle2, Circle, Loader2, RotateCcw, Sparkles, Copy, Check, Printer, AlertTriangle, XCircle, Star } from 'lucide-react';
import { adminI18n, AdminLang } from '../i18n-admin';

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatFinalEvaluationAsText(evalData: LiveInterviewFinalEvaluation, candidateName: string, position: string, t: any): string {
  let text = `=== ${t.liveFinalEvalTitle.toUpperCase()} ===\n`;
  text += `${candidateName} — ${position}\n`;
  text += `${t.liveFinalEvalGeneratedAt}: ${new Date(evalData.generatedAt).toLocaleString()}\n\n`;
  text += `* ${t.liveFinalEvalOverallScore}: ${evalData.overallRating} / 5\n`;
  text += `* ${t.liveFinalEvalRecommendation}: ${evalData.recommendation.toUpperCase()}\n\n`;

  text += `--- ${t.liveFinalEvalNarrative.toUpperCase()} ---\n`;
  text += `${evalData.narrative}\n\n`;

  text += `--- ${t.liveFinalEvalStrengths.toUpperCase()} ---\n`;
  evalData.strengths.forEach((s) => { text += `• ${s}\n`; });
  text += `\n`;

  text += `--- ${t.liveFinalEvalConcerns.toUpperCase()} ---\n`;
  evalData.concerns.forEach((c) => { text += `• ${c}\n`; });
  text += `\n`;

  text += `--- ${t.liveFinalEvalBlockBreakdown.toUpperCase()} ---\n`;
  evalData.blockSummary.forEach((b) => {
    const status = b.passed ? t.liveFinalEvalPassedBadge : t.liveFinalEvalNotPassedBadge;
    const rating = b.rating ? `${b.rating}/5` : '—';
    text += `[${status}] ${b.title} (${rating}): ${b.notes}\n`;
  });
  text += `\n`;

  text += `[${t.liveFinalEvalDisclaimer}]\n`;
  return text;
}

function generatePrintableFinalEvaluationHtml(
  evalData: LiveInterviewFinalEvaluation,
  candidateName: string,
  position: string,
  t: any
): string {
  const recColors: Record<string, { bg: string; text: string; border: string }> = {
    'Hire': { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0' },
    'Second Interview': { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
    'Do Not Hire': { bg: '#fff1f2', text: '#9f1239', border: '#fecdd3' }
  };
  const color = recColors[evalData.recommendation] || recColors['Second Interview'];

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(t.liveFinalEvalTitle)} - ${escapeHtml(candidateName)}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      color: #1e293b;
      margin: 24px;
      font-size: 13px;
    }
    .header {
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .brand { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #4338ca; }
    h1 { margin: 4px 0 8px 0; font-size: 22px; color: #0f172a; }
    .meta { font-size: 12px; color: #64748b; }
    .badges {
      display: flex;
      gap: 16px;
      margin: 16px 0;
    }
    .rec-box {
      background: ${color.bg};
      color: ${color.text};
      border: 1px solid ${color.border};
      padding: 10px 16px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 14px;
    }
    .score-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 10px 16px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 14px;
    }
    h2 {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #334155;
      margin-top: 20px;
      margin-bottom: 8px;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 4px;
    }
    ul { margin: 4px 0 16px 20px; padding: 0; }
    li { margin-bottom: 4px; }
    .block-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 20px 0;
    }
    .block-table th, .block-table td {
      border: 1px solid #e2e8f0;
      padding: 8px 10px;
      text-align: left;
      font-size: 12px;
    }
    .block-table th { background: #f8fafc; font-weight: 600; }
    .narrative {
      background: #f8fafc;
      border-left: 4px solid #4338ca;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .disclaimer {
      font-size: 11px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
      margin-top: 24px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">Ellianos Coffee — Lehigh Acres, FL</div>
    <h1>${escapeHtml(t.liveFinalEvalTitle)}</h1>
    <div class="meta">
      <strong>${escapeHtml(candidateName)}</strong> · ${escapeHtml(position)} · ${escapeHtml(t.liveFinalEvalGeneratedAt)}: ${new Date(evalData.generatedAt).toLocaleString()}
    </div>
  </div>

  <div class="badges">
    <div class="rec-box">${escapeHtml(t.liveFinalEvalRecommendation)}: ${escapeHtml(evalData.recommendation)}</div>
    <div class="score-box">${escapeHtml(t.liveFinalEvalOverallScore)}: ${evalData.overallRating} / 5</div>
  </div>

  <h2>${escapeHtml(t.liveFinalEvalNarrative)}</h2>
  <div class="narrative">${escapeHtml(evalData.narrative)}</div>

  <h2>${escapeHtml(t.liveFinalEvalStrengths)}</h2>
  <ul>
    ${evalData.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
  </ul>

  <h2>${escapeHtml(t.liveFinalEvalConcerns)}</h2>
  <ul>
    ${evalData.concerns.map(c => `<li>${escapeHtml(c)}</li>`).join('')}
  </ul>

  <h2>${escapeHtml(t.liveFinalEvalBlockBreakdown)}</h2>
  <table class="block-table">
    <thead>
      <tr>
        <th>Bloque</th>
        <th>Estado</th>
        <th>Calificación</th>
        <th>Notas</th>
      </tr>
    </thead>
    <tbody>
      ${evalData.blockSummary.map(b => `
        <tr>
          <td><strong>${escapeHtml(b.title)}</strong></td>
          <td>${b.passed ? '<span style="color:#059669;font-weight:600;">' + escapeHtml(t.liveFinalEvalPassedBadge) + '</span>' : '<span style="color:#e11d48;font-weight:600;">' + escapeHtml(t.liveFinalEvalNotPassedBadge) + '</span>'}</td>
          <td>${b.rating ? b.rating + '/5' : '—'}</td>
          <td>${escapeHtml(b.notes)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="disclaimer">${escapeHtml(t.liveFinalEvalDisclaimer)}</div>
</body>
</html>`;
}

export function LiveInterviewPanel({ 
  session, 
  adminToken,
  lang = 'es',
  onStateUpdate,
  onReset,
  onDumpScores
}: { 
  session: InterviewSession; 
  adminToken: string;
  lang?: AdminLang;
  onStateUpdate: () => void;
  onReset?: () => void;
  onDumpScores: (scores: Record<string, number>) => void;
}) {
  const t = adminI18n[lang];
  const guide = session.secondInterviewGuide;
  const [liveState, setLiveState] = useState(session.liveInterview);
  const liveStateRef = useRef(liveState);
  const isResettingRef = useRef(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [justChanged, setJustChanged] = useState(false);
  const prevQuestionRef = useRef<string | null>(null);

  const [isGeneratingFinalEval, setIsGeneratingFinalEval] = useState(false);
  const [copiedFinalEval, setCopiedFinalEval] = useState(false);
  const [finalEvalError, setFinalEvalError] = useState<string | null>(null);

  const handleGenerateFinalEvaluation = async () => {
    const transcriptText = liveState?.transcript?.trim();
    if (!transcriptText) {
      alert(t.liveFinalEvalNoTranscriptAlert);
      return;
    }

    if (liveState?.finalEvaluation) {
      const confirmed = window.confirm(t.liveFinalEvalRegenerateConfirm);
      if (!confirmed) return;
    }

    setIsGeneratingFinalEval(true);
    setFinalEvalError(null);

    try {
      const res = await fetch(`/api/admin/sessions/${session.id}/live-interview/final-evaluation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminToken
        },
        body: JSON.stringify({ uiLanguage: lang })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || t.liveFinalEvalError);
      }

      if (data.finalEvaluation) {
        const updatedLiveState = {
          ...(liveStateRef.current || { blockStatus: {}, suggestions: [], transcript: '' }),
          finalEvaluation: data.finalEvaluation,
          updatedAt: new Date().toISOString()
        };
        setLiveState(updatedLiveState);
        liveStateRef.current = updatedLiveState;
        onStateUpdate();
      }
    } catch (err: any) {
      console.error("Error generating final evaluation:", err);
      setFinalEvalError(err.message || t.liveFinalEvalError);
    } finally {
      setIsGeneratingFinalEval(false);
    }
  };

  const handleCopyFinalEvaluation = () => {
    if (!liveState?.finalEvaluation) return;
    const candidateName = session.candidateInfo?.name || t.unnamedApplicant || 'Candidate';
    const candidatePosition = session.position || 'Barista';
    const text = formatFinalEvaluationAsText(liveState.finalEvaluation, candidateName, candidatePosition, t);
    navigator.clipboard.writeText(text);
    setCopiedFinalEval(true);
    setTimeout(() => setCopiedFinalEval(false), 2000);
  };

  const handlePrintFinalEvaluation = () => {
    if (!liveState?.finalEvaluation) return;
    const candidateName = session.candidateInfo?.name || t.unnamedApplicant || 'Candidate';
    const candidatePosition = session.position || 'Barista';
    const htmlContent = generatePrintableFinalEvaluationHtml(liveState.finalEvaluation, candidateName, candidatePosition, t);

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 350);
    }
  };

  useEffect(() => {
    const currentQ = liveState?.activeSuggestion?.exactQuestion;
    if (prevQuestionRef.current && currentQ && prevQuestionRef.current !== currentQ) {
      setJustChanged(true);
      const timer = setTimeout(() => setJustChanged(false), 2500);
      return () => clearTimeout(timer);
    }
    if (currentQ) {
      prevQuestionRef.current = currentQ;
    }
  }, [liveState?.activeSuggestion?.exactQuestion]);
  
  useEffect(() => {
    if (isResettingRef.current) return;
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
    if (isResettingRef.current) return;
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
          activeSuggestion: liveStateRef.current?.activeSuggestion || liveState?.activeSuggestion || null,
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
    if (isResettingRef.current) return;
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      if (isResettingRef.current) return;
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
            activeSuggestion: liveStateRef.current?.activeSuggestion || liveState?.activeSuggestion || null,
            uiLanguage: lang
          })
        });
        if (isResettingRef.current) return;
        const data = await res.json();
        if (data.success && data.liveInterview && !isResettingRef.current) {
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

  const handleResetInterview = () => {
    setShowResetModal(true);
  };

  const confirmResetInterview = async () => {
    setIsResetting(true);
    isResettingRef.current = true;
    try {
      // 1. Stop timers
      if (cycleTimerRef.current) {
        clearTimeout(cycleTimerRef.current);
        cycleTimerRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // 2. Disconnect and stop media recorder safely
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        if (mediaRecorderRef.current.state !== 'inactive') {
          try {
            mediaRecorderRef.current.stop();
          } catch (e) {
            console.warn("Could not stop media recorder:", e);
          }
        }
        mediaRecorderRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // 3. Clear all local state
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

      // 4. Update parent in-memory state and localStorage immediately
      if (onReset) {
        onReset();
      }

      // 5. Clear persisted live interview on server
      await fetch(`/api/admin/sessions/${session.id}/live-interview`, {
        method: 'DELETE',
        headers: {
          'x-admin-passcode': adminToken
        }
      });

      // 6. Close modal
      setShowResetModal(false);

      // 7. Trigger parent refresh
      onStateUpdate();
    } catch (err) {
      console.error("Error resetting live interview:", err);
    } finally {
      setIsResetting(false);
      setTimeout(() => {
        isResettingRef.current = false;
      }, 500);
    }
  };

  const hasLiveContent = isRecording || 
    !!liveState?.transcript || 
    !!liveState?.startedAt || 
    !!liveState?.endedAt || 
    !!liveState?.consentConfirmedAt || 
    (liveState?.blockStatus && Object.keys(liveState.blockStatus).length > 0) ||
    !!session.liveInterview;

  const hasTranscript = !!liveState?.transcript?.trim();

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
        
        <div className="flex items-center gap-3 flex-wrap">
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

          {/* AI Final Evaluation Button */}
          <button
            onClick={handleGenerateFinalEvaluation}
            disabled={isGeneratingFinalEval}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs ${
              !hasTranscript
                ? 'bg-purple-100/70 text-purple-400 hover:bg-purple-100 border border-purple-200/60'
                : liveState?.finalEvaluation
                  ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-purple-500/20'
            }`}
            title={!hasTranscript ? t.liveFinalEvalNoTranscriptAlert : (liveState?.finalEvaluation ? t.liveFinalEvalRegenerateBtn : t.liveFinalEvalBtn)}
          >
            {isGeneratingFinalEval ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t.liveFinalEvalGenerating}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-current" />
                <span>{liveState?.finalEvaluation ? t.liveFinalEvalRegenerateBtn : t.liveFinalEvalBtn}</span>
              </>
            )}
          </button>

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
                const isSettled = !!status?.settled;
                const isCovered = status?.status === 'covered';
                const isPartial = status?.status === 'partial';

                const colorClass = isSettled 
                  ? 'text-slate-600 bg-slate-50/80 border-slate-300/80 opacity-80'
                  : isCovered 
                    ? 'text-emerald-600 bg-emerald-50 border-emerald-200' 
                    : isPartial 
                      ? 'text-amber-600 bg-amber-50 border-amber-200' 
                      : 'text-gray-400 border-gray-100';
                
                const rating = status?.liveRating;
                const isNotApproved = !isSettled && ((b.mustPass && (rating == null || rating < 4)) || (!isCovered));

                return (
                  <div key={b.id} className={`p-3 rounded-xl border ${colorClass} transition-colors`}>
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap pr-2">
                        <span className="font-bold text-sm leading-tight text-gray-900">{b.title}</span>
                        {isSettled && (
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">
                            {t.liveClosedLabel}
                          </span>
                        )}
                        {status?.probeAttempts && status.probeAttempts > 0 ? (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {t.liveAttemptLabel} {status.probeAttempts}/2
                          </span>
                        ) : null}
                      </div>
                      {isCovered ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                      ) : isSettled ? (
                        <Circle className="w-4 h-4 shrink-0 text-slate-400 fill-slate-200" />
                      ) : (
                        <Circle className="w-4 h-4 shrink-0 text-gray-400" />
                      )}
                    </div>
                    {b.mustPass && <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-white/60 rounded border border-gray-200/50">Must-Pass</span>}
                    {status && (
                      <div className="mt-2 space-y-2">
                        <div className="text-xs opacity-90 leading-tight">
                          <span className="font-bold block mb-1 text-slate-800">{t.liveConfidenceLabel} {status.confidence}%</span>
                          <p className="mt-1 text-slate-700">{status.evidence}</p>
                          {status.reasoning && (
                            <p className="mt-1.5 text-slate-700"><span className="font-bold">{t.liveReasoningLabel}</span> {status.reasoning}</p>
                          )}
                          {status.gaps && (
                            <div className={`mt-1.5 p-2 rounded-lg ${isNotApproved && b.mustPass ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-gray-50 border border-gray-200 text-gray-700'}`}>
                              <span className="font-bold">{t.liveGapsLabel}</span> {Array.isArray(status.gaps) ? status.gaps.join(" ") : status.gaps}
                            </div>
                          )}
                        </div>
                        <div className="pt-2 border-t border-current/10">
                          <span className="text-[10px] uppercase tracking-wider font-bold opacity-80 block mb-1">
                            Live Rating {isSettled ? `(${t.liveClosedLabel})` : ''}
                          </span>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(ratingItem => (
                              <div
                                key={ratingItem}
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  status.liveRating === ratingItem
                                    ? 'bg-slate-900 text-white scale-110 shadow-xs'
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
               {(() => {
                 const active = liveState?.activeSuggestion || (
                   liveState?.suggestions?.find(s => s.exactQuestion) ? {
                     exactQuestion: liveState.suggestions.find(s => s.exactQuestion)!.exactQuestion!,
                     text: liveState.suggestions.find(s => s.exactQuestion)!.text,
                     blockId: liveState.suggestions.find(s => s.exactQuestion)!.relatedBlockId || '',
                     attempt: liveState.suggestions.find(s => s.exactQuestion)!.attempt || 1
                   } : null
                 );
                 const secondarySuggestions = (liveState?.suggestions || []).filter(s => 
                   !active || (s.exactQuestion !== active.exactQuestion && s.text !== active.text)
                 );

                 const relatedBlock = active?.blockId 
                   ? guide.blocks.find(b => b.id === active.blockId) 
                   : undefined;

                 if (!active && secondarySuggestions.length === 0) {
                   return (
                     <div className="h-full min-h-[220px] flex items-center justify-center text-blue-300 text-sm font-medium">
                       {t.liveListeningForSuggestions}
                     </div>
                   );
                 }

                 return (
                   <div className="space-y-4">
                     {/* Active Question - Highlighted and Stable */}
                     {active && (
                       <div 
                         className={`p-4 rounded-2xl border transition-all duration-300 ${
                           justChanged 
                             ? 'bg-blue-100/90 border-blue-400 ring-2 ring-blue-400/40 shadow-md' 
                             : 'bg-white border-blue-200 text-blue-950 shadow-xs ring-1 ring-blue-400/20'
                         }`}
                       >
                         {/* Header badges: Question to ask, Attempt & Block */}
                         <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                           <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-600 text-white shadow-2xs">
                             {t.liveQuestionToAskLabel}
                           </span>
                           {active.attempt && (
                             <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                               active.attempt === 2 
                                 ? 'bg-amber-100 text-amber-800 border border-amber-300/80' 
                                 : 'bg-indigo-100 text-indigo-800 border border-indigo-200/80'
                             }`}>
                               {t.liveAttemptLabel} {active.attempt}/2
                             </span>
                           )}
                           {relatedBlock && (
                             <span className="text-[11px] font-semibold text-slate-500 truncate max-w-[200px]" title={relatedBlock.title}>
                               • {relatedBlock.title}
                             </span>
                           )}
                         </div>

                         {/* Exact Question to Speak Out Loud */}
                         <div className="p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-xl mb-2 text-slate-950 font-serif text-sm md:text-base font-semibold leading-relaxed">
                           <span className="text-blue-500 font-sans mr-1.5 text-base select-none">“</span>
                           {active.exactQuestion}
                           <span className="text-blue-500 font-sans ml-1.5 text-base select-none">”</span>
                         </div>

                         {/* Discreet stability hint */}
                         <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mt-1 mb-1">
                           <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                           <span>{t.livePendingQuestionHint}</span>
                         </div>

                         {/* Context note if available */}
                         {active.text && (
                           <p className="text-xs text-slate-600 font-medium leading-relaxed mt-1">
                             {active.text}
                           </p>
                         )}
                       </div>
                     )}

                     {/* Secondary suggestions / flags */}
                     {secondarySuggestions.length > 0 && (
                       <div className="space-y-2 pt-2 border-t border-blue-100/80">
                         {secondarySuggestions.map((s, i) => (
                           <div 
                             key={i} 
                             className={`p-3 rounded-xl border text-xs leading-relaxed ${
                               s.isFlag 
                                 ? 'bg-rose-50 border-rose-200 text-rose-900 font-medium' 
                                 : 'bg-white/90 border-slate-200 text-slate-700 font-medium'
                             }`}
                           >
                             {s.text}
                           </div>
                         ))}
                       </div>
                     )}
                   </div>
                 );
               })()}
             </div>
          </div>

        </div>
      )}

      {/* Loading state for final evaluation */}
      {isGeneratingFinalEval && (
        <div className="mt-6 p-6 rounded-3xl bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border-2 border-indigo-200 flex flex-col items-center justify-center text-center animate-pulse relative z-10 shadow-sm">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
          <h4 className="font-bold text-indigo-950 text-base">{t.liveFinalEvalGenerating}</h4>
          <p className="text-xs text-indigo-700/90 mt-1 max-w-md">
            {t.liveFinalEvalSubtitle}
          </p>
        </div>
      )}

      {/* Error state */}
      {finalEvalError && !isGeneratingFinalEval && (
        <div className="mt-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{t.liveFinalEvalError}</p>
              <p className="text-xs text-rose-700 mt-0.5">{finalEvalError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGenerateFinalEvaluation}
            className="px-3 py-1.5 bg-rose-600 text-white font-bold rounded-xl text-xs hover:bg-rose-700 transition-colors shrink-0 shadow-xs"
          >
            {t.liveFinalEvalRegenerateBtn}
          </button>
        </div>
      )}

      {/* Display Final Evaluation Card */}
      {liveState?.finalEvaluation && !isGeneratingFinalEval && (
        <div className="mt-8 bg-gradient-to-b from-white to-slate-50 border-2 border-indigo-200 rounded-3xl p-6 md:p-8 shadow-md relative z-10">
          {/* Card Top / Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-indigo-100">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                  <Sparkles className="w-4 h-4" />
                </span>
                <h4 className="text-lg md:text-xl font-serif font-bold text-indigo-950">
                  {t.liveFinalEvalTitle}
                </h4>
              </div>
              <p className="text-xs text-indigo-700/80 font-medium">
                {t.liveFinalEvalSubtitle}
              </p>
              <span className="inline-block mt-1 text-[11px] text-slate-500 font-medium">
                {t.liveFinalEvalGeneratedAt} {new Date(liveState.finalEvaluation.generatedAt).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleCopyFinalEvaluation}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
                title={t.liveFinalEvalCopyBtn}
              >
                {copiedFinalEval ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">{t.liveFinalEvalCopied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>{t.liveFinalEvalCopyBtn}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePrintFinalEvaluation}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
                title={t.liveFinalEvalPrintBtn}
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span>{t.liveFinalEvalPrintBtn}</span>
              </button>

              <button
                type="button"
                onClick={handleGenerateFinalEvaluation}
                disabled={isGeneratingFinalEval}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                title={t.liveFinalEvalRegenerateBtn}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t.liveFinalEvalRegenerateBtn}</span>
              </button>
            </div>
          </div>

          {/* Metric Badges (Overall Score & Recommendation) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
            {/* Overall Rating */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  {t.liveFinalEvalOverallScore}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-900 leading-none">
                    {liveState.finalEvaluation.overallRating}
                  </span>
                  <span className="text-sm font-bold text-slate-400">/ 5</span>
                </div>
              </div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-5 h-5 ${
                      star <= liveState.finalEvaluation!.overallRating
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-200 fill-slate-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Recommendation */}
            {(() => {
              const rec = liveState.finalEvaluation.recommendation;
              let bg = 'bg-slate-50 text-slate-800 border-slate-200';
              let icon = <CheckCircle2 className="w-6 h-6 text-slate-600" />;

              if (rec === 'Hire') {
                bg = 'bg-emerald-50 text-emerald-900 border-emerald-300';
                icon = <CheckCircle2 className="w-6 h-6 text-emerald-600" />;
              } else if (rec === 'Second Interview') {
                bg = 'bg-amber-50 text-amber-900 border-amber-300';
                icon = <AlertCircle className="w-6 h-6 text-amber-600" />;
              } else if (rec === 'Do Not Hire') {
                bg = 'bg-rose-50 text-rose-900 border-rose-300';
                icon = <XCircle className="w-6 h-6 text-rose-600" />;
              }

              return (
                <div className={`p-4 rounded-2xl border shadow-xs flex items-center justify-between ${bg}`}>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider opacity-75 block mb-1">
                      {t.liveFinalEvalRecommendation}
                    </span>
                    <span className="text-xl font-bold tracking-tight">
                      {rec === 'Hire'
                        ? (lang === 'en' ? 'Hire' : 'Contratar')
                        : rec === 'Second Interview'
                          ? (lang === 'en' ? 'Second Interview' : 'Segunda Conversación')
                          : (lang === 'en' ? 'Do Not Hire' : 'No Contratar')}
                    </span>
                  </div>
                  <div>{icon}</div>
                </div>
              );
            })()}
          </div>

          {/* Narrative / Executive Summary */}
          {liveState.finalEvaluation.narrative && (
            <div className="mb-6 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                {t.liveFinalEvalNarrative}
              </h5>
              <p className="text-sm text-slate-800 leading-relaxed font-normal whitespace-pre-line">
                {liveState.finalEvaluation.narrative}
              </p>
            </div>
          )}

          {/* Strengths & Concerns Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Strengths */}
            <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200 shadow-xs">
              <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{t.liveFinalEvalStrengths}</span>
              </h5>
              {liveState.finalEvaluation.strengths.length > 0 ? (
                <ul className="space-y-2">
                  {liveState.finalEvaluation.strengths.map((st, idx) => (
                    <li key={idx} className="text-xs text-emerald-950 flex items-start gap-2 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0 mt-1.5"></span>
                      <span>{st}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400 italic">—</p>
              )}
            </div>

            {/* Concerns */}
            <div className="p-5 rounded-2xl bg-amber-50/50 border border-amber-200 shadow-xs">
              <h5 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>{t.liveFinalEvalConcerns}</span>
              </h5>
              {liveState.finalEvaluation.concerns.length > 0 ? (
                <ul className="space-y-2">
                  {liveState.finalEvaluation.concerns.map((co, idx) => (
                    <li key={idx} className="text-xs text-amber-950 flex items-start gap-2 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0 mt-1.5"></span>
                      <span>{co}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400 italic">—</p>
              )}
            </div>
          </div>

          {/* Block Breakdown */}
          {liveState.finalEvaluation.blockSummary.length > 0 && (
            <div className="mb-6 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                {t.liveFinalEvalBlockBreakdown}
              </h5>
              <div className="space-y-2.5">
                {liveState.finalEvaluation.blockSummary.map((b) => (
                  <div
                    key={b.blockId}
                    className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-xs text-slate-900">{b.title}</span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            b.passed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {b.passed ? t.liveFinalEvalPassedBadge : t.liveFinalEvalNotPassedBadge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        {b.notes}
                      </p>
                    </div>
                    {b.rating && (
                      <div className="shrink-0 flex items-center gap-1 self-start px-2 py-1 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-700">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                        <span>{b.rating}/5</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Human Decision Disclaimer */}
          <div className="pt-4 border-t border-slate-200/80 flex items-center gap-2 text-xs text-slate-500 italic">
            <AlertCircle className="w-4 h-4 shrink-0 text-slate-400" />
            <span>{t.liveFinalEvalDisclaimer}</span>
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
            <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer mb-6 hover:bg-purple-50 transition-colors">
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
                    const el = document.getElementById('consentCheckbox');
                    if (el) el.focus();
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

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-7 max-w-md w-full shadow-2xl border-2 border-rose-200">
            <div className="flex items-center gap-3 mb-4 text-rose-600">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-serif font-bold text-gray-900 leading-tight">
                  {t.liveInterviewResetTitle}
                </h3>
                <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider">
                  Acción destructiva
                </span>
              </div>
            </div>

            <p className="text-sm text-gray-600 leading-relaxed mb-6 bg-rose-50/50 p-3.5 rounded-2xl border border-rose-100">
              {t.liveInterviewResetConfirm}
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
                className="px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
              >
                {t.liveInterviewResetCancel}
              </button>
              <button
                type="button"
                onClick={confirmResetInterview}
                disabled={isResetting}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Reiniciando...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>{t.liveInterviewResetProceed}</span>
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
