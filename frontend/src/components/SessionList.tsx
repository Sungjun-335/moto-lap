import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, HardDrive, Loader2, Trophy, X, ArrowRight, ArrowLeft, FileText, User, Sparkles, Pencil } from 'lucide-react';
import type { SessionData, SessionSummary } from '../types';
import { useTranslation } from '../i18n/context';
import { formatLapTime } from '../utils/formatLapTime';
import { pickBestLap } from '../utils/lapFilter';
import { listAllReports, deleteReport } from '../utils/sessionStorage';
import type { StoredReport } from '../utils/sessionStorage';
import { renderMarkdown, markdownStyles } from '../utils/markdownRenderer';

/** Format date string to compact Korean form: "8/16 (토)" */
function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    // Try parsing with Date constructor (handles "August 16, 2025", "2025-08-16", etc.)
    const d = new Date(dateStr);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
    }
    // Fallback: try splitting DD/MM/YYYY
    const parts = dateStr.split(/[-/.]/);
    if (parts.length >= 3) {
        let y: number, m: number, day: number;
        if (Number(parts[0]) > 31) {
            y = Number(parts[0]); m = Number(parts[1]); day = Number(parts[2]);
        } else if (Number(parts[1]) > 12) {
            m = Number(parts[0]); day = Number(parts[1]); y = Number(parts[2]);
        } else {
            day = Number(parts[0]); m = Number(parts[1]); y = Number(parts[2]);
        }
        const d2 = new Date(y, m - 1, day);
        if (!isNaN(d2.getTime())) {
            const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
            return `${m}/${day} (${weekdays[d2.getDay()]})`;
        }
    }
    return dateStr;
}

interface SessionListProps {
    sessions: SessionData[];
    savedSessions: SessionSummary[];
    loadingSessionId: string | null;
    onUploadClick: () => void;
    onSessionSelect: (session: SessionData) => void;
    onSessionRemove: (index: number) => void;
    onSavedSessionSelect: (id: string) => void;
    onSavedSessionDelete: (id: string) => void;
    onSessionMetadataUpdate?: (id: string, metadata: Partial<SessionData['metadata']>) => void;
    onDeleteAll?: () => void;
    onPairSelect?: (anaId: string, refId: string) => void;
    onBack?: () => void;
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
    onSessionMetadataUpdate,
    onDeleteAll,
    onPairSelect,
    onBack,
}) => {
    const { t } = useTranslation();
    const [selectedAnaId, setSelectedAnaId] = useState<string | null>(null);
    const [orphanReports, setOrphanReports] = useState<StoredReport[]>([]);
    const [viewingReport, setViewingReport] = useState<StoredReport | null>(null);
    const [selectedRefId, setSelectedRefId] = useState<string | null>(null);

    // Delete confirmation state
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
    const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);

    // Edit modal state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editRider, setEditRider] = useState('');
    const [editBike, setEditBike] = useState('');
    const [editCondition, setEditCondition] = useState<'dry' | 'wet'>('dry');
    const [editTuning, setEditTuning] = useState<'stock' | 'tuned'>('stock');
    const [editSessionType, setEditSessionType] = useState<'practice' | 'race' | 'warmup' | 'trackday'>('practice');
    const [editEventName, setEditEventName] = useState('');

    const openEditModal = (id: string, meta: SessionData['metadata']) => {
        setEditingId(id);
        setEditRider(meta.riderName || '');
        setEditBike(meta.bikeModel || meta.vehicle || '');
        setEditCondition(meta.condition || 'dry');
        setEditTuning(meta.tuning || 'stock');
        setEditSessionType(meta.sessionType || 'practice');
        setEditEventName(meta.eventName || '');
    };

    const handleSaveEdit = () => {
        if (!editingId || !onSessionMetadataUpdate) return;
        onSessionMetadataUpdate(editingId, {
            riderName: editRider,
            bikeModel: editBike,
            condition: editCondition,
            tuning: editTuning,
            sessionType: editSessionType,
            eventName: editEventName,
        });
        setEditingId(null);
    };

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
    // Load orphan reports (reports whose session no longer exists)
    useEffect(() => {
        listAllReports().then(allReports => {
            const allSessionIds = new Set([
                ...sessions.map(s => s.id).filter(Boolean),
                ...savedSessions.map(s => s.id),
            ]);
            const orphans = allReports.filter(r => !allSessionIds.has(r.sessionId));
            setOrphanReports(orphans);
        });
    }, [sessions, savedSessions]);

    // Merge: show in-memory sessions + saved sessions not yet in memory
    const inMemoryIds = new Set(sessions.map(s => s.id).filter(Boolean));
    const savedOnly = savedSessions.filter(s => !inMemoryIds.has(s.id));

    const hasAny = sessions.length > 0 || savedOnly.length > 0 || orphanReports.length > 0;

    // Group by venue → rider+bike
    type CardItem =
        | { type: 'memory'; session: SessionData; index: number }
        | { type: 'saved'; summary: SessionSummary };

    const grouped = useMemo(() => {
        const allItems: CardItem[] = [
            ...sessions.map((session, index) => ({ type: 'memory' as const, session, index })),
            ...savedOnly.map(summary => ({ type: 'saved' as const, summary })),
        ];

        const venueMap = new Map<string, Map<string, CardItem[]>>();

        for (const item of allItems) {
            const meta = item.type === 'memory' ? item.session.metadata : item.summary.metadata;
            const rawVenue = meta.venue || 'Unknown';
            const venue = /^(GPS|Speed|RPM|TPS|Unknown)/i.test(rawVenue) ? 'Unknown' : rawVenue;
            const rider = meta.riderName || '';
            const bike = meta.bikeModel || meta.vehicle || '';
            const riderBikeKey = [rider, bike].filter(Boolean).join(' · ') || 'Unknown';

            if (!venueMap.has(venue)) venueMap.set(venue, new Map());
            const riderMap = venueMap.get(venue)!;
            if (!riderMap.has(riderBikeKey)) riderMap.set(riderBikeKey, []);
            riderMap.get(riderBikeKey)!.push(item);
        }

        return venueMap;
    }, [sessions, savedOnly]);

    return (
        <div className="flex flex-col h-screen max-w-6xl mx-auto p-6 text-zinc-100">
            {/* Delete confirmation modal */}
            {(deleteConfirmId || deleteConfirmIndex !== null) && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setDeleteConfirmId(null); setDeleteConfirmIndex(null); }}>
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-3">{t.sessions.deleteSavedSession}</h3>
                        <p className="text-sm text-zinc-400 mb-6">{t.sessions.deleteConfirmMessage}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setDeleteConfirmId(null); setDeleteConfirmIndex(null); }}
                                className="flex-1 px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                            >
                                {t.upload.duplicateCancel}
                            </button>
                            <button
                                onClick={() => {
                                    if (deleteConfirmIndex !== null) onSessionRemove(deleteConfirmIndex);
                                    if (deleteConfirmId) onSavedSessionDelete(deleteConfirmId);
                                    setDeleteConfirmId(null);
                                    setDeleteConfirmIndex(null);
                                }}
                                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-medium"
                            >
                                {t.sessions.confirmDelete}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete all confirmation modal */}
            {deleteAllConfirm && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setDeleteAllConfirm(false)}>
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-3">{t.sessions.deleteAll}</h3>
                        <p className="text-sm text-zinc-400 mb-6">{t.sessions.deleteAllConfirmMessage}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteAllConfirm(false)}
                                className="flex-1 px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                            >
                                {t.upload.duplicateCancel}
                            </button>
                            <button
                                onClick={() => {
                                    onDeleteAll?.();
                                    setDeleteAllConfirm(false);
                                }}
                                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-medium"
                            >
                                {t.sessions.confirmDelete}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <header className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="flex items-center justify-center w-8 h-8 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div>
                        <h2 className="text-2xl font-bold text-white">{t.sessions.title}</h2>
                        <p className="text-zinc-400">
                            {t.sessions.subtitle}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {hasAny && onDeleteAll && (
                        <button
                            onClick={() => setDeleteAllConfirm(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 hover:bg-red-600 text-zinc-400 hover:text-white border border-zinc-700 hover:border-red-600 transition"
                        >
                            <Trash2 className="w-4 h-4" />
                            {t.sessions.deleteAll}
                        </button>
                    )}
                    <button
                        onClick={onUploadClick}
                        className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 transition text-white"
                    >
                        <Plus className="w-4 h-4" />
                        {t.sessions.uploadSession}
                    </button>
                </div>
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
                <div className="space-y-8 overflow-auto pb-8">
                    {Array.from(grouped.entries()).map(([venue, riderMap]) => (
                        <div key={venue}>
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <span className="w-1.5 h-5 bg-emerald-500 rounded-full" />
                                {venue}
                            </h3>
                            <div className="space-y-5 pl-3">
                                {Array.from(riderMap.entries()).map(([riderBike, items]) => (
                                    <div key={riderBike}>
                                        <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1.5">
                                            <User size={11} />
                                            {riderBike}
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {items.map(item => {
                                                const isMemory = item.type === 'memory';
                                                const meta = isMemory ? item.session.metadata : item.summary.metadata;
                                                const id = isMemory ? item.session.id : item.summary.id;
                                                const lapCount = isMemory ? item.session.laps.length : item.summary.lapCount;
                                                const bestLap = isMemory
                                                    ? (pickBestLap(item.session.laps)?.duration ?? null)
                                                    : item.summary.bestLapTime;
                                                const isLoading = !isMemory && loadingSessionId === item.summary.id;
                                                const isAna = selectedAnaId != null && id === selectedAnaId;
                                                const isRef = selectedRefId != null && id === selectedRefId;
                                                const sessionTypeLabels: Record<string, string> = {
                                                    practice: t.upload.typePractice,
                                                    race: t.upload.typeRace,
                                                    warmup: t.upload.typeWarmup,
                                                    trackday: t.upload.typeTrackday,
                                                };

                                                return (
                                                    <div
                                                        key={id || `mem-${isMemory ? item.index : ''}`}
                                                        onClick={() => {
                                                            if (isLoading) return;
                                                            if (isMemory) {
                                                                handleCardClick(id, () => onSessionSelect(item.session));
                                                            } else {
                                                                handleCardClick(id, () => onSavedSessionSelect(item.summary.id));
                                                            }
                                                        }}
                                                        className={`bg-zinc-900 border rounded-xl p-5 cursor-pointer transition group relative ${
                                                            isLoading ? 'opacity-60 pointer-events-none' :
                                                            isAna ? 'border-red-500 ring-1 ring-red-500/30' :
                                                            isRef ? 'border-blue-500 ring-1 ring-blue-500/30' :
                                                            'border-zinc-800 hover:border-blue-500/50'
                                                        }`}
                                                    >
                                                        {isAna && (
                                                            <div className="absolute -top-2 -left-2 px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded-md shadow-lg">ANA</div>
                                                        )}
                                                        {isRef && (
                                                            <div className="absolute -top-2 -left-2 px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-md shadow-lg">REF</div>
                                                        )}
                                                        <div className="flex justify-between items-start mb-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-sm font-medium text-white group-hover:text-blue-400 transition">
                                                                    {formatDate(meta.date)} {meta.time}
                                                                </span>
                                                                {!isMemory && <HardDrive size={12} className="text-zinc-600" />}
                                                                {meta.condition && (
                                                                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                                                        meta.condition === 'dry'
                                                                            ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/50'
                                                                            : 'bg-blue-900/40 text-blue-400 border border-blue-800/50'
                                                                    }`}>
                                                                        {meta.condition === 'dry' ? t.upload.conditionDry : t.upload.conditionWet}
                                                                    </span>
                                                                )}
                                                                {meta.tuning && (
                                                                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                                                        meta.tuning === 'stock'
                                                                            ? 'bg-zinc-700/60 text-zinc-300 border border-zinc-600/50'
                                                                            : 'bg-orange-900/40 text-orange-400 border border-orange-800/50'
                                                                    }`}>
                                                                        {meta.tuning === 'stock' ? t.upload.tuningStock : t.upload.tuningTuned}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-0.5">
                                                                {onSessionMetadataUpdate && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (id) openEditModal(id, meta);
                                                                        }}
                                                                        className="text-zinc-600 hover:text-blue-400 transition p-1.5 hover:bg-zinc-800 rounded-full"
                                                                        title={t.sessions.editSession}
                                                                    >
                                                                        <Pencil size={13} />
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (isMemory) setDeleteConfirmIndex(item.index);
                                                                        else setDeleteConfirmId(item.summary.id);
                                                                    }}
                                                                    className="text-zinc-600 hover:text-red-500 transition p-1.5 hover:bg-zinc-800 rounded-full"
                                                                    title={isMemory ? t.sessions.removeSession : t.sessions.deleteSavedSession}
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1 text-sm text-zinc-400">
                                                            {meta.sessionType && (
                                                                <p className="text-xs">{sessionTypeLabels[meta.sessionType] ?? meta.sessionType}</p>
                                                            )}
                                                            {meta.eventName && (
                                                                <p className="text-xs text-zinc-500">{meta.eventName}</p>
                                                            )}
                                                            {meta.fileName && (
                                                                <p className="flex items-center gap-1 text-xs text-zinc-600 truncate">
                                                                    <FileText size={10} />
                                                                    {meta.fileName}
                                                                </p>
                                                            )}
                                                            <div className="mt-3 pt-3 border-t border-zinc-800 flex justify-between items-center">
                                                                <span className="text-xs">{t.common.laps}: {lapCount}</span>
                                                                <div className="flex items-center gap-2">
                                                                    {bestLap != null && (
                                                                        <span className="flex items-center gap-1 text-yellow-400 font-mono text-sm font-medium">
                                                                            <Trophy size={13} />
                                                                            {formatLapTime(bestLap)}
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
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {/* Orphan Reports — reports from deleted sessions */}
                    {orphanReports.length > 0 && (
                        <div>
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <span className="w-1.5 h-5 bg-violet-500 rounded-full" />
                                {t.sessions.pastReports}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pl-3">
                                {orphanReports.map(report => (
                                    <div
                                        key={report.id}
                                        onClick={() => setViewingReport(report)}
                                        className="bg-zinc-900 border border-zinc-800 hover:border-violet-500/50 rounded-xl p-4 cursor-pointer transition group"
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <Sparkles size={14} className="text-violet-400" />
                                            <span className="text-sm font-medium text-white">
                                                {report.venue || 'AI Report'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-zinc-500">
                                            {report.date ? formatDate(report.date) + ' • ' : ''}
                                            L{report.anaLapIndex} vs L{report.refLapIndex} • {report.lang.toUpperCase()}
                                        </p>
                                        <p className="text-[10px] text-zinc-600 mt-1">
                                            {new Date(report.savedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Edit Session Modal */}
            {editingId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    onClick={(e) => { if (e.target === e.currentTarget) setEditingId(null); }}
                >
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-[95vw] max-w-lg shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <span className="font-bold text-white">{t.sessions.editSession}</span>
                            <button onClick={() => setEditingId(null)} className="text-zinc-400 hover:text-white transition p-1">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            {/* Rider */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-zinc-500">{t.upload.riderName}</label>
                                <input
                                    type="text"
                                    value={editRider}
                                    onChange={e => setEditRider(e.target.value)}
                                    placeholder={t.upload.riderNamePlaceholder}
                                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            {/* Bike */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-zinc-500">{t.upload.bikeModel}</label>
                                <input
                                    type="text"
                                    value={editBike}
                                    onChange={e => setEditBike(e.target.value)}
                                    placeholder={t.upload.bikeModelPlaceholder}
                                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            {/* Condition */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-zinc-500">{t.upload.condition}</label>
                                <div className="flex rounded-lg overflow-hidden border border-zinc-700 w-fit">
                                    <button type="button" onClick={() => setEditCondition('dry')}
                                        className={`px-4 py-2 text-xs font-bold transition ${editCondition === 'dry' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
                                        {t.upload.conditionDry}
                                    </button>
                                    <button type="button" onClick={() => setEditCondition('wet')}
                                        className={`px-4 py-2 text-xs font-bold transition ${editCondition === 'wet' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
                                        {t.upload.conditionWet}
                                    </button>
                                </div>
                            </div>
                            {/* Tuning */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-zinc-500">{t.upload.tuning}</label>
                                <div className="flex rounded-lg overflow-hidden border border-zinc-700 w-fit">
                                    <button type="button" onClick={() => setEditTuning('stock')}
                                        className={`px-4 py-2 text-xs font-bold transition ${editTuning === 'stock' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
                                        {t.upload.tuningStock}
                                    </button>
                                    <button type="button" onClick={() => setEditTuning('tuned')}
                                        className={`px-4 py-2 text-xs font-bold transition ${editTuning === 'tuned' ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
                                        {t.upload.tuningTuned}
                                    </button>
                                </div>
                            </div>
                            {/* Session Type */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-zinc-500">{t.upload.sessionType}</label>
                                <div className="flex rounded-lg overflow-hidden border border-zinc-700 w-fit">
                                    {(['practice', 'race', 'warmup', 'trackday'] as const).map(type => {
                                        const labels = { practice: t.upload.typePractice, race: t.upload.typeRace, warmup: t.upload.typeWarmup, trackday: t.upload.typeTrackday };
                                        return (
                                            <button key={type} type="button" onClick={() => setEditSessionType(type)}
                                                className={`px-3 py-2 text-xs font-medium transition ${editSessionType === type ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
                                                {labels[type]}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            {/* Event Name */}
                            {editSessionType === 'race' && (
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-zinc-500">{t.upload.eventName}</label>
                                    <input
                                        type="text"
                                        value={editEventName}
                                        onChange={e => setEditEventName(e.target.value)}
                                        placeholder={t.upload.eventNamePlaceholder}
                                        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800">
                            <button onClick={() => setEditingId(null)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition">
                                {t.common.cancel}
                            </button>
                            <button onClick={handleSaveEdit}
                                className="px-6 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 transition text-white">
                                {t.sessions.save}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Report Viewer Modal */}
            {viewingReport && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    onClick={(e) => { if (e.target === e.currentTarget) setViewingReport(null); }}
                >
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-[95vw] max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                            <div className="flex items-center gap-2">
                                <Sparkles size={16} className="text-violet-400" />
                                <span className="font-bold text-white">{viewingReport.venue || 'AI Report'}</span>
                                <span className="text-xs text-zinc-500">
                                    {viewingReport.date ? formatDate(viewingReport.date) : ''} • L{viewingReport.anaLapIndex} vs L{viewingReport.refLapIndex}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        deleteReport(viewingReport.id).then(() => {
                                            setOrphanReports(prev => prev.filter(r => r.id !== viewingReport.id));
                                            setViewingReport(null);
                                        });
                                    }}
                                    className="text-xs text-zinc-500 hover:text-red-400 transition px-2 py-1"
                                >
                                    <Trash2 size={14} />
                                </button>
                                <button
                                    onClick={() => setViewingReport(null)}
                                    className="text-zinc-400 hover:text-white transition p-1"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto px-6 py-4">
                            <div
                                className={markdownStyles}
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(viewingReport.report) }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SessionList;
