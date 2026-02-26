import { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import FileUpload from './components/FileUpload';
import Landing from './components/Landing';
import SessionList from './components/SessionList';
import type { SessionData, SessionSummary } from './types';
import { saveSession, listSessions, loadSession, deleteSession } from './utils/sessionStorage';
import { reconstructSession } from './utils/sessionReconstruct';

type ViewState = 'landing' | 'list' | 'upload' | 'analysis';

function App() {
  const [view, setView] = useState<ViewState>('landing');
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [currentSession, setCurrentSession] = useState<SessionData | null>(null);
  const [refSession, setRefSession] = useState<SessionData | null>(null);
  const [savedSessions, setSavedSessions] = useState<SessionSummary[]>([]);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  // Load saved session list on mount
  useEffect(() => {
    listSessions().then(setSavedSessions);
  }, []);

  const handleSessionLoaded = async (data: SessionData) => {
    const id = await saveSession(data);
    data.id = id;
    setSessions(prev => [...prev, data]);
    setView('list');
    listSessions().then(setSavedSessions);
  };

  const handleSessionSelect = (data: SessionData) => {
    setCurrentSession(data);
    setRefSession(null);
    setView('analysis');
  };

  const handleSessionRemove = (index: number) => {
    const session = sessions[index];
    const removedCurrent = currentSession === session;

    // Also remove from IndexedDB if it has an id
    if (session?.id) {
      deleteSession(session.id).then(() => listSessions().then(setSavedSessions));
    }

    setSessions(prev => prev.filter((_, i) => i !== index));

    if (removedCurrent) {
      setCurrentSession(null);
      setView('list');
    }
  };

  const loadOrGetSession = async (id: string): Promise<SessionData | null> => {
    const existing = sessions.find(s => s.id === id);
    if (existing) return existing;
    const stored = await loadSession(id);
    if (!stored) return null;
    const session = await reconstructSession(stored);
    setSessions(prev => [...prev, session]);
    return session;
  };

  const handleSavedSessionSelect = async (id: string) => {
    setLoadingSessionId(id);
    try {
      const session = await loadOrGetSession(id);
      if (!session) return;
      setCurrentSession(session);
      setRefSession(null);
      setView('analysis');
    } finally {
      setLoadingSessionId(null);
    }
  };

  const handlePairSelect = async (anaId: string, refId: string) => {
    setLoadingSessionId(anaId);
    try {
      const [ana, ref] = await Promise.all([loadOrGetSession(anaId), loadOrGetSession(refId)]);
      if (!ana) return;
      setCurrentSession(ana);
      setRefSession(ref);
      setView('analysis');
    } finally {
      setLoadingSessionId(null);
    }
  };

  const handleSavedSessionDelete = async (id: string) => {
    await deleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSession?.id === id) {
      setCurrentSession(null);
      setView('list');
    }
    setSavedSessions(await listSessions());
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-blue-500/30">
      {view === 'landing' && (
        <Landing
          onStart={() => setView('upload')}
          onSeeSessions={() => setView('list')}
          savedSessionCount={savedSessions.length}
        />
      )}

      {view === 'list' && (
        <SessionList
          sessions={sessions}
          savedSessions={savedSessions}
          loadingSessionId={loadingSessionId}
          onUploadClick={() => setView('upload')}
          onSessionSelect={handleSessionSelect}
          onSessionRemove={handleSessionRemove}
          onSavedSessionSelect={handleSavedSessionSelect}
          onSavedSessionDelete={handleSavedSessionDelete}
          onPairSelect={handlePairSelect}
        />
      )}

      {view === 'upload' && (
        <FileUpload
          onDataLoaded={handleSessionLoaded}
          onCancel={() => setView(sessions.length || savedSessions.length ? 'list' : 'landing')}
        />
      )}

      {view === 'analysis' && currentSession && (
        <Dashboard
          data={currentSession}
          refSession={refSession}
          onReset={() => {
            setCurrentSession(null);
            setRefSession(null);
            setView('list');
          }}
        />
      )}
    </div>
  );
}

export default App;
