import { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import FileUpload from './components/FileUpload';
import Landing from './components/Landing';
import SessionList from './components/SessionList';
import TrackEditor from './components/TrackEditor';
import type { SessionData, SessionSummary } from './types';
import { saveSession, listSessions, loadSession, deleteSession, updateSessionMetadata } from './utils/sessionStorage';
import { reconstructSession } from './utils/sessionReconstruct';
import { useAuth } from './auth/AuthContext';
import { apiFetch } from './utils/apiClient';
import { setTracks } from './data/tracks';

type ViewState = 'landing' | 'list' | 'upload' | 'analysis' | 'track-editor';

function App() {
  const { user } = useAuth();
  const [view, setView] = useState<ViewState>('landing');
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [currentSession, setCurrentSession] = useState<SessionData | null>(null);
  const [refSession, setRefSession] = useState<SessionData | null>(null);
  const [savedSessions, setSavedSessions] = useState<SessionSummary[]>([]);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  // Load tracks from API on mount (falls back to bundled data)
  useEffect(() => {
    apiFetch('/api/tracks')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.tracks) setTracks(data.tracks); })
      .catch(() => {});
  }, []);

  // Load saved session list on mount and when user changes
  useEffect(() => {
    listSessions(user?.id).then(setSavedSessions);
  }, [user?.id]);

  const handleSessionLoaded = async (data: SessionData) => {
    const id = await saveSession(data, user?.id);
    data.id = id;
    setSessions(prev => [...prev, data]);
    setView('list');
    listSessions(user?.id).then(setSavedSessions);
  };

  const handleBatchLoaded = async (batchSessions: SessionData[]) => {
    const ids = await Promise.all(batchSessions.map(d => saveSession(d, user?.id)));
    batchSessions.forEach((d, i) => { d.id = ids[i]; });
    setSessions(prev => [...prev, ...batchSessions]);
    setView('list');
    listSessions(user?.id).then(setSavedSessions);
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
      deleteSession(session.id).then(() => listSessions(user?.id).then(setSavedSessions));
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
    setSavedSessions(await listSessions(user?.id));
  };

  const handleSessionMetadataUpdate = async (id: string, metadata: Partial<SessionData['metadata']>) => {
    await updateSessionMetadata(id, metadata);
    // Update in-memory sessions
    setSessions(prev => prev.map(s => s.id === id ? { ...s, metadata: { ...s.metadata, ...metadata } } : s));
    setSavedSessions(await listSessions(user?.id));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-blue-500/30">
      {/* Global logo bar — shown on non-landing, non-analysis screens */}
      {view !== 'landing' && view !== 'analysis' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-950 border-b border-zinc-800/50 flex-shrink-0">
          <button
            onClick={() => setView('landing')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/10 text-xs font-bold text-emerald-200">
              M
            </div>
            <span className="text-xs uppercase tracking-[0.2em] text-emerald-200/80 font-medium">motolap</span>
          </button>
        </div>
      )}

      {view === 'landing' && (
        <Landing
          onStart={() => setView('upload')}
          onSeeSessions={() => setView('list')}
          onTrackEditor={() => setView('track-editor')}
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
          onSessionMetadataUpdate={handleSessionMetadataUpdate}
          onPairSelect={handlePairSelect}
          onBack={() => setView('landing')}
        />
      )}

      {view === 'upload' && (
        <FileUpload
          onDataLoaded={handleSessionLoaded}
          onBatchLoaded={handleBatchLoaded}
          onCancel={() => setView(sessions.length || savedSessions.length ? 'list' : 'landing')}
          existingFileNames={[
            ...sessions.map(s => s.metadata.fileName).filter((n): n is string => !!n),
            ...savedSessions.map(s => s.metadata.fileName).filter((n): n is string => !!n),
          ]}
        />
      )}

      {view === 'track-editor' && (
        <TrackEditor onBack={() => setView('landing')} />
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
          onHome={() => setView('landing')}
        />
      )}
    </div>
  );
}

export default App;
