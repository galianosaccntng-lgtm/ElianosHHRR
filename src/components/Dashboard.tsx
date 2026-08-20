import React, { useState, useEffect } from 'react';
import { InterviewSession, InterviewStatus } from '../types';
import { ArrowLeft, CheckCircle2, MessageSquare, ChevronRight, FileText, Trash2, Award, Copy, Check, ShieldCheck, LogOut, RefreshCw, Search, Mail, Phone, Loader2, AlertCircle, Clock, PlayCircle, ExternalLink, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import Markdown from 'react-markdown';

interface DashboardProps {
  adminToken: string | null;
  onBack: () => void;
  onLogout: () => void;
  onResume: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
  onSessionsUpdated?: (sessions: InterviewSession[]) => void;
}

const STORAGE_KEY = 'ellianos_candidate_sessions_v1';

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
  const userMessages = (session.messages || []).filter(m => m.role === 'user' && m.metrics);
  if (userMessages.length === 0) {
    return null;
  }

  let totalPasteAttempts = 0;
  let totalTabSwitches = 0;
  let totalWpm = 0;
  let largeInsertChunksCount = 0;

  userMessages.forEach(m => {
    const met = m.metrics!;
    totalPasteAttempts += met.pasteAttempts || 0;
    totalTabSwitches += met.tabSwitches || 0;
    totalWpm += met.wpm || 0;
    if ((met.maxInsertChunk || 0) > 40) {
      largeInsertChunksCount += 1;
    }
  });

  const avgWpm = Math.round(totalWpm / userMessages.length);
  const requiresReview = totalPasteAttempts > 0 || totalTabSwitches > 3 || largeInsertChunksCount > 0;

  return {
    totalPasteAttempts,
    totalTabSwitches,
    avgWpm,
    largeInsertChunksCount,
    requiresReview,
    answersWithMetricsCount: userMessages.length,
  };
}

function formatInterviewDate(dateStr?: string): string {
  if (!dateStr) return 'Fecha Reciente';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Fecha Reciente';
  return `${d.toLocaleDateString()} a las ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function getDaysRemaining(deletedAt?: string | null): number {
  if (!deletedAt) return 30;
  const d = new Date(deletedAt).getTime();
  if (isNaN(d)) return 30;
  const elapsedDays = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
  return Math.max(0, 30 - elapsedDays);
}

export function Dashboard({ adminToken, onBack, onLogout, onResume, onDelete, onSessionsUpdated }: DashboardProps) {
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
  const [activeTab, setActiveTab] = useState<'evaluation' | 'transcript' | 'contact'>('transcript');
  const [copied, setCopied] = useState(false);
  const [copiedContact, setCopiedContact] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpSuccessEmail, setFollowUpSuccessEmail] = useState<string | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

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

  // Soft delete: moves to trash
  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`¿Mover la entrevista de ${name || 'este candidato'} a la papelera? Podrás restaurarla durante 30 días.`)) {
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
    if (!window.confirm(`Esta acción NO se puede deshacer. ¿Eliminar definitivamente la entrevista de ${name || 'este candidato'}?`)) {
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
      .map(m => `[${m.role === 'model' ? 'Ellianos AI' : (selectedSession.candidateInfo?.name || 'Applicant')}]:\n${m.parts?.[0]?.text || ''}`)
      .join('\n\n---\n\n');

    navigator.clipboard.writeText(text || 'No hay transcripción registrada para este candidato.');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyContact = () => {
    if (!selectedSession) return;
    const contactText = `CANDIDATO: ${selectedSession.candidateInfo?.name || 'Sin Nombre'}
POSICIÓN: ${selectedSession.position || 'No especificada'}
TELÉFONO: ${selectedSession.candidateInfo?.phone || 'No registrado'}
EMAIL: ${selectedSession.candidateInfo?.email || 'No registrado'}
FECHA DE APLICACIÓN: ${formatInterviewDate(selectedSession.date)}
ESTADO: ${getEffectiveStatus(selectedSession)}`;

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
      alert('No se pudo generar la evaluación en este momento.');
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSendFollowUp = async (session: InterviewSession) => {
    if (!session || !session.id || !adminToken || isSendingFollowUp) return;
    const email = session.candidateInfo?.email;
    if (!email) {
      alert('El candidato no tiene un correo electrónico registrado.');
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
        throw new Error(data.error || 'No se pudo enviar el correo de seguimiento.');
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
      setFollowUpError(err.message || 'Error al enviar correo de seguimiento.');
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
            <span className="font-serif font-bold text-lg text-[#4B2C20]">Candidate Dashboard</span>
            <span className="bg-[#4B2C20] text-[#FAF7F2] text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-md">
              RRHH
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
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
            title="Ver papelera de reciclaje"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#D4A373]" />
            <span>Papelera ({trashSessions.length})</span>
          </button>

          <button
            onClick={fetchServerSessions}
            title="Refrescar lista"
            className="p-2 text-[#4B2C20]/70 hover:text-[#4B2C20] hover:bg-[#F5EFE6] rounded-xl transition-colors"
          >
            <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin text-[#D4A373]")} />
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-red-700 hover:bg-red-50 rounded-xl transition-colors border border-red-200"
          >
            <LogOut className="w-3.5 h-3.5" /> Cerrar Sesión
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
                    <ArrowLeft className="w-3.5 h-3.5" /> Volver al Panel de Candidatos
                  </button>
                  <h1 className="text-3xl md:text-4xl font-serif text-[#4B2C20] mb-2 flex items-center gap-3">
                    <Trash2 className="w-7 h-7 text-[#D4A373]" />
                    Papelera de Reciclaje ({trashSessions.length})
                  </h1>
                  <p className="text-[#4B2C20]/70 font-light text-sm">
                    Entrevistas eliminadas temporalmente. Puedes restaurarlas a la lista principal o eliminarlas definitivamente.
                  </p>
                </div>
              </div>

              {/* Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-center gap-3 text-xs text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Los elementos se eliminan definitivamente después de 30 días.</span>
              </div>

              {trashSessions.length === 0 ? (
                <div className="text-center py-16 px-4 bg-white border border-[#E8DFD8] rounded-2xl">
                  <Trash2 className="w-12 h-12 text-[#D4A373]/50 mx-auto mb-4" />
                  <h3 className="text-lg font-serif font-medium text-[#4B2C20] mb-2">La papelera está vacía</h3>
                  <p className="text-sm font-light text-[#4B2C20]/60 max-w-sm mx-auto">
                    Las entrevistas eliminadas aparecerán aquí y podrán restaurarse durante 30 días.
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
                              Eliminada: {formatInterviewDate(session.deletedAt || session.date)}
                            </span>
                            <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-700" /> {daysLeft} {daysLeft === 1 ? 'día restante' : 'días restantes'} antes de la purga
                            </span>
                          </div>

                          <h3 className="text-xl font-serif text-[#4B2C20]">
                            {session.candidateInfo?.name || 'Aplicante Sin Nombre'}
                          </h3>

                          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-[#4B2C20]/75 font-light">
                            <span className="font-medium text-[#4B2C20]">Posición: <strong>{session.position || 'No especificada'}</strong></span>
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
                            Restaurar
                          </button>

                          <button
                            onClick={() => handlePermanentDelete(session.id, session.candidateInfo?.name || '')}
                            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar Definitivamente
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
                    Panel Exclusivo de Recursos Humanos (RRHH)
                  </span>
                  <h1 className="text-3xl md:text-4xl font-serif text-[#4B2C20] mb-2">
                    Candidate Applications & Tracking
                  </h1>
                  <p className="text-[#4B2C20]/70 font-light text-sm">
                    Registro centralizado de todas las aplicaciones: completadas, en curso e incompletas (solo registro de datos).
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
                    Total Activas
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
                      Completadas
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
                      En Curso
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
                      Incompletas / Lead
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
                    placeholder="Buscar por nombre, correo, teléfono o puesto..."
                    className="w-full pl-10 pr-4 py-2 bg-[#FAF7F2]/60 border border-[#E8DFD8] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A373] text-[#4B2C20]"
                  />
                </div>

                <div className="flex gap-2">
                  <select
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                    className="px-3 py-2 bg-[#FAF7F2]/60 border border-[#E8DFD8] rounded-xl text-xs font-medium text-[#4B2C20] focus:outline-none focus:ring-2 focus:ring-[#D4A373]"
                  >
                    <option value="All">Todos los Puestos</option>
                    <option value="Barista">Barista</option>
                    <option value="Shift Leader">Shift Leader</option>
                    <option value="Store Manager">Store Manager</option>
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-[#FAF7F2]/60 border border-[#E8DFD8] rounded-xl text-xs font-medium text-[#4B2C20] focus:outline-none focus:ring-2 focus:ring-[#D4A373]"
                  >
                    <option value="All">Todos los Estados</option>
                    <option value="Completed">Completadas</option>
                    <option value="In Progress">En Progreso</option>
                    <option value="Incomplete">Incompletas / Lead</option>
                  </select>
                </div>
              </div>

              {/* Candidates List */}
              {activeSessions.length === 0 ? (
                <div className="text-center py-16 px-4 bg-white border border-[#E8DFD8] rounded-2xl">
                  <FileText className="w-12 h-12 text-[#D4A373]/50 mx-auto mb-4" />
                  <h3 className="text-lg font-serif font-medium text-[#4B2C20] mb-2">No hay candidatos registrados</h3>
                  <p className="text-sm font-light text-[#4B2C20]/60 max-w-sm mx-auto">
                    Aún no se han recibido aplicaciones ni inicios de entrevistas. Los candidatos aparecerán aquí automáticamente en tiempo real.
                  </p>
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="text-center py-12 px-4 bg-white border border-[#E8DFD8] rounded-2xl">
                  <Search className="w-10 h-10 text-[#D4A373]/50 mx-auto mb-3" />
                  <h3 className="text-base font-serif font-medium text-[#4B2C20] mb-1">Sin resultados</h3>
                  <p className="text-xs font-light text-[#4B2C20]/60">
                    No se encontraron candidatos que coincidan con los filtros o término de búsqueda.
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
                              {formatInterviewDate(session.date)}
                            </span>
                            
                            <span className={clsx(
                              "text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full",
                              effectiveStatus === 'Completed' 
                                ? "bg-green-100 text-green-800 border border-green-200" 
                                : effectiveStatus === 'In Progress'
                                ? "bg-blue-100 text-blue-800 border border-blue-200"
                                : "bg-amber-100 text-amber-900 border border-amber-300"
                            )}>
                              {effectiveStatus === 'Completed' ? 'Completada' : effectiveStatus === 'In Progress' ? 'En Progreso' : 'Incompleta / Datos Registrados'}
                            </span>

                            {authSummary && (
                              <span
                                className={clsx(
                                  "text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border",
                                  authSummary.requiresReview
                                    ? "bg-amber-50 text-amber-800 border-amber-200"
                                    : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                )}
                                title={
                                  authSummary.requiresReview
                                    ? `Pegado: ${authSummary.totalPasteAttempts} · Pestañas: ${authSummary.totalTabSwitches} · WPM: ${authSummary.avgWpm}`
                                    : `Escritura fluida (${authSummary.avgWpm} WPM)`
                                }
                              >
                                {authSummary.requiresReview ? '⚠ Revisar autenticidad' : '✓ Auténtico'}
                              </span>
                            )}

                            {session.emailSent && (
                              <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200 flex items-center gap-1">
                                <Mail className="w-2.5 h-2.5" /> Email RRHH Enviado
                              </span>
                            )}

                            {session.followUpSentAt && (
                              <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                                <Mail className="w-2.5 h-2.5 text-amber-600" /> Recordatorio Enviado
                              </span>
                            )}
                          </div>

                          <h3 className="text-xl font-serif text-[#4B2C20]">
                            {session.candidateInfo?.name || 'Aplicante Sin Nombre'}
                          </h3>

                          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-[#4B2C20]/75 font-light">
                            <span className="font-medium text-[#4B2C20]">Posición: <strong>{session.position || 'No especificada'}</strong></span>
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
                              {session.messages ? Math.max(0, session.messages.filter(m => m.role === 'user').length) : 0} respuestas dadas
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                          {effectiveStatus === 'In Progress' && (
                            <button
                              onClick={() => onResume(session.id)}
                              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-[#F5EFE6] text-[#4B2C20] hover:bg-[#E8DFD8] rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border border-[#D4A373]/40"
                              title="Continuar simulación de entrevista"
                            >
                              <PlayCircle className="w-3.5 h-3.5 text-[#D4A373]" />
                              Continuar
                            </button>
                          )}

                          {effectiveStatus === 'Incomplete' && (
                            <button
                              onClick={() => handleSendFollowUp(session)}
                              disabled={isSendingFollowUp}
                              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-900 hover:bg-amber-100 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border border-amber-300 disabled:opacity-50"
                              title="Enviar recordatorio automático por correo electrónico"
                            >
                              <Mail className="w-3.5 h-3.5 text-amber-700" />
                              {session.followUpSentAt ? 'Reenviar Recordatorio' : 'Enviar Recordatorio'}
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
                                Ver Evaluación
                              </>
                            ) : effectiveStatus === 'Incomplete' ? (
                              <>
                                <FileText className="w-4 h-4 text-[#D4A373]" />
                                Ver Ficha / Datos
                              </>
                            ) : (
                              <>
                                <MessageSquare className="w-4 h-4 text-[#D4A373]" />
                                Ver Transcripción
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleDelete(session.id, session.candidateInfo?.name || '')}
                            title="Mover a la papelera"
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
                    <ArrowLeft className="w-3.5 h-3.5" /> Volver a Lista de Candidatos
                  </button>
                  <h1 className="text-3xl md:text-4xl font-serif leading-tight text-[#4B2C20]">
                    {selectedSession.candidateInfo?.name || 'Aplicante'} &mdash; {selectedSession.position}
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
                      Estado: {getEffectiveStatus(selectedSession) === 'Completed' ? 'Completada' : getEffectiveStatus(selectedSession) === 'In Progress' ? 'En Progreso' : 'Incompleta / Solo Datos'}
                    </span>
                    {(() => {
                      const detailAuth = getSessionAuthenticitySummary(selectedSession);
                      if (detailAuth && detailAuth.requiresReview) {
                        return (
                          <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                            ⚠ Revisar autenticidad
                          </span>
                        );
                      }
                      return null;
                    })()}
                    <span className="text-xs text-[#4B2C20]/70 font-light">
                      Registrado el {formatInterviewDate(selectedSession.date)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleCopyContact}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#E8DFD8] text-[#4B2C20] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#F5EFE6] transition-colors shadow-xs"
                  >
                    {copiedContact ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-[#D4A373]" />}
                    {copiedContact ? 'Ficha Copiada' : 'Copiar Contacto'}
                  </button>

                  <button
                    onClick={handleCopyTranscript}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#E8DFD8] text-[#4B2C20] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#F5EFE6] transition-colors shadow-xs"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <MessageSquare className="w-3.5 h-3.5 text-[#D4A373]" />}
                    {copied ? 'Copiado' : 'Copiar Transcripción'}
                  </button>

                  <button
                    onClick={() => handleDelete(selectedSession.id, selectedSession.candidateInfo?.name || '')}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Mover a Papelera
                  </button>
                </div>
              </div>

              {/* Incomplete Banner */}
              {getEffectiveStatus(selectedSession) === 'Incomplete' && !selectedSession.evaluation && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-amber-900">Aplicación Incompleta / Solo Datos Iniciales</h4>
                      <p className="text-xs text-amber-800 font-light mt-0.5">
                        El candidato llenó el formulario de registro pero no completó o abandonó la entrevista virtual. Tiene los datos de contacto listos para seguimiento telefónico o por correo.
                      </p>
                      {followUpSuccessEmail && (
                        <div className="mt-2 text-xs font-semibold text-green-700 flex items-center gap-1.5 bg-green-50 border border-green-200 px-2.5 py-1 rounded-lg">
                          <Check className="w-3.5 h-3.5" /> Correo de seguimiento enviado a {followUpSuccessEmail}
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
                        Último recordatorio: {new Date(selectedSession.followUpSentAt).toLocaleDateString()}
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
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Mail className="w-3.5 h-3.5" />
                          {selectedSession.followUpSentAt ? 'Reenviar Correo' : 'Enviar Recordatorio'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Navigation Tabs */}
              <div className="flex border-b border-[#E8DFD8] mb-6">
                {selectedSession.evaluation && (
                  <button
                    onClick={() => setActiveTab('evaluation')}
                    className={clsx(
                      "flex items-center gap-2 px-6 py-3 font-bold text-xs uppercase tracking-widest border-b-2 transition-colors",
                      activeTab === 'evaluation'
                        ? "border-[#4B2C20] text-[#4B2C20]"
                        : "border-transparent text-[#4B2C20]/60 hover:text-[#4B2C20]"
                    )}
                  >
                    <Award className="w-4 h-4 text-[#D4A373]" />
                    Evaluación de RRHH
                  </button>
                )}

                <button
                  onClick={() => setActiveTab('contact')}
                  className={clsx(
                    "flex items-center gap-2 px-6 py-3 font-bold text-xs uppercase tracking-widest border-b-2 transition-colors",
                    activeTab === 'contact'
                      ? "border-[#4B2C20] text-[#4B2C20]"
                      : "border-transparent text-[#4B2C20]/60 hover:text-[#4B2C20]"
                  )}
                >
                  <FileText className="w-4 h-4 text-[#D4A373]" />
                  Ficha de Contacto
                </button>

                <button
                  onClick={() => setActiveTab('transcript')}
                  className={clsx(
                    "flex items-center gap-2 px-6 py-3 font-bold text-xs uppercase tracking-widest border-b-2 transition-colors",
                    activeTab === 'transcript'
                      ? "border-[#4B2C20] text-[#4B2C20]"
                      : "border-transparent text-[#4B2C20]/60 hover:text-[#4B2C20]"
                  )}
                >
                  <MessageSquare className="w-4 h-4 text-[#D4A373]" />
                  Transcripción de la Entrevista ({selectedSession.messages ? Math.max(0, selectedSession.messages.filter(m => m.role === 'user').length) : 0})
                </button>
              </div>

              {/* Tab 1: Evaluation View */}
              {activeTab === 'evaluation' && selectedSession.evaluation && (
                <div className="space-y-6">
                  {/* Authenticity Telemetry Summary Card */}
                  {(() => {
                    const authMetrics = getSessionAuthenticitySummary(selectedSession);
                    if (!authMetrics) return null;
                    return (
                      <div className="bg-white border border-[#E8DFD8] rounded-2xl p-5 shadow-xs">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                          <h4 className="text-xs uppercase tracking-widest font-bold text-[#4B2C20] flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-[#D4A373]" />
                            Señales de Autenticidad del Candidato
                          </h4>
                          <span className={clsx(
                            "text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full border inline-block w-fit",
                            authMetrics.requiresReview
                              ? "bg-amber-50 text-amber-900 border-amber-300"
                              : "bg-emerald-50 text-emerald-900 border-emerald-300"
                          )}>
                            {authMetrics.requiresReview ? '⚠ Revisión sugerida' : '✓ Patrón de escritura normal'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E8DFD8]">
                            <span className="text-neutral-500 block text-[11px]">Intentos de Pegado</span>
                            <span className="text-base font-bold text-[#4B2C20]">{authMetrics.totalPasteAttempts}</span>
                          </div>
                          <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E8DFD8]">
                            <span className="text-neutral-500 block text-[11px]">Cambios de Pestaña</span>
                            <span className="text-base font-bold text-[#4B2C20]">{authMetrics.totalTabSwitches}</span>
                          </div>
                          <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E8DFD8]">
                            <span className="text-neutral-500 block text-[11px]">Velocidad Promedio</span>
                            <span className="text-base font-bold text-[#4B2C20]">{authMetrics.avgWpm} WPM</span>
                          </div>
                          <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#E8DFD8]">
                            <span className="text-neutral-500 block text-[11px]">Inserciones Grandes (&gt;40c)</span>
                            <span className="text-base font-bold text-[#4B2C20]">{authMetrics.largeInsertChunksCount}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-[#4B2C20]/60 mt-3 font-light">
                          Nota: Estas métricas son orientativas para RRHH y evalúan el ritmo de escritura y foco durante la entrevista.
                        </p>
                      </div>
                    );
                  })()}

                  <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 md:p-8 shadow-xs">
                    <div className="prose prose-stone max-w-none text-[#4B2C20]">
                      <Markdown>{selectedSession.evaluation}</Markdown>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Candidate Contact Information */}
              {activeTab === 'contact' && (
                <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 md:p-8 shadow-xs">
                  <h3 className="text-xl font-serif text-[#4B2C20] mb-4 pb-2 border-b border-[#E8DFD8]">
                    Información Registrada del Candidato
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <span className="text-xs uppercase tracking-widest font-bold text-neutral-400 block mb-1">
                        Nombre Completo
                      </span>
                      <p className="text-base font-medium text-[#4B2C20]">
                        {selectedSession.candidateInfo?.name || 'No especificado'}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs uppercase tracking-widest font-bold text-neutral-400 block mb-1">
                        Puesto de Interés
                      </span>
                      <p className="text-base font-medium text-[#4B2C20]">
                        {selectedSession.position || 'No especificado'}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs uppercase tracking-widest font-bold text-neutral-400 block mb-1">
                        Teléfono
                      </span>
                      <p className="text-base font-medium text-[#4B2C20]">
                        {selectedSession.candidateInfo?.phone ? (
                          <a href={`tel:${selectedSession.candidateInfo.phone}`} className="text-[#4B2C20] hover:underline flex items-center gap-1.5">
                            <Phone className="w-4 h-4 text-[#D4A373]" />
                            {selectedSession.candidateInfo.phone}
                          </a>
                        ) : 'No especificado'}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs uppercase tracking-widest font-bold text-neutral-400 block mb-1">
                        Correo Electrónico
                      </span>
                      <p className="text-base font-medium text-[#4B2C20]">
                        {selectedSession.candidateInfo?.email ? (
                          <a href={`mailto:${selectedSession.candidateInfo.email}`} className="text-[#4B2C20] hover:underline flex items-center gap-1.5">
                            <Mail className="w-4 h-4 text-[#D4A373]" />
                            {selectedSession.candidateInfo.email}
                          </a>
                        ) : 'No especificado'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Transcript View */}
              {activeTab === 'transcript' && (
                <div className="space-y-4">
                  {/* Action Bar inside transcript if incomplete to evaluate manually */}
                  {!selectedSession.evaluation && (
                    <div className="bg-white border border-[#E8DFD8] rounded-2xl p-4 flex items-center justify-between shadow-xs">
                      <div>
                        <h4 className="text-sm font-bold text-[#4B2C20]">¿Deseas evaluar las respuestas existentes?</h4>
                        <p className="text-xs text-[#4B2C20]/70 font-light">
                          Puedes forzar la evaluación con las respuestas registradas hasta el momento.
                        </p>
                      </div>
                      <button
                        onClick={handleForceEvaluate}
                        disabled={isEvaluating}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#4B2C20] text-[#FAF7F2] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#3E2723] transition-colors disabled:opacity-50 shadow-xs"
                      >
                        {isEvaluating ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generando...
                          </>
                        ) : (
                          <>
                            <Award className="w-3.5 h-3.5 text-[#D4A373]" /> Evaluar Respuestas
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {selectedSession.messages.filter((_, i) => i > 0).length === 0 ? (
                    <div className="text-center py-12 px-4 bg-white border border-[#E8DFD8] rounded-2xl">
                      <MessageSquare className="w-10 h-10 text-[#D4A373]/50 mx-auto mb-3" />
                      <h3 className="text-base font-serif font-medium text-[#4B2C20] mb-1">Sin mensajes registrados</h3>
                      <p className="text-xs font-light text-[#4B2C20]/60">
                        El candidato se registró pero no inició la conversación virtual con el asistente.
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
                              {isAI ? 'Ellianos Virtual Interviewer' : (selectedSession.candidateInfo?.name || 'Applicant')}
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap font-sans font-light leading-relaxed">
                            {msg.parts?.[0]?.text || ''}
                          </div>

                          {!isAI && msg.metrics && (
                            <span className="inline-flex items-center gap-1.5 text-[10px] text-white/70 mt-2 pt-2 border-t border-white/10">
                              <span>WPM: {msg.metrics.wpm}</span>
                              <span>·</span>
                              <span>Pegado: {msg.metrics.pasteAttempts || 0}</span>
                              <span>·</span>
                              <span>Pestañas: {msg.metrics.tabSwitches || 0}</span>
                              {msg.metrics.maxInsertChunk > 40 && (
                                <>
                                  <span>·</span>
                                  <span className="text-amber-300 font-semibold">Chunk: {msg.metrics.maxInsertChunk}c</span>
                                </>
                              )}
                            </span>
                          )}
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
