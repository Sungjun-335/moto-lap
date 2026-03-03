import React, { useState, useMemo, useCallback } from 'react';
import type { SessionData, Lap } from '../types';
import Overview from './Overview';
import AnalysisDashboard from './Analysis/AnalysisDashboard';
import ReferenceSelector from './Analysis/ReferenceSelector';
import { LayoutDashboard, LineChart, MapPin } from 'lucide-react';
import { getTrackById } from '../data/tracks';
import { useTranslation } from '../i18n/context';
import { formatLapTime } from '../utils/formatLapTime';
import { getOutlierLapIndices, pickBestLap } from '../utils/lapFilter';

interface DashboardProps {
    data: SessionData;
    refSession?: SessionData | null;
    onReset: () => void;
}

type ViewMode = 'overview' | 'analysis';

const Dashboard: React.FC<DashboardProps> = ({ data, refSession, onReset }) => {
    const { t } = useTranslation();
    const [mode, setMode] = useState<ViewMode>('overview');
    const [initialCornerId, setInitialCornerId] = useState<number | null>(null);
    const matchedTrack = useMemo(() =>
        data.metadata.trackId ? getTrackById(data.metadata.trackId) : null
    , [data.metadata.trackId]);

    // Deleted laps (removed from all views) — auto-delete outliers on load
    const [deletedLaps, setDeletedLaps] = useState<Set<number>>(() => getOutlierLapIndices(data.laps));

    const effectiveData = useMemo(() => {
        if (!deletedLaps.size) return data;
        return {
            ...data,
            laps: data.laps.filter(lap => !deletedLaps.has(lap.index)),
        };
    }, [data, deletedLaps]);

    // Derived lap lists from effectiveData
    const sortedByDuration = useMemo(() =>
        [...effectiveData.laps].sort((a, b) => a.duration - b.duration)
    , [effectiveData.laps]);
    const outlierLapIndices = useMemo(() => getOutlierLapIndices(effectiveData.laps), [effectiveData.laps]);
    const [selectedLapIndex, setSelectedLapIndex] = useState<number | 'all'>('all');
    const [anaLapIdx, setAnaLapIdx] = useState<number>(() => {
        const sorted = [...data.laps].sort((a, b) => a.duration - b.duration);
        const outliers = getOutlierLapIndices(data.laps);
        const valid = sorted.filter(l => !outliers.has(l.index));
        return (valid[0] ?? sorted[0])?.index ?? 0;
    });
    const [refLapIdx, setRefLapIdx] = useState<number>(() => {
        const sorted = [...data.laps].sort((a, b) => a.duration - b.duration);
        const outliers = getOutlierLapIndices(data.laps);
        const valid = sorted.filter(l => !outliers.has(l.index));
        return (valid[1] ?? valid[0] ?? sorted[0])?.index ?? 0;
    });
    const [externalRefLap, setExternalRefLap] = useState<Lap | null>(() => {
        if (!refSession?.laps?.length) return null;
        return pickBestLap(refSession.laps) ?? null;
    });

    // Hidden laps (toggled visibility in chart, not deleted)
    const [hiddenLaps, setHiddenLaps] = useState<Set<number>>(new Set());

    const toggleLapVisibility = useCallback((lapIndex: number) => {
        setHiddenLaps(prev => {
            const next = new Set(prev);
            if (next.has(lapIndex)) next.delete(lapIndex);
            else next.add(lapIndex);
            return next;
        });
    }, []);

    const deleteLap = useCallback((lapIndex: number) => {
        setDeletedLaps(prev => {
            const next = new Set(prev);
            next.add(lapIndex);
            return next;
        });
        setHiddenLaps(prev => {
            if (!prev.has(lapIndex)) return prev;
            const next = new Set(prev);
            next.delete(lapIndex);
            return next;
        });
    }, []);

    const handleCornerNavigate = (cornerId: number) => {
        setInitialCornerId(cornerId);
        setMode('analysis');
    };

    return (
        <div className="flex flex-col h-screen w-full bg-zinc-950 text-white overflow-hidden">
            {/* Header — only for non-analysis modes */}
            {mode !== 'analysis' && (
                <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <div className="min-w-0">
                            <h1 className="text-lg font-bold truncate">
                                {data.metadata.venue}
                                {matchedTrack && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 text-xs font-medium bg-emerald-900/30 text-emerald-400 rounded-full border border-emerald-800/50 align-middle">
                                        <MapPin className="w-3 h-3 mr-1" />
                                        {matchedTrack.shortName} • {matchedTrack.totalLength}m
                                    </span>
                                )}
                            </h1>
                            <p className="text-[10px] text-zinc-500 truncate">
                                {data.metadata.date} • {data.metadata.vehicle} • {data.metadata.user}
                            </p>
                        </div>

                        <div className="h-8 w-px bg-zinc-700 flex-shrink-0" />

                        {/* Mode Switcher */}
                        <div className="flex bg-zinc-800/50 rounded-lg p-1 border border-zinc-700/50 flex-shrink-0">
                            <button
                                onClick={() => setMode('overview')}
                                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${mode === 'overview'
                                    ? 'bg-zinc-700 text-white shadow-sm'
                                    : 'text-zinc-400 hover:text-zinc-200'
                                    }`}
                            >
                                <LayoutDashboard size={14} />
                                <span>{t.common.overview}</span>
                            </button>
                            <button
                                onClick={() => setMode('analysis')}
                                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm transition-all text-zinc-400 hover:text-zinc-200"
                            >
                                <LineChart size={14} />
                                <span>{t.common.analysis}</span>
                            </button>
                        </div>

                        {/* Overview controls: Lap Filter + ANA/REF */}
                        {mode === 'overview' && (
                            <>
                                <div className="h-8 w-px bg-zinc-700 flex-shrink-0" />

                                {/* Lap Filter */}
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span className="text-[10px] text-zinc-500 uppercase font-semibold">{t.overview.filterLap}</span>
                                    <select
                                        className="bg-zinc-800 text-xs border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-300 font-medium focus:ring-1 focus:ring-zinc-500"
                                        value={selectedLapIndex}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setSelectedLapIndex(val === 'all' ? 'all' : Number(val));
                                        }}
                                    >
                                        <option value="all">{t.overview.fullSession}</option>
                                        {effectiveData.laps.map(lap => (
                                            <option key={lap.index} value={lap.index}>
                                                {outlierLapIndices.has(lap.index) ? '⚠ ' : ''}L{lap.index} ({formatLapTime(lap.duration)})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="h-8 w-px bg-zinc-700 flex-shrink-0" />

                                {/* ANA selector */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className="text-[10px] text-zinc-500 uppercase font-semibold">ANA</span>
                                    <select
                                        className="bg-zinc-800 text-xs border border-zinc-700 rounded px-1.5 py-0.5 text-red-400 font-medium focus:ring-1 focus:ring-red-500"
                                        value={anaLapIdx}
                                        onChange={(e) => setAnaLapIdx(Number(e.target.value))}
                                    >
                                        {effectiveData.laps.map(lap => (
                                            <option key={lap.index} value={lap.index}>
                                                {outlierLapIndices.has(lap.index) ? '⚠ ' : ''}L{lap.index} ({formatLapTime(lap.duration)})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* REF selector */}
                                <ReferenceSelector
                                    currentSessionLaps={sortedByDuration}
                                    refLapIndex={refLapIdx}
                                    onRefLapChange={setRefLapIdx}
                                    onExternalRefLap={setExternalRefLap}
                                    currentSessionId={data.id}
                                    initialExternalLaps={refSession?.laps}
                                />
                            </>
                        )}
                    </div>

                    <button
                        onClick={onReset}
                        className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors flex-shrink-0"
                    >
                        {t.dashboard.backToSessions}
                    </button>
                </header>
            )}

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden relative">
                <div className="absolute inset-0 h-full w-full">
                    {mode === 'overview' ? (
                        <Overview
                            data={effectiveData}
                            key="overview"
                            onCornerNavigate={handleCornerNavigate}
                            refSession={refSession}
                            selectedLapIndex={selectedLapIndex}
                            anaLapIdx={anaLapIdx}
                            refLapIdx={refLapIdx}
                            externalRefLap={externalRefLap}
                            outlierLapIndices={outlierLapIndices}
                            hiddenLaps={hiddenLaps}
                            onToggleLap={toggleLapVisibility}
                            onDeleteLap={deleteLap}
                            onSetAnaLap={setAnaLapIdx}
                            onSetRefLap={setRefLapIdx}
                        />
                    ) : (
                        <AnalysisDashboard
                            data={effectiveData}
                            key="analysis"
                            onBack={onReset}
                            onSwitchToOverview={() => setMode('overview')}
                            matchedTrack={matchedTrack}
                            initialCornerId={initialCornerId}
                            onInitialCornerHandled={() => setInitialCornerId(null)}
                            initialRefSession={refSession}
                        />
                    )}
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
