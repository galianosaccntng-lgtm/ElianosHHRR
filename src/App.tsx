import React, { useState, useEffect } from 'react';
import { Welcome } from './components/Welcome';
import { Interview } from './components/Interview';
import { Dashboard } from './components/Dashboard';
import { AdminLoginModal } from './components/AdminLoginModal';
import { Position, InterviewSession, CandidateInfo } from './types';

const STORAGE_KEY = 'ellianos_candidate_sessions_v1';
const CURRENT_ID_KEY = 'ellianos_active_session_id_v1';
const ADMIN_AUTH_KEY = 'ellianos_admin_passcode_token';

function getLocalSessions(): InterviewSession[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.warn('Error reading localStorage:', e);
    return [];
  }
}

export default function App() {
  const [sessions, setSessions] = useState<InterviewSession[]>(() => {
    return getLocalSessions();
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

  // Sync state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
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

  // Sync candidate's own session to server
  const syncSessionToServer = (session: InterviewSession) => {
    fetch('/api/sessions/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session })
    }).catch((err) => console.warn('[ServerSync] Failed to sync session with server:', err));
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

    setSessions(prev => [newSession, ...prev]);
    syncSessionToServer(newSession);
    setCurrentSessionId(newSession.id);
    setShowDashboard(false);
  };

  const updateSession = (updatedSession: InterviewSession) => {
    setSessions(prev => {
      const idx = prev.findIndex(s => s.id === updatedSession.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedSession;
        return next;
      }
      return [updatedSession, ...prev];
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
          hasSessions={sessions.length > 0}
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
