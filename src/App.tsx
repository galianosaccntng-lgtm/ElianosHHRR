import React, { useState, useEffect } from 'react';
import { Welcome } from './components/Welcome';
import { Interview } from './components/Interview';
import { Dashboard } from './components/Dashboard';
import { AdminLoginModal } from './components/AdminLoginModal';
import { Position, InterviewSession, CandidateInfo } from './types';

const STORAGE_KEY = 'ellianos_candidate_sessions_v1';
const CURRENT_ID_KEY = 'ellianos_active_session_id_v1';
const ADMIN_AUTH_KEY = 'ellianos_admin_passcode_token';

function getMergedLocalSessions(): InterviewSession[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.warn('Error reading localStorage:', e);
    return [];
  }
}

function mergeSessionLists(listA: InterviewSession[], listB: InterviewSession[]): InterviewSession[] {
  const map = new Map<string, InterviewSession>();
  for (const s of listA) {
    if (s && s.id) map.set(s.id, s);
  }
  for (const s of listB) {
    if (s && s.id) {
      if (!map.has(s.id)) {
        console.log(`[StorageSync] New session identified during merge: id=${s.id}, candidate=${s.candidateInfo?.name || 'Unknown'}`);
        map.set(s.id, s);
      } else {
        const existing = map.get(s.id)!;
        const sMsgs = s.messages?.length || 0;
        const eMsgs = existing.messages?.length || 0;
        
        // Retain the most complete and recent version
        if (s.status === 'Completed' || sMsgs >= eMsgs || s.evaluation) {
          console.log(`[StorageSync] Updating session record: id=${s.id} (status: ${existing.status} -> ${s.status}, messages: ${eMsgs} -> ${sMsgs})`);
          map.set(s.id, { ...existing, ...s });
        } else {
          console.log(`[StorageSync] Preserving existing more complete session record: id=${s.id} (existing msgs: ${eMsgs} vs incoming msgs: ${sMsgs})`);
        }
      }
    }
  }
  const result = Array.from(map.values()).sort((a, b) => {
    const tA = a.date ? new Date(a.date).getTime() : 0;
    const tB = b.date ? new Date(b.date).getTime() : 0;
    return tB - tA;
  });
  console.log(`[StorageSync] Merged total active sessions count: ${result.length}`);
  return result;
}

export default function App() {
  const [sessions, setSessions] = useState<InterviewSession[]>(() => {
    return getMergedLocalSessions();
  });

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CURRENT_ID_KEY) || null;
    } catch {
      return null;
    }
  });

  const [showDashboard, setShowDashboard] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(ADMIN_AUTH_KEY) || null;
    } catch {
      return null;
    }
  });

  // Load server sessions on startup and merge safely with localStorage
  useEffect(() => {
    const loadServerSessions = async () => {
      try {
        const res = await fetch('/api/sessions');
        if (res.ok) {
          const data = await res.json();
          const serverSessions: InterviewSession[] = data.sessions || [];
          if (serverSessions.length > 0) {
            setSessions(prev => {
              const local = getMergedLocalSessions();
              const merged = mergeSessionLists(serverSessions, mergeSessionLists(prev, local));
              try {
                console.log(`[LocalStorage:ServerSync] Initiating write: merged array length before write = ${merged.length}`);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
                const verifiedLength = getMergedLocalSessions().length;
                console.log(`[LocalStorage:ServerSync] Write verified successfully: array length in storage after write = ${verifiedLength}`);
              } catch (e) {
                console.warn('Unable to write merged sessions to localStorage:', e);
              }
              return merged;
            });
          }
        }
      } catch (err) {
        console.warn('Initial session fetch from server skipped or failed:', err);
      }
    };
    loadServerSessions();
  }, []);

  // Sync to localStorage only when sessions has items or is actively managed
  useEffect(() => {
    try {
      if (sessions.length > 0) {
        const currentLocal = getMergedLocalSessions();
        const localBeforeLen = currentLocal.length;
        const merged = mergeSessionLists(currentLocal, sessions);
        console.log(`[LocalStorage:StateSync] Initiating write: localBeforeLength = ${localBeforeLen}, inStateLength = ${sessions.length}, mergedLengthBeforeWrite = ${merged.length}`);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        const verifiedLength = getMergedLocalSessions().length;
        console.log(`[LocalStorage:StateSync] Write verified successfully: array length in storage after write = ${verifiedLength}`);
      }
    } catch (e) {
      console.warn('Unable to sync to localStorage:', e);
    }
  }, [sessions]);

  useEffect(() => {
    try {
      if (currentSessionId) {
        localStorage.setItem(CURRENT_ID_KEY, currentSessionId);
      } else {
        localStorage.removeItem(CURRENT_ID_KEY);
      }
    } catch (e) {
      console.warn('Unable to sync session ID:', e);
    }
  }, [currentSessionId]);

  // Sync candidate session directly to the server database
  const syncSessionToServer = (session: InterviewSession) => {
    console.log(`[ServerSync] Dispatching session to server: id=${session.id}, status=${session.status}, candidate=${session.candidateInfo?.name || 'Unknown'}`);
    fetch('/api/sessions/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session })
    })
      .then(res => {
        if (res.ok) {
          console.log(`[ServerSync] Successfully confirmed server storage for session: id=${session.id}`);
        } else {
          console.warn(`[ServerSync] Server response non-OK (${res.status}) for session: id=${session.id}`);
        }
      })
      .catch((err) => console.warn('[ServerSync] Failed to sync session with server:', err));
  };

  const startNewInterview = (position: Position, candidateInfo: CandidateInfo) => {
    const newSession: InterviewSession = {
      id: crypto.randomUUID(),
      position,
      candidateInfo,
      messages: [],
      status: 'Incomplete',
      date: new Date().toISOString()
    };

    console.log(`[SessionLifecycle] Starting new interview: id=${newSession.id}, position=${position}, candidate=${candidateInfo.name}`);

    setSessions(prev => {
      const local = getMergedLocalSessions();
      const localBeforeLen = local.length;
      const merged = mergeSessionLists([newSession], mergeSessionLists(prev, local));
      try {
        console.log(`[LocalStorage:startNewInterview] Initiating write: localBeforeLength = ${localBeforeLen}, mergedLengthBeforeWrite = ${merged.length}`);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        const verifiedLength = getMergedLocalSessions().length;
        console.log(`[LocalStorage:startNewInterview] Write verified successfully: array length in storage after write = ${verifiedLength}`);
      } catch (e) {
        console.warn('Unable to write to localStorage in startNewInterview:', e);
      }
      return merged;
    });

    syncSessionToServer(newSession);
    setCurrentSessionId(newSession.id);
    setShowDashboard(false);
  };

  const updateSession = (updatedSession: InterviewSession) => {
    setSessions(prev => {
      const local = getMergedLocalSessions();
      const localBeforeLen = local.length;
      const base = mergeSessionLists(prev, local);
      const exists = base.some(s => s.id === updatedSession.id);

      if (exists) {
        console.log(`[SessionLifecycle] Updating existing session record: id=${updatedSession.id}, messagesCount=${updatedSession.messages?.length || 0}, status=${updatedSession.status}`);
      } else {
        console.log(`[SessionLifecycle] Appending non-existent session record into active sessions: id=${updatedSession.id}`);
      }

      const merged = base.map(s => s.id === updatedSession.id ? updatedSession : s);
      if (!exists) {
        merged.unshift(updatedSession);
      }
      try {
        console.log(`[LocalStorage:updateSession] Initiating write: localBeforeLength = ${localBeforeLen}, mergedLengthBeforeWrite = ${merged.length}`);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        const verifiedLength = getMergedLocalSessions().length;
        console.log(`[LocalStorage:updateSession] Write verified successfully: array length in storage after write = ${verifiedLength}`);
      } catch (e) {
        console.warn('Unable to write to localStorage in updateSession:', e);
      }
      return merged;
    });

    syncSessionToServer(updatedSession);
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
    }
    if (adminToken) {
      fetch(`/api/admin/sessions/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-passcode': adminToken }
      }).catch(console.error);
    }
  };

  const handleOpenStaffPortal = () => {
    if (adminToken) {
      setShowDashboard(true);
    } else {
      setShowAdminModal(true);
    }
  };

  const handleAdminSuccess = (token: string) => {
    sessionStorage.setItem(ADMIN_AUTH_KEY, token);
    setAdminToken(token);
    setShowAdminModal(false);
    setShowDashboard(true);
  };

  const currentSession = sessions.find(s => s.id === currentSessionId);

  if (showDashboard) {
    return (
      <Dashboard 
        adminToken={adminToken}
        onBack={() => setShowDashboard(false)} 
        onLogout={() => {
          sessionStorage.removeItem(ADMIN_AUTH_KEY);
          setAdminToken(null);
          setShowDashboard(false);
        }}
        onResume={(id) => {
          setCurrentSessionId(id);
          setShowDashboard(false);
        }}
        onDelete={deleteSession}
        onSessionsUpdated={(updatedList) => setSessions(updatedList)}
      />
    );
  }

  return (
    <>
      {!currentSession ? (
        <Welcome 
          onSelectPosition={startNewInterview} 
          onOpenDashboard={handleOpenStaffPortal} 
          hasSessions={true}
        />
      ) : (
        <Interview 
          session={currentSession} 
          onUpdateSession={updateSession}
          onBack={() => setCurrentSessionId(null)} 
        />
      )}

      {showAdminModal && (
        <AdminLoginModal
          onSuccess={handleAdminSuccess}
          onClose={() => setShowAdminModal(false)}
        />
      )}
    </>
  );
}



