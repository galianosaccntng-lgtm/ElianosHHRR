import React, { useState, useEffect, useRef } from 'react';
import { InterviewSession, InterviewStatus, SecondInterviewGuide, SecondInterviewScores } from '../types';
import { ArrowLeft, CheckCircle2, MessageSquare, ChevronRight, FileText, Trash2, Award, Copy, Check, ShieldCheck, LogOut, RefreshCw, Search, Mail, Phone, Loader2, AlertCircle, Clock, PlayCircle, ExternalLink, RotateCcw, Sparkles, Star, HelpCircle, Save } from 'lucide-react';
import clsx from 'clsx';
import Markdown from 'react-markdown';
import { humanConfidence } from '../authenticity';
import { adminI18n, AdminLang, getInitialAdminLang, setSavedAdminLang } from '../i18n-admin';

interface DashboardProps {
  adminToken: string | null;
  onBack: () => void;
  onLogout: () => void;
  onResume: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
  onSessionsUpdated?: (sessions: InterviewSession[]) => void;
}

const STORAGE_KEY = 'ellianos_candidate_sessions_v1';

export function formatGuideAsPlainText(guide: SecondInterviewGuide, lang: AdminLang = 'es'): string {
  const isEn = lang === 'en';
  let out = isEn ? `=== 2ND INTERVIEW GUIDE ===\n\n` : `=== GUÍA PARA SEGUNDA ENTREVISTA ===\n\n`;
  out += isEn ? `KEY FOCUS POINTS TO VERIFY:\n` : `PUNTOS DE ENFOQUE A VERIFICAR:\n`;
  (guide.focusPoints || []).forEach((pt, i) => {
    out += `${i + 1}. ${pt}\n`;
  });
  out += isEn ? `\nINTERVIEWER INQUIRY TIPS:\n` : `\nCONSEJOS PARA EL ENTREVISTADOR:\n`;
  (guide.interviewerTips || []).forEach((tip) => {
    out += `* ${tip}\n`;
  });
  const totalMins = (guide.blocks || []).reduce((acc, b) => acc + (b.minutes || 0), 0);
  out += isEn ? `\nINTERVIEW BLOCKS (${totalMins} TOTAL MINUTES):\n` : `\nBLOQUES DE LA ENTREVISTA (${totalMins} MINUTOS TOTAL):\n`;
  (guide.blocks || []).forEach((block, bIdx) => {
    out += `\n------------------------------------------------------------\n`;
    out += isEn
      ? `BLOCK ${bIdx + 1}: ${block.title.toUpperCase()} (${block.minutes} min) ${block.mustPass ? '[ELIMINATORY / MUST PASS]' : '[FORMATIVE / OP]'}\n`
      : `BLOQUE ${bIdx + 1}: ${block.title.toUpperCase()} (${block.minutes} min) ${block.mustPass ? '[ELIMINATORIO / MUST PASS]' : '[FORMATIVO / OP]'}\n`;
    out += isEn ? `Goal: ${block.goal}\n\n` : `Objetivo: ${block.goal}\n\n`;
    const bQuestions = (guide.questions || []).filter((q) => (block.questionIds || []).includes(q.id));
    bQuestions.forEach((q, qIdx) => {
      out += isEn
        ? `Question ${bIdx + 1}.${qIdx + 1} [${(q.language || 'es').toUpperCase()}]: "${q.text}"\n`
        : `Pregunta ${bIdx + 1}.${qIdx + 1} [${(q.language || 'es').toUpperCase()}]: "${q.text}"\n`;
      out += isEn ? `  - Purpose: ${q.purpose}\n` : `  - Propósito: ${q.purpose}\n`;
      out += isEn ? `  - Listen for (Good signal): ${(q.listenFor || []).join('; ')}\n` : `  - Escuchar (Buena señal): ${(q.listenFor || []).join('; ')}\n`;
      out += isEn ? `  - Alerts (Red flags): ${(q.redFlags || []).join('; ')}\n\n` : `  - Alertas (Red Flags): ${(q.redFlags || []).join('; ')}\n\n`;
    });
  });
  out += `------------------------------------------------------------\n`;
  out += isEn ? `DECISION CRITERIA:\n` : `CRITERIOS DE DECISIÓN:\n`;
  out += isEn ? `* Hire: ${guide.decision?.hire || 'N/A'}\n` : `* Contratar: ${guide.decision?.hire || 'N/A'}\n`;
  out += isEn ? `* Third Conversation: ${guide.decision?.thirdConversation || 'N/A'}\n` : `* Tercera Conversación: ${guide.decision?.thirdConversation || 'N/A'}\n`;
  out += isEn ? `* Decline: ${guide.decision?.decline || 'N/A'}\n` : `* Declinar: ${guide.decision?.decline || 'N/A'}\n`;
  return out;
}

export function getEffectiveStatus(session: InterviewSession): InterviewStatus {
  if (session.status === 'Completed' || session.evaluation) {
    return 'Completed';
  }
  const userMessages = session.messages ? session.messages.filter((m, idx) => m.role === 'user' && idx > 0) : [];
  if (userMessages.length === 0 || session.status === 'Incomplete') {
    return 'Incomplete';
  }
  return 'In Progress';
}

export function getSessionAuthenticitySummary(session: InterviewSession) {
  const userMessages = (session.messages || []).filter(m => m.role === 'user');
  if (userMessages.length === 0) {
    return null;
  }

  const messagesWithMetrics = userMessages.filter(m => !!m.metrics);
  const hasMetrics = messagesWithMetrics.length > 0;

  let totalPasteAttempts = 0;
  let totalTabSwitches = 0;
  let totalWpm = 0;
  let largeInsertChunksCount = 0;
  let confidenceScores: { index: number; score: number; warned?: boolean; textLen: number }[] = [];
  let warnedCount = 0;

  userMessages.forEach((m, idx) => {
    const textLen = m.parts?.[0]?.text?.length || 0;
    if (m.metrics) {
      const met = m.metrics;
      totalPasteAttempts += met.pasteAttempts || 0;
      totalTabSwitches += met.tabSwitches || 0;
      totalWpm += met.wpm || 0;
      if ((met.maxInsertChunk || 0) > 40) {
        largeInsertChunksCount += 1;
      }
      if (met.lowConfidenceWarned) {
        warnedCount += 1;
      }
      const conf = typeof met.humanConfidence === 'number'
        ? met.humanConfidence
        : humanConfidence(met, textLen);
      if (conf !== null) {
        confidenceScores.push({ index: idx + 1, score: conf, warned: met.lowConfidenceWarned, textLen });
      }
    }
  });

  const avgWpm = messagesWithMetrics.length > 0 ? Math.round(totalWpm / messagesWithMetrics.length) : 0;
  const avgConfidence = confidenceScores.length > 0
    ? Math.round(confidenceScores.reduce((sum, item) => sum + item.score, 0) / confidenceScores.length)
    : null;
  const minItem = confidenceScores.length > 0
    ? confidenceScores.reduce((min, curr) => curr.score < min.score ? curr : min, confidenceScores[0])
    : null;

  const requiresReview = totalPasteAttempts > 0 || totalTabSwitches > 3 || largeInsertChunksCount > 0 || (minItem !== null && minItem.score < 35);

  return {
    hasMetrics,
    totalUserAnswers: userMessages.length,
    answersWithMetricsCount: messagesWithMetrics.length,
    totalPasteAttempts,
    totalTabSwitches,
    avgWpm,
    largeInsertChunksCount,
    avgConfidence,
    minConfidence: minItem ? minItem.score : null,
    minConfidenceIndex: minItem ? minItem.index : null,
    confidenceScores,
    warnedCount,
    requiresReview,
  };
}

function formatInterviewDate(dateStr?: string, lang: AdminLang = 'es'): string {
  const t = adminI18n[lang];
  if (!dateStr) return t.recentDate;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return t.recentDate;
  const dateFormatted = d.toLocaleDateString(t.localeCode);
  const timeFormatted = d.toLocaleTimeString(t.localeCode, { hour: '2-digit', minute: '2-digit' });
  return t.dateAtTime(dateFormatted, timeFormatted);
}

function getDaysRemaining(deletedAt?: string | null): number {
  if (!deletedAt) return 30;
  const d = new Date(deletedAt).getTime();
  if (isNaN(d)) return 30;
  const elapsedDays = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
  return Math.max(0, 30 - elapsedDays);
}

export function Dashboard({ adminToken, onBack, onLogout, onResume, onDelete, onSessionsUpdated }: DashboardProps) {
  const [lang, setLang] = useState<AdminLang>(getInitialAdminLang);
  const t = adminI18n[lang];

  const handleToggleLang = (newLang: AdminLang) => {
    setLang(newLang);
    setSavedAdminLang(newLang);
  };

  const [sessions, setSessions] = useState<InterviewSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [viewTrash, setViewTrash] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'evaluation' | 'secondInterview' | 'transcript' | 'contact'>('transcript');
  const [copied, setCopied] = useState(false);
  const [copiedContact, setCopiedContact] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpSuccessEmail, setFollowUpSuccessEmail] = useState<string | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  // Second Interview Guide state
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [copiedGuide, setCopiedGuide] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchServerSessions = async () => {
    if (!adminToken) return;
    setIsLoading(true);
    try {
      // 1. Get any local sessions that might not yet be synced on the server
      let localSessions: InterviewSession[] = [];
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) localSessions = JSON.parse(saved);
      } catch (e) {
        console.warn('Could not read local sessions:', e);
      }

      // 2. Fetch server sessions
      const res = await fetch('/api/admin/sessions', {
        headers: {
          'x-admin-passcode': adminToken,
        },
      });

      if (res.ok) {
        const data = await res.json();
        const serverSessions: InterviewSession[] = data.sessions || [];

        // 3. Bidirectional merge: combine server and local by session id
        const mergedMap = new Map<string, InterviewSession>();
        
        // Add server sessions first
        for (const s of serverSessions) {
          if (s && s.id) mergedMap.set(s.id, s);
        }

        // Merge local sessions, syncing any missing to server
        for (const ls of localSessions) {
          if (ls && ls.id) {
            if (!mergedMap.has(ls.id)) {
              if (!ls.deletedAt) {
                // Local session was not on server; sync it
                fetch('/api/sessions/sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ session: ls }),
                }).catch(console.error);
              }
              mergedMap.set(ls.id, ls);
            } else {
              // Merge: prefer server deletedAt state or local if present
              const existing = mergedMap.get(ls.id)!;
              const mergedSession: InterviewSession = {
                ...existing,
                ...ls,
                deletedAt: existing.deletedAt !== undefined ? existing.deletedAt : ls.deletedAt,
              };
              if (ls.status === 'Completed' && existing.status !== 'Completed') {
                mergedSession.status = 'Completed';
                mergedSession.evaluation = ls.evaluation || existing.evaluation;
              }
              mergedMap.set(ls.id, mergedSession);
            }
          }
        }

        const mergedList = Array.from(mergedMap.values()).sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
        });

        setSessions(mergedList);
        if (onSessionsUpdated) {
          onSessionsUpdated(mergedList);
        }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedList));
        } catch (e) {
          console.warn('Failed to update localStorage with merged sessions:', e);
        }
      }
    } catch (err) {
      console.error('Failed to load server sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServerSessions();
  }, [adminToken]);

  const activeSessions = sessions.filter(s => !s.deletedAt);
  const trashSessions = sessions.filter(s => !!s.deletedAt);

  const selectedSession = activeSessions.find(s => s.id === selectedSessionId);

  useEffect(() => {
    if (selectedSession?.secondInterviewScores) {
      setScores(selectedSession.secondInterviewScores.scores || {});
      setNotes(selectedSession.secondInterviewScores.notes || {});
    } else {
      setScores({});
      setNotes({});
    }
    setGuideError(null);
    setSaveStatus(null);
    setCopiedGuide(false);
  }, [selectedSessionId]);

  const saveScoresToServer = async (newScores: Record<string, number>, newNotes: Record<string, string>) => {
    if (!selectedSession || !adminToken) return;
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/admin/sessions/${selectedSession.id}/second-interview-scores`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminToken,
        },
        body: JSON.stringify({ scores: newScores, notes: newNotes }),
      });
      if (res.ok) {
        setSaveStatus('saved');
        const updatedScores: SecondInterviewScores = {
          scores: newScores,
          notes: newNotes,
          updatedAt: new Date().toISOString(),
        };
        const updatedList = sessions.map(s => s.id === selectedSession.id ? { ...s, secondInterviewScores: updatedScores } : s);
        setSessions(updatedList);
        if (onSessionsUpdated) onSessionsUpdated(updatedList);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
        } catch (e) {
          console.warn('LocalStorage save warning:', e);
        }
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('Failed to save scores:', err);
      setSaveStatus('error');
    }
  };

  const handleScoreChange = (qId: string, value: number) => {
    const nextScores = { ...scores };
    if (nextScores[qId] === value) {
      delete nextScores[qId];
    } else {
      nextScores[qId] = value;
    }
    setScores(nextScores);
    setSaveStatus('saving');

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      saveScoresToServer(nextScores, notes);
    }, 800);
  };

  const handleNoteChange = (qId: string, text: string) => {
    const nextNotes = { ...notes, [qId]: text };
    setNotes(nextNotes);
    setSaveStatus('saving');

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      saveScoresToServer(scores, nextNotes);
    }, 800);
  };

  const handleGenerateGuide = async (force = false) => {
    if (!selectedSession || !adminToken || isGeneratingGuide) return;
    if (force && !window.confirm(t.guideConfirmForce)) {
      return;
    }

    setIsGeneratingGuide(true);
    setGuideError(null);

    try {
      const res = await fetch(`/api/admin/sessions/${selectedSession.id}/second-interview-guide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminToken,
        },
        body: JSON.stringify({ force, lang }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.guide) {
        throw new Error(data.error || t.guideAiErrorDefault);
      }

      const updatedSession: InterviewSession = {
        ...selectedSession,
        secondInterviewGuide: data.guide,
        secondInterviewScores: force ? undefined : selectedSession.secondInterviewScores,
      };
      if (force) {
        delete updatedSession.secondInterviewScores;
        setScores({});
        setNotes({});
      }

      const updatedList = sessions.map(s => s.id === selectedSession.id ? updatedSession : s);
      setSessions(updatedList);
      if (onSessionsUpdated) onSessionsUpdated(updatedList);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
      } catch (e) {
        console.warn('LocalStorage save warning:', e);
      }
    } catch (err: any) {
      console.error('Failed to generate second interview guide:', err);
      setGuideError(err.message || t.guideAiErrorDefault);
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  const handleCopyGuide = (guide: SecondInterviewGuide) => {
    const text = formatGuideAsPlainText(guide, lang);
    navigator.clipboard.writeText(text);
    setCopiedGuide(true);
    setTimeout(() => setCopiedGuide(false), 2000);
  };

  // Soft delete: moves to trash
  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(t.confirmMoveToTrash(name || t.applicantFallback))) {
      return;
    }
    const deletedAt = new Date().toISOString();
    const updatedList = sessions.map(s => s.id === id ? { ...s, deletedAt } : s);
    setSessions(updatedList);
    if (selectedSessionId === id) setSelectedSessionId(null);
    if (onSessionsUpdated) onSessionsUpdated(updatedList);
    if (onDelete) onDelete(id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
    if (adminToken) {
      await fetch(`/api/admin/sessions/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-passcode': adminToken }
      }).catch(console.error);
    }
  };

  // Restore session from trash
  const handleRestore = async (id: string) => {
    const updatedList = sessions.map(s => s.id === id ? { ...s, deletedAt: null } : s);
    setSessions(updatedList);
    if (onSessionsUpdated) onSessionsUpdated(updatedList);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
    if (adminToken) {
      await fetch(`/api/admin/sessions/${id}/restore`, {
        method: 'POST',
        headers: { 'x-admin-passcode': adminToken }
      }).catch(console.error);
    }
  };

  // Permanent deletion from trash
  const handlePermanentDelete = async (id: string, name: string) => {
    if (!window.confirm(t.confirmPermanentDelete(name || t.applicantFallback))) {
      return;
    }
    const updatedList = sessions.filter(s => s.id !== id);
    setSessions(updatedList);
    if (onSessionsUpdated) onSessionsUpdated(updatedList);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
    if (adminToken) {
      await fetch(`/api/admin/sessions/${id}/permanent`, {
        method: 'DELETE',
        headers: { 'x-admin-passcode': adminToken }
      }).catch(console.error);
    }
  };

  const handleCopyTranscript = () => {
    if (!selectedSession) return;
    const text = selectedSession.messages
      .filter((_, i) => i > 0)
      .map(m => `[${m.role === 'model' ? t.virtualInterviewerRole : (selectedSession.candidateInfo?.name || t.applicantFallback)}]:\n${m.parts?.[0]?.text || ''}`)
      .join('\n\n---\n\n');

    navigator.clipboard.writeText(text || t.noTranscriptRecorded);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyContact = () => {
    if (!selectedSession) return;
    const effectiveStatus = getEffectiveStatus(selectedSession);
    const effectiveStatusLabel = effectiveStatus === 'Completed'
      ? t.badgeCompleted
      : effectiveStatus === 'In Progress'
      ? t.badgeInProgress
      : t.badgeIncomplete;

    const contactText = `${t.copyContactHeader} ${selectedSession.candidateInfo?.name || t.unnamedApplicant}
${t.copyContactPosition} ${selectedSession.position || t.notSpecified}
${t.copyContactPhone} ${selectedSession.candidateInfo?.phone || t.notRegistered}
${t.copyContactEmail} ${selectedSession.candidateInfo?.email || t.notRegistered}
${t.copyContactDate} ${formatInterviewDate(selectedSession.date, lang)}
${t.copyContactStatus} ${effectiveStatusLabel}`;

    navigator.clipboard.writeText(contactText);
    setCopiedContact(true);
    setTimeout(() => setCopiedContact(false), 2000);
  };

  const handleForceEvaluate = async () => {
    if (!selectedSession || isEvaluating) return;
    setIsEvaluating(true);
    try {
      const res = await fetch('/api/evaluate-and-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: selectedSession }),
      });
      const data = await res.json();
      if (data.evaluation) {
        const updated = {
          ...selectedSession,
          status: 'Completed' as const,
          evaluation: data.evaluation,
          emailSent: data.emailSent ?? false,
        };
        setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
        setActiveTab('evaluation');
      }
    } catch (e) {
      console.error('Failed to generate evaluation:', e);
      alert(t.evalGenerationError);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSendFollowUp = async (session: InterviewSession) => {
    if (!session || !session.id || !adminToken || isSendingFollowUp) return;
    const email = session.candidateInfo?.email;
    if (!email) {
      alert(t.followUpNoEmail);
      return;
    }

    setIsSendingFollowUp(true);
    setFollowUpError(null);
    try {
      const res = await fetch(`/api/admin/sessions/${session.id}/send-followup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminToken,
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || t.followUpDefaultError);
      }

      const followUpDate = data.followUpSentAt || new Date().toISOString();
      const updated = {
        ...session,
        followUpSentAt: followUpDate,
      };

      setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
      if (onSessionsUpdated) {
        onSessionsUpdated(sessions.map(s => s.id === updated.id ? updated : s));
      }

      setFollowUpSuccessEmail(email);
      setTimeout(() => {
        setFollowUpSuccessEmail(null);
      }, 4000);
    } catch (err: any) {
      console.error('Failed to send follow-up email:', err);
      setFollowUpError(err.message || t.followUpErrorGeneric);
      setTimeout(() => {
        setFollowUpError(null);
      }, 6000);
    } finally {
      setIsSendingFollowUp(false);
    }
  };

  // Counts by status (only active sessions)
  const completedCount = activeSessions.filter(s => getEffectiveStatus(s) === 'Completed').length;
  const inProgressCount = activeSessions.filter(s => getEffectiveStatus(s) === 'In Progress').length;
  const incompleteCount = activeSessions.filter(s => getEffectiveStatus(s) === 'Incomplete').length;

  const filteredSessions = activeSessions.filter(session => {
    const candidateName = session.candidateInfo?.name?.toLowerCase() || '';
    const candidateEmail = session.candidateInfo?.email?.toLowerCase() || '';
    const candidatePhone = session.candidateInfo?.phone?.toLowerCase() || '';
    const pos = session.position?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();

    const matchesSearch = candidateName.includes(query) || candidateEmail.includes(query) || candidatePhone.includes(query) || pos.includes(query);
    const matchesPosition = positionFilter === 'All' || session.position === positionFilter;
    
    const effectiveStatus = getEffectiveStatus(session);
    const matchesStatus = statusFilter === 'All' || effectiveStatus === statusFilter;

    return matchesSearch && matchesPosition && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#4B2C20] font-sans flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#E8DFD8] shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-xl text-[#4B2C20]/70 hover:text-[#4B2C20] hover:bg-[#F5EFE6] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#D4A373]" />
            <span className="font-serif font-bold text-lg text-[#4B2C20]">{t.dashboardTitle}</span>
            <span className="bg-[#4B2C20] text-[#FAF7F2] text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-md">
              {t.hrBadge}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          {/* Language Selector EN | ES Toggle */}
          <div className="flex items-center bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => handleToggleLang('es')}
              className={clsx(
                "px-2.5 py-1 text-xs font-bold rounded-lg transition-all",
                lang === 'es'
                  ? "bg-[#4B2C20] text-[#FAF7F2] shadow-xs"
                  : "text-[#4B2C20]/60 hover:text-[#4B2C20]"
              )}
              aria-label="Español"
            >
              ES
            </button>
            <span className="text-xs text-[#E8DFD8] px-0.5">|</span>
            <button
              type="button"
              onClick={() => handleToggleLang('en')}
              className={clsx(
                "px-2.5 py-1 text-xs font-bold rounded-lg transition-all",
                lang === 'en'
                  ? "bg-[#4B2C20] text-[#FAF7F2] shadow-xs"
                  : "text-[#4B2C20]/60 hover:text-[#4B2C20]"
              )}
              aria-label="English"
            >
              EN
            </button>
          </div>

          <button
            onClick={() => {
              setViewTrash(prev => !prev);
              setSelectedSessionId(null);
            }}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-colors border shadow-xs",
              viewTrash
                ? "bg-[#4B2C20] text-[#FAF7F2] border-[#4B2C20]"
                : "bg-white text-[#4B2C20]/80 border-[#E8DFD8] hover:bg-[#F5EFE6] hover:text-[#4B2C20]"
            )}
            title={t.trashTooltip}
          >
            <Trash2 className="w-3.5 h-3.5 text-[#D4A373]" />
            <span>{t.trashBtn(trashSessions.length)}</span>
          </button>

          <button
            onClick={fetchServerSessions}
            title={t.refreshTooltip}
            className="p-2 text-[#4B2C20]/70 hover:text-[#4B2C20] hover:bg-[#F5EFE6] rounded-xl transition-colors"
          >
            <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin text-[#D4A373]")} />
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-red-700 hover:bg-red-50 rounded-xl transition-colors border border-red-200"
          >
            <LogOut className="w-3.5 h-3.5" /> {t.logout}
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 md:p-12 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {viewTrash ? (
            <div>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                <div>
                  <button
                    onClick={() => setViewTrash(false)}
                    className="flex items-center gap-1 text-xs font-bold text-[#D4A373] uppercase tracking-wider mb-2 hover:underline"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> {t.backToDashboard}
                  </button>
                  <h1 className="text-3xl md:text-4xl font-serif text-[#4B2C20] mb-2 flex items-center gap-3">
                    <Trash2 className="w-7 h-7 text-[#D4A373]" />
                    {t.trashHeading(trashSessions.length)}
                  </h1>
                  <p className="text-[#4B2C20]/70 font-light text-sm">
                    {t.trashDescription}
                  </p>
                </div>
              </div>

              {/* Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-center gap-3 text-xs text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>{t.trash30DaysNotice}</span>
              </div>

              {trashSessions.length === 0 ? (
                <div className="text-center py-16 px-4 bg-white border border-[#E8DFD8] rounded-2xl">
                  <Trash2 className="w-12 h-12 text-[#D4A373]/50 mx-auto mb-4" />
                  <h3 className="text-lg font-serif font-medium text-[#4B2C20] mb-2">{t.emptyTrashTitle}</h3>
                  <p className="text-sm font-light text-[#4B2C20]/60 max-w-sm mx-auto">
                    {t.emptyTrashDesc}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {trashSessions.map((session) => {
                    const daysLeft = getDaysRemaining(session.deletedAt);
                    return (
                      <div
                        key={session.id}
                        className="bg-white border border-[#E8DFD8] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                      >
                        <div className="space-y-2 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                              {t.deletedOn} {formatInterviewDate(session.deletedAt || session.date, lang)}
                            </span>
                            <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-700" /> {t.daysRemaining(daysLeft)}
                            </span>
                          </div>

                          <h3 className="text-xl font-serif text-[#4B2C20]">
                            {session.candidateInfo?.name || t.unnamedApplicant}
                          </h3>

                          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-[#4B2C20]/75 font-light">
                            <span className="font-medium text-[#4B2C20]">{t.positionLabel} <strong>{session.position || t.notSpecified}</strong></span>
                            {session.candidateInfo?.email && (
                              <span>{session.candidateInfo.email}</span>
                            )}
                            {session.candidateInfo?.phone && (
                              <span>{session.candidateInfo.phone}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <button
                            onClick={() => handleRestore(session.id)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#4B2C20] text-[#FAF7F2] rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-[#3E2723] transition-colors shadow-xs"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-[#D4A373]" />
                            {t.restoreBtn}
                          </button>

                          <button
                            onClick={() => handlePermanentDelete(session.id, session.candidateInfo?.name || '')}
                            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t.permanentDeleteBtn}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : !selectedSession ? (
            <>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[#D4A373] font-bold block mb-1">
                    {t.panelExclusiveSubtitle}
                  </span>
                  <h1 className="text-3xl md:text-4xl font-serif text-[#4B2C20] mb-2">
                    {t.dashboardHeroTitle}
                  </h1>
                  <p className="text-[#4B2C20]/70 font-light text-sm">
                    {t.dashboardSubtitle}
                  </p>
                </div>
              </div>

              {/* KPI Filter Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <button
                  onClick={() => setStatusFilter('All')}
                  className={clsx(
                    "p-4 rounded-2xl border text-left transition-all",
                    statusFilter === 'All' 
                      ? "bg-white border-[#4B2C20] ring-2 ring-[#4B2C20]/10 shadow-sm" 
                      : "bg-white/60 border-[#E8DFD8] hover:bg-white"
                  )}
                >
                  <span className="text-[10px] uppercase tracking-widest font-bold text-[#4B2C20]/60 block mb-1">
                    {t.kpiTotalActive}
                  </span>
                  <span className="text-2xl font-serif font-bold text-[#4B2C20] block">
                    {activeSessions.length}
                  </span>
                </button>

                <button
                  onClick={() => setStatusFilter('Completed')}
                  className={clsx(
                    "p-4 rounded-2xl border text-left transition-all",
                    statusFilter === 'Completed' 
                      ? "bg-green-50/80 border-green-600 ring-2 ring-green-600/10 shadow-sm" 
                      : "bg-white/60 border-[#E8DFD8] hover:bg-white"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-green-800">
                      {t.kpiCompleted}
                    </span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  </div>
                  <span className="text-2xl font-serif font-bold text-green-900 block">
                    {completedCount}
                  </span>
                </button>

                <button
                  onClick={() => setStatusFilter('In Progress')}
                  className={clsx(
                    "p-4 rounded-2xl border text-left transition-all",
                    statusFilter === 'In Progress' 
                      ? "bg-blue-50/80 border-blue-600 ring-2 ring-blue-600/10 shadow-sm" 
                      : "bg-white/60 border-[#E8DFD8] hover:bg-white"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-blue-800">
                      {t.kpiInProgress}
                    </span>
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <span className="text-2xl font-serif font-bold text-blue-900 block">
                    {inProgressCount}
                  </span>
                </button>

                <button
                  onClick={() => setStatusFilter('Incomplete')}
                  className={clsx(
                    "p-4 rounded-2xl border text-left transition-all",
                    statusFilter === 'Incomplete' 
                      ? "bg-amber-50/80 border-amber-600 ring-2 ring-amber-600/10 shadow-sm" 
                      : "bg-white/60 border-[#E8DFD8] hover:bg-white"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-amber-900">
                      {t.kpiIncomplete}
                    </span>
                    <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                  </div>
                  <span className="text-2xl font-serif font-bold text-amber-900 block">
                    {incompleteCount}
                  </span>
                </button>
              </div>

              {/* Filters & Search Toolbar */}
              <div className="bg-white border border-[#E8DFD8] rounded-2xl p-4 mb-6 shadow-xs flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#4B2C20]/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="w-full pl-10 pr-4 py-2 bg-[#FAF7F2]/60 border border-[#E8DFD8] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A373] text-[#4B2C20]"
                  />
                </div>

                <div className="flex gap-2">
                  <select
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                    className="px-3 py-2 bg-[#FAF7F2]/60 border border-[#E8DFD8] rounded-xl text-xs font-medium text-[#4B2C20] focus:outline-none focus:ring-2 focus:ring-[#D4A373]"
                  >
                    <option value="All">{t.allPositions}</option>
                    <option value="Barista">Barista</option>
                    <option value="Shift Leader">Shift Leader</option>
                    <option value="Store Manager">Store Manager</option>
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-[#FAF7F2]/60 border border-[#E8DFD8] rounded-xl text-xs font-medium text-[#4B2C20] focus:outline-none focus:ring-2 focus:ring-[#D4A373]"
                  >
                    <option value="All">{t.allStatuses}</option>
                    <option value="Completed">{t.statusCompleted}</option>
                    <option value="In Progress">{t.statusInProgress}</option>
                    <option value="Incomplete">{t.statusIncomplete}</option>
                  </select>
                </div>
              </div>

              {/* Candidates List */}
              {activeSessions.length === 0 ? (
                <div className="text-center py-16 px-4 bg-white border border-[#E8DFD8] rounded-2xl">
                  <FileText className="w-12 h-12 text-[#D4A373]/50 mx-auto mb-4" />
                  <h3 className="text-lg font-serif font-medium text-[#4B2C20] mb-2">{t.emptyActiveTitle}</h3>
                  <p className="text-sm font-light text-[#4B2C20]/60 max-w-sm mx-auto">
                    {t.emptyActiveDesc}
                  </p>
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="text-center py-12 px-4 bg-white border border-[#E8DFD8] rounded-2xl">
                  <Search className="w-10 h-10 text-[#D4A373]/50 mx-auto mb-3" />
                  <h3 className="text-base font-serif font-medium text-[#4B2C20] mb-1">{t.emptySearchTitle}</h3>
                  <p className="text-xs font-light text-[#4B2C20]/60">
                    {t.emptySearchDesc}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSessions.map((session) => {
                    const effectiveStatus = getEffectiveStatus(session);
                    const authSummary = getSessionAuthenticitySummary(session);
                    return (
                      <div
                        key={session.id}
                        className="bg-white border border-[#E8DFD8] rounded-2xl p-5 shadow-xs hover:border-[#D4A373]/60 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                              {formatInterviewDate(session.date, lang)}
                            </span>
                            
                            <span className={clsx(
                              "text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full",
                              effectiveStatus === 'Completed' 
                                ? "bg-green-100 text-green-800 border border-green-200" 
                                : effectiveStatus === 'In Progress'
                                ? "bg-blue-100 text-blue-800 border border-blue-200"
                                : "bg-amber-100 text-amber-900 border border-amber-300"
                            )}>
                              {effectiveStatus === 'Completed' ? t.badgeCompleted : effectiveStatus === 'In Progress' ? t.badgeInProgress : t.badgeIncomplete}
                            </span>

                            {authSummary && (
                              authSummary.avgConfidence !== null ? (
                                <span
                                  className={clsx(
                                    "text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border",
                                    authSummary.avgConfidence >= 70
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                      : authSummary.avgConfidence >= 35
                                      ? "bg-amber-50 text-amber-800 border-amber-300"
                                      : "bg-red-50 text-red-800 border-red-300"
                                  )}
                                  title={`${t.authMetricAvgConfidence}: ${authSummary.avgConfidence}% · Min: ${authSummary.minConfidence}% · WPM: ${authSummary.avgWpm}`}
                                >
                                  <ShieldCheck className="w-3 h-3" />
                                  {t.chipHumanConfidence(authSummary.avgConfidence)}
                                  {authSummary.requiresReview && ` ${t.chipWarned}`}
                                </span>
                              ) : (
                                <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200 flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3" /> {t.chipNoTelemetry}
                                </span>
                              )
                            )}

                            {session.emailSent && (
                              <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200 flex items-center gap-1">
                                <Mail className="w-2.5 h-2.5" /> {t.chipEmailSent}
                              </span>
                            )}

                            {session.secondInterviewGuide && (
                              <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-900 border border-purple-200 flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5 text-purple-600" /> {t.chipGuideReady}
                              </span>
                            )}

                            {session.followUpSentAt && (
                              <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                                <Mail className="w-2.5 h-2.5 text-amber-600" /> {t.chipReminderSent}
                              </span>
                            )}
                          </div>

                          <h3 className="text-xl font-serif text-[#4B2C20]">
                            {session.candidateInfo?.name || t.unnamedApplicant}
                          </h3>

                          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-[#4B2C20]/75 font-light">
                            <span className="font-medium text-[#4B2C20]">{t.positionLabel} <strong>{session.position || t.notSpecified}</strong></span>
                            {session.candidateInfo?.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3 text-[#D4A373]" />
                                {session.candidateInfo.email}
                              </span>
                            )}
                            {session.candidateInfo?.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-[#D4A373]" />
                                {session.candidateInfo.phone}
                              </span>
                            )}
                            <span className="text-neutral-400">
                              {t.answersGiven(session.messages ? Math.max(0, session.messages.filter(m => m.role === 'user').length) : 0)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                          {effectiveStatus === 'In Progress' && (
                            <button
                              onClick={() => onResume(session.id)}
                              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-[#F5EFE6] text-[#4B2C20] hover:bg-[#E8DFD8] rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border border-[#D4A373]/40"
                              title={t.continueBtn}
                            >
                              <PlayCircle className="w-3.5 h-3.5 text-[#D4A373]" />
                              {t.continueBtn}
                            </button>
                          )}

                          {effectiveStatus === 'Incomplete' && (
                            <button
                              onClick={() => handleSendFollowUp(session)}
                              disabled={isSendingFollowUp}
                              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-900 hover:bg-amber-100 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border border-amber-300 disabled:opacity-50"
                              title={t.sendReminderBtn}
                            >
                              <Mail className="w-3.5 h-3.5 text-amber-700" />
                              {session.followUpSentAt ? t.resendReminderBtn : t.sendReminderBtn}
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setSelectedSessionId(session.id);
                              setActiveTab(effectiveStatus === 'Completed' ? 'evaluation' : effectiveStatus === 'Incomplete' ? 'contact' : 'transcript');
                            }}
                            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-[#4B2C20] text-[#FAF7F2] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#3E2723] transition-colors shadow-xs"
                          >
                            {effectiveStatus === 'Completed' ? (
                              <>
                                <Award className="w-4 h-4 text-[#D4A373]" />
                                {t.viewEvaluationBtn}
                              </>
                            ) : effectiveStatus === 'Incomplete' ? (
                              <>
                                <FileText className="w-4 h-4 text-[#D4A373]" />
                                {t.viewContactBtn}
                              </>
                            ) : (
                              <>
                                <MessageSquare className="w-4 h-4 text-[#D4A373]" />
                                {t.viewTranscriptBtn}
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleDelete(session.id, session.candidateInfo?.name || '')}
                            title={t.moveToTrashBtn}
                            className="p-2.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-200"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                  <button
                    onClick={() => setSelectedSessionId(null)}
                    className="flex items-center gap-1 text-xs font-bold text-[#D4A373] uppercase tracking-wider mb-2 hover:underline"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> {t.backToList}
                  </button>
                  <h1 className="text-3xl md:text-4xl font-serif leading-tight text-[#4B2C20]">
                    {selectedSession.candidateInfo?.name || t.applicantFallback} &mdash; {selectedSession.position || t.notSpecified}
                  </h1>
                  
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={clsx(
                      "text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full",
                      getEffectiveStatus(selectedSession) === 'Completed' 
                        ? "bg-green-100 text-green-800 border border-green-200" 
                        : getEffectiveStatus(selectedSession) === 'In Progress'
                        ? "bg-blue-100 text-blue-800 border border-blue-200"
                        : "bg-amber-100 text-amber-900 border border-amber-300"
                    )}>
                      {t.statusLabel} {getEffectiveStatus(selectedSession) === 'Completed' ? t.badgeCompleted : getEffectiveStatus(selectedSession) === 'In Progress' ? t.badgeInProgress : t.badgeIncomplete}
                    </span>
                    {(() => {
                      const detailAuth = getSessionAuthenticitySummary(selectedSession);
                      if (!detailAuth) return null;
                      if (detailAuth.avgConfidence !== null) {
                        return (
                          <span className={clsx(
                            "text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5",
                            detailAuth.avgConfidence >= 70
                              ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                              : detailAuth.avgConfidence >= 35
                              ? "bg-amber-100 text-amber-900 border-amber-300"
                              : "bg-red-100 text-red-900 border-red-300"
                          )}>
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {t.authorshipConfidence} {detailAuth.avgConfidence}%
                            {detailAuth.requiresReview ? t.reviewSuggested : t.normalPattern}
                          </span>
                        );
                      }
                      return (
                        <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5" /> {t.noTypingTelemetry}
                        </span>
                      );
                    })()}
                    <span className="text-xs text-[#4B2C20]/70 font-light">
                      {t.registeredOn(formatInterviewDate(selectedSession.date, lang))}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleCopyContact}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#E8DFD8] text-[#4B2C20] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#F5EFE6] transition-colors shadow-xs"
                  >
                    {copiedContact ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-[#D4A373]" />}
                    {copiedContact ? t.contactCopiedBtn : t.copyContactBtn}
                  </button>

                  <button
                    onClick={handleCopyTranscript}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#E8DFD8] text-[#4B2C20] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#F5EFE6] transition-colors shadow-xs"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <MessageSquare className="w-3.5 h-3.5 text-[#D4A373]" />}
                    {copied ? t.transcriptCopiedBtn : t.copyTranscriptBtn}
                  </button>

                  <button
                    onClick={() => handleDelete(selectedSession.id, selectedSession.candidateInfo?.name || '')}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {t.moveToTrashBtn}
                  </button>
                </div>
              </div>

              {/* Incomplete Banner */}
              {getEffectiveStatus(selectedSession) === 'Incomplete' && !selectedSession.evaluation && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-amber-900">{t.incompleteBannerTitle}</h4>
                      <p className="text-xs text-amber-800 font-light mt-0.5">
                        {t.incompleteBannerDesc}
                      </p>
                      {followUpSuccessEmail && (
                        <div className="mt-2 text-xs font-semibold text-green-700 flex items-center gap-1.5 bg-green-50 border border-green-200 px-2.5 py-1 rounded-lg">
                          <Check className="w-3.5 h-3.5" /> {t.followUpSentSuccess(followUpSuccessEmail)}
                        </div>
                      )}
                      {followUpError && (
                        <div className="mt-2 text-xs font-semibold text-red-700 flex items-center gap-1.5 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
                          <AlertCircle className="w-3.5 h-3.5" /> {followUpError}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row items-start md:items-center gap-2 shrink-0">
                    {selectedSession.followUpSentAt && (
                      <span className="text-[11px] text-amber-800/80 font-medium">
                        {t.lastReminder(formatInterviewDate(selectedSession.followUpSentAt, lang))}
                      </span>
                    )}
                    <button
                      onClick={() => handleSendFollowUp(selectedSession)}
                      disabled={isSendingFollowUp}
                      className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isSendingFollowUp ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {t.sendingReminderBtn}
                        </>
                      ) : (
                        <>
                          <Mail className="w-3.5 h-3.5" />
                          {selectedSession.followUpSentAt ? t.resendReminderBtn : t.sendReminderBtn}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Navigation Tabs */}
              <div className="flex border-b border-[#E8DFD8] mb-6 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('evaluation')}
                  className={clsx(
                    "flex items-center gap-2 px-6 py-3 font-bold text-xs uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap",
                    activeTab === 'evaluation'
                      ? "border-[#4B2C20] text-[#4B2C20]"
                      : "border-transparent text-[#4B2C20]/60 hover:text-[#4B2C20]"
                  )}
                >
                  <Award className="w-4 h-4 text-[#D4A373]" />
                  {t.tabEvaluation} {selectedSession.evaluation ? '✓' : `(${t.tabGenerateSuffix})`}
                </button>

                <button
                  onClick={() => setActiveTab('secondInterview')}
                  className={clsx(
                    "flex items-center gap-2 px-6 py-3 font-bold text-xs uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap",
                    activeTab === 'secondInterview'
                      ? "border-[#4B2C20] text-[#4B2C20]"
                      : "border-transparent text-[#4B2C20]/60 hover:text-[#4B2C20]"
                  )}
                >
                  <Sparkles className="w-4 h-4 text-[#D4A373]" />
                  {t.tabSecondInterview} {selectedSession.secondInterviewGuide ? '✓' : `(${t.tabGenerateSuffix})`}
                </button>

                <button
                  onClick={() => setActiveTab('transcript')}
                  className={clsx(
                    "flex items-center gap-2 px-6 py-3 font-bold text-xs uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap",
                    activeTab === 'transcript'
                      ? "border-[#4B2C20] text-[#4B2C20]"
                      : "border-transparent text-[#4B2C20]/60 hover:text-[#4B2C20]"
                  )}
                >
                  <MessageSquare className="w-4 h-4 text-[#D4A373]" />
                  {t.tabTranscript} {t.tabAnswersCount(selectedSession.messages ? Math.max(0, selectedSession.messages.filter(m => m.role === 'user').length) : 0)}
                </button>

                <button
                  onClick={() => setActiveTab('contact')}
                  className={clsx(
                    "flex items-center gap-2 px-6 py-3 font-bold text-xs uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap",
                    activeTab === 'contact'
                      ? "border-[#4B2C20] text-[#4B2C20]"
                      : "border-transparent text-[#4B2C20]/60 hover:text-[#4B2C20]"
                  )}
                >
                  <FileText className="w-4 h-4 text-[#D4A373]" />
                  {t.tabContact}
                </button>
              </div>

              {/* Tab 1: Evaluation & Confidence View */}
              {activeTab === 'evaluation' && (
                <div className="space-y-6">
                  {/* Authenticity Telemetry Summary Card */}
                  {(() => {
                    const authMetrics = getSessionAuthenticitySummary(selectedSession);
                    if (!authMetrics) {
                      return (
                        <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 shadow-xs text-center">
                          <ShieldCheck className="w-10 h-10 text-[#D4A373]/60 mx-auto mb-2" />
                          <h4 className="text-sm font-bold text-[#4B2C20]">{t.noAnswersTitle}</h4>
                          <p className="text-xs text-[#4B2C20]/60 mt-1">
                            {t.noAnswersDesc}
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 shadow-xs space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#E8DFD8]">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-[#FAF7F2] rounded-xl border border-[#E8DFD8]">
                              <ShieldCheck className="w-5 h-5 text-[#D4A373]" />
                            </div>
                            <div>
                              <h4 className="text-sm uppercase tracking-wider font-bold text-[#4B2C20]">
                                {t.authEvaluationTitle}
                              </h4>
                              <p className="text-xs text-[#4B2C20]/60 font-light">
                                {t.authEvaluationSubtitle}
                              </p>
                            </div>
                          </div>

                          {authMetrics.hasMetrics ? (
                            <span className={clsx(
                              "text-xs uppercase tracking-widest font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 w-fit",
                              authMetrics.requiresReview
                                ? "bg-amber-50 text-amber-900 border-amber-300"
                                : "bg-emerald-50 text-emerald-900 border-emerald-300"
                            )}>
                              {authMetrics.requiresReview ? t.authReviewSuggestedBadge : t.authNormalPatternBadge}
                            </span>
                          ) : (
                            <span className="text-xs uppercase tracking-widest font-bold px-3 py-1 rounded-full bg-stone-100 text-stone-700 border border-stone-300 w-fit">
                              {t.authNoTelemetryLegacy}
                            </span>
                          )}
                        </div>

                        {authMetrics.hasMetrics ? (
                          <>
                            {/* Main Score Bar */}
                            <div className="bg-[#FAF7F2] p-4 rounded-xl border border-[#E8DFD8]">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-[#4B2C20]">
                                  {t.authAvgConfidenceLabel}
                                </span>
                                <span className={clsx(
                                  "text-xl font-bold font-serif",
                                  (authMetrics.avgConfidence ?? 0) >= 70
                                    ? "text-emerald-700"
                                    : (authMetrics.avgConfidence ?? 0) >= 35
                                    ? "text-amber-700"
                                    : "text-red-700"
                                )}>
                                  {authMetrics.avgConfidence !== null ? `${authMetrics.avgConfidence}%` : 'N/A'}
                                </span>
                              </div>
                              <div className="w-full bg-neutral-200 h-2.5 rounded-full overflow-hidden">
                                <div
                                  className={clsx(
                                    "h-full transition-all duration-500 rounded-full",
                                    (authMetrics.avgConfidence ?? 0) >= 70
                                      ? "bg-emerald-600"
                                      : (authMetrics.avgConfidence ?? 0) >= 35
                                      ? "bg-amber-500"
                                      : "bg-red-500"
                                  )}
                                  style={{ width: `${Math.max(5, authMetrics.avgConfidence ?? 0)}%` }}
                                />
                              </div>
                            </div>

                            {/* Metrics Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                              <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E8DFD8]">
                                <span className="text-neutral-500 block text-[11px]">{t.authMetricAvgConfidence}</span>
                                <span className="text-base font-bold text-[#4B2C20]">
                                  {authMetrics.avgConfidence !== null ? `${authMetrics.avgConfidence}%` : 'N/A'}
                                </span>
                              </div>
                              <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E8DFD8]">
                                <span className="text-neutral-500 block text-[11px]">{t.authMetricLowestAnswer}</span>
                                <span className="text-base font-bold text-[#4B2C20]">
                                  {authMetrics.minConfidence !== null
                                    ? `#${authMetrics.minConfidenceIndex} (${authMetrics.minConfidence}%)`
                                    : 'N/A'}
                                </span>
                              </div>
                              <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E8DFD8]">
                                <span className="text-neutral-500 block text-[11px]">{t.authMetricPasteAttempts}</span>
                                <span className="text-base font-bold text-[#4B2C20]">{authMetrics.totalPasteAttempts}</span>
                              </div>
                              <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E8DFD8]">
                                <span className="text-neutral-500 block text-[11px]">{t.authMetricTabSwitches}</span>
                                <span className="text-base font-bold text-[#4B2C20]">{authMetrics.totalTabSwitches}</span>
                              </div>
                              <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E8DFD8]">
                                <span className="text-neutral-500 block text-[11px]">{t.authMetricAvgSpeed}</span>
                                <span className="text-base font-bold text-[#4B2C20]">{authMetrics.avgWpm} WPM</span>
                              </div>
                            </div>

                            {/* Individual Answers Breakdown */}
                            {authMetrics.confidenceScores.length > 0 && (
                              <div className="pt-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-[#4B2C20]/70 block mb-2">
                                  {t.authBreakdownTitle(authMetrics.confidenceScores.length)}
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {authMetrics.confidenceScores.map(item => (
                                    <div
                                      key={item.index}
                                      className="bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl px-3 py-2 text-xs flex items-center justify-between"
                                    >
                                      <span className="font-medium text-[#4B2C20]">{t.authAnswerNumber(item.index)}</span>
                                      <span
                                        className={clsx(
                                          "font-bold px-2 py-0.5 rounded-full border text-[11px]",
                                          item.score >= 70
                                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                            : item.score >= 35
                                            ? "bg-amber-50 text-amber-800 border-amber-300"
                                            : "bg-red-50 text-red-800 border-red-300"
                                        )}
                                      >
                                        {item.score}%
                                        {item.warned && ` · ${t.chipWarned}`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="bg-[#FAF7F2] p-4 rounded-xl border border-[#E8DFD8] text-xs text-[#4B2C20]/80">
                            <p>
                              {t.authLegacySessionNotice}
                            </p>
                          </div>
                        )}

                        <p className="text-[11px] text-[#4B2C20]/60 font-light">
                          {t.authFooterDisclaimer}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Evaluation Report / Generation */}
                  {selectedSession.evaluation ? (
                    <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E8DFD8]">
                        <div>
                          <h3 className="text-xl font-serif text-[#4B2C20]">{t.evalReportTitle}</h3>
                          <span className="text-xs text-[#4B2C20]/60 font-light">
                            {t.evalReportSubtitle}
                          </span>
                        </div>
                        <button
                          onClick={handleForceEvaluate}
                          disabled={isEvaluating}
                          className="flex items-center gap-1.5 px-4 py-2 bg-[#FAF7F2] border border-[#E8DFD8] text-[#4B2C20] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#F5EFE6] transition-colors disabled:opacity-50 shadow-xs"
                        >
                          {isEvaluating ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4A373]" /> {t.evalReevaluatingBtn}
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 text-[#D4A373]" /> {t.evalReevaluateBtn}
                            </>
                          )}
                        </button>
                      </div>

                      <div className="prose prose-stone max-w-none text-[#4B2C20]">
                        <Markdown>{selectedSession.evaluation}</Markdown>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white border border-[#E8DFD8] rounded-2xl p-8 shadow-xs text-center space-y-4">
                      <Award className="w-12 h-12 text-[#D4A373] mx-auto" />
                      <div>
                        <h3 className="text-lg font-serif font-bold text-[#4B2C20]">{t.evalPendingTitle}</h3>
                        <p className="text-xs text-[#4B2C20]/70 font-light max-w-md mx-auto mt-1">
                          {t.evalPendingDesc}
                        </p>
                      </div>
                      <div>
                        <button
                          onClick={handleForceEvaluate}
                          disabled={isEvaluating}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-[#4B2C20] text-[#FAF7F2] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#3E2723] transition-colors disabled:opacity-50 shadow-md"
                        >
                          {isEvaluating ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-[#D4A373]" /> {t.evalGeneratingFullBtn}
                            </>
                          ) : (
                            <>
                              <Award className="w-4 h-4 text-[#D4A373]" /> {t.evalGenerateFullBtn}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Second Interview Guide (AI Generated & Live Scoring) */}
              {activeTab === 'secondInterview' && (
                <div className="space-y-6">
                  {selectedSession.secondInterviewGuide ? (
                    (() => {
                      const guide = selectedSession.secondInterviewGuide;
                      const allQuestions = guide.questions || [];
                      const totalQuestions = allQuestions.length;
                      const scoredKeys = Object.keys(scores).filter(k => typeof scores[k] === 'number');
                      const scoredCount = scoredKeys.length;
                      const totalScoreSum = scoredKeys.reduce((acc, k) => acc + (scores[k] || 0), 0);
                      const overallAvg = scoredCount > 0 ? (totalScoreSum / scoredCount) : null;

                      // Evaluate must-pass blocks
                      const blocks = guide.blocks || [];
                      let mustPassFailed = false;
                      let mustPassExcellent = true;
                      let evaluatedMustPassBlocksCount = 0;

                      blocks.forEach(b => {
                        if (b.mustPass) {
                          const bQIds = b.questionIds || [];
                          const bScores = bQIds.map(id => scores[id]).filter(s => typeof s === 'number');
                          if (bScores.length > 0) {
                            evaluatedMustPassBlocksCount += 1;
                            const bAvg = bScores.reduce((a, c) => a + c, 0) / bScores.length;
                            if (bAvg < 2.5) {
                              mustPassFailed = true;
                            }
                            if (bAvg < 3.8) {
                              mustPassExcellent = false;
                            }
                          } else {
                            mustPassExcellent = false;
                          }
                        }
                      });

                      let calculatedVerdict: { title: string; desc: string; type: 'hire' | 'third' | 'decline' } = {
                        title: t.verdictPendingTitle,
                        desc: t.verdictPendingDesc,
                        type: 'third',
                      };

                      if (scoredCount > 0) {
                        if (mustPassFailed) {
                          calculatedVerdict = {
                            title: t.verdictDeclineTitle,
                            desc: t.verdictDeclineDesc,
                            type: 'decline',
                          };
                        } else if (mustPassExcellent && overallAvg !== null && overallAvg >= 3.8 && scoredCount >= Math.ceil(totalQuestions * 0.7)) {
                          calculatedVerdict = {
                            title: t.verdictHireTitle,
                            desc: t.verdictHireDesc,
                            type: 'hire',
                          };
                        } else {
                          calculatedVerdict = {
                            title: t.verdictThirdTitle,
                            desc: t.verdictThirdDesc,
                            type: 'third',
                          };
                        }
                      }

                      return (
                        <div className="space-y-6">
                          {/* Guide Top Header & Controls */}
                          <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-purple-700" /> {t.guideCustomBadge}
                                </span>
                                {guide.generatedAt && (
                                  <span className="text-xs text-[#4B2C20]/60 font-light">
                                    {t.guideGeneratedAt(formatInterviewDate(guide.generatedAt, lang), '')}
                                  </span>
                                )}
                              </div>
                              <h3 className="text-2xl font-serif text-[#4B2C20]">
                                {t.guideHeaderTitle}
                              </h3>
                              <p className="text-xs text-[#4B2C20]/70 font-light mt-0.5">
                                {t.guideHeaderDesc(selectedSession.candidateInfo?.name || t.applicantFallback)}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleCopyGuide(guide)}
                                className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#E8DFD8] text-[#4B2C20] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#F5EFE6] transition-colors shadow-xs"
                              >
                                {copiedGuide ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-[#D4A373]" />}
                                {copiedGuide ? t.guideCopiedBtn : t.guideCopyBtn}
                              </button>

                              <button
                                onClick={() => handleGenerateGuide(true)}
                                disabled={isGeneratingGuide}
                                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#FAF7F2] border border-[#E8DFD8] text-[#4B2C20] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#F5EFE6] transition-colors disabled:opacity-50 shadow-xs"
                                title={t.guideRegenerateTooltip}
                              >
                                {isGeneratingGuide ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4A373]" /> {t.guideRegeneratingBtn}
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 text-[#D4A373]" /> {t.guideRegenerateBtn}
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Live Recommendation & Scoring Summary Banner */}
                          <div className={clsx(
                            "rounded-2xl p-6 border transition-all shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6",
                            calculatedVerdict.type === 'hire'
                              ? "bg-emerald-50/90 border-emerald-300"
                              : calculatedVerdict.type === 'decline'
                              ? "bg-red-50/90 border-red-300"
                              : "bg-amber-50/90 border-amber-300"
                          )}>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={clsx(
                                  "text-xs uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full border",
                                  calculatedVerdict.type === 'hire'
                                    ? "bg-emerald-100 text-emerald-900 border-emerald-400"
                                    : calculatedVerdict.type === 'decline'
                                    ? "bg-red-100 text-red-900 border-red-400"
                                    : "bg-amber-100 text-amber-900 border-amber-400"
                                )}>
                                  {calculatedVerdict.title}
                                </span>
                                {saveStatus === 'saving' && (
                                  <span className="text-[11px] text-[#4B2C20]/70 flex items-center gap-1 font-medium animate-pulse">
                                    <Loader2 className="w-3 h-3 animate-spin text-[#D4A373]" /> {t.savingScore}
                                  </span>
                                )}
                                {saveStatus === 'saved' && (
                                  <span className="text-[11px] text-green-700 flex items-center gap-1 font-semibold">
                                    <Check className="w-3 h-3 text-green-600" /> {t.savedScore}
                                  </span>
                                )}
                                {saveStatus === 'error' && (
                                  <span className="text-[11px] text-red-700 flex items-center gap-1 font-semibold">
                                    <AlertCircle className="w-3 h-3 text-red-600" /> {t.errorSavingScore}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-serif text-[#4B2C20] pt-1">
                                {calculatedVerdict.desc}
                              </p>
                            </div>

                            <div className="flex items-center gap-6 shrink-0 bg-white/80 border border-[#E8DFD8] rounded-xl px-5 py-3 shadow-xs">
                              <div>
                                <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold block">
                                  {t.scoredProgressLabel}
                                </span>
                                <span className="text-lg font-serif font-bold text-[#4B2C20]">
                                  {scoredCount} / {totalQuestions}
                                </span>
                              </div>
                              <div className="border-l border-[#E8DFD8] pl-6">
                                <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold block">
                                  {t.overallAverageLabel}
                                </span>
                                <span className="text-lg font-serif font-bold text-[#4B2C20]">
                                  {overallAvg !== null ? `${overallAvg.toFixed(1)} / 5.0` : '—'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Focus Points & Tips Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {guide.focusPoints && guide.focusPoints.length > 0 && (
                              <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 shadow-xs space-y-3">
                                <div className="flex items-center gap-2 pb-2 border-b border-[#E8DFD8]">
                                  <AlertCircle className="w-4 h-4 text-[#D4A373]" />
                                  <h4 className="text-xs uppercase tracking-widest font-bold text-[#4B2C20]">
                                    {t.focusPointsTitle}
                                  </h4>
                                </div>
                                <ul className="space-y-2 text-xs text-[#4B2C20]/80 font-light leading-relaxed list-disc list-inside">
                                  {guide.focusPoints.map((pt, i) => (
                                    <li key={i} className="pl-1">
                                      <span className="font-normal text-[#4B2C20]">{pt}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {guide.interviewerTips && guide.interviewerTips.length > 0 && (
                              <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 shadow-xs space-y-3">
                                <div className="flex items-center gap-2 pb-2 border-b border-[#E8DFD8]">
                                  <HelpCircle className="w-4 h-4 text-[#D4A373]" />
                                  <h4 className="text-xs uppercase tracking-widest font-bold text-[#4B2C20]">
                                    {t.interviewerTipsTitle}
                                  </h4>
                                </div>
                                <ul className="space-y-2 text-xs text-[#4B2C20]/80 font-light leading-relaxed list-disc list-inside">
                                  {guide.interviewerTips.map((tip, i) => (
                                    <li key={i} className="pl-1">
                                      <span className="font-normal text-[#4B2C20]">{tip}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>

                          {/* Decision Framework Reference */}
                          {guide.decision && (
                            <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 shadow-xs space-y-3">
                              <h4 className="text-xs uppercase tracking-widest font-bold text-[#4B2C20] pb-2 border-b border-[#E8DFD8]">
                                {t.decisionFrameworkTitle}
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                <div className="p-3.5 rounded-xl bg-green-50 border border-green-200">
                                  <span className="font-bold text-green-900 block mb-1 uppercase tracking-wider text-[10px]">
                                    {t.decisionHireLabel}
                                  </span>
                                  <p className="text-green-800 font-light leading-relaxed">
                                    {guide.decision.hire}
                                  </p>
                                </div>

                                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                                  <span className="font-bold text-amber-900 block mb-1 uppercase tracking-wider text-[10px]">
                                    {t.decisionThirdLabel}
                                  </span>
                                  <p className="text-amber-800 font-light leading-relaxed">
                                    {guide.decision.thirdConversation}
                                  </p>
                                </div>

                                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200">
                                  <span className="font-bold text-red-900 block mb-1 uppercase tracking-wider text-[10px]">
                                    {t.decisionDeclineLabel}
                                  </span>
                                  <p className="text-red-800 font-light leading-relaxed">
                                    {guide.decision.decline}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Interview Blocks & Interactive Questions */}
                          <div className="space-y-6">
                            {blocks.map((block, bIdx) => {
                              const blockQuestions = allQuestions.filter(q => (block.questionIds || []).includes(q.id));
                              const bScores = blockQuestions.map(q => scores[q.id]).filter(s => typeof s === 'number');
                              const bAvg = bScores.length > 0 ? (bScores.reduce((a, c) => a + c, 0) / bScores.length) : null;

                              return (
                                <div
                                  key={block.id || bIdx}
                                  className="bg-white border border-[#E8DFD8] rounded-2xl p-6 md:p-8 shadow-xs space-y-6"
                                >
                                  {/* Block Header */}
                                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[#E8DFD8]">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full bg-[#FAF7F2] text-[#4B2C20] border border-[#E8DFD8]">
                                          {t.blockLabel(bIdx + 1, block.minutes)}
                                        </span>
                                        <span className={clsx(
                                          "text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full border",
                                          block.mustPass
                                            ? "bg-red-50 text-red-900 border-red-300"
                                            : "bg-neutral-50 text-neutral-700 border-neutral-200"
                                        )}>
                                          {block.mustPass ? t.blockMustPass : t.blockFormative}
                                        </span>
                                      </div>
                                      <h4 className="text-xl font-serif text-[#4B2C20]">
                                        {block.title}
                                      </h4>
                                      <p className="text-xs text-[#4B2C20]/75 font-light mt-1">
                                        <strong>{t.blockGoalLabel}</strong> {block.goal}
                                      </p>
                                    </div>

                                    {bAvg !== null && (
                                      <div className="shrink-0 flex items-center gap-2 bg-[#FAF7F2] border border-[#E8DFD8] px-3.5 py-2 rounded-xl text-xs">
                                        <span className="text-neutral-500 font-medium text-[11px] uppercase tracking-wider">{t.blockAverageLabel}</span>
                                        <span className={clsx(
                                          "font-bold font-serif text-sm",
                                          bAvg >= 3.8 ? "text-green-700" : bAvg >= 2.5 ? "text-amber-700" : "text-red-700"
                                        )}>
                                          {bAvg.toFixed(1)} / 5.0
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Questions inside Block */}
                                  <div className="space-y-6">
                                    {blockQuestions.map((question, qIdx) => {
                                      const currentScore = scores[question.id];
                                      const currentNote = notes[question.id] || '';

                                      return (
                                        <div
                                          key={question.id || qIdx}
                                          className="p-5 rounded-2xl bg-[#FAF7F2]/60 border border-[#E8DFD8] space-y-4"
                                        >
                                          {/* Question Title & Language */}
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4A373]">
                                                  {t.questionLabel(bIdx + 1, qIdx + 1)}
                                                </span>
                                                {question.language === 'en' && (
                                                  <span className="text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-300">
                                                    {t.questionEnglishBadge}
                                                  </span>
                                                )}
                                              </div>
                                              <h5 className="text-base font-serif font-medium text-[#4B2C20] leading-snug">
                                                "{question.text}"
                                              </h5>
                                              <p className="text-xs text-[#4B2C20]/70 font-light">
                                                <strong>{t.questionPurposeLabel}</strong> {question.purpose}
                                              </p>
                                            </div>
                                          </div>

                                          {/* Listen For vs Red Flags Cards */}
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5">
                                              <span className="font-bold text-emerald-900 text-[10px] uppercase tracking-wider flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3 text-emerald-700" /> {t.questionListenForTitle}
                                              </span>
                                              <ul className="space-y-1 text-emerald-950 font-light list-disc list-inside">
                                                {(question.listenFor || []).map((lf, i) => (
                                                  <li key={i}>{lf}</li>
                                                ))}
                                              </ul>
                                            </div>

                                            <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-xl space-y-1.5">
                                              <span className="font-bold text-red-900 text-[10px] uppercase tracking-wider flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3 text-red-700" /> {t.questionRedFlagsTitle}
                                              </span>
                                              <ul className="space-y-1 text-red-950 font-light list-disc list-inside">
                                                {(question.redFlags || []).map((rf, i) => (
                                                  <li key={i}>{rf}</li>
                                                ))}
                                              </ul>
                                            </div>
                                          </div>

                                          {/* Live Rating & Notes Form */}
                                          <div className="pt-2 border-t border-[#E8DFD8]/80 space-y-3">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                              <span className="text-[11px] font-bold uppercase tracking-wider text-[#4B2C20]">
                                                {t.liveRatingLabel}
                                              </span>
                                              <div className="flex items-center gap-1.5">
                                                {[1, 2, 3, 4, 5].map((val) => {
                                                  const isSelected = currentScore === val;
                                                  return (
                                                    <button
                                                      key={val}
                                                      type="button"
                                                      onClick={() => handleScoreChange(question.id, val)}
                                                      className={clsx(
                                                        "w-8 h-8 rounded-lg font-bold text-xs transition-all flex items-center justify-center border",
                                                        isSelected
                                                          ? val >= 4
                                                            ? "bg-green-700 text-white border-green-800 shadow-sm"
                                                            : val === 3
                                                            ? "bg-amber-600 text-white border-amber-700 shadow-sm"
                                                            : "bg-red-600 text-white border-red-700 shadow-sm"
                                                          : "bg-white text-[#4B2C20] border-[#E8DFD8] hover:bg-[#FAF7F2]"
                                                      )}
                                                      title={t.liveRatingTooltip(val)}
                                                    >
                                                      {val}
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            </div>

                                            <div>
                                              <textarea
                                                value={currentNote}
                                                maxLength={2000}
                                                onChange={(e) => handleNoteChange(question.id, e.target.value)}
                                                placeholder={t.notesPlaceholder}
                                                className="w-full text-xs font-light p-3 rounded-xl border border-[#E8DFD8] bg-white text-[#4B2C20] focus:ring-1 focus:ring-[#4B2C20] focus:border-[#4B2C20] outline-hidden resize-y min-h-[60px]"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="bg-white border border-[#E8DFD8] rounded-2xl p-8 md:p-12 shadow-xs text-center space-y-4">
                      <div className="w-14 h-14 bg-purple-50 border border-purple-200 rounded-2xl flex items-center justify-center mx-auto text-purple-700">
                        <Sparkles className="w-7 h-7" />
                      </div>
                      <div>
                        <h3 className="text-xl font-serif font-bold text-[#4B2C20]">
                          {t.guideEmptyTitle}
                        </h3>
                        <p className="text-xs text-[#4B2C20]/70 font-light max-w-lg mx-auto mt-2 leading-relaxed">
                          {t.guideEmptyDesc}
                        </p>
                      </div>

                      {guideError && (
                        <div className="max-w-md mx-auto p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{guideError}</span>
                        </div>
                      )}

                      <div>
                        <button
                          onClick={() => handleGenerateGuide(false)}
                          disabled={isGeneratingGuide}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-[#4B2C20] text-[#FAF7F2] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#3E2723] transition-colors disabled:opacity-50 shadow-md"
                        >
                          {isGeneratingGuide ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-[#D4A373]" /> {t.guideGeneratingBtn}
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 text-[#D4A373]" /> {t.guideGenerateBtn}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Candidate Contact Information */}
              {activeTab === 'contact' && (
                <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 md:p-8 shadow-xs">
                  <h3 className="text-xl font-serif text-[#4B2C20] mb-4 pb-2 border-b border-[#E8DFD8]">
                    {t.contactInfoHeading}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <span className="text-xs uppercase tracking-widest font-bold text-neutral-400 block mb-1">
                        {t.contactFullName}
                      </span>
                      <p className="text-base font-medium text-[#4B2C20]">
                        {selectedSession.candidateInfo?.name || t.notSpecified}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs uppercase tracking-widest font-bold text-neutral-400 block mb-1">
                        {t.contactPosition}
                      </span>
                      <p className="text-base font-medium text-[#4B2C20]">
                        {selectedSession.position || t.notSpecified}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs uppercase tracking-widest font-bold text-neutral-400 block mb-1">
                        {t.contactPhone}
                      </span>
                      <p className="text-base font-medium text-[#4B2C20]">
                        {selectedSession.candidateInfo?.phone ? (
                          <a href={`tel:${selectedSession.candidateInfo.phone}`} className="text-[#4B2C20] hover:underline flex items-center gap-1.5">
                            <Phone className="w-4 h-4 text-[#D4A373]" />
                            {selectedSession.candidateInfo.phone}
                          </a>
                        ) : t.notSpecified}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs uppercase tracking-widest font-bold text-neutral-400 block mb-1">
                        {t.contactEmail}
                      </span>
                      <p className="text-base font-medium text-[#4B2C20]">
                        {selectedSession.candidateInfo?.email ? (
                          <a href={`mailto:${selectedSession.candidateInfo.email}`} className="text-[#4B2C20] hover:underline flex items-center gap-1.5">
                            <Mail className="w-4 h-4 text-[#D4A373]" />
                            {selectedSession.candidateInfo.email}
                          </a>
                        ) : t.notSpecified}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Transcript View */}
              {activeTab === 'transcript' && (
                <div className="space-y-4">
                  {/* Action Bar inside transcript if incomplete to evaluate manually */}
                  {!selectedSession.evaluation && (
                    <div className="bg-white border border-[#E8DFD8] rounded-2xl p-4 flex items-center justify-between shadow-xs">
                      <div>
                        <h4 className="text-sm font-bold text-[#4B2C20]">{t.evaluateExistingPromptTitle}</h4>
                        <p className="text-xs text-[#4B2C20]/70 font-light">
                          {t.evaluateExistingPromptDesc}
                        </p>
                      </div>
                      <button
                        onClick={handleForceEvaluate}
                        disabled={isEvaluating}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#4B2C20] text-[#FAF7F2] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#3E2723] transition-colors disabled:opacity-50 shadow-xs"
                      >
                        {isEvaluating ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t.evalGeneratingFullBtn}
                          </>
                        ) : (
                          <>
                            <Award className="w-3.5 h-3.5 text-[#D4A373]" /> {t.evaluateExistingActionBtn}
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {selectedSession.messages.filter((_, i) => i > 0).length === 0 ? (
                    <div className="text-center py-12 px-4 bg-white border border-[#E8DFD8] rounded-2xl">
                      <MessageSquare className="w-10 h-10 text-[#D4A373]/50 mx-auto mb-3" />
                      <h3 className="text-base font-serif font-medium text-[#4B2C20] mb-1">{t.emptyTranscriptTitle}</h3>
                      <p className="text-xs font-light text-[#4B2C20]/60">
                        {t.emptyTranscriptDesc}
                      </p>
                    </div>
                  ) : (
                    selectedSession.messages.filter((_, i) => i > 0).map((msg, index) => {
                      const isAI = msg.role === 'model';
                      return (
                        <div
                          key={index}
                          className={clsx(
                            "p-5 rounded-2xl border text-sm shadow-xs",
                            isAI 
                              ? "bg-white border-[#E8DFD8] text-[#4B2C20]" 
                              : "bg-[#4B2C20] text-[#FAF7F2] border-[#4B2C20]"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className={clsx(
                              "text-[10px] uppercase font-bold tracking-widest",
                              isAI ? "text-[#D4A373]" : "text-[#D4A373]"
                            )}>
                              {isAI ? t.virtualInterviewerRole : (selectedSession.candidateInfo?.name || t.applicantFallback)}
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap font-sans font-light leading-relaxed">
                            {msg.parts?.[0]?.text || ''}
                          </div>

                          {!isAI && msg.metrics && (() => {
                            const textLen = msg.parts?.[0]?.text?.length || 0;
                            const conf = typeof msg.metrics.humanConfidence === 'number'
                              ? msg.metrics.humanConfidence
                              : humanConfidence(msg.metrics, textLen);

                            return (
                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/80 mt-2.5 pt-2.5 border-t border-white/10">
                                {conf !== null && (
                                  <span
                                    className={clsx(
                                      "font-bold px-2 py-0.5 rounded-full border flex items-center gap-1",
                                      conf >= 70
                                        ? "bg-emerald-950/70 text-emerald-300 border-emerald-500/40"
                                        : conf >= 35
                                        ? "bg-amber-950/70 text-amber-300 border-amber-500/40"
                                        : "bg-red-950/70 text-red-300 border-red-500/50"
                                    )}
                                  >
                                    {t.chipHumanConfidence(conf)}
                                    {msg.metrics.lowConfidenceWarned && (
                                      <span className="opacity-90">· {t.chipWarned}</span>
                                    )}
                                  </span>
                                )}
                                <span>WPM: {msg.metrics.wpm}</span>
                                <span>·</span>
                                <span>{t.chipPasted(msg.metrics.pasteAttempts || 0)}</span>
                                <span>·</span>
                                <span>{t.chipTabs(msg.metrics.tabSwitches || 0)}</span>
                                {msg.metrics.maxInsertChunk > 40 && (
                                  <>
                                    <span>·</span>
                                    <span className="text-amber-300 font-semibold">Chunk: {msg.metrics.maxInsertChunk}c</span>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
