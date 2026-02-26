import React, { useState } from 'react';
import { Plus, Trash2, HardDrive, Loader2, Trophy, X, ArrowRight } from 'lucide-react';
import type { SessionData, SessionSummary } from '../types';
import { useTranslation } from '../i18n/context';
import { formatLapTime } from '../utils/formatLapTime';

interface SessionListProps {
    sessions: SessionData[];
    savedSessions: SessionSummary[];
    loadingSessionId: string | null;
    onUploadClick: () => void;
    onSessionSelect: (session: SessionData) => void;
    onSessionRemove: (index: number) => void;
    onSavedSessionSelect: (id: string) => void;
    onSavedSessionDelete: (id: string) => void;
    onPairSelect?: (anaId: string, refId: string) => void;
}

const SessionList: React.FC<SessionListProps> = ({
    sessions,
    savedSessions,
    loadingSessionId,
    onUploadClick,
    onSessionSelect,
    onSessionRemove,
    onSavedSessionSelect,
    onSavedSessionDelete,
    onPairSelect,
}) => {
    const { t } = useTranslation();
    const [selectedAnaId, setSelectedAnaId] = useState<string | null>(null);
    const [selectedRefId, setSelectedRefId] = useState<string | null>(null);

    // Look up session name by id
    const getSessionLabel = (id: string): string => {
        const mem = sessions.find(s => s.id === id);
        if (mem) return `${mem.metadata.venue} ${mem.metadata.date}`;
        const saved = savedSessions.find(s => s.id === id);
        if (saved) return `${saved.metadata.venue} ${saved.metadata.date}`;
        return id;
    };

    const handleCardClick = (id: string | undefined, fallback: () => void) => {
        if (!id) { fallback(); return; }
        if (!selectedAnaId) {
            // First click → mark as ANA
            setSelectedAnaId(id);
            setSelectedRefId(null);
        } else if (selectedAnaId === id && !selectedRefId) {
            // Same ANA card → just open as single session
            setSelectedAnaId(null);
            fallback();
        } else if (selectedRefId === id) {
            // Click same REF → deselect REF
            setSelectedRefId(null);
        } else {
            // Second click on different card → mark as REF
            setSelectedRefId(id);
        }
    };

    const handleConfirmPair = () => {
        if (selectedAnaId && selectedRefId && onPairSelect) {
            onPairSelect(selectedAnaId, selectedRefId);
            setSelectedAnaId(null);
            setSelectedRefId(null);
        }
    };

    const handleClearSelection = () => {
        setSelectedAnaId(null);
        setSelectedRefId(null);
    };
    // Merge: show in-memory sessions + saved sessions not yet in memory
    const inMemoryIds = new Set(sessions.map(s => s.id).filter(Boolean));
    const savedOnly = savedSessions.filter(s => !inMemoryIds.has(s.id));

    const hasAny = sessions.length > 0 || savedOnly.length > 0;

    return (
        <div className="flex flex-col h-screen max-w-6xl mx-auto p-6 text-zinc-100">
            <header className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-white">{t.sessions.title}</h2>
                    <p className="text-zinc-400">
                        {t.sessions.subtitle}
                    </p>
                </div>
                <button
                    onClick={onUploadClick}
                    className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 transition text-white"
                >
                    <Plus className="w-4 h-4" />
                    {t.sessions.uploadSession}
                </button>
            </header>

            {selectedAnaId && (
                <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg">
                    {/* ANA label */}
                    <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded">ANA</span>
                    <span className="text-sm text-zinc-300 truncate max-w-[200px]">{getSessionLabel(selectedAnaId)}</span>

                    {selectedRefId ? (
                        <>
                            <ArrowRight size={14} className="text-zinc-500 flex-shrink-0" />
                            <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded">REF</span>
                            <span className="text-sm text-zinc-300 truncate max-w-[200px]">{getSessionLabel(selectedRefId)}</span>
                            <button
                                onClick={handleConfirmPair}
                                className="ml-auto flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
                            >
                                {t.sessions.startAnalysis}
                                <ArrowRight size={14} />
                            </button>
                        </>
                    ) : (
                        <span className="text-sm text-zinc-500">{t.sessions.selectRefPrompt}</span>
                    )}

                    <button
                        onClick={handleClearSelection}
                        className={`${selectedRefId ? '' : 'ml-auto '}flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 transition-colors`}
                    >
                        <X size={12} />
                        {t.sessions.cancelSelection}
                    </button>
                </div>
            )}

            {!hasAny ? (
                <div className="flex flex-col items-center justify-center flex-1 border-2 border-dashed border-zinc-800 rounded-3xl p-12 text-zinc-500">
                    <p className="text-lg mb-4">{t.sessions.noSessionsFound}</p>
                    <p className="text-sm">{t.sessions.uploadToStart}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* In-memory sessions */}
                    {sessions.map((session, index) => {
                        const bestLap = session.laps.length
                            ? Math.min(...session.laps.map(l => l.duration))
                            : null;
                        const meta = session.metadata;
                        const sessionTypeLabels: Record<string, string> = {
                            practice: t.upload.typePractice,
                            race: t.upload.typeRace,
                            warmup: t.upload.typeWarmup,
                            trackday: t.upload.typeTrackday,
                        };
                        const isAna = selectedAnaId != null && session.id === selectedAnaId;
                        const isRef = selectedRefId != null && session.id === selectedRefId;
                        return (
                            <div
                                key={session.id || `mem-${index}`}
                                onClick={() => handleCardClick(session.id, () => onSessionSelect(session))}
                                className={`bg-zinc-900 border rounded-xl p-6 cursor-pointer transition group relative ${
                                    isAna
                                        ? 'border-red-500 ring-1 ring-red-500/30'
                                        : isRef
                                        ? 'border-blue-500 ring-1 ring-blue-500/30'
                                        : 'border-zinc-800 hover:border-blue-500/50'
                                }`}
                            >
                                {isAna && (
                                    <div className="absolute -top-2 -left-2 px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded-md shadow-lg">
                                        ANA
                                    </div>
                                )}
                                {isRef && (
                                    <div className="absolute -top-2 -left-2 px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-md shadow-lg">
                                        REF
                                    </div>
                                )}
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition">{meta.venue}</h3>
                                        {meta.condition && (
                                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                                meta.condition === 'dry'
                                                    ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/50'
                                                    : 'bg-blue-900/40 text-blue-400 border border-blue-800/50'
                                            }`}>
                                                {meta.condition === 'dry' ? t.upload.conditionDry : t.upload.conditionWet}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSessionRemove(index);
                                        }}
                                        className="text-zinc-500 hover:text-red-500 transition p-2 hover:bg-zinc-800 rounded-full"
                                        title={t.sessions.removeSession}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <div className="space-y-1 text-sm text-zinc-400">
                                    <p>{meta.date} {meta.time}</p>
                                    <p>
                                        {meta.bikeModel || meta.vehicle}
                                        {meta.sessionType && <> · {sessionTypeLabels[meta.sessionType] ?? meta.sessionType}</>}
                                    </p>
                                    {meta.eventName && (
                                        <p className="text-xs text-zinc-500">{meta.eventName}</p>
                                    )}
                                    <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between items-center">
                                        <span>{t.common.laps}: {session.laps.length}</span>
                                        {bestLap != null && (
                                            <span className="flex items-center gap-1 text-yellow-400 font-mono text-sm font-medium">
                                                <Trophy size={14} />
                                                {formatLapTime(bestLap)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Saved-only sessions (not in memory) */}
                    {savedOnly.map(summary => {
                        const isLoading = loadingSessionId === summary.id;
                        const meta = summary.metadata;
                        const sessionTypeLabels: Record<string, string> = {
                            practice: t.upload.typePractice,
                            race: t.upload.typeRace,
                            warmup: t.upload.typeWarmup,
                            trackday: t.upload.typeTrackday,
                        };
                        const isAna = selectedAnaId != null && summary.id === selectedAnaId;
                        const isRef = selectedRefId != null && summary.id === selectedRefId;
                        return (
                            <div
                                key={summary.id}
                                onClick={() => !isLoading && handleCardClick(summary.id, () => onSavedSessionSelect(summary.id))}
                                className={`bg-zinc-900 border rounded-xl p-6 cursor-pointer transition group relative ${
                                    isLoading ? 'opacity-60 pointer-events-none' :
                                    isAna ? 'border-red-500 ring-1 ring-red-500/30' :
                                    isRef ? 'border-blue-500 ring-1 ring-blue-500/30' :
                                    'border-zinc-800 hover:border-blue-500/50'
                                }`}
                            >
                                {isAna && (
                                    <div className="absolute -top-2 -left-2 px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded-md shadow-lg">
                                        ANA
                                    </div>
                                )}
                                {isRef && (
                                    <div className="absolute -top-2 -left-2 px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-md shadow-lg">
                                        REF
                                    </div>
                                )}
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition">{meta.venue}</h3>
                                        <span title="Saved to device"><HardDrive size={14} className="text-zinc-500" /></span>
                                        {meta.condition && (
                                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                                meta.condition === 'dry'
                                                    ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/50'
                                                    : 'bg-blue-900/40 text-blue-400 border border-blue-800/50'
                                            }`}>
                                                {meta.condition === 'dry' ? t.upload.conditionDry : t.upload.conditionWet}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSavedSessionDelete(summary.id);
                                        }}
                                        className="text-zinc-500 hover:text-red-500 transition p-2 hover:bg-zinc-800 rounded-full"
                                        title={t.sessions.deleteSavedSession}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <div className="space-y-1 text-sm text-zinc-400">
                                    <p>{meta.date} {meta.time}</p>
                                    <p>
                                        {meta.bikeModel || meta.vehicle}
                                        {meta.sessionType && <> · {sessionTypeLabels[meta.sessionType] ?? meta.sessionType}</>}
                                    </p>
                                    {meta.eventName && (
                                        <p className="text-xs text-zinc-500">{meta.eventName}</p>
                                    )}
                                    <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between items-center">
                                        <span>{t.common.laps}: {summary.lapCount}</span>
                                        <div className="flex items-center gap-2">
                                            {summary.bestLapTime != null && (
                                                <span className="flex items-center gap-1 text-yellow-400 font-mono text-sm font-medium">
                                                    <Trophy size={14} />
                                                    {formatLapTime(summary.bestLapTime)}
                                                </span>
                                            )}
                                            {isLoading && (
                                                <span className="flex items-center gap-1 text-blue-400 text-xs">
                                                    <Loader2 size={12} className="animate-spin" />
                                                    {t.sessions.restoring}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default SessionList;
