import React, { useState, useEffect } from 'react';
import { InterviewSession, InterviewStatus } from '../types';
import { ArrowLeft, CheckCircle2, MessageSquare, ChevronRight, FileText, Trash2, Award, Copy, Check, ShieldCheck, LogOut, RefreshCw, Search, Mail, Phone, Loader2, AlertCircle, Clock, PlayCircle, ExternalLink } from 'lucide-react';
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

export function Dashboard({ adminToken, onBack, onLogout, onResume, onDelete, onSessionsUpdated }: DashboardProps) {
  const [sessions, setSessions] = useState<InterviewSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
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
              // Local session was not on server; sync it
              fetch('/api/sessions/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session: ls }),
              }).catch(console.error);
              mergedMap.set(ls.id, ls);
            } else {
              // Merge: prefer completed over in progress if more updated
              const existing = mergedMap.get(ls.id)!;
              if (ls.status === 'Completed' && existing.status !== 'Completed') {
                mergedMap.set(ls.id, { ...existing, ...ls });
              }
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

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el registro de entrevista de ${name || 'este candidato'}?`)) {
      return;
    }
    setSessions(prev => prev.filter(s => s.id !== id));
    if (selectedSessionId === id) setSelectedSessionId(null);
    if (onDelete) onDelete(id);
    if (adminToken) {
      await fetch(`/api/admin/sessions/${id}`, {
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

  // Counts by status
  const completedCount = sessions.filter(s => getEffectiveStatus(s) === 'Completed').length;
  const inProgressCount = sessions.filter(s => getEffectiveStatus(s) === 'In Progress').length;
  const incompleteCount = sessions.filter(s => getEffectiveStatus(s) === 'Incomplete').length;

  const filteredSessions = sessions.filter(session => {
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

        <div className="flex items-center gap-3">
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
          {!selectedSession ? (
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
                  type="button"
                  onClick={() => setStatusFilter('All')}
                  className={clsx(
                    "p-4 rounded-2xl border text-left transition-all",
                    statusFilter === 'All' 
                      ? "bg-[#4B2C20] text-[#FAF7F2] border-[#4B2C20] shadow-md" 
                      : "bg-white border-[#E8DFD8] hover:border-[#D4A373] text-[#4B2C20]"
                  )}
                >
                  <span className="text-[10px] uppercase tracking-widest font-bold block opacity-70 mb-1">Total Registrados</span>
                  <span className="text-2xl font-serif font-bold">{sessions.length}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('Completed')}
                  className={clsx(
                    "p-4 rounded-2xl border text-left transition-all",
                    statusFilter === 'Completed' 
                      ? "bg-green-800 text-white border-green-800 shadow-md" 
                      : "bg-white border-[#E8DFD8] hover:border-green-400 text-[#4B2C20]"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-green-700">Completadas</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  </div>
                  <span className="text-2xl font-serif font-bold text-green-700">{completedCount}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('In Progress')}
                  className={clsx(
                    "p-4 rounded-2xl border text-left transition-all",
                    statusFilter === 'In Progress' 
                      ? "bg-blue-800 text-white border-blue-800 shadow-md" 
                      : "bg-white border-[#E8DFD8] hover:border-blue-400 text-[#4B2C20]"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-blue-700">En Progreso</span>
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <span className="text-2xl font-serif font-bold text-blue-700">{inProgressCount}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('Incomplete')}
                  className={clsx(
                    "p-4 rounded-2xl border text-left transition-all",
                    statusFilter === 'Incomplete' 
                      ? "bg-amber-700 text-white border-amber-700 shadow-md" 
                      : "bg-white border-[#E8DFD8] hover:border-amber-400 text-[#4B2C20]"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-amber-700">Incompletas</span>
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <span className="text-2xl font-serif font-bold text-amber-700">{incompleteCount}</span>
                </button>
              </div>

              {/* Search & Filters Bar */}
              <div className="bg-white border border-[#E8DFD8] rounded-2xl p-4 mb-6 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
                <div className="relative w-full md:w-72">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre, teléfono, email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-xs bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl text-[#4B2C20] placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#D4A373]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <select
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                    className="px-3 py-2 text-xs bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl text-[#4B2C20] font-medium focus:outline-none focus:ring-2 focus:ring-[#D4A373]"
                  >
                    <option value="All">Todas las Posiciones</option>
                    <option value="Barista">Barista</option>
                    <option value="Shift Leader">Shift Leader</option>
                    <option value="Store Manager">Store Manager</option>
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 text-xs bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl text-[#4B2C20] font-medium focus:outline-none focus:ring-2 focus:ring-[#D4A373]"
                  >
                    <option value="All">Todos los Estados ({sessions.length})</option>
                    <option value="Completed">Completadas ({completedCount})</option>
                    <option value="In Progress">En Progreso ({inProgressCount})</option>
                    <option value="Incomplete">Incompletas / Solo Registro ({incompleteCount})</option>
                  </select>
                </div>
              </div>

              {isLoading ? (
                <div className="flex flex-col items-center justify-center p-16 bg-white border border-[#E8DFD8] rounded-2xl">
                  <Loader2 className="w-8 h-8 text-[#D4A373] animate-spin mb-3" />
                  <p className="text-sm font-medium text-[#4B2C20]/70">Cargando registros de candidatos del servidor...</p>
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="text-center py-16 px-4 bg-white border border-[#E8DFD8] rounded-2xl">
                  <FileText className="w-12 h-12 text-[#D4A373]/60 mx-auto mb-4" />
                  <h3 className="text-lg font-serif font-medium text-[#4B2C20] mb-2">No se encontraron candidatos</h3>
                  <p className="text-sm font-light text-[#4B2C20]/60 max-w-sm mx-auto">
                    {searchQuery || statusFilter !== 'All' || positionFilter !== 'All' 
                      ? "Ningún registro coincide con los filtros seleccionados." 
                      : "Aún no se han registrado aplicaciones en el sistema."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredSessions.map((session) => {
                    const effectiveStatus = getEffectiveStatus(session);
                    const userResponsesCount = session.messages ? session.messages.filter((m, i) => m.role === 'user' && i > 0).length : 0;
                    const authSummary = getSessionAuthenticitySummary(session);
                    
                    return (
                      <div 
                        key={session.id}
                        className="bg-white border border-[#E8DFD8] rounded-2xl p-6 shadow-xs hover:border-[#D4A373] transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                      >
                        <div className="space-y-2 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold text-[#D4A373] uppercase tracking-wider">
                              {formatInterviewDate(session.date)}
                            </span>
                            
                            {effectiveStatus === 'Completed' && (
                              <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Completada
                              </span>
                            )}

                            {effectiveStatus === 'In Progress' && (
                              <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> En Progreso ({userResponsesCount} resp.)
                              </span>
                            )}

                            {effectiveStatus === 'Incomplete' && (
                              <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 text-amber-700" /> Incompleta / Solo Registro
                              </span>
                            )}

                            {session.evaluation && (
                              <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full bg-[#4B2C20] text-[#FAF7F2] flex items-center gap-1">
                                <Award className="w-3 h-3 text-[#D4A373]" /> Evaluada por IA
                              </span>
                            )}

                            {authSummary && authSummary.requiresReview && (
                              <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                                ⚠ Revisar autenticidad
                              </span>
                            )}
                          </div>

                          <h3 className="text-xl font-serif text-[#4B2C20]">
                            {session.candidateInfo?.name || 'Aplicante Sin Nombre'}
                          </h3>
                          
                          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-[#4B2C20]/75 font-light">
                            <span className="font-medium text-[#4B2C20]">Posición: <strong>{session.position || 'No especificada'}</strong></span>
                            {session.candidateInfo?.email && (
                              <a 
                                href={`mailto:${session.candidateInfo.email}`} 
                                className="flex items-center gap-1 hover:text-[#D4A373] transition-colors"
                                title="Enviar email"
                              >
                                <Mail className="w-3.5 h-3.5 text-[#D4A373]" /> {session.candidateInfo.email}
                              </a>
                            )}
                            {session.candidateInfo?.phone && (
                              <a 
                                href={`tel:${session.candidateInfo.phone}`} 
                                className="flex items-center gap-1 hover:text-[#D4A373] transition-colors"
                                title="Llamar por teléfono"
                              >
                                <Phone className="w-3.5 h-3.5 text-[#D4A373]" /> {session.candidateInfo.phone}
                              </a>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <button
                            onClick={() => {
                              setSelectedSessionId(session.id);
                              if (session.evaluation) {
                                setActiveTab('evaluation');
                              } else if (effectiveStatus === 'Incomplete' && userResponsesCount === 0) {
                                setActiveTab('contact');
                              } else {
                                setActiveTab('transcript');
                              }
                            }}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-[#4B2C20] text-[#FAF7F2] rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-[#3E2723] transition-colors shadow-xs"
                          >
                            {session.evaluation ? (
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
                            title="Eliminar registro"
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
                    {copiedContact ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedContact ? 'Ficha Copiada' : 'Copiar Contacto'}
                  </button>

                  <button
                    onClick={handleCopyTranscript}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#E8DFD8] text-[#4B2C20] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#F5EFE6] transition-colors shadow-xs"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <MessageSquare className="w-3.5 h-3.5" />}
                    {copied ? 'Copiado' : 'Copiar Transcripción'}
                  </button>

                  <button
                    onClick={() => handleDelete(selectedSession.id, selectedSession.candidateInfo?.name || '')}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar
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
                    <div className="flex items-center gap-2">
                      {selectedSession.candidateInfo?.phone && (
                        <a 
                          href={`tel:${selectedSession.candidateInfo.phone}`}
                          className="px-3 py-1.5 bg-amber-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-amber-800 transition-colors flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3" /> Llamar
                        </a>
                      )}
                      {selectedSession.candidateInfo?.email && (
                        <button 
                          onClick={() => handleSendFollowUp(selectedSession)}
                          disabled={isSendingFollowUp}
                          className={clsx(
                            "px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-60",
                            followUpSuccessEmail
                              ? "bg-green-600 text-white border border-green-700"
                              : "bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
                          )}
                          title="Enviar correo de seguimiento automático al candidato"
                        >
                          {isSendingFollowUp ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...
                            </>
                          ) : followUpSuccessEmail ? (
                            <>
                              <Check className="w-3.5 h-3.5" /> Enviado
                            </>
                          ) : (
                            <>
                              <Mail className="w-3.5 h-3.5" /> Email
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Authenticity Summary Bar (if metrics exist) */}
              {(() => {
                const detailAuth = getSessionAuthenticitySummary(selectedSession);
                if (!detailAuth) return null;

                return (
                  <div className="mb-6 p-4 bg-[#FAF7F2] border border-[#E8DFD8] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wider font-bold text-[#D4A373]">
                        Señales de Autenticidad:
                      </span>
                      {detailAuth.requiresReview ? (
                        <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                          ⚠ Revisar autenticidad
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">
                          ✓ Normales
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#4B2C20]">
                      <span>WPM Promedio: <strong className="font-semibold text-[#4B2C20]">{detailAuth.avgWpm}</strong></span>
                      <span>Intentos de Pegado: <strong className={clsx("font-semibold", detailAuth.totalPasteAttempts > 0 ? "text-amber-800" : "text-[#4B2C20]")}>{detailAuth.totalPasteAttempts}</strong></span>
                      <span>Cambios de Pestaña: <strong className={clsx("font-semibold", detailAuth.totalTabSwitches > 3 ? "text-amber-800" : "text-[#4B2C20]")}>{detailAuth.totalTabSwitches}</strong></span>
                      <span>Inserciones &gt;40c: <strong className={clsx("font-semibold", detailAuth.largeInsertChunksCount > 0 ? "text-amber-800" : "text-[#4B2C20]")}>{detailAuth.largeInsertChunksCount}</strong></span>
                    </div>
                  </div>
                );
              })()}

              {/* Tabs Bar */}
              <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-[#E8DFD8] pb-3">
                {selectedSession.evaluation && (
                  <button
                    onClick={() => setActiveTab('evaluation')}
                    className={clsx(
                      "px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5",
                      activeTab === 'evaluation' ? "bg-[#4B2C20] text-[#FAF7F2] shadow-xs" : "text-[#4B2C20]/70 hover:text-[#4B2C20] hover:bg-[#F5EFE6]"
                    )}
                  >
                    <Award className="w-3.5 h-3.5 text-[#D4A373]" /> Evaluación y Puntuación IA
                  </button>
                )}
                
                <button
                  onClick={() => setActiveTab('transcript')}
                  className={clsx(
                    "px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5",
                    activeTab === 'transcript' ? "bg-[#4B2C20] text-[#FAF7F2] shadow-xs" : "text-[#4B2C20]/70 hover:text-[#4B2C20] hover:bg-[#F5EFE6]"
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Transcripción ({selectedSession.messages.length} mensajes)
                </button>

                <button
                  onClick={() => setActiveTab('contact')}
                  className={clsx(
                    "px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5",
                    activeTab === 'contact' ? "bg-[#4B2C20] text-[#FAF7F2] shadow-xs" : "text-[#4B2C20]/70 hover:text-[#4B2C20] hover:bg-[#F5EFE6]"
                  )}
                >
                  <FileText className="w-3.5 h-3.5" /> Ficha de Contacto
                </button>

                {!selectedSession.evaluation && (
                  <button
                    onClick={handleForceEvaluate}
                    disabled={isEvaluating}
                    className="ml-auto px-3.5 py-1.5 bg-[#D4A373] text-[#4B2C20] hover:bg-[#c49363] rounded-xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isEvaluating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Evaluando...
                      </>
                    ) : (
                      <>
                        <Award className="w-3.5 h-3.5" />
                        Generar Evaluación IA
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Tab Contents */}
              {activeTab === 'evaluation' && selectedSession.evaluation ? (
                <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 md:p-10 shadow-xs prose prose-sm max-w-none prose-headings:font-serif prose-headings:text-[#4B2C20] prose-hr:border-[#E8DFD8]">
                  <Markdown>{selectedSession.evaluation}</Markdown>
                </div>
              ) : activeTab === 'contact' ? (
                <div className="bg-white border border-[#E8DFD8] rounded-2xl p-8 shadow-xs max-w-2xl mx-auto space-y-6">
                  <div className="border-b border-[#E8DFD8] pb-4">
                    <span className="text-[10px] uppercase tracking-widest text-[#D4A373] font-bold block mb-1">
                      Ficha Oficial del Candidato
                    </span>
                    <h3 className="text-2xl font-serif text-[#4B2C20]">{selectedSession.candidateInfo?.name || 'Sin Nombre'}</h3>
                    <p className="text-xs text-[#4B2C20]/70">Posición solicitada: <strong>{selectedSession.position || 'No especificada'}</strong></p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#4B2C20]/60 block">Teléfono</span>
                      <p className="text-sm font-medium text-[#4B2C20]">{selectedSession.candidateInfo?.phone || 'No registrado'}</p>
                      {selectedSession.candidateInfo?.phone && (
                        <a 
                          href={`tel:${selectedSession.candidateInfo.phone}`} 
                          className="inline-flex items-center gap-1 text-xs text-[#D4A373] font-bold hover:underline pt-1"
                        >
                          <Phone className="w-3 h-3" /> Realizar Llamada
                        </a>
                      )}
                    </div>

                    <div className="p-4 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#4B2C20]/60 block">Correo Electrónico</span>
                      <p className="text-sm font-medium text-[#4B2C20]">{selectedSession.candidateInfo?.email || 'No registrado'}</p>
                      {selectedSession.candidateInfo?.email && (
                        <a 
                          href={`mailto:${selectedSession.candidateInfo.email}`} 
                          className="inline-flex items-center gap-1 text-xs text-[#D4A373] font-bold hover:underline pt-1"
                        >
                          <Mail className="w-3 h-3" /> Enviar Correo
                        </a>
                      )}
                    </div>

                    <div className="p-4 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#4B2C20]/60 block">Fecha y Hora de Aplicación</span>
                      <p className="text-sm font-medium text-[#4B2C20]">{formatInterviewDate(selectedSession.date)}</p>
                    </div>

                    <div className="p-4 bg-[#FAF7F2] border border-[#E8DFD8] rounded-xl space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#4B2C20]/60 block">Progreso de la Entrevista</span>
                      <p className="text-sm font-medium text-[#4B2C20]">
                        {selectedSession.messages.filter((m, idx) => m.role === 'user' && idx > 0).length} preguntas respondidas
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-between border-t border-[#E8DFD8]">
                    <span className="text-xs text-neutral-400">ID de Sesión: {selectedSession.id}</span>
                    <button
                      onClick={handleCopyContact}
                      className="px-4 py-2 bg-[#4B2C20] text-[#FAF7F2] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#3E2723] transition-colors"
                    >
                      {copiedContact ? 'Copiado!' : 'Copiar Todos los Datos'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-[#E8DFD8] rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
                  {selectedSession.messages.length <= 1 ? (
                    <div className="text-center py-12 px-4">
                      <AlertCircle className="w-10 h-10 text-[#D4A373] mx-auto mb-3" />
                      <h4 className="text-base font-serif font-bold text-[#4B2C20] mb-1">Sin Respuestas Registradas</h4>
                      <p className="text-xs text-[#4B2C20]/70 max-w-md mx-auto mb-4">
                        Este candidato registró sus datos de contacto pero no envió mensajes durante la entrevista.
                      </p>
                      <button
                        onClick={() => setActiveTab('contact')}
                        className="px-4 py-2 bg-[#4B2C20] text-[#FAF7F2] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#3E2723]"
                      >
                        Ver Ficha de Contacto Directo
                      </button>
                    </div>
                  ) : (
                    selectedSession.messages.filter(msg => !(msg.role === 'user' && selectedSession.messages.indexOf(msg) === 0)).map((msg, i) => {
                      const isModel = msg.role === 'model';
                      return (
                        <div key={i} className={clsx("flex flex-col max-w-[85%]", isModel ? "mr-auto" : "ml-auto items-end")}>
                          <span className="text-[10px] uppercase tracking-widest text-[#D4A373] font-bold mb-1 ml-1">
                            {isModel ? 'Ellianos AI Recruiter' : (selectedSession.candidateInfo?.name || 'Applicant')}
                          </span>
                          <div className={clsx(
                            "px-5 py-4 rounded-2xl shadow-xs text-[15px] leading-relaxed",
                            isModel 
                              ? "bg-[#F5F5F5] border border-[#E8DFD8] text-[#4B2C20] rounded-tl-none" 
                              : "bg-[#4B2C20] text-[#FAF7F2] rounded-tr-none"
                          )}>
                            {isModel ? (
                              <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-a:text-[#D4A373] prose-headings:font-serif">
                                <Markdown>{msg.parts?.[0]?.text || ''}</Markdown>
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap font-light">{msg.parts?.[0]?.text || ''}</p>
                            )}
                          </div>
                          {msg.metrics && (
                            <span className="text-[10px] text-[#4B2C20]/50 mt-1 mr-1 flex items-center gap-2">
                              <span>WPM: {msg.metrics.wpm}</span>
                              <span>·</span>
                              <span>Pegado: {msg.metrics.pasteAttempts || 0}</span>
                              <span>·</span>
                              <span>Pestañas: {msg.metrics.tabSwitches || 0}</span>
                              {msg.metrics.maxInsertChunk > 40 && (
                                <>
                                  <span>·</span>
                                  <span className="text-amber-800 font-semibold">Chunk: {msg.metrics.maxInsertChunk}c</span>
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
